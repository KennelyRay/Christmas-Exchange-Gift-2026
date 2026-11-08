import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { sha256Hex } from "./crypto";
import { ApiError } from "./http";

export type Limit = { key: string; max: number; windowSeconds: number };

export const ipKey = (scope: string, ip: string) => `${scope}:${sha256Hex(ip).slice(0, 32)}`;

/**
 * Counts the attempt before the secret is checked. Incrementing atomically up
 * front means parallel guesses cannot slip past the limit.
 */
async function consume({ key, max, windowSeconds }: Limit) {
  const windowEnd = new Date(Date.now() + windowSeconds * 1000).toISOString();
  const expired = sql`${rateLimits.windowEndsAt} <= now()`;

  const [row] = await getDb()
    .insert(rateLimits)
    .values({ key, count: 1, windowEndsAt: new Date(windowEnd) })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowEndsAt: sql`CASE WHEN ${expired} THEN ${windowEnd}::timestamptz ELSE ${rateLimits.windowEndsAt} END`,
      },
    })
    .returning({ count: rateLimits.count, windowEndsAt: rateLimits.windowEndsAt });

  return {
    allowed: row.count <= max,
    retryAfterSeconds: Math.max(1, Math.ceil((row.windowEndsAt.getTime() - Date.now()) / 1000)),
  };
}

export async function enforceLimits(limits: Limit[], message: string) {
  for (const limit of limits) {
    const { allowed, retryAfterSeconds } = await consume(limit);
    if (!allowed) {
      const minutes = Math.ceil(retryAfterSeconds / 60);
      throw new ApiError(
        429,
        "rate_limited",
        `${message} Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        undefined,
        retryAfterSeconds,
      );
    }
  }
}

/** Takes a correct guess back off the count, so honest use never adds up to a lockout. */
export async function refundLimits(limits: Limit[]) {
  for (const { key } of limits) {
    await getDb()
      .update(rateLimits)
      .set({ count: sql`GREATEST(${rateLimits.count} - 1, 0)` })
      .where(eq(rateLimits.key, key));
  }
}

export async function clearLimit(key: string) {
  await getDb().delete(rateLimits).where(eq(rateLimits.key, key));
}
