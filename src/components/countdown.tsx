"use client";

import { timeParts } from "@/lib/christmas";
import { useNow } from "@/lib/hooks";

const UNITS = ["days", "hours", "minutes", "seconds"] as const;

export function Countdown({ target, doneLabel, size = "md" }: { target: Date; doneLabel: string; size?: "md" | "lg" }) {
  const now = useNow();

  if (now !== null && target.getTime() <= now) {
    return <p className="font-display text-3xl font-semibold text-gold">{doneLabel}</p>;
  }

  const parts = now === null ? null : timeParts(target.getTime() - now);
  const numberSize = size === "lg" ? "text-5xl sm:text-8xl" : "text-3xl sm:text-4xl";

  return (
    <dl role="timer" className="flex gap-4 sm:gap-6">
      {UNITS.map((unit) => (
        <div key={unit} className="flex flex-col-reverse">
          <dt className="text-xs font-medium text-snow/75 capitalize">{unit}</dt>
          <dd className={`font-display font-semibold tabular-nums text-gold ${numberSize}`}>
            {parts ? String(parts[unit]).padStart(2, "0") : "--"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
