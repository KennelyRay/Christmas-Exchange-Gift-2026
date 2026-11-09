"use client";

import { CaretDownIcon, CaretRightIcon, CheckIcon } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { pushEntry } from "@/lib/app-history";
import { formatManila } from "@/lib/christmas";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { formatPeso } from "@/lib/money";
import { groupByFamily, normalizeNamePart } from "@/lib/names";
import type { LobbyModel, Stage } from "@/lib/stage";
import type { LobbyView, PublicParticipant } from "@/lib/types";
import { CodeGate } from "./code-gate";
import { CountdownFocal } from "./countdown";
import { TreeAndGifts } from "./illustrations";
import { AuditList, CONTACT_URL, InstallRow, LanguageToggle } from "./lobby-cards";
import { MobileEnvelope } from "./mobile-envelope";
import { HeadlineWithSearch, SoftAvatar, TabBar, tabHref, TopBar, type Tab } from "./mobile-shell";
import { ShareButton } from "./share";
import { Button, Dialog, ErrorNote, LinkButton } from "./ui";

/* -------------------------------- Home -------------------------------- */

const STAGE_TITLE: Record<Stage, MessageKey> = {
  1: "home.stage.1",
  2: "home.stage.2",
  3: "home.stage.3",
  4: "home.stage.4",
};

const STEPS: ReadonlyArray<[MessageKey, MessageKey]> = [
  ["step.1", "step.1.note"],
  ["step.2", "step.2.note"],
  ["step.3", "step.3.note"],
  ["step.4", "step.4.note"],
];

