"use client";

import { CaretLeftIcon, CaretRightIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { MotionConfig } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBackToClose } from "@/lib/app-history";
import { burst } from "@/lib/celebrate";
import { formatManila } from "@/lib/christmas";
import { api } from "@/lib/client-api";
import { friendlyError, useT } from "@/lib/i18n";
import { formatPeso } from "@/lib/money";
import { normalizeNamePart } from "@/lib/names";
import type { EnvelopeView, LobbyView, PublicParticipant } from "@/lib/types";
import { CODE_LENGTH, CodeEntry } from "./code-entry";
import { SealedEnvelope } from "./envelope";
import { HeadlineWithSearch, SoftAvatar } from "./mobile-shell";
import { StoreLink } from "./store-chip";
import { Button, Dialog, ErrorNote, Field, inputClass } from "./ui";

const SWIPE_PX = 50;

type Ready = Extract<EnvelopeView, { state: "ready" }>;

function NotDrawnYet({ lobby }: { lobby: LobbyView }) {
  const t = useT();
  return (
    <div className="gutter flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto overscroll-contain py-4">
      <EnvelopeSimpleIcon aria-hidden size={88} weight="light" className="shrink-0 drop-shadow-[0_0_24px_rgba(224,187,107,0.4)]" />
      <div className="shrink-0">
        <h1 className="font-display text-3xl font-semibold">{t("envelope.notYet")}</h1>
        <p className="mt-2 text-base">{t("envelope.comeBack", { date: formatManila(lobby.revealAt) })}</p>
      </div>
    </div>
  );
}

function ForgotCode({ usesWords, onToggleWords }: { usesWords?: boolean; onToggleWords?: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="text" fit onClick={() => setOpen(true)}>
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
        <p className="text-base">{t("unlock.forgotBody")}</p>
        <p className="text-base font-semibold text-ink">{t("unlock.forgotHint")}</p>
        {onToggleWords && (
          <Button
            variant="text"
            fit
            onClick={() => {
              setOpen(false);
              onToggleWords();
            }}
            className="justify-self-start"
          >
            {t(usesWords ? "unlock.usesNumbers" : "unlock.usesWords")}
          </Button>
        )}
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
    <div className="animate-soft gutter flex min-h-0 flex-1 flex-col gap-4 pt-4">
      <HeadlineWithSearch title={t("unlock.who.title")} id="mobile-name-search" value={query} onChange={setQuery} />
      {shown.length > 0 ? (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {shown.map((person) => (
            <li key={person.id} className="shrink-0">
              <button type="button" onClick={() => onPick(person)} className="flex min-h-row w-full min-w-0 items-center gap-4 text-left">
                <SoftAvatar person={person} />
                <span className="min-w-0 flex-1 text-base font-semibold wrap-anywhere">{person.name}</span>
                <CaretRightIcon aria-hidden size={20} className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="min-h-0 flex-1 text-base">{t("joined.noMatch")}</p>
      )}
      <div className="shrink-0 pb-2">
        <ForgotCode />
      </div>
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
    <form onSubmit={unlock} noValidate className="animate-soft gutter flex min-h-0 flex-1 flex-col pt-4">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain">
        <header className="shrink-0">
          <h1 className="font-display text-3xl font-semibold">{t("unlock.code.title")}</h1>
          <p className="mt-2 text-base wrap-anywhere">{t("unlock.code.hi", { name: person.name })}</p>
        </header>
        <div className="shrink-0">
          <Field label={t(hasWordCode ? "unlock.wordsLabel" : "unlock.codeShort")} helper={hasWordCode ? t("unlock.wordsHelp") : undefined} error={codeError}>
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
        <div className="flex shrink-0 flex-wrap gap-x-6">
          <ForgotCode
            usesWords={hasWordCode}
            onToggleWords={() => {
              setHasWordCode(!hasWordCode);
              changeCode("");
            }}
          />
          <Button variant="text" fit onClick={onBack}>
            {t("unlock.notYou")}
          </Button>
        </div>
      </div>
      <div className="grid shrink-0 pt-4 pb-4">
        <Button type="submit" busy={busy}>
          {busy ? t("unlock.busy") : t("unlock.open")}
        </Button>
      </div>
    </form>
  );
}

function Wishlist({ envelope, onBack, onClose }: { envelope: Ready; onBack: () => void; onClose: () => void }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);

  const total = envelope.items.length;
  const item = envelope.items[Math.min(index, total - 1)];
  const go = (offset: -1 | 1) => setIndex((current) => Math.min(total - 1, Math.max(0, current + offset)));

  return (
    <div className="animate-soft gutter flex min-h-0 flex-1 flex-col gap-4 pt-2">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <Button variant="text" fit onClick={onBack} className="min-w-0 gap-1! no-underline!">
          <CaretLeftIcon aria-hidden size={20} className="shrink-0" />
          <span className="min-w-0 truncate">{envelope.recipientName}</span>
        </Button>
        <p aria-live="polite" className="shrink-0 text-sm">
          {t("reveal.itemOf", { n: index + 1, total })}
        </p>
      </div>

      <article
        className="paper flex min-h-0 flex-1 touch-pan-y flex-col justify-center gap-2 overflow-y-auto overscroll-contain rounded-soft bg-paper p-6"
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
          // Blob photos are already compressed client-side, so next/image would only add cost.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.imageUrl} src={item.imageUrl} alt={item.name} loading="lazy" className="h-[22dvh] w-full shrink-0 rounded-field object-contain" />
        )}
        <h1 className="font-display text-3xl font-semibold wrap-anywhere">{item.name}</h1>
        {item.priceCentavos !== null && <p className="text-base tabular-nums">{formatPeso(item.priceCentavos)}</p>}
        {item.url && (
          <div className="mt-2 grid">
            <StoreLink url={item.url} />
          </div>
        )}
      </article>

      {total > 1 && (
        <div className="flex shrink-0 justify-between">
          <Button variant="ghost" fit disabled={index === 0} onClick={() => go(-1)} className="gap-1! px-4!">
            <CaretLeftIcon aria-hidden size={20} className="shrink-0" />
            {t("reveal.previous")}
          </Button>
          <Button variant="ghost" fit disabled={index >= total - 1} onClick={() => go(1)} className="gap-1! px-4!">
            {t("reveal.next")}
            <CaretRightIcon aria-hidden size={20} className="shrink-0" />
          </Button>
        </div>
      )}

      <div className="shrink-0 pb-2">
        <Button variant="text" fit onClick={onClose}>
          {t("reveal.close")}
        </Button>
      </div>
    </div>
  );
}

