"use client";

import { CaretDownIcon, CaretRightIcon, ClockCounterClockwiseIcon, EnvelopeSimpleIcon, GiftIcon, MagnifyingGlassIcon, SealCheckIcon, TelevisionIcon, UsersThreeIcon } from "@phosphor-icons/react";
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
import { CountdownBig } from "./countdown";
import { TreeAndGifts } from "./illustrations";
import { AuditList, CONTACT_URL, InstallTip, LanguageToggle } from "./lobby-cards";
import { MobileEnvelope } from "./mobile-envelope";
import { TabBar, tabHref, TopBar, type Tab } from "./mobile-shell";
import { Avatar } from "./people";
import { ShareButton } from "./share";
import { Stepper } from "./stepper";
import { Button, buttonClass, Dialog, ErrorNote, inputClass, LinkButton } from "./ui";
import { WaxSeal } from "./wax-seal";

const STAGE_TITLE: Record<Stage, MessageKey> = {
  1: "home.stage.1",
  2: "home.stage.2",
  3: "home.stage.3",
  4: "home.stage.4",
};

/* -------------------------------- Home -------------------------------- */

function StepDots({ current }: { current: Stage }) {
  return (
    <span aria-hidden className="flex gap-2">
      {[1, 2, 3, 4].map((n) => (
        <span key={n} className={`size-3 rounded-full ${n <= current ? "bg-wax" : "bg-ink/25"} ${n === current ? "ring-2 ring-wax/40 ring-offset-2 ring-offset-paper" : ""}`} />
      ))}
    </span>
  );
}

function MainAction({ model, onSelect }: { model: LobbyModel; onSelect: (tab: Tab) => void }) {
  const t = useT();
  const { mainAction, lobby } = model;
  const base = `/x/${lobby.slug}`;

  if (mainAction === "add") {
    return (
      <LinkButton href={`${base}/join`} icon={<GiftIcon aria-hidden size={22} />}>
        {t("action.addWishlist")}
      </LinkButton>
    );
  }
  if (mainAction === "envelope") {
    return (
      <Button onClick={() => onSelect("envelope")} icon={<EnvelopeSimpleIcon aria-hidden size={22} />}>
        {t("action.openEnvelope")}
      </Button>
    );
  }
  if (mainAction === "chain") {
    return (
      <LinkButton href={`${base}/chain`} variant="gold" icon={<TelevisionIcon aria-hidden size={22} />}>
        {t("action.joinChain")}
      </LinkButton>
    );
  }
  if (mainAction === "share") return <ShareButton slug={lobby.slug} name={lobby.name} variant="primary" />;
  return <p className="rounded-tile bg-pine-800 px-4 py-2 text-center text-base font-bold ring-1 ring-white/25">{t("home.nothingToDo")}</p>;
}

