"use client";

import { CaretLeftIcon, CaretRightIcon, LockKeyIcon, MagnifyingGlassIcon, QuestionIcon, SmileyWinkIcon } from "@phosphor-icons/react";
import { MotionConfig } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBackToClose } from "@/lib/app-history";
import { burst } from "@/lib/celebrate";
import { formatManila, nextChristmas } from "@/lib/christmas";
import { api } from "@/lib/client-api";
import { friendlyError, useT } from "@/lib/i18n";
import { formatPeso } from "@/lib/money";
import { normalizeNamePart } from "@/lib/names";
import type { EnvelopeView, LobbyView, PublicParticipant } from "@/lib/types";
import { CODE_LENGTH, CodeEntry } from "./code-entry";
import { CountdownBig } from "./countdown";
import { SealedEnvelope } from "./envelope";
import { ItemPhoto } from "./item-photo";
import { Avatar } from "./people";
import { StoreLink } from "./store-chip";
import { Button, Dialog, ErrorNote, Field, inputClass } from "./ui";

const SWIPE_PX = 50;

type Ready = Extract<EnvelopeView, { state: "ready" }>;

function NotDrawnYet({ lobby }: { lobby: LobbyView }) {
  const t = useT();
  return (
    <div className="safe-x flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-y-auto overscroll-contain py-2">
      <div className="paper shrink-0 rounded-card bg-paper p-4 shadow-card">
        <SmileyWinkIcon aria-hidden size={40} className="text-wax-deep" />
        <h1 className="mt-2 font-display text-3xl font-semibold">{t("envelope.notYet")}</h1>
        <p className="mt-2 text-lg text-ink-soft">{t("envelope.comeBack", { date: formatManila(lobby.revealAt) })}</p>
      </div>
      <section aria-label={t("count.until")} className="shrink-0 rounded-card bg-pine-800/90 p-4 shadow-card ring-1 ring-gold/40">
        <h2 className="mb-2 font-display text-xl font-semibold">{t("count.until")}</h2>
        <CountdownBig target={nextChristmas(new Date(lobby.revealAt))} />
      </section>
    </div>
  );
}

function ForgotCode({ compact }: { compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" fit={compact} onClick={() => setOpen(true)} className={compact ? "px-2! text-base!" : "w-full shrink-0"}>
        {!compact && <QuestionIcon aria-hidden size={22} className="shrink-0" />}
        {t("unlock.forgot")}
      </Button>
      <Dialog
        open={open}
        title={t("unlock.forgotTitle")}
        onClose={() => setOpen(false)}
        footer={
          <Button onClick={() => setOpen(false)} className="w-full">
            {t("unlock.okay")}
          </Button>
        }
      >
        <p className="text-lg">{t("unlock.forgotBody")}</p>
        <p className="text-lg font-bold text-ink">{t("unlock.forgotHint")}</p>
      </Dialog>
    </>
  );
}