function RevealName({ envelope, onSeeList, onClose }: { envelope: Ready; onSeeList: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <div className="animate-soft gutter flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div className="flex flex-[1_0_auto] flex-col justify-center py-4">
        <p className="text-base">{t("reveal.leadShort")}</p>
        <h1 className="mt-2 font-display text-[clamp(3.25rem,15vw,4.5rem)] leading-tight font-semibold wrap-anywhere text-gold">{envelope.recipientName}</h1>
        {envelope.codeReissuedAt && <p className="mt-6 text-sm">{t("reveal.reissued", { date: formatManila(envelope.codeReissuedAt) })}</p>}
      </div>
      <div className="grid shrink-0 gap-2 pb-2">
        <Button onClick={onSeeList}>{t("reveal.seeList")}</Button>
        <Button variant="text" fit onClick={onClose} className="justify-self-start">
          {t("reveal.close")}
        </Button>
      </div>
    </div>
  );
}

function EnvelopeSteps({ slug, participants }: { slug: string; participants: PublicParticipant[] }) {
  const t = useT();
  const [person, setPerson] = useState<PublicParticipant | null>(null);
  const [envelope, setEnvelope] = useState<EnvelopeView | null>(null);
  const [opened, setOpened] = useState(false);
  const [seeingList, setSeeingList] = useState(false);

  function startOver() {
    setPerson(null);
    setEnvelope(null);
    setOpened(false);
    setSeeingList(false);
  }

  useBackToClose(person !== null, startOver);
  useBackToClose(seeingList, () => setSeeingList(false));

  useEffect(() => {
    // A small flourish, once, when the name first appears.
    if (opened) burst(0.5);
  }, [opened]);

  if (participants.length === 0) {
    return (
      <div className="gutter flex min-h-0 flex-1 items-center">
        <p className="text-base">{t("unlock.who.nobody")}</p>
      </div>
    );
  }
  if (!person) return <PickName participants={participants} onPick={setPerson} />;
  if (envelope?.state === "ready" && opened) {
    return seeingList ? (
      <Wishlist envelope={envelope} onBack={() => setSeeingList(false)} onClose={startOver} />
    ) : (
      <RevealName envelope={envelope} onSeeList={() => setSeeingList(true)} onClose={startOver} />
    );
  }
  if (envelope?.state === "ready") {
    return (
      <div className="animate-soft gutter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pt-4 pb-2">
        <h1 className="shrink-0 font-display text-3xl font-semibold">{t("open.yours")}</h1>
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
