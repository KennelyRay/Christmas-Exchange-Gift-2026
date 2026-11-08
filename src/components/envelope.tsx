"use client";

import { EnvelopeSimpleIcon, GiftIcon, LockKeyIcon, SmileyWinkIcon } from "@phosphor-icons/react";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { burst } from "@/lib/celebrate";
import { formatManila } from "@/lib/christmas";
import { api, errorMessage } from "@/lib/client-api";
import { formatPeso } from "@/lib/money";
import { groupByFamily } from "@/lib/names";
import type { EnvelopeView, PublicParticipant } from "@/lib/types";
import { StoreChip } from "./store-chip";
import { Button, ErrorNote, Field, inputClass, LinkButton, Paper } from "./ui";
import { WaxSeal } from "./wax-seal";

const TAPS_TO_BREAK = 3;
const DRAG_TO_BREAK_PX = 80;
const SHAKES_TO_OPEN = 5;
const SHAKE_THRESHOLD = 18;
const OPENING_MS = 1300;

type Ready = Extract<EnvelopeView, { state: "ready" }>;

function SealedEnvelope({ onOpen }: { onOpen: () => void }) {
  const [taps, setTaps] = useState(0);
  const [opening, setOpening] = useState(false);
  const reducedMotion = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function open() {
    if (opening) return;
    setOpening(true);
    burst();
    timer.current = setTimeout(onOpen, reducedMotion ? 300 : OPENING_MS);
  }

  function tap() {
    const next = taps + 1;
    setTaps(next);
    if (next >= TAPS_TO_BREAK) open();
  }

  const settle = { duration: 0.9, ease: [0.32, 0.72, 0, 1] as const };

  return (
    <div className="grid justify-items-center gap-8">
      <div className="relative aspect-[7/5] w-full max-w-sm [perspective:1000px]">
        <div className="absolute inset-0 rounded-2xl bg-paper-deep" />
        <motion.div
          className="absolute inset-x-4 inset-y-3 rounded-xl bg-paper"
          animate={opening ? { y: "-46%" } : { y: 0 }}
          transition={{ ...settle, delay: 0.35 }}
        />
        <div className="absolute inset-0 rounded-2xl bg-[#e6d6b6] [clip-path:polygon(0_100%,50%_46%,100%_100%)]" />
        <div className="absolute inset-0 rounded-2xl bg-[#ecdec2] [clip-path:polygon(0_0,50%_54%,0_100%)]" />
        <div className="absolute inset-0 rounded-2xl bg-[#ecdec2] [clip-path:polygon(100%_0,50%_54%,100%_100%)]" />
        <motion.div
          className="absolute inset-x-0 top-0 h-[60%] origin-top rounded-t-2xl bg-[#f4e9d2] [clip-path:polygon(0_0,100%_0,50%_100%)]"
          style={{ zIndex: opening ? 0 : 2 }}
          animate={opening ? { rotateX: 180 } : { rotateX: 0 }}
          transition={settle}
        />

        {!opening && (
          <motion.button
            type="button"
            onClick={tap}
            aria-label={`Break the wax seal. ${TAPS_TO_BREAK - taps} ${TAPS_TO_BREAK - taps === 1 ? "tap" : "taps"} left.`}
            drag
            dragSnapToOrigin
            dragElastic={0.5}
            dragConstraints={{ left: -120, right: 120, top: -120, bottom: 120 }}
            onDragEnd={(_, info) => {
              if (Math.hypot(info.offset.x, info.offset.y) >= DRAG_TO_BREAK_PX) open();
            }}
            animate={{ rotate: taps * 11 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 12 }}
            className="absolute top-[60%] left-1/2 z-[3] -mt-14 -ml-14 size-28 touch-none rounded-full"
          >
            <WaxSeal className="size-full" cracks={taps} />
          </motion.button>
        )}
      </div>
      <p className="text-center text-lg font-semibold">{opening ? "Here it comes..." : "Tap the seal three times, or drag it off"}</p>
    </div>
  );
}

