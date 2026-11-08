import { describe, expect, it } from "vitest";
import {
  checkFeasibility,
  cycleToChain,
  DrawError,
  drawGiftChain,
  isValidChain,
  sattoloCycle,
  type DrawPerson,
  type ExclusionPair,
} from "./draw";
import { normalizeNamePart } from "./names";
import { createSeededRandomInt, secureRandomInt } from "./rng";

/** Everyone in their own family unless given a family list. */
const people = (n: number, families?: readonly string[]): DrawPerson[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, family: families?.[i] ?? `family-${i}` }));

const repeat = (family: string, count: number) => new Array<string>(count).fill(family);

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

function expectNoFamilyLinks(chain: readonly string[], pool: readonly DrawPerson[]) {
  const familyOf = new Map(pool.map((person) => [person.id, person.family]));
  chain.forEach((giver, i) => {
    expect(familyOf.get(giver)).not.toBe(familyOf.get(chain[(i + 1) % chain.length]));
  });
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
    expect(sattoloCycle(12, createSeededRandomInt(99))).toEqual(sattoloCycle(12, createSeededRandomInt(99)));
  });

  it("produces different cycles for different seeds", () => {
    expect(sattoloCycle(12, createSeededRandomInt(99))).not.toEqual(sattoloCycle(12, createSeededRandomInt(100)));
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
  it("returns every person exactly once in one valid loop", () => {
    const rng = createSeededRandomInt(3);
    const pool = people(15);
    for (let run = 0; run < 500; run++) {
      const { chain } = drawGiftChain(pool, [], rng);
      expect([...chain].sort()).toEqual(pool.map((p) => p.id).sort());
      expect(isValidChain(chain, pool)).toBe(true);
    }
  });

  it("replays the same chain from the same seed", () => {
    const pool = people(10, ["a", "a", "b", "b", "c", "c", "d", "e", "f", "g"]);
    const exclusions: ExclusionPair[] = [["p0", "p2"], ["p3", "p4"]];
    expect(drawGiftChain(pool, exclusions, createSeededRandomInt(42))).toEqual(
      drawGiftChain(pool, exclusions, createSeededRandomInt(42)),
    );
  });

  it("varies who starts the chain", () => {
    const rng = createSeededRandomInt(4);
    const pool = people(6);
    const starters = new Set<string>();
    for (let run = 0; run < 300; run++) starters.add(drawGiftChain(pool, [], rng).chain[0]);
    expect(starters.size).toBe(6);
  });

  it("works with the secure RNG", () => {
    const pool = people(25, [...repeat("santos", 8), ...repeat("reyes", 7)]);
    const { chain } = drawGiftChain(pool, [], secureRandomInt);
    expect(isValidChain(chain, pool)).toBe(true);
  });

  it("rejects duplicate people", () => {
    const pool = [
      { id: "a", family: "x" },
      { id: "b", family: "y" },
      { id: "a", family: "z" },
    ];
    expectDrawError(() => drawGiftChain(pool, [], secureRandomInt), "duplicate_people");
  });

  it("rejects fewer than three people", () => {
    expectDrawError(() => drawGiftChain(people(2), [], secureRandomInt), "too_few");
  });
});

