import { randomInt } from "node:crypto";
import type { RandomInt } from "./draw";

/** The only RNG the real draw uses. node:crypto's randomInt has no modulo bias. */
export const secureRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

/** Mulberry32, for deterministic tests only. Not suitable for a real draw. */
export function createSeededRandomInt(seed: number): RandomInt {
  let state = seed >>> 0;
  return (maxExclusive) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * maxExclusive);
  };
}
