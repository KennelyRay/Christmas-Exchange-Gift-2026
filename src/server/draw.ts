import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assignments, exchanges, exclusions, participants } from "@/db/schema";
import { DrawError, drawGiftChain, isValidChain, MIN_PARTICIPANTS, type ExclusionPair } from "@/lib/draw";
import { buildManifest } from "@/lib/manifest";
import { fullNameOf } from "@/lib/names";
import { secureRandomInt } from "@/lib/rng";
import { randomSalt, seal, sha256Hex } from "./crypto";
import { describeProblem } from "./draw-check";
import { addAudit, shortHash, type Exchange } from "./exchanges";
import { ApiError } from "./http";

export const assignmentContext = (exchangeId: string, giverId: string, generation: number) =>
  `assignment:${exchangeId}:${giverId}:${generation}`;

export const manifestContext = (exchangeId: string, generation: number) =>
  `manifest:${exchangeId}:${generation}`;

/** Generates, seals, and stores the draw in one transaction: all of it lands or none. */
export async function runDraw(exchangeId: string) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(exchanges).where(eq(exchanges.id, exchangeId)).for("update");

    if (current.status === "drawn") {
      throw new ApiError(409, "already_drawn", "The draw has already been run.");
    }
    if (current.status !== "locked") {
      throw new ApiError(409, "pool_not_locked", "Lock the pool before running the draw.");
    }
    if (current.revealAt.getTime() <= Date.now()) {
      throw new ApiError(409, "reveal_passed", "Christmas Night has already passed. Set a new time before drawing.");
    }

    const people = await tx
      .select({
        id: participants.id,
        firstName: participants.firstName,
        lastName: participants.lastName,
        lastNameKey: participants.lastNameKey,
      })
      .from(participants)
      .where(eq(participants.exchangeId, exchangeId))
      .orderBy(asc(participants.joinedAt), asc(participants.id));

    if (people.length < MIN_PARTICIPANTS) {
      throw new ApiError(422, "draw_too_few", `The draw needs at least ${MIN_PARTICIPANTS} people.`);
    }

    const rules = await tx.select().from(exclusions).where(eq(exclusions.exchangeId, exchangeId));
    const pairs: ExclusionPair[] = rules.map((r) => [r.participantAId, r.participantBId]);
    const pool = people.map((p) => ({ id: p.id, family: p.lastNameKey }));
    const nameOf = (id: string) => {
      const person = people.find((p) => p.id === id);
      return person ? fullNameOf(person.firstName, person.lastName) : "Someone";
    };

    let chain: string[];
    try {
      chain = drawGiftChain(pool, pairs, secureRandomInt).chain;
    } catch (error) {
      if (error instanceof DrawError) {
        throw new ApiError(422, `draw_${error.code}`, error.problem ? describeProblem(error.problem, people) : error.message);
      }
      throw error;
    }
    if (!isValidChain(chain, pool, pairs)) throw new Error("Draw produced an invalid chain");

    const generation = current.drawGeneration + 1;
    const manifest = buildManifest(current.slug, randomSalt(), chain.map(nameOf));
    const commitmentHash = sha256Hex(manifest);

    // `people` is in join order, so the stored row order says nothing about the chain.
    await tx.insert(assignments).values(
      people.map((person) => {
        const position = chain.indexOf(person.id);
        const recipientId = chain[(position + 1) % chain.length];
        return {
          exchangeId,
          giverId: person.id,
          generation,
          sealedRecipient: seal(
            JSON.stringify({ recipientId, position }),
            assignmentContext(exchangeId, person.id, generation),
          ),
        };
      }),
    );

    await tx
      .update(exchanges)
      .set({
        status: "drawn",
        drawnAt: new Date(),
        drawGeneration: generation,
        commitmentHash,
        sealedManifest: seal(manifest, manifestContext(exchangeId, generation)),
        chainStep: 0,
      })
      .where(eq(exchanges.id, exchangeId));

    await addAudit(tx, exchangeId, "draw_run", `Draw #${generation} was sealed (${shortHash(commitmentHash)}...)`);

    return { commitmentHash, generation };
  });
}

export async function resetDraw(exchangeId: string, reason: string) {
  await getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(exchanges).where(eq(exchanges.id, exchangeId)).for("update");

    if (current.status !== "drawn") {
      throw new ApiError(409, "not_drawn", "There is no draw to reset.");
    }
    if (current.chainStep > 0 || current.sealOpenedAt) {
      throw new ApiError(409, "reveal_started", "The reveal has started, so the draw can no longer be reset.");
    }

    await tx.delete(assignments).where(eq(assignments.exchangeId, exchangeId));
    await tx
      .update(participants)
      .set({ firstOpenedAt: null })
      .where(eq(participants.exchangeId, exchangeId));
    await tx
      .update(exchanges)
      .set({ status: "locked", drawnAt: null, commitmentHash: null, sealedManifest: null })
      .where(eq(exchanges.id, exchangeId));

    const oldHash = current.commitmentHash ? ` (${shortHash(current.commitmentHash)}...)` : "";
    await addAudit(
      tx,
      exchangeId,
      "draw_reset",
      `The organizer reset draw #${current.drawGeneration}${oldHash}. Reason: ${reason}`,
    );
  });
}

export function canResetDraw(exchange: Exchange) {
  return exchange.status === "drawn" && exchange.chainStep === 0 && !exchange.sealOpenedAt;
}
