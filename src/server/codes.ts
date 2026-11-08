import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { WORDS } from "@/lib/wordlist";

const ELF_CODE_WORDS = 4;
const ORGANIZER_CODE_WORDS = 6;

const rounds = () => Number(process.env.BCRYPT_ROUNDS ?? 11);

function randomWords(count: number) {
  return Array.from({ length: count }, () => WORDS[randomInt(WORDS.length)]);
}

export const generateElfCode = () => randomWords(ELF_CODE_WORDS).join("-");
export const generateOrganizerCode = () => randomWords(ORGANIZER_CODE_WORDS).join("-");
export const generateSlug = () => `${randomWords(2).join("-")}-${randomInt(10, 100)}`;

/** Lets people type "Snow Frost holly IVY" or paste the code with stray spaces. */
export function normalizeCode(code: string) {
  return code
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const hashCode = (code: string) => bcrypt.hash(normalizeCode(code), rounds());

export const verifyCode = (code: string, hash: string) => bcrypt.compare(normalizeCode(code), hash);

/** Burned when the person does not exist, so timing does not reveal who does. */
const DUMMY_HASH = bcrypt.hashSync("no-such-person", 4);
export const burnVerification = (code: string) => bcrypt.compare(normalizeCode(code), DUMMY_HASH);
