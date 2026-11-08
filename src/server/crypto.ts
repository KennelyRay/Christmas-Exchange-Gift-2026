import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const keys = new Map<string, Buffer>();

function deriveKey(purpose: string) {
  const cached = keys.get(purpose);
  if (cached) return cached;

  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("APP_SECRET must be set to at least 32 characters");
  }
  const key = Buffer.from(hkdfSync("sha256", secret, "christmas-exchange", purpose, 32));
  keys.set(purpose, key);
  return key;
}

/** AES-256-GCM. `context` binds the ciphertext to its row so rows cannot be swapped. */
export function seal(plaintext: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("seal-v1"), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, body, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

export function unseal(sealed: string, context: string) {
  const [iv, body, tag] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("seal-v1"), iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

export const sha256Hex = (text: string) => createHash("sha256").update(text).digest("hex");

export const randomSalt = () => randomBytes(32).toString("hex");

const sessionSignature = (exchangeId: string, expires: number) =>
  createHmac("sha256", deriveKey("organizer-session-v1"))
    .update(`${exchangeId}.${expires}`)
    .digest("base64url");

export function createOrganizerToken(exchangeId: string, ttlSeconds: number) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${expires}.${sessionSignature(exchangeId, expires)}`;
}

export function isValidOrganizerToken(token: string | undefined, exchangeId: string) {
  if (!token) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!signature || !Number.isInteger(expires) || expires < Date.now() / 1000) return false;

  const expected = Buffer.from(sessionSignature(exchangeId, expires));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
