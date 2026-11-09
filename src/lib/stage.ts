import { normalizeNamePart } from "./names";
import type { LobbyView, PublicAuditEntry, PublicParticipant } from "./types";

export type LobbyModel = {
  lobby: LobbyView;
  stage: Stage;
  mainAction: MainAction | null;
  joinedName: string | null;
  joinTimes: ReadonlyMap<string, string>;
  christmas: Date;
  stale: boolean;
};

export type Stage = 1 | 2 | 3 | 4;
export type MainAction = "add" | "share" | "envelope" | "chain";

export function stageOf(status: LobbyView["status"], chainIsOpen: boolean): Stage {
  if (status === "open") return 1;
  if (status === "locked") return 2;
  return chainIsOpen ? 4 : 3;
}

/** The one thing this person should do next. Null when they only need to wait. */
export function mainActionOf(stage: Stage, hasJoined: boolean): MainAction | null {
  if (stage === 1) return hasJoined ? "share" : "add";
  if (stage === 2) return null;
  return stage === 3 ? "envelope" : "chain";
}

const JOINED_SUFFIX = / joined the pool$/;

export const nameFromJoinEntry = (entry: PublicAuditEntry) => entry.detail.replace(JOINED_SUFFIX, "");

/** The lobby API has no join time, but the public log records each arrival by full name. */
export function joinTimesFrom(audit: readonly PublicAuditEntry[]) {
  const times = new Map<string, string>();
  for (const entry of audit) {
    // Newest first, so someone removed who joined again keeps their latest time.
    if (entry.event === "participant_joined" && !times.has(nameFromJoinEntry(entry))) times.set(nameFromJoinEntry(entry), entry.at);
  }
  return times;
}

/** This device remembers a first name; the organizer may have removed that person since. */
export function isStillJoined(firstName: string, people: readonly PublicParticipant[]) {
  const prefix = `${normalizeNamePart(firstName)} `;
  return people.some((person) => normalizeNamePart(person.name).startsWith(prefix));
}

export const joinedNameKey = (slug: string) => `joined-name:${slug}`;
