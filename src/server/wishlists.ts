import { count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { exchanges, participants, wishlistItems } from "@/db/schema";
import { fullNameOf, nameKeyOf, normalizeNamePart } from "@/lib/names";
import { MAX_PARTICIPANTS, type WishlistSubmission } from "@/lib/validation";
import { generateElfCode, hashCode } from "./codes";
import { addAudit, type Exchange } from "./exchanges";
import { ApiError, isUniqueViolation } from "./http";
import { isOurImageUrl } from "./uploads";

/**
 * The only way a wishlist is ever written. There is deliberately no update or
 * delete counterpart, and database triggers reject those operations too.
 */
export async function submitWishlist(exchange: Exchange, input: WishlistSubmission) {
  for (const item of input.items) {
    if (item.imageUrl && !isOurImageUrl(item.imageUrl, exchange.id)) {
      throw new ApiError(422, "invalid_image", "One of the photos didn't upload properly. Please add it again.");
    }
  }

  const elfCode = generateElfCode();
  const elfCodeHash = await hashCode(elfCode);
  const name = fullNameOf(input.firstName, input.lastName);

  try {
    const participantId = await getDb().transaction(async (tx) => {
      // Shared lock: joins can run side by side, but never alongside a pool lock.
      const [current] = await tx
        .select({ status: exchanges.status })
        .from(exchanges)
        .where(eq(exchanges.id, exchange.id))
        .for("share");

      if (current.status !== "open") {
        throw new ApiError(409, "pool_locked", "The pool is locked, so new wishlists are closed.");
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(participants)
        .where(eq(participants.exchangeId, exchange.id));
      if (total >= MAX_PARTICIPANTS) {
        throw new ApiError(409, "pool_full", "This exchange is full.");
      }

      const [person] = await tx
        .insert(participants)
        .values({
          exchangeId: exchange.id,
          firstName: input.firstName,
          lastName: input.lastName,
          lastNameKey: normalizeNamePart(input.lastName),
          nameKey: nameKeyOf(input.firstName, input.lastName),
          elfCodeHash,
        })
        .returning({ id: participants.id });

      await tx.insert(wishlistItems).values(
        input.items.map((item, position) => ({
          participantId: person.id,
          position,
          name: item.name,
          priceCentavos: item.priceCentavos,
          url: item.url ?? null,
          imageUrl: item.imageUrl ?? null,
        })),
      );

      await addAudit(tx, exchange.id, "participant_joined", `${name} joined the pool`);
      return person.id;
    });

    return { participantId, name, elfCode };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "name_taken",
        "That name is already in the pool. If it's a different person, add a middle name or nickname.",
        { firstName: "That name is already in the pool" },
      );
    }
    throw error;
  }
}