function GiftBox({ onOpen }: { onOpen: () => void }) {
  const [shakes, setShakes] = useState(0);
  const [opening, setOpening] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(
    () => typeof DeviceMotionEvent !== "undefined" && "requestPermission" in DeviceMotionEvent,
  );
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function shake() {
    if (opening) return;
    void animate(scope.current, { rotate: [0, -7, 7, -5, 5, 0] }, { duration: 0.4 });
    const next = shakes + 1;
    setShakes(next);
    if (next >= SHAKES_TO_OPEN) {
      setOpening(true);
      burst();
      timer.current = setTimeout(onOpen, OPENING_MS);
    }
  }

  const onShake = useEffectEvent(shake);

  useEffect(() => {
    if (needsPermission) return;
    let last = 0;
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.acceleration ?? event.accelerationIncludingGravity;
      if (!a) return;
      const strength = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const now = Date.now();
      if (strength > SHAKE_THRESHOLD && now - last > 300) {
        last = now;
        onShake();
      }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [needsPermission]);

  async function allowMotion() {
    // iOS only grants motion access from inside a tap.
    const motionEvent = DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> };
    const answer = await motionEvent.requestPermission().catch(() => "denied");
    if (answer === "granted") setNeedsPermission(false);
  }

  return (
    <div className="grid justify-items-center gap-6">
      <div ref={scope} className="relative h-56 w-56">
        <motion.div
          className="absolute inset-x-0 top-6 z-[2] h-14 rounded-xl bg-[#b83237]"
          animate={opening ? { y: -140, rotate: -18, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="absolute inset-y-0 left-1/2 w-9 -translate-x-1/2 bg-gold" />
        </motion.div>
        <div className="absolute inset-x-4 top-20 bottom-0 rounded-b-2xl bg-wax">
          <div className="absolute inset-y-0 left-1/2 w-9 -translate-x-1/2 bg-gold" />
        </div>
      </div>

      <div className="h-2.5 w-56 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Shake progress" aria-valuemin={0} aria-valuemax={SHAKES_TO_OPEN} aria-valuenow={shakes}>
        <div className="h-full origin-left bg-gold transition-transform duration-300 ease-settle" style={{ transform: `scaleX(${shakes / SHAKES_TO_OPEN})` }} />
      </div>

      <p className="text-center text-lg font-semibold">{opening ? "Here it comes..." : "Shake your phone, or tap the button"}</p>

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="gold" onClick={shake} disabled={opening}>
          Shake the box
        </Button>
        {needsPermission && (
          <Button variant="ghost" onClick={allowMotion}>
            Use my phone&apos;s motion
          </Button>
        )}
      </div>
    </div>
  );
}

function Reveal({ envelope, onClose }: { envelope: Ready; onClose: () => void }) {
  useEffect(() => burst(1.3), []);

  return (
    <div className="grid gap-6">
      <header className="rise">
        <p className="text-lg text-snow/85">{envelope.giverName}, you&apos;re giving a gift to</p>
        <h1 className="mt-1 font-display text-6xl leading-none font-semibold tracking-tight break-words text-gold sm:text-7xl">
          {envelope.recipientName}
        </h1>
      </header>

      <ol className="grid gap-4">
        {envelope.items.map((item, index) => (
          <li key={index} className="rise" style={{ "--i": index + 1 } as React.CSSProperties}>
            <Paper>
              <div className="flex flex-col gap-4 sm:flex-row">
                {item.imageUrl && (
                  // Blob photos are already compressed client-side, so next/image would only add cost.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} loading="lazy" className="aspect-square w-full rounded-2xl object-cover sm:w-36" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl leading-tight font-semibold break-words">{item.name}</h2>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-wax-deep">{formatPeso(item.priceCentavos)}</p>
                  {item.url && (
                    <div className="mt-3">
                      <StoreChip url={item.url} linked />
                    </div>
                  )}
                </div>
              </div>
            </Paper>
          </li>
        ))}
      </ol>

      {envelope.codeReissuedAt && (
        <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
          A new Elf Code was issued for you on {formatManila(envelope.codeReissuedAt)}. If you didn&apos;t ask for one, tell your family.
        </p>
      )}

      <div>
        <p className="mb-3 text-snow/85">It&apos;s your secret. Reseal this before you hand your phone to anyone.</p>
        <Button variant="gold" onClick={onClose} icon={<LockKeyIcon aria-hidden size={18} />}>
          Reseal my envelope
        </Button>
      </div>
    </div>
  );
}

export function EnvelopeClient({ slug, participants }: { slug: string; participants: PublicParticipant[] }) {
  const [participantId, setParticipantId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [busy, setBusy] = useState(false);
  const [envelope, setEnvelope] = useState<EnvelopeView | null>(null);
  const [opened, setOpened] = useState(false);
  const [style, setStyle] = useState<"envelope" | "box">("envelope");
  const families = groupByFamily(participants).sort((a, b) => a.label.localeCompare(b.label));

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNameError("");
    if (!participantId) {
      setNameError("Pick your name first");
      return;
    }

    setBusy(true);
    try {
      setEnvelope(await api<EnvelopeView>(`/api/exchanges/${slug}/envelope`, { body: { participantId, code } }));
      setCode("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function reseal() {
    setEnvelope(null);
    setOpened(false);
    setParticipantId("");
    window.scrollTo({ top: 0 });
  }

  if (envelope?.state === "waiting") {
    return (
      <div className="rise">
        <SmileyWinkIcon aria-hidden size={48} className="text-gold" />
        <h1 className="mt-3 font-display text-4xl font-semibold">Your code works, {envelope.giverName}</h1>
        <p className="mt-3 mb-8 text-snow/85">The draw hasn&apos;t happened yet. Come back once the organizer has sealed the envelopes.</p>
        <LinkButton href={`/x/${slug}`} variant="gold">
          Back to the pool
        </LinkButton>
      </div>
    );
  }

  if (envelope?.state === "ready") {
    if (opened) return <Reveal envelope={envelope} onClose={reseal} />;

    return (
      <div className="rise grid gap-8">
        <h1 className="font-display text-4xl font-semibold">This one&apos;s yours, {envelope.giverName}</h1>

        <div role="group" aria-label="How to open it" className="flex w-fit gap-1 rounded-full bg-white/10 p-1">
          {(
            [
              ["envelope", "Envelope", EnvelopeSimpleIcon],
              ["box", "Gift box", GiftIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={style === value}
              onClick={() => setStyle(value)}
              className={`flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold transition duration-300 ease-settle ${style === value ? "bg-gold text-ink" : "text-snow"}`}
            >
              <Icon aria-hidden size={18} />
              {label}
            </button>
          ))}
        </div>

        {style === "envelope" ? <SealedEnvelope onOpen={() => setOpened(true)} /> : <GiftBox onOpen={() => setOpened(true)} />}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="rise">
        <h1 className="font-display text-4xl leading-tight font-semibold sm:text-5xl">Find your envelope</h1>
        <p className="mt-3 text-snow/85">Pick your name and enter the Elf Code you saved when you joined.</p>
      </header>

      <Paper className="rise" style={{ "--i": 1 } as React.CSSProperties}>
        {participants.length === 0 ? (
          <p className="text-ink-soft">Nobody has joined this exchange yet.</p>
        ) : (
          <form onSubmit={unlock} noValidate className="grid gap-5">
            <Field label="Your name" error={nameError}>
              {(props) => (
                <select {...props} value={participantId} onChange={(e) => setParticipantId(e.target.value)} className={inputClass}>
                  <option value="">Choose your name</option>
                  {families.map((family) => (
                    <optgroup key={family.key} label={`${family.label} family`}>
                      {[...family.members].sort((a, b) => a.name.localeCompare(b.name)).map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Elf Code" helper="Four words. Capitals and spaces don't matter.">
              {(props) => (
                <input {...props} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="snow-cocoa-parol-robin" className={inputClass} />
              )}
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}

            <Button type="submit" busy={busy} className="w-full">
              {busy ? "Checking..." : "Unlock my envelope"}
            </Button>

            <p className="text-sm text-ink-soft">Lost your code? Ask the organizer for a new one.</p>
          </form>
        )}
      </Paper>
    </div>
  );
}
