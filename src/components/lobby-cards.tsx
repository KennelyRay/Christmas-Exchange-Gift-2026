"use client";

import { DeviceMobileIcon, EnvelopeOpenIcon, GiftIcon, KeyIcon, type Icon } from "@phosphor-icons/react";
import { useState, useSyncExternalStore } from "react";
import { formatManila } from "@/lib/christmas";
import { isInstalled, isIos, isPhone } from "@/lib/device";
import { useDeviceValue } from "@/lib/hooks";
import { setLocale, useLocale, useT, type Translate } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { nameFromJoinEntry } from "@/lib/stage";
import type { LobbyView, PublicAuditEntry } from "@/lib/types";
import { TreeAndGifts } from "./illustrations";
import { ShareButton } from "./share";
import { buttonClass, Dialog, LinkButton, Panel, Paper } from "./ui";
import { WaxSeal } from "./wax-seal";

const HOW_STEPS: ReadonlyArray<{ icon: Icon; title: MessageKey; body: MessageKey }> = [
  { icon: GiftIcon, title: "how.1", body: "how.1.body" },
  { icon: KeyIcon, title: "how.2", body: "how.2.body" },
  { icon: EnvelopeOpenIcon, title: "how.3", body: "how.3.body" },
];

export function HowItWorksSteps({ layout = "stack" }: { layout?: "stack" | "row" }) {
  const t = useT();
  return (
    <ol className={`grid gap-6 ${layout === "row" ? "lg:grid-cols-3" : ""}`}>
      {HOW_STEPS.map(({ icon: StepIcon, title, body }, index) => (
        <li key={title} className="flex items-start gap-4 [[data-big-text]_&]:flex-col">
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-pine-800 text-gold">
            <StepIcon size={30} weight="duotone" />
          </span>
          <div className="min-w-0">
            <p className="text-lg leading-snug font-bold">
              {index + 1}. {t(title)}
            </p>
            <p className="mt-1 text-base text-ink-soft">{t(body)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HowItWorksCard() {
  const t = useT();
  return (
    <Paper>
      <h2 className="mb-6 font-display text-2xl font-semibold">{t("how.title")}</h2>
      <HowItWorksSteps />
    </Paper>
  );
}

/** Nobody yet: the most useful moment for this space, so it explains and invites. */
export function EmptyJoined({ slug, name, canJoin }: { slug: string; name: string; canJoin: boolean }) {
  const t = useT();
  return (
    <div className="grid gap-8">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
        <TreeAndGifts className="mx-auto w-full max-w-64 lg:max-w-sm" />
        <div>
          <h3 className="font-display text-3xl font-semibold">{canJoin ? t("empty.title") : t("joined.empty")}</h3>
          {canJoin && (
            <>
              <p className="mt-2 text-lg text-ink-soft">{t("empty.body")}</p>
              <div className="mt-6 flex flex-wrap gap-4">
                <LinkButton href={`/x/${slug}/join`}>{t("empty.cta")}</LinkButton>
                <ShareButton slug={slug} name={name} />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="border-t-2 border-ink/15 pt-8">
        <h3 className="mb-6 font-display text-2xl font-semibold">{t("how.title")}</h3>
        <HowItWorksSteps layout="row" />
      </div>
    </div>
  );
}

function auditText(entry: PublicAuditEntry, t: Translate) {
  if (entry.event === "participant_joined") return t("audit.joined", { name: nameFromJoinEntry(entry) });
  if (entry.event === "pool_locked") return t("audit.locked");
  if (entry.event === "pool_reopened") return t("audit.reopened");
  return entry.detail;
}

export function AuditList({ entries }: { entries: readonly PublicAuditEntry[] }) {
  const t = useT();
  return (
    <ol className="divide-y-2 divide-ink/10">
      {entries.map((entry) => (
        <li key={entry.id} className="py-4 first:pt-0 last:pb-0">
          <p className="text-base font-semibold wrap-anywhere text-ink">{auditText(entry, t)}</p>
          <p className="text-sm text-ink-soft">{formatManila(entry.at)}</p>
        </li>
      ))}
    </ol>
  );
}

const LATEST_ACTIVITY = 5;

export function ActivityCard({ audit }: { audit: readonly PublicAuditEntry[] }) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);

  return (
    <Paper>
      <h2 className="font-display text-2xl font-semibold">{t("activity.title")}</h2>
      <p className="mt-1 mb-6 text-base text-ink-soft">{t("activity.note")}</p>
      <AuditList entries={audit.slice(0, LATEST_ACTIVITY)} />
      {audit.length > LATEST_ACTIVITY && (
        <button type="button" onClick={() => setShowAll(true)} className={buttonClass({ variant: "ghost" }, "mt-6 w-full")}>
          {t("activity.seeAll", { n: audit.length })}
        </button>
      )}
      <Dialog open={showAll} title={t("activity.allTitle")} onClose={() => setShowAll(false)}>
        <AuditList entries={audit} />
      </Dialog>
    </Paper>
  );
}

export function OrganizerCard({ slug }: { slug: string }) {
  const t = useT();
  return (
    <Panel>
      <h2 className="font-display text-2xl font-semibold">{t("organizer.title")}</h2>
      <p className="mt-1 mb-6 text-base text-snow-soft">{t("organizer.body")}</p>
      <LinkButton href={`/x/${slug}/organizer`} variant="ghost" className="w-full">
        {t("organizer.cta")}
      </LinkButton>
    </Panel>
  );
}

export function SealedCard({ lobby }: { lobby: LobbyView }) {
  const t = useT();
  return (
    <Panel>
      <div className="flex items-center gap-4">
        <WaxSeal className="size-14 shrink-0" />
        <h2 className="font-display text-2xl font-semibold">{t("sealed.title", { n: lobby.drawGeneration })}</h2>
      </div>
      <p className="mt-4 text-base text-snow-soft">{t("sealed.body")}</p>
      <p className="mt-4 font-mono text-sm break-all text-gold">{lobby.commitmentHash}</p>
      <LinkButton href={`/x/${lobby.slug}/seal`} variant="ghost" className="mt-6 w-full">
        {lobby.sealOpened ? t("sealed.check") : t("sealed.how")}
      </LinkButton>
    </Panel>
  );
}

export const CONTACT_URL = process.env.NEXT_PUBLIC_ORGANIZER_CONTACT_URL;

const FAQS: ReadonlyArray<[MessageKey, MessageKey]> = [
  ["faq.what", "faq.what.a"],
  ["faq.join", "faq.join.a"],
  ["faq.lost", "faq.lost.a"],
  ["faq.draw", "faq.draw.a"],
];

/** Always open: older relatives shouldn't have to discover that a question expands. */
export function Faq({ revealAt, columns }: { revealAt: string; columns?: boolean }) {
  const t = useT();
  return (
    <Paper>
      <h2 className="mb-6 font-display text-3xl font-semibold">{t("faq.title")}</h2>
      <dl className={`grid gap-6 ${columns ? "lg:grid-cols-2 lg:gap-x-12" : ""}`}>
        {FAQS.map(([question, answer]) => (
          <div key={question}>
            <dt className="text-xl font-bold">{t(question)}</dt>
            <dd className="mt-1 text-lg text-ink-soft">{t(answer, { date: formatManila(revealAt), manila: t("common.manila") })}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8 border-t-2 border-ink/15 pt-6">
        {CONTACT_URL ? (
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "primary" })}>
            {t("faq.message")}
          </a>
        ) : (
          <p className="text-lg font-bold">{t("faq.askSender")}</p>
        )}
      </div>
    </Paper>
  );
}

export function LanguageToggle() {
  const t = useT();
  const locale = useLocale();
  return (
    <div role="group" aria-label={t("common.language")} className="inline-flex w-fit gap-1 rounded-full bg-black/30 p-1 ring-1 ring-white/20">
      {(
        [
          ["en", "English"],
          ["tl", "Tagalog"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          lang={value === "tl" ? "fil" : "en"}
          aria-pressed={locale === value}
          onClick={() => setLocale(value)}
          className={`min-h-tap rounded-full px-6 text-base font-bold transition duration-200 ease-settle ${locale === value ? "bg-gold text-ink" : "text-snow"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const noSubscription = () => () => {};
const installPlatform = () => (isPhone() && !isInstalled() ? (isIos() ? "iphone" : "android") : null);

/** Shown once per device. It sits low on the page, so appearing late moves nothing. */
export function InstallTip() {
  const t = useT();
  const [dismissed, dismiss] = useDeviceValue("install-tip-dismissed");
  const platform = useSyncExternalStore(noSubscription, installPlatform, () => null);

  if (!platform || dismissed) return null;

  return (
    <Panel>
      <div className="flex items-start gap-4">
        <DeviceMobileIcon aria-hidden size={36} weight="duotone" className="shrink-0 text-gold" />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">{t("install.title")}</h2>
          <p className="mt-1 text-base text-snow-soft">{t(platform === "iphone" ? "install.iphone" : "install.android")}</p>
        </div>
      </div>
      <button type="button" onClick={() => dismiss("1")} className={buttonClass({ variant: "ghost" }, "mt-4 w-full")}>
        {t("install.dismiss")}
      </button>
    </Panel>
  );
}
