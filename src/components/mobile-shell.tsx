"use client";

import { EnvelopeSimpleIcon, HouseIcon, QuestionIcon, UsersThreeIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isPhoneWidth } from "@/lib/app-history";
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

export const tabHref = (slug: string, tab: Tab) => (tab === "home" ? `/x/${slug}` : `/x/${slug}?tab=${tab}`);

export function TopBar({ name, revealAt }: { name: string; revealAt: string }) {
  return (
    <header className="safe-top safe-x flex shrink-0 items-center justify-between gap-4 bg-pine-950 pb-2 shadow-card [[data-big-text]_&]:flex-wrap">
      <p className="min-w-0 flex-1 truncate font-display text-xl leading-tight font-semibold">{name}</p>
      <CountdownChip target={nextChristmas(new Date(revealAt))} />
    </header>
  );
}

export function TabBar({ slug, active, onSelect }: { slug: string; active: Tab; onSelect: (tab: Tab) => void }) {
  const t = useT();

  return (
    <nav aria-label={t("nav.main")} className="tab-bar safe-bottom shrink-0 border-t-2 border-white/20 bg-pine-950">
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
                className={`flex h-full min-h-[4.5rem] flex-col items-center justify-start gap-1 border-t-4 px-1 pt-2 text-center text-sm leading-tight font-bold wrap-anywhere [[data-big-text]_&]:min-h-14 ${isActive ? "border-gold text-gold" : "border-transparent text-snow"}`}
              >
                <TabIcon aria-hidden size={26} weight={isActive ? "fill" : "regular"} className="shrink-0 [[data-big-text]_&]:hidden" />
                {t(label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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
