import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { exchanges, exclusions, participants } from "@/db/schema";
import { checkFeasibility, MIN_PARTICIPANTS, type ExclusionPair } from "@/lib/draw";
import { formatManila } from "@/lib/christmas";
import { formatPeso } from "@/lib/money";
import type { DashboardView } from "@/lib/types";
import type { organizerSettingsSchema } from "@/lib/validation";
import { generateElfCode, hashCode, verifyCode } from "./codes";
import { createOrganizerToken, isValidOrganizerToken, unseal } from "./crypto";
import { canResetDraw, manifestContext } from "./draw";
import { elfLimitKey } from "./envelopes";
import {
  addAudit,
  assertFutureReveal,
  participantsWithCounts,
  requireExchange,
  type Exchange,
} from "./exchanges";
import { ApiError, readCookie } from "./http";
import { hasRevealArrived } from "./chain";
import { clearLimit, enforceLimits, ipKey, refundLimits } from "./rate-limit";

const SESSION_SECONDS = 12 * 60 * 60;
const LOCK_WINDOW_SECONDS = 15 * 60;
/** If the chain is never played, the seal can still open a day after Christmas Night. */
const SEAL_GRACE_MS = 24 * 60 * 60 * 1000;

const cookieName = (slug: string) => `organizer_${slug}`;

function cookieHeader(slug: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName(slug)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function loginOrganizer(exchange: Exchange, code: string, ip: string) {
  const exchangeLimit = { key: `org:${exchange.id}`, max: 8, windowSeconds: LOCK_WINDOW_SECONDS };
  const networkLimit = { key: ipKey("org-ip", ip), max: 30, windowSeconds: LOCK_WINDOW_SECONDS };
  await enforceLimits([exchangeLimit, networkLimit], "Too many wrong codes.");

  if (!(await verifyCode(code, exchange.organizerCodeHash))) {
    throw new ApiError(401, "wrong_code", "That Organizer Code isn't right.");
  }

  await clearLimit(exchangeLimit.key);
  await refundLimits([networkLimit]);
  return cookieHeader(exchange.slug, createOrganizerToken(exchange.id, SESSION_SECONDS), SESSION_SECONDS);
}

export const logoutCookie = (slug: string) => cookieHeader(slug, "", 0);

export async function requireOrganizer(request: Request, slug: string) {
  const exchange = await requireExchange(slug);
  if (!isValidOrganizerToken(readCookie(request, cookieName(slug)), exchange.id)) {
    throw new ApiError(401, "not_organizer", "Enter your Organizer Code first.");
  }
  return exchange;
}

type CookieReader = { get(name: string): { value: string } | undefined };

export function hasOrganizerSession(exchange: Exchange, cookies: CookieReader) {
  return isValidOrganizerToken(cookies.get(cookieName(exchange.slug))?.value, exchange.id);
}

function canOpenSeal(exchange: Exchange, participantCount: number) {
  if (exchange.status !== "drawn" || exchange.sealOpenedAt || !hasRevealArrived(exchange)) return false;
  const chainFinished = exchange.chainStep >= participantCount + 1;
  return chainFinished || Date.now() >= exchange.revealAt.getTime() + SEAL_GRACE_MS;
}

/** Contains no assignment data of any kind: the organizer stays as blind as everyone else. */
export async function getDashboard(exchange: Exchange): Promise<DashboardView> {
  const [people, rules] = await Promise.all([
    participantsWithCounts(exchange.id),
    getDb().select().from(exclusions).where(eq(exclusions.exchangeId, exchange.id)),
  ]);

  return {
    slug: exchange.slug,
    name: exchange.name,
    status: exchange.status,
    budgetCentavos: exchange.budgetHintCentavos,
    revealAt: exchange.revealAt.toISOString(),
    commitmentHash: exchange.commitmentHash,
    drawGeneration: exchange.drawGeneration,
    chainStep: exchange.chainStep,
    sealOpened: exchange.sealOpenedAt !== null,
    canOpenSeal: canOpenSeal(exchange, people.length),
    canResetDraw: canResetDraw(exchange),
    participants: people.map((p) => ({
      id: p.id,
      name: p.name,
      itemCount: p.itemCount,
      hasOpened: p.firstOpenedAt !== null,
      codeReissuedAt: p.codeReissuedAt?.toISOString() ?? null,
    })),
    exclusions: rules.map((r) => [r.participantAId, r.participantBId]),
  };
}

export async function updateSettings(exchange: Exchange, input: z.infer<typeof organizerSettingsSchema>) {
  if (exchange.status === "drawn") {
    throw new ApiError(409, "already_drawn", "Settings are frozen once the draw has run.");
  }

  await getDb().transaction(async (tx) => {
    if (input.budgetCentavos !== undefined && input.budgetCentavos !== exchange.budgetHintCentavos) {
      await tx
        .update(exchanges)
        .set({ budgetHintCentavos: input.budgetCentavos })
        .where(eq(exchanges.id, exchange.id));
      const text = input.budgetCentavos === null ? "removed" : `set to ${formatPeso(input.budgetCentavos)}`;
      await addAudit(tx, exchange.id, "budget_changed", `The suggested budget was ${text}`);
    }

    if (input.revealAt !== undefined) {
      const revealAt = new Date(input.revealAt);
      assertFutureReveal(revealAt);
      if (revealAt.getTime() !== exchange.revealAt.getTime()) {
        await tx.update(exchanges).set({ revealAt }).where(eq(exchanges.id, exchange.id));
        await addAudit(tx, exchange.id, "reveal_time_changed", `Christmas Night moved to ${formatManila(revealAt)} (Manila time)`);
      }
    }
  });
}

export async function changePool(exchange: Exchange, action: "lock" | "reopen") {
  const db = getDb();

  if (action === "lock") {
    const [{ total }] = await db
      .select({ total: count() })
      .from(participants)
      .where(eq(participants.exchangeId, exchange.id));
    if (total < MIN_PARTICIPANTS) {
      throw new ApiError(422, "too_few", `Wait for at least ${MIN_PARTICIPANTS} people before locking the pool.`);
    }
  }

  const [from, to] = action === "lock" ? (["open", "locked"] as const) : (["locked", "open"] as const);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(exchanges)
      .set({ status: to, lockedAt: action === "lock" ? new Date() : null })
      .where(and(eq(exchanges.id, exchange.id), eq(exchanges.status, from)))
      .returning({ id: exchanges.id });

    if (updated.length === 0) {
      throw new ApiError(409, "wrong_state", action === "lock" ? "The pool is already locked." : "The pool can't be reopened now.");
    }
    await addAudit(
      tx,
      exchange.id,
      action === "lock" ? "pool_locked" : "pool_reopened",
      action === "lock" ? "The organizer locked the pool" : "The organizer reopened the pool",
    );
  });
}

