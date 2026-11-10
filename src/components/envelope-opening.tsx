"use client";

import { ArrowCounterClockwiseIcon, EnvelopeOpenIcon, GiftIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { burst } from "@/lib/celebrate";
import { useT } from "@/lib/i18n";
import { playDing, unlockAudio } from "@/lib/sound";
import { Button } from "./ui";
import { WaxSeal } from "./wax-seal";

/** Every timing in one place, in milliseconds. A full opening takes about 2.4 seconds. */
export const ENVELOPE_TIMING = {
  /** Pause between the idle wiggles that invite a tap. */
  wiggleEvery: 2600,
  wiggle: 600,
  /** The seal swells, then cracks in two and falls away. */
  sealSwell: 100,
  sealFall: 260,
  /** The flap swings up to 90°, then on to 180°, while the envelope settles lower. */
  flapToUpright: 260,
  flapToOpen: 260,
  /** The letter slides out of the pocket. Its spring keeps settling as the next step starts. */
  letterSlide: 700,
  /** The letter comes forward to fill the stage as the envelope fades. */
  letterForward: 460,
  /** With reduced motion: the envelope fades out, then the letter fades in. */
  reducedFade: 250,
} as const;

const SETTLE = [0.32, 0.72, 0, 1] as const;
const seconds = (ms: number) => ms / 1000;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Positions are percentages of each element's own height, so nothing needs
 * measuring. The stage is 1.7 envelopes tall: room for the letter to clear the pocket.
 */
const POSE = {
  closed: {
    box: { y: "0%" },
    letter: { y: "0%", scale: 1, opacity: 1, zIndex: 1 },
    part: { y: "0%", opacity: 1 },
    flap: { y: "0%", opacity: 1, rotateX: 0, zIndex: 3 },
    seal: { scale: 1, opacity: 1 },
    sealHalf: { x: "0%", y: "0%", rotate: 0, opacity: 1 },
  },
  revealed: {
    box: { y: "35%" },
    // Puts the letter's centre at the centre of the stage.
    letter: { y: "-58%", scale: 1.15, opacity: 1, zIndex: 5 },
    part: { y: "15%", opacity: 0 },
    flap: { y: "26%", opacity: 0, rotateX: 180, zIndex: 0 },
    seal: { scale: 1, opacity: 0 },
    sealHalf: { x: "0%", y: "0%", rotate: 0, opacity: 0 },
  },
} as const;

/** Just clear of the pocket's top edge, with the envelope at the bottom of the stage. */
const LETTER_OUT = { y: "-139%" };

export type EnvelopePhase = "closed" | "opening" | "opened" | "revealed";

type Props = {
  recipientName: string;
  /** Remembers that this person already watched it, so returning skips to the letter. */
  rememberKey: string;
  onShowWishlist: () => void;
};

const SEEN_PREFIX = "envelope-opened:";
const SOUND_KEY = "envelope-sound";

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // Private browsing: it simply won't be remembered.
  }
}

/** A jagged crack down the middle, so the seal breaks into two halves. */
const CRACK_LEFT = "polygon(0 0, 54% 0, 46% 22%, 56% 46%, 45% 70%, 53% 100%, 0 100%)";
const CRACK_RIGHT = "polygon(54% 0, 100% 0, 100% 100%, 53% 100%, 45% 70%, 56% 46%, 46% 22%)";

const hiddenBack = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" } as const;

