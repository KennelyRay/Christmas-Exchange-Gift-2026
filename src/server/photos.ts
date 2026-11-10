import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { exchanges, photoUploads, wishlistItems } from "@/db/schema";
import type { Db } from "@/db/types";
import { exchangeIdOfPhotoKey, isPhotoType, MAX_PHOTO_BYTES, PHOTO_TYPES, photoKeyPrefix, type UploadedPhoto } from "@/lib/photos";
import { ApiError } from "./http";
import { enforceLimits, ipKey } from "./rate-limit";
import { deletePhoto, deletePhotos, headPhoto, presignPhotoUpload, publicPhotoUrl, readPhotoStart, requireStorage, sniffPhotoType } from "./storage";

const HOUR = 60 * 60;
/** Uploads not saved with a wishlist after this long are treated as abandoned. */
export const STALE_UPLOAD_HOURS = 48;
const CLEANUP_BATCH = 5000;

const notOurs = () => new ApiError(422, "invalid_image", "That photo didn't upload properly. Please add it again.");

async function findPhoto(key: string) {
  if (!exchangeIdOfPhotoKey(key)) throw notOurs();
  const [upload] = await getDb().select().from(photoUploads).where(eq(photoUploads.key, key)).limit(1);
  return upload;
}

export async function requestPhotoUpload(input: { exchangeId: string; contentType: string; size: number }, ip: string) {
  requireStorage();

  if (!isPhotoType(input.contentType)) {
    throw new ApiError(415, "unsupported_file", "Please choose a JPG, PNG, or WebP photo.");
  }
  if (input.size <= 0 || input.size > MAX_PHOTO_BYTES) {
    throw new ApiError(413, "file_too_large", "That photo is too large. Please try a smaller one.");
  }

  const [exchange] = await getDb()
    .select({ id: exchanges.id, status: exchanges.status })
    .from(exchanges)
    .where(eq(exchanges.id, input.exchangeId))
    .limit(1);
  if (!exchange) throw new ApiError(404, "not_found", "We couldn't find that exchange.");
  if (exchange.status !== "open") {
    throw new ApiError(409, "pool_locked", "The pool is locked, so new wishlists are closed.");
  }

  await enforceLimits([{ key: ipKey("photo-upload", ip), max: 60, windowSeconds: HOUR }], "Too many photo uploads.");

  // Always a fresh random key, so a replaced photo never overwrites another.
  const key = `${photoKeyPrefix(exchange.id)}items/${randomUUID()}.${PHOTO_TYPES[input.contentType]}`;
  await getDb().insert(photoUploads).values({ key, exchangeId: exchange.id, contentType: input.contentType });

  const upload = await presignPhotoUpload(key, input.contentType);
  return { key, uploadUrl: upload.url, headers: upload.headers, expiresIn: upload.expiresIn };
}

/**
 * The browser uploads straight to storage, so nothing it sent can be trusted
 * until it's checked here. A file that fails any check is deleted.
 */
export async function confirmPhotoUpload(key: string, ip: string): Promise<UploadedPhoto> {
  await enforceLimits([{ key: ipKey("photo-confirm", ip), max: 120, windowSeconds: HOUR }], "Too many photo uploads.");

  const upload = await findPhoto(key);
  if (!upload || upload.attached) throw notOurs();

  const head = await headPhoto(key);
  if (!head) {
    throw new ApiError(422, "photo_missing", "The photo didn't finish uploading. Please try again.");
  }

  const actualType = head.size > 0 ? sniffPhotoType(await readPhotoStart(key)) : null;
  const acceptable =
    head.size > 0 && head.size <= MAX_PHOTO_BYTES && isPhotoType(head.contentType) && actualType === head.contentType;

  if (!acceptable) {
    await deletePhoto(key);
    await getDb().delete(photoUploads).where(eq(photoUploads.key, key));
    throw head.size > MAX_PHOTO_BYTES
      ? new ApiError(413, "file_too_large", "That photo is too large. Please try a smaller one.")
      : new ApiError(415, "unsupported_file", "Please choose a JPG, PNG, or WebP photo.");
  }

  await getDb().update(photoUploads).set({ confirmed: true }).where(eq(photoUploads.key, key));
  return { key, url: publicPhotoUrl(key)! };
}

/** Removing or replacing a photo before the wishlist is submitted. */
export async function discardPhotoUpload(key: string, ip: string) {
  await enforceLimits([{ key: ipKey("photo-discard", ip), max: 120, windowSeconds: HOUR }], "Too many requests.");

  const upload = await findPhoto(key);
  if (!upload) return;
  if (upload.attached) {
    throw new ApiError(409, "photo_locked", "That photo belongs to a submitted wishlist, so it can't be removed.");
  }
  await deletePhoto(key);
  await getDb().delete(photoUploads).where(eq(photoUploads.key, key));
}

type Writer = Pick<Db, "update">;

/**
 * Locks photos to the wishlist being submitted, inside its transaction. Each must
 * belong to this exchange, have passed confirmation, and not be used elsewhere.
 */
export async function attachPhotos(tx: Writer, exchangeId: string, keys: readonly string[]) {
  if (keys.length === 0) return;
  if (new Set(keys).size !== keys.length || keys.some((key) => exchangeIdOfPhotoKey(key) !== exchangeId)) throw notOurs();

  const attached = await tx
    .update(photoUploads)
    .set({ attached: true })
    .where(
      and(
        inArray(photoUploads.key, [...keys]),
        eq(photoUploads.exchangeId, exchangeId),
        eq(photoUploads.confirmed, true),
        eq(photoUploads.attached, false),
      ),
    )
    .returning({ key: photoUploads.key });

  if (attached.length !== keys.length) throw notOurs();
}

/** Deletes uploads that never made it into a submitted wishlist. Run daily. */
export async function cleanupStalePhotos(now = new Date()) {
  requireStorage();
  const cutoff = new Date(now.getTime() - STALE_UPLOAD_HOURS * HOUR * 1000);

  const stale = await getDb()
    .select({ key: photoUploads.key })
    .from(photoUploads)
    .where(
      and(
        eq(photoUploads.attached, false),
        lt(photoUploads.createdAt, cutoff),
        sql`NOT EXISTS (SELECT 1 FROM ${wishlistItems} WHERE ${wishlistItems.imageKey} = ${photoUploads.key})`,
      ),
    )
    .limit(CLEANUP_BATCH);

  const keys = stale.map((row) => row.key);
  if (keys.length > 0) {
    await deletePhotos(keys);
    await getDb()
      .delete(photoUploads)
      .where(and(inArray(photoUploads.key, keys), eq(photoUploads.attached, false)));
  }
  return { deleted: keys.length };
}
