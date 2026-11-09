"use client";

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

function Tiles({ parts, numberClass }: { parts: ReturnType<typeof timeParts> | null; numberClass: string }) {
  const t = useT();
  return (
    <dl role="timer" className="grid grid-cols-[repeat(auto-fit,minmax(min(4rem,100%),1fr))] gap-2">
      {UNITS.map(([unit, label]) => (
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

/** One big number: days, then hours on the last day, then minutes in the last hour. */
export function CountdownFocal({ target }: { target: Date }) {
  const now = useNow();
  const t = useT();

  if (now !== null && target.getTime() <= now) {
    return <p className="font-display text-5xl font-semibold text-gold">{t("count.done")}</p>;
  }

  const parts = now === null ? null : timeParts(target.getTime() - now);
  let value: number | string = "--";
  let label: MessageKey = "home.days";
  if (parts) {
    if (parts.days > 0) [value, label] = [parts.days, parts.days === 1 ? "home.day" : "home.days"];
    else if (parts.hours > 0) [value, label] = [parts.hours, parts.hours === 1 ? "home.hour" : "home.hours"];
    else [value, label] = [parts.minutes, parts.minutes === 1 ? "home.minute" : "home.minutes"];
  }

  return (
    <div role="timer">
      <p className="font-display text-[clamp(5rem,32vw,8rem)] leading-none font-semibold text-gold tabular-nums">{value}</p>
      <p className="mt-2 text-base">{t(label)}</p>
    </div>
  );
}
