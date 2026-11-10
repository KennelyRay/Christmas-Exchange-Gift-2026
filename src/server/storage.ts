import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PHOTO_BUCKET, type PhotoType } from "@/lib/photos";
import { ApiError } from "./http";

/** Neon Object Storage, reached through its S3-compatible API. */

const UPLOAD_URL_SECONDS = 5 * 60;
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const DELETE_BATCH = 1000;

type Storage = { client: S3Client; endpoint: string };

let cached: Storage | null | undefined;

/**
 * Neon endpoints carry their region, e.g. br-x.storage.c-3.ap-southeast-1.aws.neon.tech.
 * It's preferred over AWS_REGION because Vercel's runtime can set AWS_REGION itself.
 */
export function regionFromEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname.match(/\.([a-z]{2}-[a-z]+-\d+)\.aws\.neon\.tech$/)?.[1];
  } catch {
    return undefined;
  }
}

function getStorage(): Storage | null {
  if (cached !== undefined) return cached;

  // The endpoint decides whether storage is configured: Vercel never sets it on its own.
  const endpoint = process.env.AWS_ENDPOINT_URL_S3?.trim().replace(/\/+$/, "");
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return (cached = null);

  cached = {
    endpoint,
    client: new S3Client({
      endpoint,
      region: regionFromEndpoint(endpoint) ?? process.env.AWS_REGION ?? "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      // Without these, the SDK can sign a checksum of an empty body into presigned PUTs.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
  return cached;
}

export function requireStorage() {
  const storage = getStorage();
  if (!storage) {
    throw new ApiError(503, "uploads_unavailable", "Photo uploads aren't set up yet. You can add the item without a photo.");
  }
  return storage;
}

/** Built at read time, so each Neon branch serves its own copy of the photo. */
export function publicPhotoUrl(key: string | null) {
  const storage = getStorage();
  if (!key || !storage) return null;
  return `${storage.endpoint}/${PHOTO_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** The browser must send exactly these headers, because they are part of the signature. */
export async function presignPhotoUpload(key: string, contentType: PhotoType) {
  const { client } = requireStorage();
  const command = new PutObjectCommand({ Bucket: PHOTO_BUCKET, Key: key, ContentType: contentType, CacheControl: CACHE_CONTROL });
  const url = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_SECONDS });
  return { url, headers: { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL }, expiresIn: UPLOAD_URL_SECONDS };
}

const isNotFound = (error: unknown) => {
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return failure.name === "NotFound" || failure.name === "NoSuchKey" || failure.$metadata?.httpStatusCode === 404;
};

export async function headPhoto(key: string) {
  const { client } = requireStorage();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: PHOTO_BUCKET, Key: key }));
    return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? "" };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** The first bytes are enough to tell what the file really is. */
export async function readPhotoStart(key: string) {
  const { client } = requireStorage();
  const object = await client.send(new GetObjectCommand({ Bucket: PHOTO_BUCKET, Key: key, Range: "bytes=0-15" }));
  const bytes = (await object.Body?.transformToByteArray()) ?? new Uint8Array();
  return bytes.slice(0, 16);
}

export async function deletePhoto(key: string) {
  const { client } = requireStorage();
  await client.send(new DeleteObjectCommand({ Bucket: PHOTO_BUCKET, Key: key }));
}

export async function deletePhotos(keys: readonly string[]) {
  const { client } = requireStorage();
  for (let start = 0; start < keys.length; start += DELETE_BATCH) {
    const batch = keys.slice(start, start + DELETE_BATCH);
    await client.send(
      new DeleteObjectsCommand({ Bucket: PHOTO_BUCKET, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
    );
  }
}

const SIGNATURES: ReadonlyArray<{ type: PhotoType; matches: (b: Uint8Array) => boolean }> = [
  { type: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: "image/webp",
    matches: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
];

/** Trusts the file's own bytes, not the type the browser claimed. */
export const sniffPhotoType = (bytes: Uint8Array) => SIGNATURES.find(({ matches }) => matches(bytes))?.type ?? null;