export async function replaceExclusions(exchange: Exchange, rawPairs: Array<[string, string]>) {
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: exchanges.status })
      .from(exchanges)
      .where(eq(exchanges.id, exchange.id))
      .for("update");
    if (current.status === "drawn") {
      throw new ApiError(409, "already_drawn", "Rules are frozen once the draw has run.");
    }

    const people = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.exchangeId, exchange.id));
    const known = new Set(people.map((p) => p.id));

    const unique = new Map<string, readonly [string, string]>();
    for (const [first, second] of rawPairs) {
      const a = first.toLowerCase();
      const b = second.toLowerCase();
      if (a === b || !known.has(a) || !known.has(b)) {
        throw new ApiError(422, "invalid_rule", "A rule refers to someone who isn't in the pool.");
      }
      unique.set(a < b ? `${a}|${b}` : `${b}|${a}`, a < b ? [a, b] : [b, a]);
    }
    const pairs = [...unique.values()];

    await tx.delete(exclusions).where(eq(exclusions.exchangeId, exchange.id));
    if (pairs.length > 0) {
      await tx.insert(exclusions).values(
        pairs.map(([participantAId, participantBId]) => ({
          exchangeId: exchange.id,
          participantAId,
          participantBId,
        })),
      );
    }

    await addAudit(
      tx,
      exchange.id,
      "exclusions_changed",
      `The organizer updated the rules (${pairs.length} pair${pairs.length === 1 ? "" : "s"} can't draw each other)`,
    );

    return { pairs: pairs as ExclusionPair[], ids: [...known] };
  });

  const feasible =
    result.ids.length < MIN_PARTICIPANTS || checkFeasibility(result.ids, result.pairs).result !== "impossible";
  return { count: result.pairs.length, feasible };
}

/**
 * Replaces the hash and returns the new code once. The event is public and the
 * old code stops working, so this can't be used quietly to read someone's envelope.
 */
export async function reissueElfCode(exchange: Exchange, participantId: string) {
  const elfCode = generateElfCode();
  const elfCodeHash = await hashCode(elfCode);

  const name = await getDb().transaction(async (tx) => {
    const [person] = await tx
      .update(participants)
      .set({ elfCodeHash, codeReissuedAt: new Date() })
      .where(and(eq(participants.id, participantId), eq(participants.exchangeId, exchange.id)))
      .returning({ name: participants.displayName });
    if (!person) throw new ApiError(404, "not_found", "That person isn't in this exchange.");

    await addAudit(tx, exchange.id, "code_reissued", `The organizer issued a new Elf Code for ${person.name}`);
    return person.name;
  });

  await clearLimit(elfLimitKey(participantId));
  return { name, elfCode };
}

export async function openSeal(exchange: Exchange) {
  const [{ total }] = await getDb()
    .select({ total: count() })
    .from(participants)
    .where(eq(participants.exchangeId, exchange.id));

  if (!canOpenSeal(exchange, total)) {
    throw new ApiError(409, "seal_locked", "The seal opens after the Gift Chain finishes, or a day after Christmas Night.");
  }
  if (!exchange.sealedManifest) throw new Error(`Exchange ${exchange.id} has no sealed manifest`);

  const openedManifest = unseal(exchange.sealedManifest, manifestContext(exchange.id, exchange.drawGeneration));

  await getDb().transaction(async (tx) => {
    await tx
      .update(exchanges)
      .set({ openedManifest, sealOpenedAt: new Date() })
      .where(eq(exchanges.id, exchange.id));
    await addAudit(tx, exchange.id, "seal_opened", "The organizer opened the seal. Anyone can now verify the draw");
  });
}
