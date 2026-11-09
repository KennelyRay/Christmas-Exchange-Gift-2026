"use client";

import { EnvelopeSimpleIcon, GiftIcon, MagnifyingGlassIcon, TelevisionIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { burst } from "@/lib/celebrate";
import { nextChristmas } from "@/lib/christmas";
import { useDeviceValue, useHasPassed, usePoll } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { formatPeso } from "@/lib/money";
import type { MessageKey } from "@/lib/messages";
import { normalizeNamePart } from "@/lib/names";
import { isStillJoined, joinedNameKey, joinTimesFrom, mainActionOf, stageOf, type MainAction, type Stage } from "@/lib/stage";
import type { LobbyView } from "@/lib/types";
import { CountdownCard } from "./countdown";
import { ActivityCard, EmptyJoined, Faq, HowItWorksCard, InstallTip, LanguageToggle, OrganizerCard, SealedCard } from "./lobby-cards";
import { Dock, TabBar, tabHref, TopBar, type Tab } from "./mobile-shell";
import { FamilyList } from "./people";
import { ShareButton } from "./share";
import { Stepper } from "./stepper";
import { ErrorNote, inputClass, LinkButton, Panel, Paper } from "./ui";

/** Everything the two layouts share, worked out once. */
type LobbyModel = {
  lobby: LobbyView;
  stage: Stage;
  mainAction: MainAction | null;
  joinedName: string | null;
  joinTimes: ReadonlyMap<string, string>;
  christmas: Date;
  stale: boolean;
};

function stageMessage({ stage, joinedName }: LobbyModel): [MessageKey, Record<string, string>?] {
  if (stage === 1) return joinedName ? ["stage.openJoined", { name: joinedName }] : ["stage.open"];
  if (stage === 2) return ["stage.locked"];
  return [stage === 3 ? "stage.drawn" : "stage.chain"];
}

function StageIntro({ model }: { model: LobbyModel }) {
  const t = useT();
  const { budgetCentavos } = model.lobby;
  const [key, values] = stageMessage(model);
  return (
    <>
      <p className="text-xl font-semibold">{t(key, values)}</p>
      {budgetCentavos !== null && (
        <p className="mt-2 text-lg">
          {t("stage.budget")} <strong className="font-bold text-gold">{formatPeso(budgetCentavos)}</strong>
        </p>
      )}
    </>
  );
}

function StaleNote({ show }: { show: boolean }) {
  const t = useT();
  if (!show) return null;
  return (
    <p role="status" className="rounded-tile bg-pine-800 px-4 py-4 text-base font-bold ring-1 ring-white/25">
      {t("stage.stale")}
    </p>
  );
}

function MainActionButton({ action, lobby }: { action: MainAction; lobby: LobbyView }) {
  const t = useT();
  const base = `/x/${lobby.slug}`;
  if (action === "add") {
    return (
      <LinkButton href={`${base}/join`} icon={<GiftIcon aria-hidden size={22} />}>
        {t("action.addWishlist")}
      </LinkButton>
    );
  }
  if (action === "envelope") {
    return (
      <LinkButton href={`${base}/envelope`} icon={<EnvelopeSimpleIcon aria-hidden size={22} />}>
        {t("action.openEnvelope")}
      </LinkButton>
    );
  }
  if (action === "chain") {
    return (
      <LinkButton href={`${base}/chain`} variant="gold" icon={<TelevisionIcon aria-hidden size={22} />}>
        {t("action.joinChain")}
      </LinkButton>
    );
  }
  return <ShareButton slug={lobby.slug} name={lobby.name} variant="primary" />;
}

/** Quieter ways forward, shown beside the one main action. */
function SecondaryActions({ model }: { model: LobbyModel }) {
  const t = useT();
  const { lobby, mainAction, joinedName, stage } = model;
  return (
    <>
      {mainAction !== "share" && <ShareButton slug={lobby.slug} name={lobby.name} />}
      {stage === 1 && joinedName && (
        <LinkButton href={`/x/${lobby.slug}/join`} variant="ghost" size="lg">
          {t("action.addSomeoneElse")}
        </LinkButton>
      )}
      {stage === 4 && (
        <LinkButton href={`/x/${lobby.slug}/envelope`} variant="ghost" size="lg">
          {t("action.openEnvelope")}
        </LinkButton>
      )}
    </>
  );
}

function JoinedHeading({ count }: { count: number }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="font-display text-3xl font-semibold">{t("joined.title")}</h2>
      {count > 0 && <p className="text-lg font-bold text-ink-soft tabular-nums">{count === 1 ? t("joined.count1") : t("joined.count", { n: count })}</p>}
    </div>
  );
}

