/** Rules for wishlist photos shared by the browser and the server. */

export const PHOTO_BUCKET = "wishlist-photos";

/** What the server accepts after the browser has shrunk the photo. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const PHOTO_TYPES = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export type PhotoType = keyof typeof PHOTO_TYPES;

export const isPhotoType = (value: string): value is PhotoType => Object.hasOwn(PHOTO_TYPES, value);

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const PHOTO_KEY_PATTERN = new RegExp(`^exchanges/(${UUID})/items/${UUID}\\.(webp|jpg|png)$`);

export const photoKeyPrefix = (exchangeId: string) => `exchanges/${exchangeId}/`;

/** The exchange a photo belongs to, or null when the key isn't one of ours. */
export function exchangeIdOfPhotoKey(key: string) {
  return PHOTO_KEY_PATTERN.exec(key)?.[1] ?? null;
}

export type UploadedPhoto = { key: string; url: string };
