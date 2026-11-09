"use client";

import { EnvelopeSimpleIcon, HouseIcon, QuestionIcon, UsersThreeIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isPhoneWidth } from "@/lib/app-history";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import type { PublicParticipant } from "@/lib/types";
import { initialsOf } from "./people";
import { inputClass } from "./ui";

export type Tab = "home" | "joined" | "envelope" | "help";

const TABS: ReadonlyArray<{ id: Tab; label: MessageKey; icon: Icon }> = [
  { id: "home", label: "nav.home", icon: HouseIcon },
  { id: "joined", label: "nav.joined", icon: UsersThreeIcon },
  { id: "envelope", label: "nav.envelope", icon: EnvelopeSimpleIcon },
  { id: "help", label: "nav.help", icon: QuestionIcon },
];

export const tabHref = (slug: string, tab: Tab) => (tab === "home" ? `/x/${slug}` : `/x/${slug}?tab=${tab}`);

export function TopBar({ name }: { name: string }) {
  return (
    <header className="gutter flex shrink-0 items-center pt-[max(0.75rem,env(safe-area-inset-top))] pb-1">
      <p className="min-w-0 flex-1 truncate font-display text-base font-semibold">{name}</p>
    </header>
  );
}

export function TabBar({ slug, active, onSelect }: { slug: string; active: Tab; onSelect: (tab: Tab) => void }) {
  const t = useT();

  return (
    <nav aria-label={t("nav.main")} className="tab-bar shrink-0 bg-white/[0.06] pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <ul className="grid grid-cols-4 [[data-big-text]_&]:grid-cols-2">
        {TABS.map(({ id, label, icon: TabIcon }) => {
          const isActive = id === active;
          return (
            <li key={id}>
              <Link
                href={tabHref(slug, id)}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onSelect(id);
                }}
                className={`flex h-full min-h-14 flex-col items-center justify-start gap-0.5 pt-1.5 pb-1 text-center text-sm leading-tight ${isActive ? "font-semibold" : ""}`}
              >
                <span className={`rounded-full px-4 py-0.5 transition-colors duration-200 [[data-big-text]_&]:hidden ${isActive ? "bg-white/15" : ""}`}>
                  <TabIcon aria-hidden size={24} />
                </span>
                <span className={`rounded-full [[data-big-text]_&]:px-2 ${isActive ? "[[data-big-text]_&]:bg-white/15" : ""}`}>{t(label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A headline with search tucked behind a quiet link, until someone actually wants it. */
export function HeadlineWithSearch({ title, id, value, onChange }: { title: string; id: string; value: string; onChange: (value: string) => void }) {
  const t = useT();
  const [searching, setSearching] = useState(false);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="min-w-0 font-display text-3xl font-semibold">{title}</h1>
        <button
          type="button"
          aria-expanded={searching}
          onClick={() => {
            if (searching) onChange("");
            setSearching(!searching);
          }}
          className="min-h-tap shrink-0 text-base underline decoration-current/50 underline-offset-4"
        >
          {t(searching ? "common.done" : "common.search")}
        </button>
      </div>
      {searching && (
        <div className="animate-soft shrink-0">
          <label htmlFor={id} className="mb-2 block text-base font-semibold">
            {t("joined.search")}
          </label>
          {/* Opened by a deliberate tap, so raising the keyboard is what they asked for. */}
          <input id={id} autoFocus type="search" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" className={inputClass} />
        </div>
      )}
    </>
  );
}

export function SoftAvatar({ person }: { person: PublicParticipant }) {
  return (
    <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
      {initialsOf(person)}
    </span>
  );
}

/** On phones My Envelope is a tab, so its old address opens that tab. Above phone width it steps aside. */
export function EnvelopeFrame({ slug, children }: { slug: string; children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (isPhoneWidth()) router.replace(tabHref(slug, "envelope"));
  }, [router, slug]);

  return (
    <div className="flex min-h-[100dvh] flex-col max-md:invisible">
      <div className="flex-1">{children}</div>
    </div>
  );
}
