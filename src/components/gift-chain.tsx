"use client";

import { CaretRightIcon, GiftIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { finale } from "@/lib/celebrate";
import { formatManila } from "@/lib/christmas";
import { api, ClientApiError, errorMessage } from "@/lib/client-api";
import { usePoll } from "@/lib/hooks";
import { playChime, playFanfare, playTick, toggleMuted, unlockAudio, useMuted } from "@/lib/sound";
import type { ChainView } from "@/lib/types";
import { CodeGate } from "./code-gate";
import { Countdown } from "./countdown";
import { Button, LinkButton, Paper } from "./ui";

const MIN_REEL_ROWS = 30;
const SPIN_SECONDS = 2.8;
const NAME_SIZE = "text-[clamp(3rem,11vw,9rem)]";

type Live = Extract<ChainView, { state: "live" }>;

function Reel({ names, target, onDone }: { names: string[]; target: string; onDone: () => void }) {
  const rows: string[] = [];
  while (rows.length < MIN_REEL_ROWS) rows.push(...names);
  rows.push(target);

  const distance = ((rows.length - 1) / rows.length) * 100;
  const lastRow = useRef(0);

  return (
    <div aria-hidden className={`h-[1.25em] overflow-hidden font-display leading-[1.25] font-semibold ${NAME_SIZE}`}>
      <motion.div
        initial={{ y: "0%" }}
        animate={{ y: `-${distance}%` }}
        transition={{ duration: SPIN_SECONDS, ease: [0.12, 0.7, 0.1, 1] }}
        onUpdate={(latest) => {
          const row = Math.floor((Math.abs(parseFloat(String(latest.y))) / 100) * rows.length);
          if (row !== lastRow.current) {
            lastRow.current = row;
            playTick();
          }
        }}
        onAnimationComplete={onDone}
      >
        {rows.map((name, index) => (
          <div key={index} className="truncate">
            {name}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function Stage({ view, spinning, onSpinDone }: { view: Live; spinning: boolean; onSpinDone: () => void }) {
  const { step, totalSteps, sequence, names } = view;

  if (step === 0) {
    return (
      <div>
        <p className="text-[clamp(1.5rem,3vw,2.5rem)] text-snow/85">Everyone ready?</p>
        <h1 className={`font-display leading-none font-semibold tracking-tight text-gold ${NAME_SIZE}`}>Who goes first?</h1>
      </div>
    );
  }

  const current = sequence[step - 1];
  const giver = step >= 2 ? sequence[step - 2] : null;
  const closesLoop = step === totalSteps;

  return (
    <div>
      {giver ? (
        <p className="text-[clamp(1.5rem,3.5vw,3rem)] text-snow/90">
          <strong className="font-semibold text-snow">{giver}</strong> gives a gift to
        </p>
      ) : (
        <p className="text-[clamp(1.5rem,3.5vw,3rem)] text-snow/90">The chain begins with</p>
      )}

      {spinning ? (
        <Reel names={names} target={current} onDone={onSpinDone} />
      ) : (
        <motion.h1
          key={step}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className={`font-display leading-[1.25] font-semibold tracking-tight break-words text-gold ${NAME_SIZE}`}
        >
          {current}
        </motion.h1>
      )}

      {closesLoop && !spinning && <p className="text-[clamp(1.25rem,2.5vw,2rem)] text-snow/90">and the chain is back where it started.</p>}
    </div>
  );
}

function Garland({ sequence }: { sequence: string[] }) {
  if (sequence.length === 0) return null;
  return (
    <ol aria-label="The chain so far" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-lg sm:text-2xl">
      {sequence.map((name, index) => (
        <li key={`${name}-${index}`} className="flex items-center gap-3">
          {index > 0 && <GiftIcon aria-hidden className="text-gold" />}
          <span className="font-semibold">{name}</span>
        </li>
      ))}
    </ol>
  );
}

function LiveChain({ slug, initial, startsAsOrganizer }: { slug: string; initial: Live; startsAsOrganizer: boolean }) {
  const [view, setView] = useState(initial);
  const [spinning, setSpinning] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(startsAsOrganizer);
  const [showSignIn, setShowSignIn] = useState(false);
  const [error, setError] = useState("");
  const pressing = useRef(false);
  const muted = useMuted();
  const reducedMotion = useReducedMotion();

  const finished = view.step === view.totalSteps;

  function landed(step: number) {
    setSpinning(false);
    if (step === view.totalSteps) {
      playFanfare();
      finale();
    } else {
      playChime();
    }
  }

  function receive(next: ChainView) {
    if (next.state !== "live" || next.step === view.step) return;
    setView(next);
    if (next.step > view.step) {
      if (reducedMotion) landed(next.step);
      else setSpinning(true);
    }
  }

  // Phones following along update from the poll; the presenter updates from the press.
  usePoll<ChainView>(`/api/exchanges/${slug}/chain`, initial, 2500, (_, next) => receive(next));

  async function advance() {
    if (pressing.current || spinning || finished || !isOrganizer) return;
    pressing.current = true;
    setError("");
    unlockAudio();
    try {
      receive(await api<ChainView>(`/api/exchanges/${slug}/chain`, { body: { expectedStep: view.step } }));
    } catch (caught) {
      if (caught instanceof ClientApiError && caught.status === 401) setIsOrganizer(false);
      setError(errorMessage(caught));
    } finally {
      pressing.current = false;
    }
  }

  const onSpace = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (event.code !== "Space" || target.matches("input, textarea, select, button, a")) return;
    event.preventDefault();
    void advance();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onSpace(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const nextLabel = view.step === 0 ? "Spin for the first giver" : `Who does ${view.sequence[view.step - 1]} give to?`;

  return (
    <main onClick={() => void advance()} className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col justify-between gap-8 px-4 py-6 sm:px-10 sm:py-10">
      <header className="flex items-center justify-between gap-4" onClick={(e) => e.stopPropagation()}>
        <LinkButton href={`/x/${slug}`} variant="ghost" className="text-snow">
          Back to the pool
        </LinkButton>
        <button type="button" onClick={toggleMuted} aria-label={muted ? "Turn sound on" : "Mute sound"} aria-pressed={muted} className="flex size-12 items-center justify-center rounded-full ring-1 ring-white/30 hover:bg-white/10">
          {muted ? <SpeakerSlashIcon aria-hidden size={24} /> : <SpeakerHighIcon aria-hidden size={24} />}
        </button>
      </header>

      <section aria-live="polite" className="py-6">
        <Stage view={view} spinning={spinning} onSpinDone={() => landed(view.step)} />
      </section>

      <footer className="grid gap-6" onClick={(e) => e.stopPropagation()}>
        <Garland sequence={view.sequence} />

        {error && (
          <p role="alert" className="rounded-2xl bg-wax px-4 py-3 font-semibold text-snow">
            {error}
          </p>
        )}

        {finished && !spinning ? (
          <div className="flex flex-wrap items-center gap-4">
            <p className="font-display text-3xl font-semibold">Merry Christmas!</p>
            <LinkButton href={`/x/${slug}/seal`} variant="gold">
              Check the seal
            </LinkButton>
          </div>
        ) : isOrganizer ? (
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => void advance()} disabled={spinning} className="text-lg" icon={<CaretRightIcon aria-hidden size={20} />}>
              {spinning ? "Spinning..." : nextLabel}
            </Button>
            <p className="hidden text-snow/80 sm:block">or press the spacebar, or tap anywhere</p>
          </div>
        ) : showSignIn ? (
          <Paper className="max-w-md">
            <CodeGate
              slug={slug}
              onSuccess={() => {
                setIsOrganizer(true);
                setShowSignIn(false);
                setError("");
              }}
            />
          </Paper>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-snow/85">Following along. The organizer is running the reveal.</p>
            <Button variant="ghost" onClick={() => setShowSignIn(true)} className="text-snow">
              I&apos;m the organizer
            </Button>
          </div>
        )}
      </footer>
    </main>
  );
}

export function GiftChain({ slug, initial, isOrganizer }: { slug: string; initial: ChainView; isOrganizer: boolean }) {
  const [view, setView] = useState(initial);

  if (view.state === "live") return <LiveChain slug={slug} initial={view} startsAsOrganizer={isOrganizer} />;
  return <WaitingScreen slug={slug} view={view} onChange={setView} />;
}

type Waiting = Exclude<ChainView, Live>;

/** Keeps polling so a TV left on opens by itself at the reveal time. */
function WaitingScreen({ slug, view, onChange }: { slug: string; view: Waiting; onChange: (next: ChainView) => void }) {
  usePoll<ChainView>(`/api/exchanges/${slug}/chain`, view, 5000, (_, next) => onChange(next));

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col justify-center gap-8 px-4 py-10 sm:px-10">
      <h1 className="font-display text-5xl leading-none font-semibold tracking-tight sm:text-8xl">
        {view.state === "sealed" ? "The chain is sealed" : "No draw yet"}
      </h1>
      {view.state === "sealed" ? (
        <>
          <p className="text-xl text-snow/85">It opens {formatManila(view.revealAt)} (Manila time). Nobody can open it sooner, not even the organizer.</p>
          <Countdown target={new Date(view.revealAt)} doneLabel="Opening..." size="lg" />
        </>
      ) : (
        <p className="text-xl text-snow/85">The Gift Chain appears here once the organizer has run the draw.</p>
      )}
      <div>
        <LinkButton href={`/x/${slug}`} variant="gold">
          Back to the pool
        </LinkButton>
      </div>
    </main>
  );
}