function DrawWarning({ message }: { message: string | null }) {
  return message ? <ErrorNote className="mt-6">{message}</ErrorNote> : null;
}

/* ------------------------------ Phone (under 768px) ------------------------------ */

function MobileHome({ model }: { model: LobbyModel }) {
  const t = useT();
  const { lobby, stage, christmas } = model;
  return (
    <div className="grid gap-4">
      <header className="rise">
        <h1 className="mb-2 font-display text-3xl font-semibold wrap-anywhere">{lobby.name}</h1>
        <StageIntro model={model} />
      </header>
      <StaleNote show={model.stale} />
      <CountdownCard target={christmas} revealAt={lobby.revealAt} />
      <Panel>
        <h2 className="mb-4 font-display text-2xl font-semibold">{t("stage.whereWeAre")}</h2>
        <Stepper current={stage} direction="column" />
      </Panel>
      <div className="grid gap-2">
        <SecondaryActions model={model} />
      </div>
      <HowItWorksCard />
      <InstallTip />
    </div>
  );
}

function MobileJoined({ model }: { model: LobbyModel }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const { lobby, joinTimes } = model;
  const count = lobby.participants.length;
  const search = normalizeNamePart(query);
  const shown = search ? lobby.participants.filter((person) => normalizeNamePart(person.name).includes(search)) : lobby.participants;

  return (
    <Paper>
      <JoinedHeading count={count} />
      {count === 0 ? (
        <div className="mt-6">
          <EmptyJoined slug={lobby.slug} name={lobby.name} canJoin={lobby.status === "open"} />
        </div>
      ) : (
        <>
          <label htmlFor="joined-search" className="mt-6 mb-2 block text-lg font-bold">
            {t("joined.search")}
          </label>
          <div className="relative mb-6">
            <MagnifyingGlassIcon aria-hidden size={24} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
            <input id="joined-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={`${inputClass} pl-12`} />
          </div>
          {shown.length > 0 ? <FamilyList people={shown} joinTimes={joinTimes} layout="rows" /> : <p className="text-lg font-bold">{t("joined.noMatch")}</p>}
        </>
      )}
      <DrawWarning message={lobby.drawWarning} />
    </Paper>
  );
}

function MobileHelp({ model }: { model: LobbyModel }) {
  const t = useT();
  const { lobby } = model;
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-4xl font-semibold">{t("nav.help")}</h1>
      <Faq revealAt={lobby.revealAt} />
      <Panel>
        <h2 className="mb-4 font-display text-2xl font-semibold">{t("common.language")}</h2>
        <LanguageToggle />
      </Panel>
      <ActivityCard audit={lobby.audit} />
      {lobby.commitmentHash && <SealedCard lobby={lobby} />}
      <OrganizerCard slug={lobby.slug} />
    </div>
  );
}

function MobileLobby({ model, tab, onSelect }: { model: LobbyModel; tab: Tab; onSelect: (tab: Tab) => void }) {
  const { lobby, mainAction } = model;
  return (
    <div className="flex min-h-[100dvh] flex-col md:hidden">
      <TopBar name={lobby.name} revealAt={lobby.revealAt} />
      <main className="safe-x flex-1 py-4">
        {tab === "joined" ? <MobileJoined model={model} /> : tab === "help" ? <MobileHelp model={model} /> : <MobileHome model={model} />}
      </main>
      <Dock action={tab === "home" && mainAction ? <MainActionButton action={mainAction} lobby={lobby} /> : undefined}>
        <TabBar slug={lobby.slug} active={tab} onSelect={onSelect} />
      </Dock>
    </div>
  );
}

/* ----------------------------- Tablet and computer ----------------------------- */

function Hero({ model }: { model: LobbyModel }) {
  const { lobby, mainAction, christmas } = model;
  return (
    <header className="grid items-start gap-8 md:grid-cols-2 lg:grid-cols-12">
      <div className="rise lg:col-span-7 xl:col-span-8">
        <h1 className="font-display text-5xl font-semibold tracking-tight wrap-anywhere lg:text-6xl">{lobby.name}</h1>
        <div className="mt-6 max-w-[44ch]">
          <StageIntro model={model} />
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          {mainAction && <MainActionButton action={mainAction} lobby={lobby} />}
          <SecondaryActions model={model} />
        </div>
      </div>
      <div className="rise lg:col-span-5 xl:col-span-4" style={{ "--i": 1 } as React.CSSProperties}>
        <CountdownCard target={christmas} revealAt={lobby.revealAt} />
      </div>
    </header>
  );
}

