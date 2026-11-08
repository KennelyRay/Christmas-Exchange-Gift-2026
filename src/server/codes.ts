import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { WORDS } from "@/lib/wordlist";

/** Elf Codes used to be four words, and people who joined then still hold those. */
const LEGACY_ELF_CODE_WORDS = 4;
const ORGANIZER_CODE_WORDS = 6;

const rounds = () => Number(process.env.BCRYPT_ROUNDS ?? 11);

function randomWords(count: number) {
  return Array.from({ length: count }, () => WORDS[randomInt(WORDS.length)]);
}

export const generateElfCode = () => String(randomInt(1_000_000)).padStart(6, "0");
export const generateOrganizerCode = () => randomWords(ORGANIZER_CODE_WORDS).join("-");
export const generateSlug = () => `${randomWords(2).join("-")}-${randomInt(10, 100)}`;

/** Lets people type "482 913" or "Snow Frost holly IVY", or paste with stray spaces. */
export function normalizeCode(code: string) {
  const digits = code.replace(/\D/g, "");
  if (digits) return digits;

  return code
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const WORD_SET = new Set<string>(WORDS);
const LONGEST_WORD = Math.max(...WORDS.map((word) => word.length));
const MAX_READINGS = 8;

/** Every way a run of letters splits into exactly `wordCount` code words. */
function readingsOf(letters: string, wordCount: number, words: string[] = []): string[] {
  if (wordCount === 0) return letters === "" ? [words.join("-")] : [];

  const readings: string[] = [];
  for (let end = 1; end <= Math.min(letters.length, LONGEST_WORD); end++) {
    const word = letters.slice(0, end);
    if (WORD_SET.has(word)) readings.push(...readingsOf(letters.slice(end), wordCount - 1, [...words, word]));
  }
  return readings;
}

/** People often type a code with no gaps, so the words are recovered from the letters. */
function candidateForms(code: string) {
  const normalized = normalizeCode(code);
  if (/^\d+$/.test(normalized)) return [normalized];

  const letters = normalized.replaceAll("-", "");
  const readings = [LEGACY_ELF_CODE_WORDS, ORGANIZER_CODE_WORDS].flatMap((count) => readingsOf(letters, count));
  return [...new Set([normalized, ...readings])].slice(0, MAX_READINGS);
}

export const hashCode = (code: string) => bcrypt.hash(normalizeCode(code), rounds());

export async function verifyCode(code: string, hash: string) {
  for (const form of candidateForms(code)) {
    if (await bcrypt.compare(form, hash)) return true;
  }
  return false;
}

/** Burned when the person does not exist, so timing does not reveal who does. */
const DUMMY_HASH = bcrypt.hashSync("no-such-person", 4);
export const burnVerification = (code: string) => bcrypt.compare(normalizeCode(code), DUMMY_HASH);