describe("the same family name rule", () => {
  it("never lets relatives draw each other", () => {
    const pool = people(12, [...repeat("santos", 4), ...repeat("reyes", 4), ...repeat("lim", 2), "tan", "go"]);
    const rng = createSeededRandomInt(5);
    for (let run = 0; run < 1000; run++) expectNoFamilyLinks(drawGiftChain(pool, [], rng).chain, pool);
  });

  it("treats case, accent, and spacing differences as one family", () => {
    const lastNames = ["Dela Cruz", "dela  cruz", " DÉLA CRUZ ", "Dèla\tCruz", "Peña", "pena", "PEÑA", "Lim", "Tan", "Go", "Yu", "Uy"];
    const keys = lastNames.map(normalizeNamePart);
    expect(new Set(keys.slice(0, 4)).size).toBe(1);
    expect(new Set(keys.slice(4, 7)).size).toBe(1);

    const pool = people(12, keys);
    const rng = createSeededRandomInt(6);
    for (let run = 0; run < 1000; run++) expectNoFamilyLinks(drawGiftChain(pool, [], rng).chain, pool);
  });

  it("counts spelling variants together toward the family limit", () => {
    const keys = ["Santos", "SANTOS", " santos ", "Sántos", "Lim", "Tan"].map(normalizeNamePart);
    const feasibility = checkFeasibility(people(6, keys));
    expect(feasibility).toEqual({
      result: "impossible",
      problem: { kind: "family_majority", family: "santos", count: 4, total: 6 },
    });
  });

  it("blocks the draw when one family is more than half the pool", () => {
    const pool = people(10, [...repeat("santos", 6), "a", "b", "c", "d"]);
    const error = expectDrawError(() => drawGiftChain(pool, [], secureRandomInt), "family_majority");
    expect(error.problem).toEqual({ kind: "family_majority", family: "santos", count: 6, total: 10 });
  });

  it("blocks odd pools where a family is just over half", () => {
    expectDrawError(() => drawGiftChain(people(5, [...repeat("santos", 3), "a", "b"]), [], secureRandomInt), "family_majority");
  });

  it("allows a family of exactly half by alternating around the loop", () => {
    const pool = people(10, [...repeat("santos", 5), "a", "b", "c", "d", "e"]);
    const rng = createSeededRandomInt(7);
    for (let run = 0; run < 200; run++) {
      const { chain } = drawGiftChain(pool, [], rng);
      expect(isValidChain(chain, pool)).toBe(true);
    }
  });

  it("handles a large pool split between two families", () => {
    const pool = people(100, [...repeat("santos", 50), ...repeat("reyes", 50)]);
    const result = drawGiftChain(pool, [], createSeededRandomInt(8), { maxAttempts: 200 });
    expect(result.method).toBe("backtracking");
    expect(isValidChain(result.chain, pool)).toBe(true);
  });

  it("reports a pool with one last name as impossible", () => {
    expectDrawError(() => drawGiftChain(people(4, repeat("santos", 4)), [], secureRandomInt), "family_majority");
  });
});

