"use client";

import { AnimatePresence, motion } from "motion/react";
import { formatManila } from "@/lib/christmas";
import { useT } from "@/lib/i18n";
import { groupByFamily } from "@/lib/names";
import type { PublicParticipant } from "@/lib/types";

type JoinTimes = ReadonlyMap<string, string>;

function initialsOf({ name, lastName }: PublicParticipant) {
  const firstName = name.slice(0, Math.max(0, name.length - lastName.length)).trim();
  const [first] = Array.from(firstName || name);
  const [last] = Array.from(lastName);
  return `${first ?? ""}${firstName ? (last ?? "") : ""}`.toUpperCase();
}

export function Avatar({ person }: { person: PublicParticipant }) {
  return (
    <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-pine-800 font-display text-xl font-semibold text-gold max-md:size-10 max-md:text-base">
      {initialsOf(person)}
    </span>
  );
}

function PersonDetails({ person, joinedAt }: { person: PublicParticipant; joinedAt?: string }) {
  const t = useT();
  return (
    <div className="min-w-0 flex-1">
      <p className="text-lg leading-snug font-bold wrap-anywhere">{person.name}</p>
      <p className="text-base text-ink-soft">{person.itemCount === 1 ? t("joined.items1") : t("joined.items", { n: person.itemCount })}</p>
      {joinedAt && <p className="text-sm text-ink-soft">{t("joined.at", { date: formatManila(joinedAt) })}</p>}
    </div>
  );
}

type Layout = "cards" | "rows";

/** Everyone, under a header for each family. Cards on wide screens, large rows on phones. */
export function FamilyList({ people, joinTimes, layout }: { people: readonly PublicParticipant[]; joinTimes: JoinTimes; layout: Layout }) {
  const t = useT();

  return (
    <div className="grid gap-8">
      {groupByFamily(people).map((family) => (
        <section key={family.key} aria-label={t("joined.family", { name: family.label })}>
          <h3 className="mb-4 flex items-baseline justify-between gap-4 border-b-2 border-ink/15 pb-2 font-display text-xl font-semibold">
            <span className="min-w-0 wrap-anywhere">{t("joined.family", { name: family.label })}</span>
            <span className="shrink-0 font-sans text-base font-bold text-ink-soft tabular-nums">
              {family.members.length === 1 ? t("joined.familyCount1") : t("joined.familyCount", { n: family.members.length })}
            </span>
          </h3>
          <ul className={layout === "cards" ? "grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-4" : "grid gap-2"}>
            <AnimatePresence initial={false}>
              {family.members.map((person) => (
                <motion.li
                  key={person.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="flex min-w-0 items-center gap-4 rounded-tile bg-paper-deep/70 p-4"
                >
                  <Avatar person={person} />
                  <PersonDetails person={person} joinedAt={joinTimes.get(person.name)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}
