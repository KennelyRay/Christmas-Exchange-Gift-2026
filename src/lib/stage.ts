import type { LobbyView, PublicAuditEntry } from "./types";

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
    if (entry.event === "participant_joined") times.set(nameFromJoinEntry(entry), entry.at);
  }
  return times;
}

export const joinedNameKey = (slug: string) => `joined-name:${slug}`;
