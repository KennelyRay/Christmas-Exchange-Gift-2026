"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import type { Stage } from "@/lib/stage";

const STEPS: ReadonlyArray<{ n: Stage; label: MessageKey; note: MessageKey }> = [
  { n: 1, label: "step.1", note: "step.1.note" },
  { n: 2, label: "step.2", note: "step.2.note" },
  { n: 3, label: "step.3", note: "step.3.note" },
  { n: 4, label: "step.4", note: "step.4.note" },
];

/** Where the whole exchange is. Each state has words as well as a color. */
export function Stepper({ current, direction }: { current: Stage; direction: "row" | "column" }) {
  const t = useT();

  return (
    <ol className={`grid gap-2 ${direction === "row" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1"}`}>
      {STEPS.map(({ n, label, note }) => {
        const state = n < current ? "done" : n === current ? "now" : "later";
        const surface = state === "now" ? "bg-gold text-ink ring-gold" : "bg-pine-950/60 text-snow ring-white/20";
        const badge = state === "now" ? "bg-ink text-gold" : state === "done" ? "bg-gold text-ink" : "bg-pine-700 text-snow";

        return (
          <li key={n} aria-current={state === "now" ? "step" : undefined} className={`flex min-w-0 items-start gap-4 rounded-tile p-4 ring-1 [[data-big-text]_&]:flex-col ${surface}`}>
            <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full font-display text-xl font-semibold max-md:size-8 max-md:text-base ${badge}`}>
              {state === "done" ? <CheckIcon size={22} weight="bold" /> : n}
            </span>
            <div className="min-w-0">
              <p className="text-lg leading-snug font-bold wrap-anywhere">{t(label)}</p>
              <p className="text-sm wrap-anywhere">{t(note)}</p>
              <p className="mt-1 text-sm font-bold">{t(state === "now" ? "step.now" : state === "done" ? "step.done" : "step.later")}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
