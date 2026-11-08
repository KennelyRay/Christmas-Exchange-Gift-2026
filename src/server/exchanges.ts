import { asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLog, exchanges, exclusions, participants, wishlistItems } from "@/db/schema";
import type { Db } from "@/db/types";
import { defaultRevealAt } from "@/lib/christmas";
import type { ExclusionPair } from "@/lib/draw";
import { fullNameOf } from "@/lib/names";
import type { LobbyView, SealView } from "@/lib/types";
import type { createExchangeSchema } from "@/lib/validation";
import { generateOrganizerCode, generateSlug, hashCode } from "./codes";
import { assessDraw } from "./draw-check";
import { ApiError, isUniqueViolation } from "./http";

export type Exchange = typeof exchanges.$inferSelect;
type AuditEvent = (typeof auditLog.$inferInsert)["event"];
type Writer = Pick<Db, "insert">;

export const addAudit = (db: Writer, exchangeId: string, event: AuditEvent, detail: string) =>
  db.insert(auditLog).values({ exchangeId, event, detail });

export const shortHash = (hash: string) => hash.slice(0, 12);

export async function findExchange(slug: string): Promise<Exchange | undefined> {
  const [exchange] = await getDb().select().from(exchanges).where(eq(exchanges.slug, slug)).limit(1);
  return exchange;
}

export async function requireExchange(slug: string) {
  const exchange = await findExchange(slug);
  if (!exchange) throw new ApiError(404, "not_found", "We couldn't find that exchange.");
  return exchange;
}

export function assertFutureReveal(revealAt: Date) {
  if (revealAt.getTime() <= Date.now()) {
    throw new ApiError(422, "reveal_in_past", "Christmas Night has to be in the future.");
  }
}

export async function createExchange(input: z.infer<typeof createExchangeSchema>) {
  const revealAt = input.revealAt ? new Date(input.revealAt) : defaultRevealAt(new Date());
  assertFutureReveal(revealAt);

  const organizerCode = generateOrganizerCode();
  const organizerCodeHash = await hashCode(organizerCode);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    try {
      await getDb().transaction(async (tx) => {
        const [created] = await tx
          .insert(exchanges)
          .values({
            slug,
            name: input.name,
            organizerCodeHash,
            budgetHintCentavos: input.budgetCentavos ?? null,
            revealAt,
          })
          .returning({ id: exchanges.id });
        await addAudit(tx, created.id, "exchange_created", `"${input.name}" was created`);
      });
      return { slug, organizerCode };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new ApiError(503, "slug_exhausted", "Please try creating the exchange again.");
}

export async function participantsWithCounts(exchangeId: string) {
  const rows = await getDb()
    .select({
      id: participants.id,
      firstName: participants.firstName,
      lastName: participants.lastName,
      lastNameKey: participants.lastNameKey,
      itemCount: count(wishlistItems.id),
      firstOpenedAt: participants.firstOpenedAt,
      codeReissuedAt: participants.codeReissuedAt,
    })
    .from(participants)
    .leftJoin(wishlistItems, eq(wishlistItems.participantId, participants.id))
    .where(eq(participants.exchangeId, exchangeId))
    .groupBy(participants.id)
    .orderBy(asc(participants.joinedAt), asc(participants.id));

  return rows.map((row) => ({ ...row, name: fullNameOf(row.firstName, row.lastName) }));
}

export async function exclusionPairs(exchangeId: string): Promise<Array<[string, string]>> {
  const rules = await getDb().select().from(exclusions).where(eq(exclusions.exchangeId, exchangeId));
  return rules.map((rule) => [rule.participantAId, rule.participantBId]);
}

export async function getLobby(exchange: Exchange): Promise<LobbyView> {
  const [people, audit, pairs] = await Promise.all([
    participantsWithCounts(exchange.id),
    getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.exchangeId, exchange.id))
      .orderBy(desc(auditLog.id))
      .limit(100),
    exclusionPairs(exchange.id),
  ]);

  const drawWarning = exchange.status === "drawn" ? null : assessDraw(people, pairs as ExclusionPair[])?.publicMessage ?? null;

  return {
    slug: exchange.slug,
    name: exchange.name,
    status: exchange.status,
    budgetCentavos: exchange.budgetHintCentavos,
    revealAt: exchange.revealAt.toISOString(),
    commitmentHash: exchange.commitmentHash,
    sealOpened: exchange.sealOpenedAt !== null,
    drawGeneration: exchange.drawGeneration,
    participants: people.map(({ id, name, lastName, lastNameKey, itemCount }) => ({
      id,
      name,
      lastName,
      familyKey: lastNameKey,
      itemCount,
    })),
    drawWarning,
    audit: audit.map(({ id, event, detail, createdAt }) => ({
      id,
      event,
      detail,
      at: createdAt.toISOString(),
    })),
  };
}

export function getSeal(exchange: Exchange): SealView {
  return {
    commitmentHash: exchange.commitmentHash,
    manifest: exchange.openedManifest,
    openedAt: exchange.sealOpenedAt?.toISOString() ?? null,
  };
}