export function EnvelopeOpening({ recipientName, rememberKey, onShowWishlist }: Props) {
  const t = useT();
  const reducedMotion = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const [seenBefore] = useState(() => readFlag(SEEN_PREFIX + rememberKey));
  const [phase, setPhase] = useState<EnvelopePhase>(seenBefore ? "revealed" : "closed");
  const [replayed, setReplayed] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readFlag(SOUND_KEY));
  // A ref, not state: a second tap in the same frame must already see it.
  const running = useRef(false);

  const pose = seenBefore ? POSE.revealed : POSE.closed;

  /** Every step of closed → opening → opened → revealed is readable as data-phase. */
  function markPhase(next: EnvelopePhase) {
    scope.current?.setAttribute("data-phase", next);
  }

  function enterPhase(next: EnvelopePhase) {
    markPhase(next);
    setPhase(next);
  }

  function setPose(target: typeof POSE.closed | typeof POSE.revealed) {
    const now = { duration: 0 };
    return Promise.all([
      animate(scope.current, target.box, now),
      animate(".env-letter", target.letter, now),
      animate(".env-part", target.part, now),
      animate(".env-flap", target.flap, now),
      animate(".env-seal", target.seal, now),
      animate(".env-seal-half", target.sealHalf, now),
    ]);
  }

  async function playFull() {
    const T = ENVELOPE_TIMING;

    // 1. The seal swells, cracks, and its halves fall away.
    await animate(".env-seal", { scale: 1.12 }, { duration: seconds(T.sealSwell), ease: "easeOut" });
    await Promise.all([
      animate(".env-seal-left", { x: "-34%", y: "70%", rotate: -32, opacity: 0 }, { duration: seconds(T.sealFall), ease: "easeIn" }),
      animate(".env-seal-right", { x: "34%", y: "70%", rotate: 32, opacity: 0 }, { duration: seconds(T.sealFall), ease: "easeIn" }),
    ]);

    // 2. The flap swings open from its top hinge. Past 90° it drops behind the
    //    letter, so the letter can rise in front of it. The envelope settles lower
    //    at the same time, so the open flap stays inside the stage.
    const swing = async () => {
      await animate(".env-flap", { rotateX: 90 }, { duration: seconds(T.flapToUpright), ease: "easeIn" });
      await animate(".env-flap", { zIndex: 0 }, { duration: 0 });
      await animate(".env-flap", { rotateX: 180 }, { duration: seconds(T.flapToOpen), ease: "easeOut" });
    };
    await Promise.all([
      swing(),
      animate(scope.current, POSE.revealed.box, { duration: seconds(T.flapToUpright + T.flapToOpen), ease: SETTLE }),
    ]);

    // 3. The letter slides out of the pocket, still behind it. The spring's tail
    //    overlaps the next step instead of holding everything up while it settles.
    void animate(".env-letter", LETTER_OUT, { type: "spring", visualDuration: seconds(T.letterSlide), bounce: 0.22 });
    await wait(T.letterSlide);

    // 4. Clear of the pocket, the letter moves in front and comes forward. The
    //    phase is marked on the element, not in state: a re-render here would
    //    cost a frame in the middle of the motion.
    markPhase("opened");
    await animate(".env-letter", { zIndex: POSE.revealed.letter.zIndex }, { duration: 0 });
    const forward = { duration: seconds(T.letterForward), ease: SETTLE };
    // The envelope fades a little sooner, so it never sits half-visible behind the letter.
    const fadeAway = { duration: seconds(T.letterForward * 0.7), ease: "easeOut" as const };
    await Promise.all([
      animate(".env-letter", { y: POSE.revealed.letter.y, scale: POSE.revealed.letter.scale }, forward),
      animate(".env-part", POSE.revealed.part, fadeAway),
      animate(".env-flap", { y: POSE.revealed.flap.y, opacity: 0 }, fadeAway),
    ]);
  }

  /** No 3D flip and no confetti: the envelope fades out and the letter fades in. */
  async function playReduced() {
    const fade = { duration: seconds(ENVELOPE_TIMING.reducedFade) };
    await Promise.all([
      animate(".env-part, .env-flap, .env-seal", { opacity: 0 }, fade),
      animate(".env-letter", { opacity: 0 }, fade),
    ]);
    await setPose(POSE.revealed);
    await animate(".env-letter", { opacity: [0, 1] }, fade);
  }

  /** `replay` skips the revealed check: a delayed replay still sees the old phase. */
  async function open(replay = false) {
    if (running.current || (!replay && phase === "revealed")) return;
    running.current = true;
    if (soundOn) unlockAudio();
    enterPhase("opening");

    if (reducedMotion) {
      await playReduced();
    } else {
      await playFull();
      burst(0.6);
    }
    if (soundOn) playDing();
    writeFlag(SEEN_PREFIX + rememberKey, true);
    enterPhase("revealed");
    running.current = false;
  }

  async function watchAgain() {
    if (running.current) return;
    await setPose(POSE.closed);
    enterPhase("closed");
    setReplayed(true);
    // Give the closed envelope a moment on screen before it opens again.
    setTimeout(() => void open(true), 350);
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    writeFlag(SOUND_KEY, next);
    if (next) unlockAudio();
  }

  const closed = phase === "closed";
  const wiggling = closed && !reducedMotion;

  return (
    <div className="grid w-full justify-items-center gap-4">
      <motion.div
        animate={wiggling ? { rotate: [0, -2.5, 2.5, -1.5, 1, 0] } : { rotate: 0 }}
        transition={
          wiggling
            ? { duration: seconds(ENVELOPE_TIMING.wiggle), repeat: Infinity, repeatDelay: seconds(ENVELOPE_TIMING.wiggleEvery), ease: "easeInOut" }
            : { duration: 0.2 }
        }
        className="relative aspect-[400/510] w-[min(85vw,420px,46dvh)] shrink-0"
      >
        <button
          type="button"
          onClick={() => void open()}
          disabled={!closed}
          aria-label={t("letter.envelopeLabel")}
          className="absolute inset-0 z-10 rounded-card disabled:pointer-events-none disabled:cursor-default"
        />

        {/* The envelope itself: perspective lets the flap swing toward the viewer. */}
        <motion.div
          ref={scope}
          initial={pose.box}
          data-phase={seenBefore ? "revealed" : "closed"}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[20.59%] aspect-[4/3] will-change-transform [perspective:1000px]"
        >
          {/* 1. Back panel: the inside of the envelope. */}
          <motion.div
            initial={pose.part}
            className="env-part absolute inset-0 rounded-tile bg-[#d9c39a] shadow-[0_18px_30px_-18px_rgba(5,20,15,0.85)] will-change-[transform,opacity]"
            style={{ zIndex: 0 }}
          />

          {/* 2. The letter, inside the envelope until it slides out. */}
          <motion.div
            initial={pose.letter}
            className="env-letter absolute top-[20%] right-[7%] left-[7%] h-[62%] will-change-transform"
          >
            <div className="paper flex h-full flex-col items-center justify-center gap-1 rounded-field bg-[#fffaf0] px-4 text-center shadow-[0_10px_24px_-14px_rgba(5,20,15,0.7)] ring-1 ring-gold-deep/30">
              <svg viewBox="0 0 120 120" aria-hidden className="size-5 shrink-0">
                <path d="M60 8l9 43 43 9-43 9-9 43-9-43-43-9 43-9z" fill="#c9a24e" />
              </svg>
              <p className="text-[0.875rem] leading-snug font-bold text-ink-soft">{t("letter.lead")}</p>
              <p className="line-clamp-2 font-display text-[1.625rem] leading-[1.1] font-semibold wrap-anywhere text-wax-deep">{recipientName}</p>
            </div>
          </motion.div>

          {/* 3. Front pocket: side and bottom folds covering the letter. */}
          <motion.div initial={pose.part} className="env-part absolute inset-0 overflow-hidden rounded-tile will-change-[transform,opacity]" style={{ zIndex: 2 }}>
            <svg viewBox="0 0 400 300" preserveAspectRatio="none" className="size-full">
              <path d="M0 0 L200 165 L0 300 Z" fill="#ecdcbb" />
              <path d="M400 0 L200 165 L400 300 Z" fill="#ecdcbb" />
              <path d="M0 300 L200 150 L400 300 Z" fill="#e4d0a8" />
              <path d="M0 0 L200 165 L400 0 M0 300 L200 150 L400 300" fill="none" stroke="#7d5a2a" strokeOpacity="0.14" strokeWidth="2" />
            </svg>
          </motion.div>

          {/* 4. Top flap, hinged at the top edge, with a darker inner side. */}
          <motion.div
            initial={pose.flap}
            className="env-flap absolute inset-x-0 top-0 h-[58%] origin-top will-change-transform"
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="absolute inset-0 rounded-t-tile bg-[#f3e6cb] [clip-path:polygon(0_0,100%_0,50%_100%)]" style={hiddenBack} />
            <div
              className="absolute inset-0 bg-[#cfb88d] [clip-path:polygon(0_100%,100%_100%,50%_0)]"
              style={{ ...hiddenBack, transform: "rotateX(180deg)" }}
            />
          </motion.div>

          {/* 5. Wax seal where the flap's point meets the front. */}
          <div className="absolute top-[58%] left-1/2 aspect-square w-[24%] -translate-x-1/2 -translate-y-1/2" style={{ zIndex: 4 }}>
            <motion.div initial={pose.seal} className="env-seal relative size-full will-change-transform">
              <motion.div initial={pose.sealHalf} className="env-seal-half env-seal-left absolute inset-0" style={{ clipPath: CRACK_LEFT }}>
                <WaxSeal className="size-full drop-shadow-[0_3px_3px_rgba(5,20,15,0.35)]" />
              </motion.div>
              <motion.div initial={pose.sealHalf} className="env-seal-half env-seal-right absolute inset-0" style={{ clipPath: CRACK_RIGHT }}>
                <WaxSeal className="size-full drop-shadow-[0_3px_3px_rgba(5,20,15,0.35)]" />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      {/* Controls keep the same height in every phase, so nothing shifts. */}
      <div className="grid min-h-[7.5rem] w-full max-w-[420px] content-start gap-2" aria-live="polite">
        {closed && (
          <>
            <Button onClick={() => void open()} className="w-full">
              <EnvelopeOpenIcon aria-hidden size={26} className="shrink-0" />
              {t("open.tapEnvelope")}
            </Button>
            <Button variant="ghost" size="md" aria-pressed={soundOn} onClick={toggleSound} className="w-full">
              {soundOn ? <SpeakerHighIcon aria-hidden size={22} className="shrink-0" /> : <SpeakerSlashIcon aria-hidden size={22} className="shrink-0" />}
              {t(soundOn ? "letter.soundOn" : "letter.soundOff")}
            </Button>
          </>
        )}

        {phase === "opening" && (
          <p role="status" className="py-3 text-center text-xl font-bold">
            {t("open.coming")}
          </p>
        )}

        {phase === "revealed" && (
          <>
            <Button onClick={onShowWishlist} className="w-full">
              <GiftIcon aria-hidden size={26} className="shrink-0" />
              {t("letter.see")}
            </Button>
            <Button variant="ghost" size="md" onClick={() => void watchAgain()} className="w-full">
              <ArrowCounterClockwiseIcon aria-hidden size={22} className="shrink-0" />
              {t(seenBefore && !replayed ? "letter.openAgain" : "letter.again")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
