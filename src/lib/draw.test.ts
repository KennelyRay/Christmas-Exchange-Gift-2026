import { describe, expect, it } from "vitest";
import {
  checkFeasibility,
  cycleToChain,
  DrawError,
  drawGiftChain,
  isValidChain,
  sattoloCycle,
  type ExclusionPair,
} from "./draw";
import { createSeededRandomInt, secureRandomInt } from "./rng";

const people = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function expectDrawError(fn: () => unknown, code: DrawError["code"]) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DrawError);
    expect((error as DrawError).code).toBe(code);
    return error as DrawError;
  }
  throw new Error(`expected DrawError ${code}`);
}

describe("sattoloCycle", () => {
  it("never lets anyone draw themselves", () => {
    const rng = createSeededRandomInt(1);
    for (let run = 0; run < 3000; run++) {
      const n = 2 + (run % 30);
      sattoloCycle(n, rng).forEach((to, from) => expect(to).not.toBe(from));
    }
  });

  it("always forms one single loop through everyone", () => {
    const rng = createSeededRandomInt(2);
    for (let run = 0; run < 3000; run++) {
      const n = 2 + (run % 30);
      const next = sattoloCycle(n, rng);
      expect(new Set(next).size).toBe(n);
      expect(cycleToChain(next, 0)).toHaveLength(n);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(sattoloCycle(12, createSeededRandomInt(99))).toEqual(
      sattoloCycle(12, createSeededRandomInt(99)),
    );
  });

  it("produces different cycles for different seeds", () => {
    expect(sattoloCycle(12, createSeededRandomInt(99))).not.toEqual(
      sattoloCycle(12, createSeededRandomInt(100)),
    );
  });

  it("gives every possible cycle an equal chance", () => {
    const rng = createSeededRandomInt(2026);
    const runs = 120_000;
    const counts = new Map<string, number>();
    for (let run = 0; run < runs; run++) {
      const key = sattoloCycle(5, rng).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // 5 people have exactly 4! = 24 possible single cycles.
    expect(counts.size).toBe(24);
    const expected = runs / 24;
    for (const count of counts.values()) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.06);
    }
  });
});

