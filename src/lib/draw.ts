/**
 * The gift-chain draw. Pure logic with an injected RNG, so the real draw uses
 * node:crypto while tests replay exact sequences from a seed.
 */

/** Returns a uniform integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

/** `family` must already be normalized: everyone with the same value is one family. */
export type DrawPerson = { id: string; family: string };

export type ExclusionPair = readonly [string, string];

export type DrawProblem =
  | { kind: "too_few" }
  | { kind: "family_majority"; family: string; count: number; total: number }
  | { kind: "stuck"; people: string[] }
  | { kind: "impossible" };

export type DrawErrorCode = "too_few" | "duplicate_people" | "family_majority" | "impossible" | "too_constrained";

export class DrawError extends Error {
  constructor(
    readonly code: DrawErrorCode,
    message: string,
    readonly problem?: DrawProblem,
  ) {
    super(message);
    this.name = "DrawError";
  }
}

export const MIN_PARTICIPANTS = 3;

const DEFAULT_STEP_BUDGET = 50_000;
const FALLBACK_RESTARTS = 8;

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

function shuffled<T>(items: readonly T[], rng: RandomInt) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

type Graph = {
  blocked: boolean[][];
  neighbors: number[][];
  familyOf: number[];
  familyCount: number;
};

function buildGraph(people: readonly DrawPerson[], exclusions: readonly ExclusionPair[]): Graph {
  const indexOf = new Map(people.map((person, i) => [person.id, i]));
  const families = new Map<string, number>();
  const familyOf = people.map(({ family }) => {
    if (!families.has(family)) families.set(family, families.size);
    return families.get(family)!;
  });

  const blocked = people.map((_, i) => people.map((__, j) => familyOf[i] === familyOf[j]));
  for (const [a, b] of exclusions) {
    const ia = indexOf.get(a);
    const ib = indexOf.get(b);
    if (ia === undefined || ib === undefined) continue;
    blocked[ia][ib] = true;
    blocked[ib][ia] = true;
  }

  const neighbors = people.map((_, i) => people.flatMap((__, j) => (blocked[i][j] ? [] : [j])));
  return { blocked, neighbors, familyOf, familyCount: families.size };
}

type CandidateOrder = (candidates: number[], visited: readonly boolean[]) => number[];

/** Depth-first search for a loop through everyone, pruning branches that can't finish. */
function searchCycle(graph: Graph, start: number, order: CandidateOrder, stepBudget: number) {
  const { neighbors, familyOf, familyCount } = graph;
  const n = neighbors.length;
  const visited = new Array<boolean>(n).fill(false);
  const remaining = new Array<number>(familyCount).fill(0);
  familyOf.forEach((family) => remaining[family]++);

  const path = [start];
  visited[start] = true;
  remaining[familyOf[start]]--;

  let steps = 0;
  let exhausted = false;

  // Family members can't be neighbours, so they fit in at most every other open
  // slot. The slots right after `current` and right before `start` may be unusable.
  const familiesFit = (current: number) => {
    const open = n - path.length;
    for (let family = 0; family < familyCount; family++) {
      if (remaining[family] === 0) continue;
      let slots = open;
      if (familyOf[current] === family) slots--;
      if (familyOf[start] === family) slots--;
      if (remaining[family] > Math.max(0, Math.ceil(slots / 2))) return false;
    }
    return true;
  };

  const hasDeadEnd = (current: number) => {
    for (let v = 0; v < n; v++) {
      if (visited[v]) continue;
      let exits = 0;
      for (const w of neighbors[v]) {
        if (!visited[w] || w === current || w === start) exits++;
      }
      if (exits < 2) return true;
    }
    return false;
  };

  const search = (current: number): boolean => {
    if (path.length === n) return neighbors[current].includes(start);
    if (++steps > stepBudget) {
      exhausted = true;
      return false;
    }

    for (const v of order(neighbors[current].filter((w) => !visited[w]), visited)) {
      visited[v] = true;
      remaining[familyOf[v]]--;
      path.push(v);

      if (familiesFit(v) && !hasDeadEnd(v) && search(v)) return true;

      path.pop();
      remaining[familyOf[v]]++;
      visited[v] = false;
      if (exhausted) return false;
    }
    return false;
  };

  return { cycle: search(start) ? path : null, exhausted };
}

export type Feasibility = { result: "possible" | "unknown" } | { result: "impossible"; problem: DrawProblem };

function largestFamily(people: readonly DrawPerson[]) {
  const counts = new Map<string, number>();
  for (const { family } of people) counts.set(family, (counts.get(family) ?? 0) + 1);
  let largest = { family: "", count: 0 };
  for (const [family, count] of counts) {
    if (count > largest.count) largest = { family, count };
  }
  return largest;
}

/**
 * Can any single chain satisfy every rule? This only decides possibility and
 * never picks the chain, so its deterministic search order can't bias the draw.
 */
