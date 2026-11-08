"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui";

type SecretCodeProps = {
  label: string;
  code: string;
  explanation: ReactNode;
  confirmLabel: string;
  onDone: () => void;
  doneLabel: string;
};

/** Shown exactly once. The server keeps only a hash, so leaving is guarded. */
export function SecretCode({ label, code, explanation, confirmLabel, onDone, doneLabel }: SecretCodeProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (saved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="-rotate-1 rounded-3xl border-2 border-dashed border-gold-deep bg-gold/40 p-5 sm:p-6">
        <p className="font-display text-2xl font-semibold text-wax-deep">Screenshot this!</p>
        <p className="mt-3 text-sm font-semibold">{label}</p>
        <p className="mt-1 font-display text-3xl leading-tight font-semibold break-words sm:text-4xl">
          {code.split("-").join(" · ")}
        </p>
      </div>

      <p className="text-sm text-ink-soft">{explanation}</p>

      <Button variant="ghost" onClick={copy} className="w-full">
        {copied ? <CheckIcon aria-hidden size={20} /> : <CopyIcon aria-hidden size={20} />}
        <span aria-live="polite">{copied ? "Copied" : "Copy the code"}</span>
      </Button>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-6 shrink-0 accent-[#a3262b]" />
        {confirmLabel}
      </label>

      <Button onClick={onDone} disabled={!saved} className="w-full">
        {doneLabel}
      </Button>
    </div>
  );
}