function PickName({ participants, onPick }: { participants: PublicParticipant[]; onPick: (person: PublicParticipant) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const search = normalizeNamePart(query);
  const shown = [...participants].sort((a, b) => a.name.localeCompare(b.name)).filter((person) => !search || normalizeNamePart(person.name).includes(search));

  return (
    <div className="safe-x flex min-h-0 flex-1 flex-col gap-3 py-3">
      <h1 className="shrink-0 font-display text-3xl font-semibold">{t("unlock.who.title")}</h1>
      <div className="paper flex min-h-0 flex-1 flex-col gap-2 rounded-card bg-paper p-4 shadow-card">
        <div className="shrink-0">
          <label htmlFor="mobile-name-search" className="mb-1 block text-sm font-bold">
            {t("joined.search")}
          </label>
          <div className="relative">
            <MagnifyingGlassIcon aria-hidden size={24} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
            <input id="mobile-name-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={`${inputClass} pl-12`} />
          </div>
        </div>
        {shown.length > 0 ? (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
            {shown.map((person) => (
              <li key={person.id}>
                <button type="button" onClick={() => onPick(person)} className="flex min-h-tap-lg w-full min-w-0 items-center gap-4 rounded-tile bg-paper-deep/70 p-2 text-left">
                  <Avatar person={person} />
                  <span className="min-w-0 flex-1 text-lg font-bold wrap-anywhere">{person.name}</span>
                  <CaretRightIcon aria-hidden size={24} weight="bold" className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="min-h-0 flex-1 text-lg font-bold">{t("joined.noMatch")}</p>
        )}
      </div>
      <ForgotCode />
    </div>
  );
}

function EnterCode({ slug, person, onBack, onOpened }: { slug: string; person: PublicParticipant; onBack: () => void; onOpened: (envelope: EnvelopeView) => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [hasWordCode, setHasWordCode] = useState(false);
  const [error, setError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  function changeCode(value: string) {
    setCode(value);
    setCodeError("");
    setError("");
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
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

  return (
    <form onSubmit={unlock} noValidate className="safe-x flex min-h-0 flex-1 flex-col gap-3 py-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
        <h1 className="shrink-0 font-display text-3xl font-semibold">{t("unlock.code.title")}</h1>
        <p className="shrink-0 text-base wrap-anywhere">{hasWordCode ? person.name : t("unlock.code.body", { name: person.name })}</p>
        <div className="paper shrink-0 rounded-card bg-paper p-4 shadow-card">
          <Field label={t(hasWordCode ? "unlock.wordsLabel" : "unlock.codeLabel")} helper={hasWordCode ? t("unlock.wordsHelp") : undefined} error={codeError}>
            {(props) =>
              hasWordCode ? (
                <input {...props} value={code} onChange={(e) => changeCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} className={inputClass} />
              ) : (
                <CodeEntry {...props} value={code} onChange={changeCode} />
              )
            }
          </Field>
        </div>
        {error && <ErrorNote className="shrink-0">{error}</ErrorNote>}
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <ForgotCode compact />
          <Button variant="ghost" fit onClick={onBack} className="px-2! text-base!">
            {t("unlock.notYou")}
          </Button>
        </div>
        <button
          type="button"
          onClick={() => {
            setHasWordCode(!hasWordCode);
            changeCode("");
          }}
          className="min-h-tap shrink-0 text-base font-bold underline underline-offset-4"
        >
          {t(hasWordCode ? "unlock.usesNumbers" : "unlock.usesWords")}
        </button>
      </div>
      <Button type="submit" busy={busy} className="w-full shrink-0">
        {busy ? t("unlock.busy") : t("unlock.open")}
      </Button>
    </form>
  );
}

function Reveal({ envelope, onClose }: { envelope: Ready; onClose: () => void }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  useEffect(() => burst(1.3), []);

  const total = envelope.items.length;
  const item = envelope.items[Math.min(index, total - 1)];
  const go = (offset: -1 | 1) => setIndex((current) => Math.min(total - 1, Math.max(0, current + offset)));

  return (
    <div className="safe-x flex min-h-0 flex-1 flex-col gap-3 py-3">
      <header className="shrink-0">
        <p className="text-base font-semibold wrap-anywhere">{t("reveal.lead", { name: envelope.giverName })}</p>
        <h1 className="line-clamp-2 font-display text-4xl font-semibold tracking-tight wrap-anywhere text-gold">{envelope.recipientName}</h1>
      </header>

      <p aria-live="polite" className="shrink-0 text-center text-lg font-bold">
        {t("reveal.itemOf", { n: index + 1, total })}
      </p>

      <article
        className="paper flex min-h-0 flex-1 touch-pan-y flex-col gap-2 overflow-y-auto overscroll-contain rounded-card bg-paper p-4 shadow-card"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          if (touchStart.current === null) return;
          const distance = event.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (distance <= -SWIPE_PX) go(1);
          else if (distance >= SWIPE_PX) go(-1);
        }}
      >
        {item.imageUrl && (
          <ItemPhoto key={item.imageUrl} zoomable src={item.imageUrl} alt={item.name} sizes="100vw" fit="contain" className="h-[22dvh] w-full shrink-0 rounded-tile" />
        )}
        <h2 className="font-display text-2xl font-semibold wrap-anywhere">{item.name}</h2>
        {item.priceCentavos !== null && <p className="text-xl font-bold text-wax-deep tabular-nums">{formatPeso(item.priceCentavos)}</p>}
        {item.url && <StoreLink url={item.url} />}
        {envelope.codeReissuedAt && <p className="mt-2 rounded-tile bg-paper-deep p-2 text-base font-bold">{t("reveal.reissued", { date: formatManila(envelope.codeReissuedAt) })}</p>}
      </article>

      {total > 1 && (
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <Button variant="ghost" size="lg" fit disabled={index === 0} onClick={() => go(-1)} className="gap-1! px-2!">
            <CaretLeftIcon aria-hidden size={22} weight="bold" className="shrink-0" />
            {t("reveal.previous")}
          </Button>
          <Button variant="ghost" size="lg" fit disabled={index >= total - 1} onClick={() => go(1)} className="gap-1! px-2!">
            {t("reveal.next")}
            <CaretRightIcon aria-hidden size={22} weight="bold" className="shrink-0" />
          </Button>
        </div>
      )}

      <Button variant="gold" size="md" onClick={onClose} className="w-full shrink-0">
        <LockKeyIcon aria-hidden size={22} className="shrink-0" />
        {t("reveal.close")}
      </Button>
    </div>
  );
}

function EnvelopeSteps({ slug, participants }: { slug: string; participants: PublicParticipant[] }) {
  const t = useT();
  const [person, setPerson] = useState<PublicParticipant | null>(null);
  const [envelope, setEnvelope] = useState<EnvelopeView | null>(null);
  const [opened, setOpened] = useState(false);

  function startOver() {
    setPerson(null);
    setEnvelope(null);
    setOpened(false);
  }

  useBackToClose(person !== null, startOver);

  if (participants.length === 0) {
    return (
      <div className="safe-x flex min-h-0 flex-1 items-center">
        <p className="text-xl font-bold">{t("unlock.who.nobody")}</p>
      </div>
    );
  }
  if (!person) return <PickName participants={participants} onPick={setPerson} />;
  if (envelope?.state === "ready" && opened) return <Reveal envelope={envelope} onClose={startOver} />;
  if (envelope?.state === "ready") {
    return (
      <div className="rise safe-x flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-y-auto overscroll-contain py-2">
        <h1 className="shrink-0 font-display text-3xl font-semibold wrap-anywhere">{t("open.ready.title", { name: envelope.giverName })}</h1>
        <SealedEnvelope onOpen={() => setOpened(true)} />
      </div>
    );
  }
  return <EnterCode key={person.id} slug={slug} person={person} onBack={startOver} onOpened={setEnvelope} />;
}

export function MobileEnvelope({ lobby }: { lobby: LobbyView }) {
  if (lobby.status !== "drawn") return <NotDrawnYet lobby={lobby} />;
  return (
    <MotionConfig reducedMotion="user">
      <EnvelopeSteps slug={lobby.slug} participants={lobby.participants} />
    </MotionConfig>
  );
}
