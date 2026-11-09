"use client";

import { CaretRightIcon, EnvelopeOpenIcon, EnvelopeSimpleIcon, GiftIcon, LockKeyIcon, MagnifyingGlassIcon, QuestionIcon, SmileyWinkIcon } from "@phosphor-icons/react";
import { motion, MotionConfig, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { burst } from "@/lib/celebrate";
import { formatManila } from "@/lib/christmas";
import { api } from "@/lib/client-api";
import { friendlyError, useT } from "@/lib/i18n";
import { formatPeso } from "@/lib/money";
import { normalizeNamePart } from "@/lib/names";
import type { EnvelopeView, PublicParticipant } from "@/lib/types";
import { CODE_LENGTH, CodeEntry } from "./code-entry";
import { Avatar } from "./people";
import { StoreLink } from "./store-chip";
import { Button, Dialog, ErrorNote, Field, inputClass, LinkButton, Paper } from "./ui";
import { WaxSeal } from "./wax-seal";

const TAPS_TO_BREAK = 3;
const DRAG_TO_BREAK_PX = 80;
const SHAKES_TO_OPEN = 5;
const SHAKE_THRESHOLD = 18;
const OPENING_MS = 1300;
const FADE_MS = 300;

type Ready = Extract<EnvelopeView, { state: "ready" }>;

function SealedEnvelope({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const [taps, setTaps] = useState(0);
  const [opening, setOpening] = useState(false);
  const reducedMotion = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function open() {
    if (opening) return;
    setOpening(true);
    burst();
    timer.current = setTimeout(onOpen, reducedMotion ? FADE_MS : OPENING_MS);
  }

  function tap() {
    const next = taps + 1;
    setTaps(next);
    if (next >= TAPS_TO_BREAK) open();
  }

  const settle = { duration: 0.9, ease: [0.32, 0.72, 0, 1] as const };

  return (
    <div className="grid justify-items-center gap-6">
      <motion.div
        className="relative aspect-[7/5] w-full max-w-sm [perspective:1000px]"
        animate={{ opacity: opening && reducedMotion ? 0 : 1 }}
        transition={{ duration: FADE_MS / 1000 }}
      >
        <div className="absolute inset-0 rounded-tile bg-paper-deep" />
        <motion.div
          className="absolute inset-x-4 inset-y-3 rounded-field bg-paper"
          animate={opening ? { y: "-46%" } : { y: 0 }}
          transition={{ ...settle, delay: 0.35 }}
        />
        <div className="absolute inset-0 rounded-tile bg-[#e6d6b6] [clip-path:polygon(0_100%,50%_46%,100%_100%)]" />
        <div className="absolute inset-0 rounded-tile bg-[#ecdec2] [clip-path:polygon(0_0,50%_54%,0_100%)]" />
        <div className="absolute inset-0 rounded-tile bg-[#ecdec2] [clip-path:polygon(100%_0,50%_54%,100%_100%)]" />
        <motion.div
          className="absolute inset-x-0 top-0 h-[60%] origin-top rounded-t-tile bg-[#f4e9d2] [clip-path:polygon(0_0,100%_0,50%_100%)]"
          style={{ zIndex: opening ? 0 : 2 }}
          animate={opening ? { rotateX: 180 } : { rotateX: 0 }}
          transition={settle}
        />

        {!opening && (
          <motion.button
            type="button"
            onClick={tap}
            aria-label={t("open.sealLabel", { n: TAPS_TO_BREAK - taps })}
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
      </motion.div>

      {opening ? (
        <p role="status" className="text-center text-2xl font-bold">
          {t("open.coming")}
        </p>
      ) : (
        <>
          <Button onClick={open} className="w-full">
            <EnvelopeOpenIcon aria-hidden size={26} className="shrink-0" />
            {t("open.tapEnvelope")}
          </Button>
          <p className="text-center text-base">{t("open.sealFun")}</p>
        </>
      )}
    </div>
  );
}

function GiftBox({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const [shakes, setShakes] = useState(0);
  const [opening, setOpening] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(() => typeof DeviceMotionEvent !== "undefined" && "requestPermission" in DeviceMotionEvent);
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reducedMotion = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function openNow() {
    if (opening) return;
    setOpening(true);
    burst();
    timer.current = setTimeout(onOpen, reducedMotion ? FADE_MS : OPENING_MS);
  }

  function shake() {
    if (opening) return;
    if (!reducedMotion) void animate(scope.current, { rotate: [0, -7, 7, -5, 5, 0] }, { duration: 0.4 });
    const next = shakes + 1;
    setShakes(next);
    if (next >= SHAKES_TO_OPEN) openNow();
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
          className="absolute inset-x-0 top-6 z-[2] h-14 rounded-field bg-[#b83237]"
          animate={opening ? { y: -140, rotate: -18, opacity: 0 } : { y: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="absolute inset-y-0 left-1/2 w-9 -translate-x-1/2 bg-gold" />
        </motion.div>
        <div className="absolute inset-x-4 top-20 bottom-0 rounded-b-tile bg-wax">
          <div className="absolute inset-y-0 left-1/2 w-9 -translate-x-1/2 bg-gold" />
        </div>
      </div>

      {opening ? (
        <p role="status" className="text-center text-2xl font-bold">
          {t("open.coming")}
        </p>
      ) : (
        <>
          <Button onClick={openNow} className="w-full">
            <GiftIcon aria-hidden size={26} className="shrink-0" />
            {t("open.tapBox")}
          </Button>

          <div className="h-3 w-56 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label={t("open.shakeProgress")} aria-valuemin={0} aria-valuemax={SHAKES_TO_OPEN} aria-valuenow={shakes}>
            <div className="h-full origin-left bg-gold transition-transform duration-300 ease-settle" style={{ transform: `scaleX(${shakes / SHAKES_TO_OPEN})` }} />
          </div>

          <p className="text-center text-base">{t("open.boxFun")}</p>

          <div className="grid w-full gap-2 md:flex md:justify-center">
            <Button variant="ghost" onClick={shake}>
              {t("open.shake")}
            </Button>
            {needsPermission && (
              <Button variant="ghost" onClick={allowMotion}>
                {t("open.motion")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Reveal({ envelope, onClose }: { envelope: Ready; onClose: () => void }) {
  const t = useT();
  useEffect(() => burst(1.3), []);

  return (
    <div className="grid gap-6">
      <header className="rise">
        <p className="text-xl font-semibold">{t("reveal.lead", { name: envelope.giverName })}</p>
        <h1 className="mt-2 font-display text-[clamp(3rem,13vw,6rem)] leading-none font-semibold tracking-tight wrap-anywhere text-gold">{envelope.recipientName}</h1>
      </header>

      <h2 className="font-display text-2xl font-semibold">{t("reveal.wishlist")}</h2>

      <ol className="grid gap-4">
        {envelope.items.map((item, index) => (
          <li key={index} className="rise" style={{ "--i": index + 1 } as React.CSSProperties}>
            <Paper>
              <div className="flex flex-col gap-4 md:flex-row">
                {item.imageUrl && (
                  // Blob photos are already compressed client-side, so next/image would only add cost.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} loading="lazy" className="aspect-square w-full rounded-tile object-cover md:w-48" />
                )}
                <div className="grid min-w-0 flex-1 content-start gap-2">
                  <h3 className="font-display text-3xl font-semibold wrap-anywhere">{item.name}</h3>
                  <p className="text-xl font-bold text-wax-deep tabular-nums">{formatPeso(item.priceCentavos)}</p>
                  {item.url && (
                    <div className="mt-2">
                      <StoreLink url={item.url} />
                    </div>
                  )}
                </div>
              </div>
            </Paper>
          </li>
        ))}
      </ol>

      {envelope.codeReissuedAt && (
        <p className="rounded-tile bg-pine-800 px-4 py-4 text-base font-bold ring-1 ring-white/25">{t("reveal.reissued", { date: formatManila(envelope.codeReissuedAt) })}</p>
      )}

      <div className="grid gap-4">
        <p className="text-lg">{t("reveal.secret")}</p>
        <Button variant="gold" onClick={onClose} icon={<LockKeyIcon aria-hidden size={22} />}>
          {t("reveal.close")}
        </Button>
      </div>
    </div>
  );
}

function NameList({ participants, onPick }: { participants: PublicParticipant[]; onPick: (person: PublicParticipant) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const search = normalizeNamePart(query);
  const shown = [...participants]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((person) => !search || normalizeNamePart(person.name).includes(search));

  return (
    <div className="grid gap-6">
      <div>
        <label htmlFor="name-search" className="mb-2 block text-lg font-bold">
          {t("joined.search")}
        </label>
        <div className="relative">
          <MagnifyingGlassIcon aria-hidden size={24} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
          <input id="name-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={`${inputClass} pl-12`} />
        </div>
      </div>

      {shown.length > 0 ? (
        <ul className="grid gap-2">
          {shown.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onPick(person)}
                className="flex min-h-[5rem] w-full min-w-0 items-center gap-4 rounded-tile bg-paper-deep/70 p-4 text-left transition duration-200 ease-settle hover:bg-paper-deep active:scale-[0.99]"
              >
                <Avatar person={person} />
                <span className="min-w-0 flex-1 text-xl font-bold wrap-anywhere">{person.name}</span>
                <CaretRightIcon aria-hidden size={24} weight="bold" className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-lg font-bold">{t("joined.noMatch")}</p>
      )}
    </div>
  );
}

function Unlock({ slug, participants, onOpened }: { slug: string; participants: PublicParticipant[]; onOpened: (envelope: EnvelopeView) => void }) {
  const t = useT();
  const [person, setPerson] = useState<PublicParticipant | null>(null);
  const [code, setCode] = useState("");
  const [hasWordCode, setHasWordCode] = useState(false);
  const [error, setError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const sending = useRef(false);

  function changeCode(value: string) {
    setCode(value);
    setCodeError("");
    setError("");
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!person || sending.current) return;
    setError("");
    if (!code.trim()) {
      setCodeError(t("unlock.needCode"));
      return;
    }
    if (!hasWordCode && code.length < CODE_LENGTH) {
      setCodeError(t("unlock.shortCode"));
      return;
    }

    sending.current = true;
    setBusy(true);
    try {
      onOpened(await api<EnvelopeView>(`/api/exchanges/${slug}/envelope`, { body: { participantId: person.id, code } }));
    } catch (caught) {
      setError(friendlyError(caught, t));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const forgotButton = (
    <Button variant="ghost" onClick={() => setShowForgot(true)} className="w-full">
      <QuestionIcon aria-hidden size={22} className="shrink-0" />
      {t("unlock.forgot")}
    </Button>
  );

  return (
    <div className="grid gap-6">
      {person ? (
        <>
          <header className="rise">
            <h1 className="font-display text-4xl font-semibold">{t("unlock.code.title")}</h1>
            <p className="mt-2 text-lg wrap-anywhere">{hasWordCode ? person.name : t("unlock.code.body", { name: person.name })}</p>
          </header>
          <Paper className="rise" style={{ "--i": 1 } as React.CSSProperties}>
            <form onSubmit={unlock} noValidate className="grid gap-6">
              <Field label={t(hasWordCode ? "unlock.wordsLabel" : "unlock.codeLabel")} helper={hasWordCode ? t("unlock.wordsHelp") : undefined} error={codeError}>
                {(props) =>
                  hasWordCode ? (
                    <input {...props} value={code} onChange={(e) => changeCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} className={inputClass} />
                  ) : (
                    <CodeEntry {...props} value={code} onChange={changeCode} />
                  )
                }
              </Field>

              {error && <ErrorNote>{error}</ErrorNote>}

              <Button type="submit" busy={busy} className="w-full">
                {busy ? t("unlock.busy") : t("unlock.open")}
              </Button>

              <div className="grid gap-2">
                {forgotButton}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setHasWordCode(!hasWordCode);
                    changeCode("");
                  }}
                  className="w-full"
                >
                  {t(hasWordCode ? "unlock.usesNumbers" : "unlock.usesWords")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPerson(null);
                    changeCode("");
                  }}
                  className="w-full"
                >
                  {t("unlock.notYou")}
                </Button>
              </div>
            </form>
          </Paper>
        </>
      ) : (
        <>
          <header className="rise">
            <h1 className="font-display text-4xl font-semibold">{t("unlock.who.title")}</h1>
            <p className="mt-2 text-lg">{t("unlock.who.body")}</p>
          </header>
          <Paper className="rise" style={{ "--i": 1 } as React.CSSProperties}>
            {participants.length === 0 ? (
              <p className="text-lg">{t("unlock.who.nobody")}</p>
            ) : (
              <div className="grid gap-6">
                <NameList participants={participants} onPick={setPerson} />
                {forgotButton}
              </div>
            )}
          </Paper>
        </>
      )}

      <Dialog
        open={showForgot}
        title={t("unlock.forgotTitle")}
        onClose={() => setShowForgot(false)}
        footer={
          <Button onClick={() => setShowForgot(false)} className="w-full">
            {t("unlock.okay")}
          </Button>
        }
      >
        <p className="text-lg">{t("unlock.forgotBody")}</p>
        <p className="text-lg font-bold text-ink">{t("unlock.forgotHint")}</p>
      </Dialog>
    </div>
  );
}

export function EnvelopeClient({ slug, participants }: { slug: string; participants: PublicParticipant[] }) {
  const t = useT();
  const [envelope, setEnvelope] = useState<EnvelopeView | null>(null);
  const [opened, setOpened] = useState(false);
  const [style, setStyle] = useState<"envelope" | "box">("envelope");

  function reseal() {
    setEnvelope(null);
    setOpened(false);
    window.scrollTo({ top: 0 });
  }

  let screen;
  if (envelope?.state === "waiting") {
    screen = (
      <div className="rise">
        <SmileyWinkIcon aria-hidden size={56} className="text-gold" />
        <h1 className="mt-4 font-display text-4xl font-semibold wrap-anywhere">{t("open.waiting.title", { name: envelope.giverName })}</h1>
        <p className="mt-4 mb-8 text-lg">{t("open.waiting.body")}</p>
        <LinkButton href={`/x/${slug}`} variant="gold">
          {t("common.backHome")}
        </LinkButton>
      </div>
    );
  } else if (envelope?.state === "ready") {
    screen = opened ? (
      <Reveal envelope={envelope} onClose={reseal} />
    ) : (
      <div className="rise grid gap-6">
        <h1 className="font-display text-4xl font-semibold wrap-anywhere">{t("open.ready.title", { name: envelope.giverName })}</h1>

        {style === "envelope" ? <SealedEnvelope onOpen={() => setOpened(true)} /> : <GiftBox onOpen={() => setOpened(true)} />}

        <div>
          <p className="mb-2 text-lg font-bold">{t("open.howTo")}</p>
          <div role="group" aria-label={t("open.howTo")} className="flex w-fit max-w-full flex-wrap gap-1 rounded-card bg-black/30 p-1 ring-1 ring-white/20">
            {(
              [
                ["envelope", t("open.envelope"), EnvelopeSimpleIcon],
                ["box", t("open.box"), GiftIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={style === value}
                onClick={() => setStyle(value)}
                className={`flex min-h-tap items-center gap-2 rounded-full px-6 text-base font-bold transition duration-300 ease-settle ${style === value ? "bg-gold text-ink" : "text-snow"}`}
              >
                <Icon aria-hidden size={22} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  } else {
    screen = <Unlock slug={slug} participants={participants} onOpened={setEnvelope} />;
  }

  return <MotionConfig reducedMotion="user">{screen}</MotionConfig>;
}
