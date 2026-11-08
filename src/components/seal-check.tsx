"use client";

import { CheckCircleIcon, GiftIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { isSingleLoop, parseManifest, sha256HexInBrowser } from "@/lib/manifest";
import type { SealView } from "@/lib/types";
import { Paper } from "./ui";
import { WaxSeal } from "./wax-seal";

function Result({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircleIcon : XCircleIcon;
  return (
    <li className={`flex items-start gap-2 font-semibold ${ok ? "text-pine-700" : "text-wax"}`}>
      <Icon aria-hidden size={22} className="mt-0.5 shrink-0" />
      {children}
    </li>
  );
}

function OpenedSeal({ seal }: { seal: SealView & { manifest: string } }) {
  const [computed, setComputed] = useState<string | null>(null);
  const manifest = parseManifest(seal.manifest);

  useEffect(() => {
    let active = true;
    void sha256HexInBrowser(seal.manifest).then((hash) => {
      if (active) setComputed(hash);
    });
    return () => {
      active = false;
    };
  }, [seal.manifest]);

  return (
    <div className="grid gap-6">
      <Paper>
        <h2 className="font-display text-2xl font-semibold">Your browser checked this</h2>
        {computed === null ? (
          <p role="status" className="mt-3 text-ink-soft">Checking the seal...</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            <Result ok={computed === seal.commitmentHash}>
              {computed === seal.commitmentHash ? "The list matches the fingerprint published before the reveal" : "The list does NOT match the published fingerprint"}
            </Result>
            <Result ok={isSingleLoop(manifest.assignments)}>
              {isSingleLoop(manifest.assignments) ? "It is one single chain, and nobody drew themselves" : "It is not one single chain"}
            </Result>
          </ul>
        )}
      </Paper>

      <Paper>
        <h2 className="font-display text-2xl font-semibold">Who gave to whom</h2>
        <ol className="mt-4 divide-y divide-ink/10">
          {manifest.assignments.map(({ giver, recipient }) => (
            <li key={giver} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 font-semibold">
              <span className="break-words">{giver}</span>
              <GiftIcon aria-label="gives to" className="text-wax" />
              <span className="break-words">{recipient}</span>
            </li>
          ))}
        </ol>
      </Paper>

      <details className="rounded-3xl bg-white/6 p-5 ring-1 ring-white/12">
        <summary className="min-h-6 font-semibold">Check it yourself with any SHA-256 tool</summary>
        <p className="mt-3 text-sm text-snow/85">Hash this exact text. The result should equal the fingerprint above.</p>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-pine-950 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{seal.manifest}</pre>
      </details>
    </div>
  );
}

export function SealCheck({ seal }: { seal: SealView }) {
  return (
    <div className="grid gap-6">
      <header className="rise">
        <WaxSeal className="mb-4 size-16" />
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">The seal</h1>
        <p className="mt-3 text-snow/85">
          The moment the draw ran, the app published a fingerprint of the full result, mixed with a secret random value. After
          Christmas the list and that value are revealed, so anyone can confirm the result was never swapped.
        </p>
      </header>

      {seal.commitmentHash ? (
        <section className="rounded-3xl bg-white/6 p-5 ring-1 ring-white/12">
          <h2 className="font-semibold">Published fingerprint (SHA-256)</h2>
          <p className="mt-2 font-mono text-sm leading-relaxed break-all text-gold">{seal.commitmentHash}</p>
        </section>
      ) : (
        <p className="rounded-3xl bg-white/6 p-5 ring-1 ring-white/12">Nothing is sealed yet. The fingerprint appears here once the draw has run.</p>
      )}

      {seal.manifest ? (
        <OpenedSeal seal={{ ...seal, manifest: seal.manifest }} />
      ) : (
        seal.commitmentHash && <p className="text-snow/85">Still sealed. The organizer can open it after the Gift Chain finishes.</p>
      )}
    </div>
  );
}