describe("manual exclusions", () => {
  it("are respected in both directions", () => {
    const pool = people(10);
    const exclusions: ExclusionPair[] = [["p0", "p1"], ["p2", "p3"], ["p4", "p5"], ["p6", "p7"]];
    const rng = createSeededRandomInt(9);
    for (let run = 0; run < 1000; run++) {
      const { chain } = drawGiftChain(pool, exclusions, rng);
      chain.forEach((giver, i) => {
        const pair = [giver, chain[(i + 1) % chain.length]].sort();
        for (const [a, b] of exclusions) expect(pair).not.toEqual([a, b].sort());
      });
    }
  });

  it("combine with the family rule", () => {
    const pool = people(8, ["a", "a", "b", "b", "c", "c", "d", "d"]);
    const exclusions: ExclusionPair[] = [["p0", "p2"], ["p4", "p6"]];
    const rng = createSeededRandomInt(10);
    for (let run = 0; run < 500; run++) {
      expect(isValidChain(drawGiftChain(pool, exclusions, rng).chain, pool, exclusions)).toBe(true);
    }
  });

  it("names the person left with nobody to draw", () => {
    const exclusions: ExclusionPair[] = [["p0", "p1"], ["p0", "p2"], ["p0", "p3"]];
    const error = expectDrawError(() => drawGiftChain(people(5), exclusions, secureRandomInt), "impossible");
    expect(error.problem).toEqual({ kind: "stuck", people: ["p0"] });
  });

  it("detects impossible rules that per-person counts cannot catch", () => {
    // Allowed links form two triangles joined only at p2: everyone has two
    // partners, but no loop can pass through p2 twice.
    const exclusions: ExclusionPair[] = [["p0", "p3"], ["p0", "p4"], ["p1", "p3"], ["p1", "p4"]];
    expect(checkFeasibility(people(5), exclusions)).toEqual({ result: "impossible", problem: { kind: "impossible" } });
    expectDrawError(() => drawGiftChain(people(5), exclusions, secureRandomInt), "impossible");
  });

  it("detects when manual rules make a legal family split impossible", () => {
    // Two families of two must alternate, leaving only p0-p2-p1-p3 style loops.
    const pool = people(4, ["a", "a", "b", "b"]);
    const exclusions: ExclusionPair[] = [["p0", "p2"]];
    expect(checkFeasibility(pool, exclusions).result).toBe("impossible");
  });

  it("ignores rules about people not in the pool", () => {
    expect(() => drawGiftChain(people(4), [["p0", "ghost"]], secureRandomInt)).not.toThrow();
  });

  it("stays uniform across the chains the rules allow", () => {
    const pool = people(5);
    const rng = createSeededRandomInt(11);
    const runs = 60_000;
    const counts = new Map<string, number>();
    for (let run = 0; run < runs; run++) {
      const { chain } = drawGiftChain(pool, [["p0", "p1"]], rng);
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
});

describe("the backtracking fallback", () => {
  // A stuck RNG repeats one cycle forever, so blocking one of its links can never pass.
  const stuckRng = () => 0;
  const blockedLink = (): ExclusionPair => ["p0", `p${sattoloCycle(6, stuckRng)[0]}`];

  it("finds a valid chain when random retries run out", () => {
    const pool = people(6);
    const exclusions = [blockedLink()];
    const result = drawGiftChain(pool, exclusions, stuckRng, { maxAttempts: 25 });
    expect(result.method).toBe("backtracking");
    expect(isValidChain(result.chain, pool, exclusions)).toBe(true);
  });

  it("is randomized, not one fixed answer", () => {
    const pool = people(8);
    const rng = createSeededRandomInt(12);
    const chains = new Set<string>();
    for (let run = 0; run < 50; run++) {
      chains.add(drawGiftChain(pool, [], rng, { maxAttempts: 0 }).chain.join());
    }
    expect(chains.size).toBeGreaterThan(40);
  });

  it("replays the same chain from the same seed", () => {
    const pool = people(10, ["a", "a", "a", "b", "b", "b", "c", "c", "d", "e"]);
    const run = () => drawGiftChain(pool, [], createSeededRandomInt(13), { maxAttempts: 0 });
    expect(run()).toEqual(run());
    expect(isValidChain(run().chain, pool)).toBe(true);
  });

  it("gives up with a clear error if the search budget runs out", () => {
    expectDrawError(
      () => drawGiftChain(people(6), [blockedLink()], stuckRng, { maxAttempts: 25, stepBudget: 0 }),
      "too_constrained",
    );
  });
});

describe("isValidChain", () => {
  const pool = people(4);

  it("accepts a correct chain", () => {
    expect(isValidChain(["p2", "p0", "p3", "p1"], pool)).toBe(true);
  });

  it("rejects a chain missing someone", () => {
    expect(isValidChain(["p0", "p1", "p2"], pool)).toBe(false);
  });

  it("rejects repeats and strangers", () => {
    expect(isValidChain(["p0", "p0", "p1", "p2"], pool)).toBe(false);
    expect(isValidChain(["p0", "p1", "p2", "zz"], pool)).toBe(false);
  });

  it("rejects a same-family link, including the closing link", () => {
    expect(isValidChain(["p0", "p1", "p2", "p3"], people(4, ["a", "a", "b", "c"]))).toBe(false);
    expect(isValidChain(["p0", "p1", "p2", "p3"], people(4, ["a", "b", "c", "a"]))).toBe(false);
  });

  it("rejects a chain that breaks a manual rule, including the closing link", () => {
    expect(isValidChain(["p0", "p1", "p2", "p3"], pool, [["p0", "p1"]])).toBe(false);
    expect(isValidChain(["p0", "p1", "p2", "p3"], pool, [["p3", "p0"]])).toBe(false);
    expect(isValidChain(["p0", "p2", "p1", "p3"], pool, [["p0", "p1"]])).toBe(true);
  });
});
