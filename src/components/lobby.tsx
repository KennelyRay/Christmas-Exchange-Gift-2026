"use client";

import { EnvelopeSimpleIcon, GiftIcon, ShareNetworkIcon, TelevisionIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { burst } from "@/lib/celebrate";
import { formatManila, nextChristmas } from "@/lib/christmas";
import { usePoll, useNow } from "@/lib/hooks";
import { formatPeso } from "@/lib/money";
import type { LobbyView } from "@/lib/types";
import { Countdown } from "./countdown";
import { Button, LinkButton, Paper } from "./ui";
import { WaxSeal } from "./wax-seal";

const VISIBLE_LOG_ENTRIES = 6;

const STATUS_TEXT: Record<LobbyView["status"], string> = {
  open: "The pool is open. Add your wishlist to join.",
  locked: "The pool is locked. The draw is coming.",
  drawn: "The envelopes are sealed. Yours is waiting.",
};

function ShareButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text: "Add your wishlist to our gift exchange", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The share sheet was dismissed, or clipboard access was refused.
    }
  }

  return (
    <Button variant="ghost" onClick={share}>
      <ShareNetworkIcon aria-hidden size={20} />
      <span aria-live="polite">{copied ? "Link copied" : "Share the link"}</span>
    </Button>
  );
}

