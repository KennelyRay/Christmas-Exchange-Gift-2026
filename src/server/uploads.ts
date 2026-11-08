import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { ApiError } from "./http";

export const MAX_UPLOAD_BYTES = 1_500_000;

const SIGNATURES: ReadonlyArray<{ type: string; extension: string; matches: (b: Uint8Array) => boolean }> = [
  {
    type: "image/jpeg",
    extension: "jpg",
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: "image/png",
    extension: "png",
    matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: "image/webp",
    extension: "webp",
    matches: (b) =>
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
];

const blobFolder = (exchangeId: string) => `wishlist/${exchangeId}/`;

export function isOurImageUrl(value: string, exchangeId: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".public.blob.vercel-storage.com") &&
      url.pathname.startsWith(`/${blobFolder(exchangeId)}`)
    );
  } catch {
    return false;
  }
}

/** Trusts the file's own bytes, not the browser's claimed type. */
export async function storeWishlistImage(exchangeId: string, file: File) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(503, "uploads_unavailable", "Photo uploads aren't set up yet. You can add the item without a photo.");
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, "file_too_large", "That photo is too large. Please try a smaller one.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = SIGNATURES.find(({ matches }) => matches(bytes));
  if (!signature) {
    throw new ApiError(415, "unsupported_file", "Please choose a JPG, PNG, or WebP photo.");
  }

  const pathname = `${blobFolder(exchangeId)}${randomUUID()}.${signature.extension}`;
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "public",
    contentType: signature.type,
  });
  return { url: blob.url };
}