describe("drawGiftChain", () => {
  it("returns every person exactly once, in a valid chain", () => {
    const rng = createSeededRandomInt(3);
    const ids = people(15);
    for (let run = 0; run < 500; run++) {
      const { chain } = drawGiftChain(ids, [], rng);
      expect([...chain].sort()).toEqual([...ids].sort());
      expect(isValidChain(chain, ids)).toBe(true);
    }
  });

  it("replays the same chain from the same seed", () => {
    const ids = people(10);
    const exclusions: ExclusionPair[] = [["p0", "p1"], ["p2", "p3"]];
    expect(drawGiftChain(ids, exclusions, createSeededRandomInt(42))).toEqual(
      drawGiftChain(ids, exclusions, createSeededRandomInt(42)),
    );
  });

  it("varies who starts the chain", () => {
    const rng = createSeededRandomInt(4);
    const ids = people(6);
    const starters = new Set<string>();
    for (let run = 0; run < 300; run++) starters.add(drawGiftChain(ids, [], rng).chain[0]);
    expect(starters.size).toBe(6);
  });

  it("works with the secure RNG", () => {
    const ids = people(25);
    expect(isValidChain(drawGiftChain(ids, [], secureRandomInt).chain, ids)).toBe(true);
  });

  it("respects exclusions in both directions", () => {
    const ids = people(10);
    const exclusions: ExclusionPair[] = [
      ["p0", "p1"],
      ["p2", "p3"],
      ["p4", "p5"],
      ["p6", "p7"],
    ];
    const rng = createSeededRandomInt(5);
    for (let run = 0; run < 1000; run++) {
      const { chain } = drawGiftChain(ids, exclusions, rng);
      chain.forEach((giver, i) => {
        const recipient = chain[(i + 1) % chain.length];
        for (const [a, b] of exclusions) {
          expect([giver, recipient].sort()).not.toEqual([a, b].sort());
        }
      });
    }
  });

  it("stays uniform across the chains the rules allow", () => {
    const ids = people(5);
    const exclusions: ExclusionPair[] = [["p0", "p1"]];
    const rng = createSeededRandomInt(6);
    const runs = 60_000;
    const counts = new Map<string, number>();
    for (let run = 0; run < runs; run++) {
      const { chain } = drawGiftChain(ids, exclusions, rng);
      const from0 = chain.indexOf("p0");
      const key = [...chain.slice(from0), ...chain.slice(0, from0)].join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Of the 24 cycles, those with p0 and p1 adjacent are removed, leaving 12.
    expect(counts.size).toBe(12);
    const expected = runs / 12;
    for (const count of counts.values()) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.08);
    }
  });

  it("rejects fewer than three people", () => {
    expectDrawError(() => drawGiftChain(people(2), [], secureRandomInt), "too_few");
  });

  it("rejects duplicate people", () => {
    expectDrawError(() => drawGiftChain(["a", "b", "a"], [], secureRandomInt), "duplicate_people");
  });

  it("names the person left with nobody to draw", () => {
    const ids = people(5);
    const exclusions: ExclusionPair[] = [
      ["p0", "p1"],
      ["p0", "p2"],
      ["p0", "p3"],
    ];
    const error = expectDrawError(() => drawGiftChain(ids, exclusions, secureRandomInt), "impossible");
    expect(error.people).toEqual(["p0"]);
  });

  it("detects impossible rules that per-person counts cannot catch", () => {
    // Allowed graph: p0-p1, p0-p2, p1-p2 and p2-p3, p2-p4, p3-p4. Two triangles
    // joined only at p2, so everyone has two partners but no loop can exist.
    const ids = people(5);
    const exclusions: ExclusionPair[] = [
      ["p0", "p3"],
      ["p0", "p4"],
      ["p1", "p3"],
      ["p1", "p4"],
    ];
    expect(checkFeasibility(ids, exclusions).result).toBe("impossible");
    expectDrawError(() => drawGiftChain(ids, exclusions, secureRandomInt), "impossible");
  });

  it("handles three couples, a typical family setup", () => {
    const ids = people(6);
    const exclusions: ExclusionPair[] = [
      ["p0", "p1"],
      ["p2", "p3"],
      ["p4", "p5"],
    ];
    expect(checkFeasibility(ids, exclusions).result).toBe("possible");
    const rng = createSeededRandomInt(7);
    for (let run = 0; run < 500; run++) {
      expect(isValidChain(drawGiftChain(ids, exclusions, rng).chain, ids, exclusions)).toBe(true);
    }
  });

  it("gives up with a friendly error when attempts run out", () => {
    const ids = people(6);
    // A stuck RNG repeats one cycle forever, so blocking one of its links can never pass.
    const stuckRng = () => 0;
    const next = sattoloCycle(6, stuckRng);
    const blockedPair: ExclusionPair = ["p0", `p${next[0]}`];
    expectDrawError(
      () => drawGiftChain(ids, [blockedPair], stuckRng, { maxAttempts: 25 }),
      "too_constrained",
    );
  });

  it("ignores exclusions for people not in the pool", () => {
    const ids = people(4);
    expect(() => drawGiftChain(ids, [["p0", "ghost"]], secureRandomInt)).not.toThrow();
  });
});

describe("isValidChain", () => {
  const ids = ["a", "b", "c", "d"];

  it("accepts a correct chain", () => {
    expect(isValidChain(["c", "a", "d", "b"], ids)).toBe(true);
  });

  it("rejects a chain missing someone", () => {
    expect(isValidChain(["a", "b", "c"], ids)).toBe(false);
  });

  it("rejects repeats and strangers", () => {
    expect(isValidChain(["a", "a", "b", "c"], ids)).toBe(false);
    expect(isValidChain(["a", "b", "c", "z"], ids)).toBe(false);
  });

  it("rejects a chain that breaks a rule, including the closing link", () => {
    expect(isValidChain(["a", "b", "c", "d"], ids, [["a", "b"]])).toBe(false);
    expect(isValidChain(["a", "b", "c", "d"], ids, [["d", "a"]])).toBe(false);
    expect(isValidChain(["a", "c", "b", "d"], ids, [["a", "b"]])).toBe(true);
  });
});
