"use client";

import { TreeEvergreenIcon } from "@phosphor-icons/react";
import { formatManila, timeParts } from "@/lib/christmas";
import { useNow } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const UNITS: ReadonlyArray<[keyof ReturnType<typeof timeParts>, MessageKey]> = [
  ["days", "count.days"],
  ["hours", "count.hours"],
  ["minutes", "count.minutes"],
  ["seconds", "count.seconds"],
];

const MS_PER_DAY = 86_400_000;

function Tiles({ parts, numberClass, units = UNITS }: { parts: ReturnType<typeof timeParts> | null; numberClass: string; units?: typeof UNITS }) {
  const t = useT();
  return (
    <dl role="timer" className="grid grid-cols-[repeat(auto-fit,minmax(min(4rem,100%),1fr))] gap-2">
      {units.map(([unit, label]) => (
        <div key={unit} className="flex flex-col-reverse items-center rounded-tile bg-pine-950/70 py-2 text-center">
          <dt className="text-sm font-semibold wrap-normal text-snow">{t(label)}</dt>
          <dd className={`font-display font-semibold tabular-nums text-gold ${numberClass}`}>{parts ? String(parts[unit]).padStart(2, "0") : "--"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Countdown({ target, doneLabel, size = "md" }: { target: Date; doneLabel: string; size?: "md" | "lg" }) {
  const now = useNow();

  if (now !== null && target.getTime() <= now) {
    return <p className="font-display text-3xl font-semibold text-gold">{doneLabel}</p>;
  }

  const parts = now === null ? null : timeParts(target.getTime() - now);
  return <Tiles parts={parts} numberClass={size === "lg" ? "text-5xl sm:text-6xl" : "text-4xl lg:text-5xl"} />;
}

export function CountdownCard({ target, revealAt }: { target: Date; revealAt: string }) {
  const t = useT();
  return (
    <section aria-labelledby="countdown-title" className="grid gap-4 rounded-card bg-pine-800/90 p-4 shadow-card ring-1 ring-gold/40 md:p-6">
      <h2 id="countdown-title" className="font-display text-xl font-semibold">
        {t("count.until")}
      </h2>
      <Countdown target={target} doneLabel={t("count.done")} />
      <div className="grid gap-2">
        <p className="text-base font-bold">{t("count.reveal", { date: formatManila(revealAt), manila: t("common.manila") })}</p>
        <p className="text-base text-snow-soft">{t("count.chainExplained")}</p>
      </div>
    </section>
  );
}

/** Days, hours and minutes in big numbers, for the phone's Home screen. */
export function CountdownBig({ target }: { target: Date }) {
  const now = useNow();
  const t = useT();

  if (now !== null && target.getTime() <= now) {
    return <p className="font-display text-3xl font-semibold text-gold">{t("count.done")}</p>;
  }
  return <Tiles parts={now === null ? null : timeParts(target.getTime() - now)} numberClass="text-5xl [@media(max-height:42rem)]:text-4xl" units={UNITS.slice(0, 3)} />;
}

function chipLabel(remainingMs: number, t: ReturnType<typeof useT>) {
  if (remainingMs <= 0) return t("count.chipToday");
  // Rounded down, so it always agrees with the Days tile on the same screen.
  const days = Math.floor(remainingMs / MS_PER_DAY);
  if (days === 0) return t("count.chip0");
  return days === 1 ? t("count.chip1") : t("count.chip", { n: days });
}

/** Compact "45 days to go" for the phone's top bar. */
export function CountdownChip({ target }: { target: Date }) {
  const now = useNow();
  const t = useT();
  const label = now === null ? " " : chipLabel(target.getTime() - now, t);

  return (
    <p className="flex shrink-0 items-center gap-1 rounded-full bg-pine-950/70 px-4 py-1 text-sm font-bold tabular-nums text-gold ring-1 ring-gold/40">
      <TreeEvergreenIcon aria-hidden size={18} weight="fill" className="shrink-0" />
      {label}
    </p>
  );
}
