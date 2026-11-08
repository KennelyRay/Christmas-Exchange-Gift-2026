/**
 * The gift-chain draw. Pure logic with an injected RNG, so the real draw uses
 * node:crypto while tests replay exact sequences from a seed.
 */

/** Returns a uniform integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

export type ExclusionPair = readonly [string, string];

export type DrawErrorCode = "too_few" | "duplicate_people" | "impossible" | "too_constrained";

export class DrawError extends Error {
  constructor(
    readonly code: DrawErrorCode,
    message: string,
    /** Participant ids that explain the failure, when there is a specific culprit. */
    readonly people: string[] = [],
  ) {
    super(message);
    this.name = "DrawError";
  }
}

export const MIN_PARTICIPANTS = 3;

/**
 * Sattolo's algorithm. The result `next` is a single n-cycle: person i gives to
 * next[i]. Every one of the (n-1)! possible cycles is equally likely, and a
 * single cycle can never contain a fixed point, so nobody draws themselves.
 */
export function sattoloCycle(n: number, rng: RandomInt): number[] {
  const next = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    // j < i is what separates Sattolo from Fisher-Yates (j <= i).
    const j = rng(i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Walks a cycle from `start`, returning people in giving order. */
export function cycleToChain(next: readonly number[], start: number): number[] {
  const chain: number[] = [];
  let current = start;
  do {
    chain.push(current);
    current = next[current];
  } while (current !== start && chain.length <= next.length);
  return chain;
}

function buildBlockedMatrix(ids: readonly string[], exclusions: readonly ExclusionPair[]) {
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const blocked = ids.map(() => new Array<boolean>(ids.length).fill(false));
  for (const [a, b] of exclusions) {
    const ia = indexOf.get(a);
    const ib = indexOf.get(b);
    if (ia === undefined || ib === undefined) continue;
    blocked[ia][ib] = true;
    blocked[ib][ia] = true;
  }
  return blocked;
}

function cycleRespectsRules(next: readonly number[], blocked: readonly boolean[][]) {
  return next.every((to, from) => !blocked[from][to]);
}

export type Feasibility = "possible" | "impossible" | "unknown";

const FEASIBILITY_STEP_BUDGET = 2_000_000;

/**
 * Can any single chain satisfy the rules? This is a Hamiltonian-cycle search
 * over the "allowed to draw" graph. It only decides possibility and never
 * picks the chain, so its deterministic order cannot bias the draw.
 */
export function checkFeasibility(
  ids: readonly string[],
  exclusions: readonly ExclusionPair[],
): { result: Feasibility; stuck: string[] } {
  const n = ids.length;
  const blocked = buildBlockedMatrix(ids, exclusions);
  const neighbors = ids.map((_, i) =>
    ids.flatMap((__, j) => (i !== j && !blocked[i][j] ? [j] : [])),
  );

  // In a chain each person needs two different partners: a giver and a recipient.
  const stuck = ids.filter((_, i) => neighbors[i].length < 2);
  if (stuck.length > 0) return { result: "impossible", stuck };

  const visited = new Array<boolean>(n).fill(false);
  let steps = 0;
  let exhausted = false;

  const hasDeadEnd = (current: number) => {
    for (let v = 0; v < n; v++) {
      if (visited[v]) continue;
      const exits = neighbors[v].filter((w) => !visited[w] || w === current || w === 0);
      if (exits.length < 2) return true;
    }
    return false;
  };

  const search = (current: number, depth: number): boolean => {
    if (depth === n) return neighbors[current].includes(0);
    if (++steps > FEASIBILITY_STEP_BUDGET) {
      exhausted = true;
      return false;
    }
    const candidates = neighbors[current]
      .filter((v) => !visited[v])
      .map((v) => ({ v, free: neighbors[v].filter((w) => !visited[w]).length }))
      .sort((a, b) => a.free - b.free);

    for (const { v } of candidates) {
      visited[v] = true;
      const found = !hasDeadEnd(v) && search(v, depth + 1);
      if (found) return true;
      visited[v] = false;
      if (exhausted) return false;
    }
    return false;
  };

  visited[0] = true;
  if (search(0, 1)) return { result: "possible", stuck: [] };
  return { result: exhausted ? "unknown" : "impossible", stuck: [] };
}

export type DrawResult = {
  /** Ids in giving order: chain[i] gives to chain[i + 1], and the last gives to chain[0]. */
  chain: string[];
  attempts: number;
};

export type DrawOptions = { maxAttempts?: number };

/**
 * Picks one uniformly random single chain among all chains that obey the rules.
 * Rejecting whole cycles keeps the distribution uniform; repairing a bad cycle
 * would favour some outcomes.
 */
export function drawGiftChain(
  ids: readonly string[],
  exclusions: readonly ExclusionPair[],
  rng: RandomInt,
  { maxAttempts = 200_000 }: DrawOptions = {},
): DrawResult {
  if (ids.length < MIN_PARTICIPANTS) {
    throw new DrawError("too_few", `The draw needs at least ${MIN_PARTICIPANTS} people.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new DrawError("duplicate_people", "The same person appears twice in the pool.");
  }

  if (exclusions.length > 0) {
    const { result, stuck } = checkFeasibility(ids, exclusions);
    if (result === "impossible") {
      throw new DrawError(
        "impossible",
        "No single gift chain can satisfy these rules. Remove a rule or two and try again.",
        stuck,
      );
    }
  }

  const blocked = buildBlockedMatrix(ids, exclusions);
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const next = sattoloCycle(ids.length, rng);
    if (cycleRespectsRules(next, blocked)) {
      // A random starting point stops the first joiner from always opening the chain.
      const chain = cycleToChain(next, rng(ids.length)).map((i) => ids[i]);
      return { chain, attempts };
    }
  }

  throw new DrawError(
    "too_constrained",
    "These rules leave almost no valid chains, so the draw gave up. Remove a rule and try again.",
  );
}

/** Independent re-check of a chain, run again just before it is stored. */
export function isValidChain(
  chain: readonly string[],
  ids: readonly string[],
  exclusions: readonly ExclusionPair[] = [],
): boolean {
  if (chain.length !== ids.length || ids.length < MIN_PARTICIPANTS) return false;
  if (new Set(chain).size !== chain.length) return false;
  const known = new Set(ids);
  if (!chain.every((id) => known.has(id))) return false;

  const pairKey = (a: string, b: string) => JSON.stringify(a < b ? [a, b] : [b, a]);
  const forbidden = new Set(exclusions.map(([a, b]) => pairKey(a, b)));
  return chain.every((giver, i) => {
    const recipient = chain[(i + 1) % chain.length];
    return giver !== recipient && !forbidden.has(pairKey(giver, recipient));
  });
}