export function checkFeasibility(
  people: readonly DrawPerson[],
  exclusions: readonly ExclusionPair[] = [],
  { stepBudget = DEFAULT_STEP_BUDGET }: { stepBudget?: number } = {},
): Feasibility {
  if (people.length < MIN_PARTICIPANTS) return { result: "impossible", problem: { kind: "too_few" } };

  // In a loop, no two members of a family can sit side by side, so one family
  // can fill at most half the seats.
  const { family, count } = largestFamily(people);
  if (count * 2 > people.length) {
    return { result: "impossible", problem: { kind: "family_majority", family, count, total: people.length } };
  }

  const graph = buildGraph(people, exclusions);

  // Each person needs two different partners: one to give to, one to receive from.
  const stuck = people.filter((_, i) => graph.neighbors[i].length < 2).map((person) => person.id);
  if (stuck.length > 0) return { result: "impossible", problem: { kind: "stuck", people: stuck } };

  const fewestOptionsFirst: CandidateOrder = (candidates, visited) =>
    candidates
      .map((v) => ({ v, free: graph.neighbors[v].filter((w) => !visited[w]).length }))
      .sort((a, b) => a.free - b.free)
      .map(({ v }) => v);

  const { cycle, exhausted } = searchCycle(graph, 0, fewestOptionsFirst, stepBudget);
  if (cycle) return { result: "possible" };
  return exhausted ? { result: "unknown" } : { result: "impossible", problem: { kind: "impossible" } };
}

function errorFor(problem: DrawProblem) {
  switch (problem.kind) {
    case "too_few":
      return new DrawError("too_few", `The draw needs at least ${MIN_PARTICIPANTS} people.`, problem);
    case "family_majority":
      return new DrawError("family_majority", `One family has ${problem.count} of ${problem.total} people.`, problem);
    case "stuck":
    case "impossible":
      return new DrawError("impossible", "No single gift chain can satisfy these rules.", problem);
  }
}

export type DrawResult = {
  /** Ids in giving order: chain[i] gives to chain[i + 1], and the last gives to chain[0]. */
  chain: string[];
  attempts: number;
  method: "random_cycle" | "backtracking";
};

export type DrawOptions = { maxAttempts?: number; stepBudget?: number };

/**
 * Prefers a whole random cycle, retried until it obeys every rule: rejecting
 * whole cycles keeps the choice uniform among all valid chains. When the rules
 * are so tight that retries run out, a randomized search still finds a chain.
 */
export function drawGiftChain(
  people: readonly DrawPerson[],
  exclusions: readonly ExclusionPair[],
  rng: RandomInt,
  { maxAttempts = 20_000, stepBudget = DEFAULT_STEP_BUDGET }: DrawOptions = {},
): DrawResult {
  if (new Set(people.map((person) => person.id)).size !== people.length) {
    throw new DrawError("duplicate_people", "The same person appears twice in the pool.");
  }

  const feasibility = checkFeasibility(people, exclusions, { stepBudget });
  if (feasibility.result === "impossible") throw errorFor(feasibility.problem);

  const graph = buildGraph(people, exclusions);
  const n = people.length;
  const toIds = (order: readonly number[]) => order.map((i) => people[i].id);

  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const next = sattoloCycle(n, rng);
    if (next.every((to, from) => !graph.blocked[from][to])) {
      // A random starting point stops the first joiner from always opening the chain.
      return { chain: toIds(cycleToChain(next, rng(n))), attempts, method: "random_cycle" };
    }
  }

  const randomOrder: CandidateOrder = (candidates) => shuffled(candidates, rng);
  for (let restart = 0; restart < FALLBACK_RESTARTS; restart++) {
    const { cycle } = searchCycle(graph, rng(n), randomOrder, stepBudget);
    if (cycle) return { chain: toIds(cycle), attempts: maxAttempts, method: "backtracking" };
  }

  throw new DrawError("too_constrained", "These rules leave almost no valid chains, so the draw gave up. Remove a rule and try again.");
}

/** Independent re-check of a chain, run again just before it is stored. */
export function isValidChain(
  chain: readonly string[],
  people: readonly DrawPerson[],
  exclusions: readonly ExclusionPair[] = [],
): boolean {
  if (chain.length !== people.length || people.length < MIN_PARTICIPANTS) return false;
  if (new Set(chain).size !== chain.length) return false;

  const familyOf = new Map(people.map((person) => [person.id, person.family]));
  if (!chain.every((id) => familyOf.has(id))) return false;

  const pairKey = (a: string, b: string) => JSON.stringify(a < b ? [a, b] : [b, a]);
  const forbidden = new Set(exclusions.map(([a, b]) => pairKey(a, b)));
  return chain.every((giver, i) => {
    const recipient = chain[(i + 1) % chain.length];
    return (
      giver !== recipient && familyOf.get(giver) !== familyOf.get(recipient) && !forbidden.has(pairKey(giver, recipient))
    );
  });
}