function HomeScreen({ model, onSelect }: { model: LobbyModel; onSelect: (tab: Tab) => void }) {
  const t = useT();
  const [showSteps, setShowSteps] = useState(false);
  const { lobby, stage, christmas, mainAction, joinedName, stale } = model;
  const count = lobby.participants.length;
  const title = stage === 1 && joinedName ? "home.stage.1.joined" : STAGE_TITLE[stage];

  return (
    <div className="safe-x flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain py-2">
      {stale && <p className="shrink-0 rounded-tile bg-pine-800 px-4 py-2 text-base font-bold ring-1 ring-white/25">{t("stage.stale")}</p>}

      <section aria-label={t("count.until")} className="flex flex-[1_0_auto] flex-col justify-center gap-2 rounded-card bg-pine-800/90 p-4 shadow-card ring-1 ring-gold/40">
        <h1 className="font-display text-xl font-semibold">{t("count.until")}</h1>
        <CountdownBig target={christmas} />
      </section>

      <button type="button" onClick={() => setShowSteps(true)} className="paper flex flex-[1_0_auto] flex-col justify-center gap-1 rounded-card bg-paper p-4 text-left shadow-card">
        <span className="text-base font-bold text-ink-soft">{t("stage.whereWeAre")}</span>
        <span className="font-display text-2xl font-semibold [@media(max-height:42rem)]:text-xl">
          {t("home.stepOf", { n: stage })}: {t(title)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <StepDots current={stage} />
          <span className="text-base font-bold text-wax-deep underline underline-offset-4">{t("home.seeSteps")}</span>
        </span>
      </button>

      {/* Sticky, so at very large text it stays in reach while the cards scroll under it. */}
      <div className="sticky bottom-0 z-10 grid shrink-0">
        <MainAction model={model} onSelect={onSelect} />
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2">
        <Button variant="ghost" size="lg" fit onClick={() => onSelect("joined")} className="gap-2! px-2! text-base!">
          <UsersThreeIcon aria-hidden size={24} className="shrink-0" />
          {t("home.joined", { n: count })}
        </Button>
        {mainAction === "share" ? (
          <LinkButton href={`/x/${lobby.slug}/join`} variant="ghost" size="lg" fit className="px-2! text-base!">
            {t("home.addOther")}
          </LinkButton>
        ) : (
          <ShareButton slug={lobby.slug} name={lobby.name} className="w-full gap-2! px-2! text-base!" />
        )}
      </div>

      <Dialog open={showSteps} title={t("steps.title")} onClose={() => setShowSteps(false)}>
        {/* The step tiles are see-through, made to sit on the dark background. */}
        <div className="rounded-card bg-pine-900 p-2">
          <Stepper current={stage} direction="column" />
        </div>
        <p className="text-lg">{t("count.chainExplained")}</p>
        <p className="text-lg font-bold text-ink">{t("count.reveal", { date: formatManila(lobby.revealAt), manila: t("common.manila") })}</p>
        {lobby.budgetCentavos !== null && (
          <p className="text-lg font-bold text-ink">
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
    <div className="grid min-h-0 flex-1 content-center justify-items-center gap-4 overflow-y-auto text-center">
      <TreeAndGifts className="max-h-[30dvh] w-full" />
      <h2 className="font-display text-2xl font-semibold">{canJoin ? t("empty.title") : t("joined.empty")}</h2>
      {canJoin && (
        <div className="grid w-full gap-2">
          <LinkButton href={`/x/${lobby.slug}/join`}>{t("empty.first")}</LinkButton>
          <ShareButton slug={lobby.slug} name={lobby.name} className="w-full" />
        </div>
      )}
    </div>
  );
}

function PersonRow({ person }: { person: PublicParticipant }) {
  const t = useT();
  return (
    <li className="flex min-w-0 items-center gap-4 rounded-tile bg-paper-deep/70 p-2">
      <Avatar person={person} />
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-snug font-bold wrap-anywhere">{person.name}</p>
        <p className="text-base text-ink-soft">{person.itemCount === 1 ? t("joined.items1") : t("joined.items", { n: person.itemCount })}</p>
      </div>
    </li>
  );
}

function JoinedScreen({ lobby }: { lobby: LobbyView }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [familyKey, setFamilyKey] = useState<string | null>(null);

  const count = lobby.participants.length;
  const families = groupByFamily(lobby.participants);
  const selected = families.find((family) => family.key === familyKey) ?? null;
  const search = normalizeNamePart(query);
  const shown = (selected ? selected.members : families.flatMap((family) => family.members)).filter((person) => !search || normalizeNamePart(person.name).includes(search));

  const chip = (active: boolean) => `min-h-tap shrink-0 rounded-full px-4 text-base font-bold whitespace-nowrap wrap-normal ring-2 ${active ? "bg-pine-800 text-snow ring-pine-800" : "ring-ink/40"}`;

  return (
    <div className="safe-x flex min-h-0 flex-1 flex-col py-2">
      <div className="paper flex min-h-0 flex-1 flex-col gap-2 rounded-card bg-paper p-4 shadow-card">
        <h1 className="shrink-0 font-display text-2xl font-semibold">{count > 0 ? (count === 1 ? t("joined.count1") : t("joined.count", { n: count })) : t("joined.title")}</h1>

        {count === 0 ? (
          <JoinedEmpty lobby={lobby} />
        ) : (
          <>
            <div className="shrink-0">
              <label htmlFor="mobile-joined-search" className="mb-1 block text-base font-bold">
                {t("joined.search")}
              </label>
              <div className="relative">
                <MagnifyingGlassIcon aria-hidden size={24} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
                <input id="mobile-joined-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={`${inputClass} pl-12`} />
              </div>
            </div>

            {families.length > 1 && (
              <div className="-mx-4 flex shrink-0 gap-2 overflow-x-auto px-4 py-1">
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
              <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
                {shown.map((person) => (
                  <PersonRow key={person.id} person={person} />
                ))}
              </ul>
            ) : (
              <p className="min-h-0 flex-1 text-lg font-bold">{t("joined.noMatch")}</p>
            )}
          </>
        )}
      </div>
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

function HelpRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="paper flex min-h-tap shrink-0 items-center gap-2 rounded-tile bg-paper px-4 py-2 text-left text-lg font-bold">
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
      <CaretRightIcon aria-hidden size={20} weight="bold" className="shrink-0" />
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
    <div className="safe-x flex min-h-0 flex-1 flex-col gap-2 py-2">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-2xl font-semibold">{t("nav.help")}</h1>
        <LanguageToggle />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
        {QUESTIONS.map(([question, answer]) => {
          const isOpen = openQuestion === question;
          return (
            <div key={question} className="paper shrink-0 rounded-tile bg-paper">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpenQuestion(isOpen ? null : question)} className="flex min-h-tap w-full items-center gap-2 px-4 py-2 text-left text-lg font-bold">
                <span className="min-w-0 flex-1">{t(question)}</span>
                <CaretDownIcon aria-hidden size={20} weight="bold" className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <p className="px-4 pb-4 text-lg text-ink-soft">{t(answer, values)}</p>}
            </div>
          );
        })}

        <HelpRow icon={<ClockCounterClockwiseIcon aria-hidden size={24} className="shrink-0" />} label={t("help.activity")} onClick={() => setSheet("activity")} />
        {lobby.commitmentHash && <HelpRow icon={<SealCheckIcon aria-hidden size={24} className="shrink-0" />} label={t("sealed.title", { n: lobby.drawGeneration })} onClick={() => setSheet("sealed")} />}

        {CONTACT_URL ? (
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "gold", size: "md" }, "shrink-0")}>
            {t("faq.message")}
          </a>
        ) : (
          <p className="shrink-0 text-base font-bold">{t("faq.askSender")}</p>
        )}

        <div className="shrink-0">
          <InstallTip />
        </div>
      </div>

      <Button variant="ghost" size="lg" onClick={() => setSheet("organizer")} className="shrink-0 w-full">
        {t("help.organizer")}
      </Button>

      <Dialog open={sheet === "activity"} title={t("help.activity")} onClose={close}>
        <p className="text-base">{t("activity.note")}</p>
        <AuditList entries={lobby.audit} />
      </Dialog>

      <Dialog open={sheet === "sealed"} title={t("sealed.title", { n: lobby.drawGeneration })} onClose={close}>
        <WaxSeal className="size-14" />
        <p className="text-lg">{t("sealed.body")}</p>
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
      <TopBar name={lobby.name} revealAt={lobby.revealAt} />
      <main className="relative min-h-0 flex-1">
        {screens.map(([id, screen]) => (
          <div key={id} inert={id !== tab} className={`absolute inset-0 flex flex-col ${id === tab ? "" : "invisible"}`}>
            {screen}
          </div>
        ))}
      </main>
      <TabBar slug={lobby.slug} active={tab} onSelect={select} />
    </div>
  );
}