function SideColumn({ children }: { children: ReactNode }) {
  // On tablets an odd card out takes the whole row, so no half-empty column is left behind.
  return <aside className="grid content-start gap-6 md:grid-cols-2 md:[&>:last-child:nth-child(odd)]:col-span-2 lg:col-span-4 lg:grid-cols-1 lg:[&>:last-child:nth-child(odd)]:col-span-1">{children}</aside>;
}

function DesktopLobby({ model }: { model: LobbyModel }) {
  const t = useT();
  const { lobby, stage, joinTimes } = model;
  const count = lobby.participants.length;

  return (
    <main className="mx-auto hidden min-h-[100dvh] w-full max-w-page flex-col gap-8 px-6 py-8 md:flex lg:px-10">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <Hero model={model} />
      <StaleNote show={model.stale} />

      <section aria-label={t("stage.whereWeAre")}>
        <Stepper current={stage} direction="row" />
      </section>

      <div className="grid flex-1 items-stretch gap-6 lg:grid-cols-12">
        <section aria-label={t("joined.title")} className="rise lg:col-span-8" style={{ "--i": 2 } as React.CSSProperties}>
          <Paper className="h-full">
            <JoinedHeading count={count} />
            <div className="mt-6">
              {count === 0 ? (
                <EmptyJoined slug={lobby.slug} name={lobby.name} canJoin={lobby.status === "open"} />
              ) : (
                <FamilyList people={lobby.participants} joinTimes={joinTimes} layout="cards" />
              )}
            </div>
            <DrawWarning message={lobby.drawWarning} />
          </Paper>
        </section>

        <SideColumn>
          {count > 0 && <HowItWorksCard />}
          <ActivityCard audit={lobby.audit} />
          {lobby.commitmentHash && <SealedCard lobby={lobby} />}
          <OrganizerCard slug={lobby.slug} />
        </SideColumn>
      </div>

      <Faq revealAt={lobby.revealAt} columns />
    </main>
  );
}

/* ---------------------------------- The lobby ---------------------------------- */

function currentTab(value: string | null): Tab {
  return value === "joined" || value === "help" ? value : "home";
}

export function Lobby({ initial }: { initial: LobbyView }) {
  const t = useT();
  const [justJoined, setJustJoined] = useState<string | null>(null);
  const tab = currentTab(useSearchParams().get("tab"));

  const { data: lobby, stale } = usePoll<LobbyView>(`/api/exchanges/${initial.slug}`, initial, 4000, (previous, next) => {
    const known = new Set(previous.participants.map((p) => p.id));
    const arrivals = next.participants.filter((p) => !known.has(p.id));
    if (arrivals.length > 0) {
      setJustJoined(arrivals.map((p) => p.name).join(", "));
      burst(0.7);
    }
  });

  const revealTime = new Date(lobby.revealAt).getTime();
  const revealPassed = useHasPassed(revealTime);
  const [rememberedName] = useDeviceValue(joinedNameKey(lobby.slug));
  const joinedName = rememberedName !== null && isStillJoined(rememberedName, lobby.participants) ? rememberedName : null;

  const stage = stageOf(lobby.status, revealPassed);
  const model: LobbyModel = {
    lobby,
    stage,
    mainAction: mainActionOf(stage, joinedName !== null),
    joinedName,
    joinTimes: joinTimesFrom(lobby.audit),
    christmas: nextChristmas(new Date(lobby.revealAt)),
    stale,
  };

  function selectTab(next: Tab) {
    // Tabs share one page's data, so switching needs no trip to the server.
    window.history.pushState(null, "", tabHref(lobby.slug, next));
    window.scrollTo({ top: 0 });
  }

  return (
    <MotionConfig reducedMotion="user">
      <MobileLobby model={model} tab={tab} onSelect={selectTab} />
      <DesktopLobby model={model} />

      <p aria-live="polite" className="sr-only">
        {justJoined ? t("joined.toast", { name: justJoined }) : ""}
      </p>

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
            className="fixed inset-x-4 top-20 z-30 mx-auto min-h-tap-lg max-w-md rounded-card bg-gold px-6 py-2 text-center text-lg font-bold text-ink shadow-card md:top-auto md:bottom-6"
          >
            {t("joined.toast", { name: justJoined })}
          </motion.button>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