export function Lobby({ initial }: { initial: LobbyView }) {
  const [justJoined, setJustJoined] = useState<string | null>(null);
  const [showFullLog, setShowFullLog] = useState(false);

  const { data: lobby, stale } = usePoll<LobbyView>(`/api/exchanges/${initial.slug}`, initial, 4000, (previous, next) => {
    const known = new Set(previous.participants.map((p) => p.id));
    const arrivals = next.participants.filter((p) => !known.has(p.id));
    if (arrivals.length > 0) {
      setJustJoined(arrivals.map((p) => p.name).join(", "));
      burst(0.7);
    }
  });

  const now = useNow();
  const revealAt = new Date(lobby.revealAt);
  const chainIsOpen = lobby.status === "drawn" && now !== null && revealAt.getTime() <= now;
  const log = showFullLog ? lobby.audit : lobby.audit.slice(0, VISIBLE_LOG_ENTRIES);
  const count = lobby.participants.length;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.45fr_1fr] lg:gap-12">
      <div className="grid content-start gap-8">
        <header className="rise">
          <h1 className="font-display text-5xl leading-none font-semibold tracking-tight break-words sm:text-6xl">{lobby.name}</h1>
          <p className="mt-4 text-lg text-snow/85">{STATUS_TEXT[lobby.status]}</p>
          {lobby.budgetCentavos !== null && (
            <p className="mt-1 text-snow/85">
              Suggested budget: <strong className="text-gold">{formatPeso(lobby.budgetCentavos)}</strong>
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {lobby.status === "open" && (
              <LinkButton href={`/x/${lobby.slug}/join`} icon={<GiftIcon aria-hidden size={18} />}>
                Add my wishlist
              </LinkButton>
            )}
            {lobby.status === "drawn" && (
              <LinkButton href={`/x/${lobby.slug}/envelope`} icon={<EnvelopeSimpleIcon aria-hidden size={18} />}>
                Open my envelope
              </LinkButton>
            )}
            {chainIsOpen && (
              <LinkButton href={`/x/${lobby.slug}/chain`} variant="gold" icon={<TelevisionIcon aria-hidden size={18} />}>
                Watch the Gift Chain
              </LinkButton>
            )}
            <ShareButton name={lobby.name} />
          </div>
        </header>

        {stale && (
          <p role="status" className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
            Having trouble refreshing. We&apos;ll keep trying.
          </p>
        )}

        <section aria-labelledby="pool-heading" className="rise" style={{ "--i": 1 } as React.CSSProperties}>
          <Paper>
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="pool-heading" className="font-display text-3xl font-semibold">
                The Pool
              </h2>
              <p className="font-semibold tabular-nums text-ink-soft">
                {count} {count === 1 ? "person" : "people"}
              </p>
            </div>

            <p aria-live="polite" className="sr-only">
              {justJoined ? `${justJoined} just joined` : ""}
            </p>

            {count === 0 ? (
              <div className="mt-6 rounded-3xl border-2 border-dashed border-ink/20 px-5 py-10">
                <p className="font-display text-xl font-semibold">Nobody&apos;s here yet</p>
                <p className="mt-1 text-ink-soft">Send the link to the family, or be the first to add a wishlist.</p>
              </div>
            ) : (
              <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <AnimatePresence initial={false}>
                  {lobby.participants.map((person) => (
                    <motion.li
                      key={person.id}
                      layout
                      initial={{ opacity: 0, scale: 0.8, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className="flex min-w-0 items-center gap-3 rounded-2xl bg-paper-deep/70 p-2 pr-4"
                    >
                      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pine-800 font-display font-semibold text-gold">
                        {person.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{person.name}</span>
                      <span className="shrink-0 text-sm text-ink-soft">
                        {person.itemCount} {person.itemCount === 1 ? "wish" : "wishes"}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Paper>
        </section>
      </div>

      <aside className="grid content-start gap-8">
        <section aria-label="Countdown to Christmas" className="rise" style={{ "--i": 2 } as React.CSSProperties}>
          <h2 className="mb-2 font-semibold text-snow/85">Until Christmas</h2>
          <Countdown target={nextChristmas(new Date(lobby.revealAt))} doneLabel="Merry Christmas!" />
          <p className="mt-3 text-sm text-snow/80">Gift Chain reveal: {formatManila(lobby.revealAt)} (Manila time)</p>
        </section>

        {lobby.commitmentHash && (
          <section className="rise rounded-3xl bg-white/6 p-5 ring-1 ring-white/12">
            <div className="flex items-center gap-3">
              <WaxSeal className="size-11 shrink-0" />
              <h2 className="font-display text-xl font-semibold">Sealed draw #{lobby.drawGeneration}</h2>
            </div>
            <p className="mt-3 text-sm text-snow/85">
              This fingerprint locks in the result. If anyone changes a single name, it won&apos;t match when the seal is opened.
            </p>
            <p className="mt-3 font-mono text-xs leading-relaxed break-all text-gold">{lobby.commitmentHash}</p>
            <Link href={`/x/${lobby.slug}/seal`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
              {lobby.sealOpened ? "Check the opened seal" : "How the seal works"}
            </Link>
          </section>
        )}

        <section aria-labelledby="log-heading">
          <h2 id="log-heading" className="font-display text-xl font-semibold">
            What&apos;s happened
          </h2>
          <p className="mt-1 text-sm text-snow/80">Everyone sees this log, and it can&apos;t be edited.</p>
          <ol className="mt-3 divide-y divide-white/10">
            {log.map((entry) => (
              <li key={entry.id} className="py-2.5">
                <p className="text-sm break-words">{entry.detail}</p>
                <p className="text-xs text-snow/70">{formatManila(entry.at)}</p>
              </li>
            ))}
          </ol>
          {lobby.audit.length > VISIBLE_LOG_ENTRIES && (
            <button type="button" onClick={() => setShowFullLog(!showFullLog)} className="min-h-11 text-sm font-semibold underline underline-offset-4">
              {showFullLog ? "Show less" : `Show all ${lobby.audit.length}`}
            </button>
          )}
        </section>

        <Link href={`/x/${lobby.slug}/organizer`} className="inline-flex min-h-11 items-center text-sm text-snow/80 underline underline-offset-4">
          I&apos;m the organizer
        </Link>
      </aside>

      <AnimatePresence>
        {justJoined && (
          <motion.button
            type="button"
            onClick={() => setJustJoined(null)}
            onAnimationComplete={() => setTimeout(() => setJustJoined(null), 3500)}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="fixed inset-x-4 bottom-5 z-10 mx-auto min-h-12 max-w-sm rounded-full bg-gold px-5 py-3 text-center font-semibold text-ink shadow-[0_16px_32px_-16px_rgba(11,35,28,0.9)]"
          >
            {justJoined} just joined the pool
          </motion.button>
        )}
      </AnimatePresence>
    </main>
  );
}
