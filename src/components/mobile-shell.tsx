"use client";

import { EnvelopeSimpleIcon, HouseIcon, QuestionIcon, UsersThreeIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { nextChristmas } from "@/lib/christmas";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { CountdownChip } from "./countdown";

export type Tab = "home" | "joined" | "envelope" | "help";

const TABS: ReadonlyArray<{ id: Tab; label: MessageKey; icon: Icon }> = [
  { id: "home", label: "nav.home", icon: HouseIcon },
  { id: "joined", label: "nav.joined", icon: UsersThreeIcon },
  { id: "envelope", label: "nav.envelope", icon: EnvelopeSimpleIcon },
  { id: "help", label: "nav.help", icon: QuestionIcon },
];

export const tabHref = (slug: string, tab: Tab) =>
  tab === "envelope" ? `/x/${slug}/envelope` : tab === "home" ? `/x/${slug}` : `/x/${slug}?tab=${tab}`;

export function TopBar({ name, revealAt }: { name: string; revealAt: string }) {
  return (
    <header className="safe-top safe-x sticky top-0 z-20 flex items-center justify-between gap-4 bg-pine-950 pb-2 shadow-card [[data-big-text]_&]:static [[data-big-text]_&]:flex-wrap">
      <p className="line-clamp-2 min-w-0 font-display text-xl leading-tight font-semibold wrap-anywhere">{name}</p>
      <CountdownChip target={nextChristmas(new Date(revealAt))} />
    </header>
  );
}

type TabBarProps = {
  slug: string;
  active: Tab;
  /** Switches instantly inside the lobby. Elsewhere the tabs are ordinary links. */
  onSelect?: (tab: Tab) => void;
};

export function TabBar({ slug, active, onSelect }: TabBarProps) {
  const t = useT();

  return (
    <nav aria-label={t("nav.main")} className="tab-bar safe-bottom border-t-2 border-white/20 bg-pine-950">
      <ul className="grid grid-cols-4 [[data-big-text]_&]:grid-cols-2">
        {TABS.map(({ id, label, icon: TabIcon }) => {
          const isActive = id === active;
          const href = tabHref(slug, id);
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  if (id !== "envelope" && onSelect) {
                    event.preventDefault();
                    onSelect(id);
                  }
                }}
                className={`flex h-full min-h-[4.5rem] flex-col items-center justify-start gap-1 border-t-4 px-1 pt-2 text-center text-sm leading-tight font-bold wrap-anywhere ${isActive ? "border-gold text-gold" : "border-transparent text-snow"}`}
              >
                <TabIcon aria-hidden size={26} weight={isActive ? "fill" : "regular"} className="shrink-0" />
                {t(label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Pinned to the thumb zone. Takes up real space, so nothing ever hides behind it. */
export function Dock({ action, children }: { action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="dock shadow-dock">
      {action && <div className="safe-x bg-pine-950 pt-2 pb-2">{action}</div>}
      {children}
    </div>
  );
}

/** The phone frame for pages outside the lobby. Above phone width it steps aside. */
export function EnvelopeFrame({ slug, name, revealAt, children }: { slug: string; name: string; revealAt: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="md:hidden">
        <TopBar name={name} revealAt={revealAt} />
      </div>
      <div className="flex-1">{children}</div>
      <div className="md:hidden">
        <Dock>
          <TabBar slug={slug} active="envelope" />
        </Dock>
      </div>
    </div>
  );
}
