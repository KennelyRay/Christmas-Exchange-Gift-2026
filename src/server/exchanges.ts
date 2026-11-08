import { asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLog, exchanges, participants, wishlistItems } from "@/db/schema";
import type { Db } from "@/db/types";
import { defaultRevealAt } from "@/lib/christmas";
import type { LobbyView, SealView } from "@/lib/types";
import type { createExchangeSchema } from "@/lib/validation";
import { generateOrganizerCode, generateSlug, hashCode } from "./codes";
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
  return getDb()
    .select({
      id: participants.id,
      name: participants.displayName,
      itemCount: count(wishlistItems.id),
      firstOpenedAt: participants.firstOpenedAt,
      codeReissuedAt: participants.codeReissuedAt,
    })
    .from(participants)
    .leftJoin(wishlistItems, eq(wishlistItems.participantId, participants.id))
    .where(eq(participants.exchangeId, exchangeId))
    .groupBy(participants.id)
    .orderBy(asc(participants.joinedAt), asc(participants.id));
}

export async function getLobby(exchange: Exchange): Promise<LobbyView> {
  const [people, audit] = await Promise.all([
    participantsWithCounts(exchange.id),
    getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.exchangeId, exchange.id))
      .orderBy(desc(auditLog.id))
      .limit(100),
  ]);

  return {
    slug: exchange.slug,
    name: exchange.name,
    status: exchange.status,
    budgetCentavos: exchange.budgetHintCentavos,
    revealAt: exchange.revealAt.toISOString(),
    commitmentHash: exchange.commitmentHash,
    sealOpened: exchange.sealOpenedAt !== null,
    drawGeneration: exchange.drawGeneration,
    participants: people.map(({ id, name, itemCount }) => ({ id, name, itemCount })),
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
