import { checkFeasibility, MIN_PARTICIPANTS, type DrawProblem, type ExclusionPair } from "@/lib/draw";
import { fullNameOf } from "@/lib/names";

export type DrawCandidate = { id: string; firstName: string; lastName: string; lastNameKey: string };

export type DrawCheck = {
  /** Full explanation for the organizer. */
  message: string;
  /** Safe for the public lobby: manual rules are never spelled out there. */
  publicMessage: string;
  /** True when locking would only prevent the fix, which is more people joining. */
  blocksLock: boolean;
};

const LOBBY_STEP_BUDGET = 5_000;
const RULES_NEED_CHANGING = "The organizer's rules need adjusting before the draw can run.";

export function describeProblem(problem: DrawProblem, people: readonly DrawCandidate[]) {
  switch (problem.kind) {
    case "too_few":
      return `The draw needs at least ${MIN_PARTICIPANTS} people.`;
    case "family_majority": {
      const label = people.find((person) => person.lastNameKey === problem.family)?.lastName ?? "One";
      return `The ${label} family has ${problem.count} of ${problem.total} people, so they can't avoid drawing each other. Add more people from other families.`;
    }
    case "stuck": {
      const names = people.filter((p) => problem.people.includes(p.id)).map((p) => fullNameOf(p.firstName, p.lastName));
      return `${names.join(", ")} ${names.length === 1 ? "has" : "have"} too few people left to draw. Everyone needs at least two people the rules allow, so remove a rule.`;
    }
    case "impossible":
      return "No single gift chain can satisfy these rules. Remove a rule or add more people.";
  }
}

/** Null means no problem to report: the pool is too small to judge yet, or the draw can run. */
export function assessDraw(
  people: readonly DrawCandidate[],
  pairs: readonly ExclusionPair[],
  stepBudget = LOBBY_STEP_BUDGET,
): DrawCheck | null {
  if (people.length < MIN_PARTICIPANTS) return null;

  const pool = people.map(({ id, lastNameKey }) => ({ id, family: lastNameKey }));
  const feasibility = checkFeasibility(pool, pairs, { stepBudget });
  if (feasibility.result !== "impossible") return null;

  const { problem } = feasibility;
  const message = describeProblem(problem, people);
  const isFamilyProblem = problem.kind === "family_majority";
  return { message, publicMessage: isFamilyProblem ? message : RULES_NEED_CHANGING, blocksLock: isFamilyProblem };
}
