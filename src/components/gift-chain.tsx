"use client";

import { CaretRightIcon, GiftIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { finale } from "@/lib/celebrate";
import { formatManila } from "@/lib/christmas";
import { api, ClientApiError } from "@/lib/client-api";
import { usePoll } from "@/lib/hooks";
import { friendlyError, useT } from "@/lib/i18n";
import { playChime, playFanfare, playTick, toggleMuted, unlockAudio, useMuted } from "@/lib/sound";
import type { ChainView } from "@/lib/types";
import { CodeGate } from "./code-gate";
import { Countdown } from "./countdown";
import { Button, LinkButton, Paper } from "./ui";

const MIN_REEL_ROWS = 30;
const SPIN_SECONDS = 2.8;
const HEADLINE_SIZE = "text-[clamp(3rem,11vw,9rem)] max-md:text-5xl";

/** Full names vary a lot in length, and the reel has to fit the longest on one line. */
function nameSize(names: readonly string[]) {
  const longest = Math.max(...names.map((name) => name.length));
  if (longest > 24) return "text-[clamp(1.5rem,5.5vw,5rem)] max-md:text-3xl";
  if (longest > 14) return "text-[clamp(2rem,7.5vw,7rem)] max-md:text-4xl";
  return HEADLINE_SIZE;
}

type Live = Extract<ChainView, { state: "live" }>;

function Reel({ names, target, size, onDone }: { names: string[]; target: string; size: string; onDone: () => void }) {
  const rows: string[] = [];
  while (rows.length < MIN_REEL_ROWS) rows.push(...names);
  rows.push(target);

  const distance = ((rows.length - 1) / rows.length) * 100;
  const lastRow = useRef(0);

  return (
    <div aria-hidden className={`h-[1.25em] overflow-hidden font-display leading-[1.25] font-semibold ${size}`}>
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
  const t = useT();
  const { step, totalSteps, sequence, names } = view;

  if (step === 0) {
    return (
      <div>
        <p className="text-[clamp(1.5rem,3vw,2.5rem)] max-md:text-xl">{t("chain.ready")}</p>
        <h1 className={`font-display leading-none font-semibold tracking-tight text-gold ${HEADLINE_SIZE}`}>{t("chain.first")}</h1>
      </div>
    );
  }

  const current = sequence[step - 1];
  const giver = step >= 2 ? sequence[step - 2] : null;
  const closesLoop = step === totalSteps;
  const size = nameSize(names);

  return (
    <div>
      {giver ? (
        <p className="text-[clamp(1.5rem,3.5vw,3rem)] max-md:text-xl">
          <strong className="font-semibold">{giver}</strong> {t("chain.gives")}
        </p>
      ) : (
        <p className="text-[clamp(1.5rem,3.5vw,3rem)] max-md:text-xl">{t("chain.begins")}</p>
      )}

      {spinning ? (
        <Reel names={names} target={current} size={size} onDone={onSpinDone} />
      ) : (
        <motion.h1
          key={step}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className={`font-display leading-[1.25] font-semibold tracking-tight wrap-anywhere text-gold ${size}`}
        >
          {current}
        </motion.h1>
      )}

      {closesLoop && !spinning && <p className="text-[clamp(1.25rem,2.5vw,2rem)] max-md:text-lg">{t("chain.loop")}</p>}
    </div>
  );
}

function Garland({ sequence }: { sequence: string[] }) {
  const t = useT();
  if (sequence.length === 0) return null;
  return (
    <ol aria-label={t("chain.soFar")} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xl sm:text-2xl">
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
  const t = useT();
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
      setError(friendlyError(caught, t));
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

  const nextLabel = view.step === 0 ? t("chain.spinFirst") : t("chain.spinNext", { name: view.sequence[view.step - 1] });

  return (
    <main onClick={() => void advance()} className="safe-top safe-bottom safe-x mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col justify-between gap-8 sm:px-10 sm:py-10">
      <header className="flex items-center justify-between gap-4" onClick={(e) => e.stopPropagation()}>
        <LinkButton href={`/x/${slug}`} variant="ghost" fit className="text-snow">
          {t("chain.back")}
        </LinkButton>
        <button type="button" onClick={toggleMuted} className="flex min-h-tap items-center gap-2 rounded-full px-4 py-1 text-base font-bold ring-2 ring-white/50 hover:bg-white/10">
          {muted ? <SpeakerSlashIcon aria-hidden size={24} className="shrink-0" /> : <SpeakerHighIcon aria-hidden size={24} className="shrink-0" />}
          {muted ? t("chain.soundOn") : t("chain.soundOff")}
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
            <p className="font-display text-3xl font-semibold">{t("chain.merry")}</p>
            <LinkButton href={`/x/${slug}/seal`} variant="gold">
              {t("chain.checkSeal")}
            </LinkButton>
          </div>
        ) : isOrganizer ? (
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => void advance()} disabled={spinning} icon={<CaretRightIcon aria-hidden size={22} />}>
              {spinning ? t("chain.spinning") : nextLabel}
            </Button>
            <p className="hidden text-lg sm:block">{t("chain.keys")}</p>
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
            <p className="text-lg">{t("chain.following")}</p>
            <Button variant="ghost" onClick={() => setShowSignIn(true)} className="text-snow">
              {t("chain.organizer")}
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
  const t = useT();

  return (
    <main className="safe-top safe-bottom safe-x mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col justify-center gap-8 py-10 sm:px-10">
      <h1 className="font-display text-5xl leading-none font-semibold tracking-tight sm:text-8xl">
        {t(view.state === "sealed" ? "chain.sealed" : "chain.noDraw")}
      </h1>
      {view.state === "sealed" ? (
        <>
          <p className="text-xl">{t("chain.opens", { date: formatManila(view.revealAt), manila: t("common.manila") })}</p>
          <div className="max-w-3xl">
            <Countdown target={new Date(view.revealAt)} doneLabel={t("chain.opening")} size="lg" />
          </div>
        </>
      ) : (
        <p className="text-xl">{t("chain.noDrawBody")}</p>
      )}
      <div>
        <LinkButton href={`/x/${slug}`} variant="gold">
          {t("chain.back")}
        </LinkButton>
      </div>
    </main>
  );
}
