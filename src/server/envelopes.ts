import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, participants, wishlistItems } from "@/db/schema";
import { fullNameOf } from "@/lib/names";
import type { EnvelopeView } from "@/lib/types";
import { burnVerification, verifyCode } from "./codes";
import { unseal } from "./crypto";
import { assignmentContext } from "./draw";
import type { Exchange } from "./exchanges";
import { ApiError } from "./http";
import { clearLimit, enforceLimits, ipKey, refundLimits } from "./rate-limit";

const NETWORK_WINDOW_SECONDS = 15 * 60;
/** A 6-digit code is short, so guessing has to stay slow. A reissued code clears this. */
const PERSON_WINDOW_SECONDS = 60 * 60;

export const elfLimitKey = (participantId: string) => `elf:${participantId}`;

export async function openEnvelope(
  exchange: Exchange,
  input: { participantId: string; code: string },
  ip: string,
): Promise<EnvelopeView> {
  const personLimit = { key: elfLimitKey(input.participantId), max: 6, windowSeconds: PERSON_WINDOW_SECONDS };
  const networkLimit = { key: ipKey("elf-ip", ip), max: 40, windowSeconds: NETWORK_WINDOW_SECONDS };
  await enforceLimits([personLimit, networkLimit], "Too many wrong codes.");

  const db = getDb();
  const [person] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, input.participantId), eq(participants.exchangeId, exchange.id), isNull(participants.removedAt)))
    .limit(1);

  const verified = person ? await verifyCode(input.code, person.elfCodeHash) : await burnVerification(input.code);
  if (!person || !verified) {
    throw new ApiError(401, "wrong_code", "That name and Elf Code don't match. Check your screenshot and try again.");
  }

  await clearLimit(personLimit.key);
  await refundLimits([networkLimit]);

  const giverName = fullNameOf(person.firstName, person.lastName);

  if (exchange.status !== "drawn") {
    return { state: "waiting", giverName };
  }

  const [assignment] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.exchangeId, exchange.id), eq(assignments.giverId, person.id)))
    .limit(1);
  if (!assignment) throw new Error(`Drawn exchange ${exchange.id} has no assignment for a participant`);

  const { recipientId } = JSON.parse(
    unseal(assignment.sealedRecipient, assignmentContext(exchange.id, person.id, assignment.generation)),
  ) as { recipientId: string };

  const [[recipient], items] = await Promise.all([
    db
      .select({ firstName: participants.firstName, lastName: participants.lastName })
      .from(participants)
      .where(eq(participants.id, recipientId))
      .limit(1),
    db
      .select({
        name: wishlistItems.name,
        priceCentavos: wishlistItems.priceCentavos,
        url: wishlistItems.url,
        imageUrl: wishlistItems.imageUrl,
      })
      .from(wishlistItems)
      .where(eq(wishlistItems.participantId, recipientId))
      .orderBy(asc(wishlistItems.position)),
  ]);

  await db
    .update(participants)
    .set({ firstOpenedAt: new Date() })
    .where(and(eq(participants.id, person.id), isNull(participants.firstOpenedAt)));

  return {
    state: "ready",
    giverName,
    recipientName: fullNameOf(recipient.firstName, recipient.lastName),
    items,
    codeReissuedAt: person.codeReissuedAt?.toISOString() ?? null,
  };
}