function StepList({ current }: { current: Stage }) {
  const t = useT();
  return (
    <ol className="grid gap-4">
      {STEPS.map(([label, note], index) => {
        const n = index + 1;
        return (
          <li key={label} aria-current={n === current ? "step" : undefined} className="flex gap-4">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center text-base font-semibold text-ink">
              {n < current ? <CheckIcon size={22} /> : n}
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">
                {t(label)}
                {n < current && <span className="sr-only"> {t("step.done")}</span>}
              </p>
              <p className="text-sm">{n === current ? `${t("step.now")}. ${t(note)}` : t(note)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ParolStar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="32 32 56 56" aria-hidden className={className}>
      <path d="M60 32l6 22 22 6-22 6-6 22-6-22-22-6 22-6z" fill="currentColor" />
    </svg>
  );
}

function MainAction({ model, onSelect }: { model: LobbyModel; onSelect: (tab: Tab) => void }) {
  const t = useT();
  const { mainAction, lobby } = model;
  const base = `/x/${lobby.slug}`;

  if (mainAction === "add") return <LinkButton href={`${base}/join`}>{t("action.addWishlist")}</LinkButton>;
  if (mainAction === "envelope") return <Button onClick={() => onSelect("envelope")}>{t("action.openEnvelope")}</Button>;
  if (mainAction === "chain") return <LinkButton href={`${base}/chain`}>{t("action.joinChain")}</LinkButton>;
  if (mainAction === "share") return <ShareButton slug={lobby.slug} name={lobby.name} variant="primary" />;
  return null;
}

function HomeScreen({ model, onSelect }: { model: LobbyModel; onSelect: (tab: Tab) => void }) {
  const t = useT();
  const [showSteps, setShowSteps] = useState(false);
  const { lobby, stage, christmas, mainAction, joinedName, stale } = model;
  const title = stage === 1 && joinedName ? "home.stage.1.joined" : STAGE_TITLE[stage];

  return (
    <div className="gutter flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {stale && <p className="shrink-0 pt-2 text-base">{t("stage.stale")}</p>}

      <div className="flex flex-[1_0_auto] flex-col justify-center gap-8 py-4">
        <section aria-label={t("count.until")} className="relative w-fit pr-8">
          <ParolStar className="absolute top-1 right-0 size-6 text-snow/60" />
          <CountdownFocal target={christmas} />
        </section>

        <div>
          <p className="text-base">{t("home.stepOf", { n: stage })}</p>
          <p className="mt-1 font-display text-2xl font-semibold">{t(title)}</p>
          {mainAction === null && <p className="mt-1 text-base">{t("home.nothingToDo")}</p>}
          <button type="button" onClick={() => setShowSteps(true)} className="min-h-tap text-base underline decoration-current/50 underline-offset-4">
            {t("home.whatsThis")}
          </button>
        </div>
      </div>

      {/* Sticky, so at very large text it stays in reach while the rest scrolls under it. */}
      {mainAction !== null && (
        <div className="sticky bottom-0 z-10 grid shrink-0">
          <MainAction model={model} onSelect={onSelect} />
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-x-6 pt-2 pb-2">
        <Button variant="text" fit onClick={() => onSelect("joined")}>
          {t("home.joined", { n: lobby.participants.length })}
        </Button>
        {mainAction === "share" ? (
          <LinkButton href={`/x/${lobby.slug}/join`} variant="text" fit>
            {t("home.addOther")}
          </LinkButton>
        ) : (
          <ShareButton slug={lobby.slug} name={lobby.name} variant="text" />
        )}
      </div>

      <Dialog open={showSteps} title={t("steps.title")} onClose={() => setShowSteps(false)}>
        <StepList current={stage} />
        <p className="text-base">{t("count.chainExplained")}</p>
        <p className="text-base font-semibold text-ink">{t("count.reveal", { date: formatManila(lobby.revealAt), manila: t("common.manila") })}</p>
        {lobby.budgetCentavos !== null && (
          <p className="text-base font-semibold text-ink">
            {t("stage.budget")} {formatPeso(lobby.budgetCentavos)}
          </p>
        )}
      </Dialog>
    </div>
  );
}

/* ---------------------------- Who's Joined ---------------------------- */

function JoinedEmpty({ lobby }: { lobby: LobbyView }) {
  const t = useT();
  const canJoin = lobby.status === "open";
  return (
    <div className="gutter flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div className="flex flex-[1_0_auto] flex-col justify-center gap-6 py-4">
        <div className="paper rounded-soft bg-paper p-6">
          <TreeAndGifts className="mx-auto max-h-[28dvh] w-full" />
        </div>
        <h1 className="font-display text-3xl font-semibold">{t("joined.empty")}</h1>
      </div>
      {canJoin && (
        <div className="grid shrink-0 gap-2 pb-2">
          <LinkButton href={`/x/${lobby.slug}/join`}>{t("empty.first")}</LinkButton>
          <ShareButton slug={lobby.slug} name={lobby.name} variant="text" className="justify-self-start" />
        </div>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: PublicParticipant }) {
  const t = useT();
  return (
    <li className="flex min-h-row min-w-0 shrink-0 items-center gap-4">
      <SoftAvatar person={person} />
      <div className="min-w-0 flex-1">
        <p className="text-base leading-snug font-semibold wrap-anywhere">{person.name}</p>
        <p className="text-sm">{person.itemCount === 1 ? t("joined.items1") : t("joined.items", { n: person.itemCount })}</p>
      </div>
    </li>
  );
}

function JoinedScreen({ lobby }: { lobby: LobbyView }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [familyKey, setFamilyKey] = useState<string | null>(null);

  const count = lobby.participants.length;
  if (count === 0) return <JoinedEmpty lobby={lobby} />;

  const families = groupByFamily(lobby.participants);
  const selected = families.find((family) => family.key === familyKey) ?? null;
  const search = normalizeNamePart(query);
  const shown = (selected ? selected.members : families.flatMap((family) => family.members)).filter((person) => !search || normalizeNamePart(person.name).includes(search));
  const chip = (active: boolean) => `min-h-tap shrink-0 rounded-full px-3 text-sm whitespace-nowrap wrap-normal transition-colors duration-200 ${active ? "bg-white/15 font-semibold" : ""}`;

  return (
    <div className="gutter flex min-h-0 flex-1 flex-col gap-4 pt-4">
      <HeadlineWithSearch title={count === 1 ? t("joined.count1") : t("joined.count", { n: count })} id="mobile-joined-search" value={query} onChange={setQuery} />

      {families.length > 1 && (
        <div className="-mx-6 flex shrink-0 gap-1 overflow-x-auto px-6">
          <button type="button" aria-pressed={selected === null} onClick={() => setFamilyKey(null)} className={chip(selected === null)}>
            {t("joined.all")}
          </button>
          {families.map((family) => (
            <button key={family.key} type="button" aria-pressed={selected?.key === family.key} onClick={() => setFamilyKey(family.key)} className={chip(selected?.key === family.key)}>
              {family.label}
            </button>
          ))}
        </div>
      )}

      {lobby.drawWarning && <ErrorNote className="shrink-0">{lobby.drawWarning}</ErrorNote>}

      {shown.length > 0 ? (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {shown.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </ul>
      ) : (
        <p className="min-h-0 flex-1 text-base">{t("joined.noMatch")}</p>
      )}
    </div>
  );
}

/* -------------------------------- Help -------------------------------- */

const QUESTIONS: ReadonlyArray<[MessageKey, MessageKey]> = [
  ["faq.what", "faq.what.a"],
  ["faq.join", "faq.join.a"],
  ["faq.lostShort", "faq.lost.a"],
  ["faq.draw", "faq.draw.a"],
  ["faq.chain", "faq.chain.a"],
];

function HelpRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full shrink-0 items-center gap-4 text-left text-base font-semibold">
      <span className="min-w-0 flex-1">{label}</span>
      <CaretRightIcon aria-hidden size={20} className="shrink-0" />
    </button>
  );
}

function HelpScreen({ lobby }: { lobby: LobbyView }) {
  const t = useT();
  const router = useRouter();
  const [openQuestion, setOpenQuestion] = useState<MessageKey | null>(null);
  const [sheet, setSheet] = useState<"activity" | "organizer" | "sealed" | null>(null);
  const close = () => setSheet(null);
  const values = { date: formatManila(lobby.revealAt), manila: t("common.manila") };

  return (
    <div className="gutter flex min-h-0 flex-1 flex-col gap-4 pt-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4">
        <h1 className="font-display text-3xl font-semibold">{t("nav.help")}</h1>
        <LanguageToggle />
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {QUESTIONS.map(([question, answer]) => {
          const isOpen = openQuestion === question;
          return (
            <div key={question} className="shrink-0">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpenQuestion(isOpen ? null : question)} className="flex min-h-14 w-full items-center gap-4 text-left text-base font-semibold">
                <span className="min-w-0 flex-1">{t(question)}</span>
                <CaretDownIcon aria-hidden size={20} className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <p className="animate-soft pb-4 text-base">{t(answer, values)}</p>}
            </div>
          );
        })}

        <HelpRow label={t("help.activity")} onClick={() => setSheet("activity")} />
        {lobby.commitmentHash && <HelpRow label={t("sealed.title", { n: lobby.drawGeneration })} onClick={() => setSheet("sealed")} />}
        <InstallRow />

        {CONTACT_URL ? (
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-14 shrink-0 items-center text-base font-semibold underline decoration-current/50 underline-offset-4">
            {t("faq.message")}
          </a>
        ) : (
          <p className="shrink-0 py-4 text-base">{t("faq.askSender")}</p>
        )}
      </div>

      <div className="shrink-0 pb-2">
        <Button variant="ghost" onClick={() => setSheet("organizer")} className="w-full">
          {t("help.organizer")}
        </Button>
      </div>

      <Dialog open={sheet === "activity"} title={t("help.activity")} onClose={close}>
        <AuditList entries={lobby.audit} />
      </Dialog>

      <Dialog open={sheet === "sealed"} title={t("sealed.title", { n: lobby.drawGeneration })} onClose={close}>
        <p className="text-base">{t("sealed.body")}</p>
        <p className="font-mono text-sm break-all text-ink">{lobby.commitmentHash}</p>
        <LinkButton href={`/x/${lobby.slug}/seal`} variant="ghost" className="w-full">
          {lobby.sealOpened ? t("sealed.check") : t("sealed.how")}
        </LinkButton>
      </Dialog>

      <Dialog open={sheet === "organizer"} title={t("help.signIn")} onClose={close}>
        {sheet === "organizer" && <CodeGate slug={lobby.slug} onSuccess={() => router.push(`/x/${lobby.slug}/organizer`)} />}
      </Dialog>
    </div>
  );
}

/* --------------------------------- App -------------------------------- */

function currentTab(value: string | null): Tab {
  return value === "joined" || value === "envelope" || value === "help" ? value : "home";
}

/**
 * Every tab stays mounted and only the visible one is shown, so each keeps its
 * scroll position, search text, and place in the envelope steps.
 */
export function MobileLobby({ model }: { model: LobbyModel }) {
  const tab = currentTab(useSearchParams().get("tab"));
  const { lobby } = model;

  function select(next: Tab) {
    if (next !== tab) pushEntry(tabHref(lobby.slug, next));
  }

  const screens: Array<[Tab, ReactNode]> = [
    ["home", <HomeScreen key="home" model={model} onSelect={select} />],
    ["joined", <JoinedScreen key="joined" lobby={lobby} />],
    ["envelope", <MobileEnvelope key="envelope" lobby={lobby} />],
    ["help", <HelpScreen key="help" lobby={lobby} />],
  ];

  return (
    <div className="app-screen md:hidden">
      <TopBar name={lobby.name} />
      <main className="relative min-h-0 flex-1">
        {screens.map(([id, screen]) => (
          <div key={id} inert={id !== tab} className={`absolute inset-0 flex flex-col transition-[opacity,transform,visibility] duration-200 ease-settle ${id === tab ? "" : "invisible translate-y-2 opacity-0"}`}>
            {screen}
          </div>
        ))}
      </main>
      <TabBar slug={lobby.slug} active={tab} onSelect={select} />
    </div>
  );
}
