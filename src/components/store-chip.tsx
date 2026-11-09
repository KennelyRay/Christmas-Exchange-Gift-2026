"use client";

import { ArrowSquareOutIcon, StorefrontIcon } from "@phosphor-icons/react";
import { useT } from "@/lib/i18n";
import { storeNameFor } from "@/lib/stores";

/** Names the shop so people can see which store a link goes to before they tap it. */
export function StoreChip({ url }: { url: string }) {
  const store = storeNameFor(url);
  if (!store) return null;

  return (
    <span className="inline-flex min-h-10 w-fit max-w-full items-center gap-2 rounded-full bg-pine-800 px-4 text-base font-bold text-snow">
      <StorefrontIcon aria-hidden size={20} className="shrink-0" />
      <span className="truncate">{store}</span>
    </span>
  );
}

export function StoreLink({ url }: { url: string }) {
  const t = useT();
  const store = storeNameFor(url);
  if (!store) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex min-h-tap-lg items-center justify-center gap-3 rounded-full bg-pine-800 px-6 py-2 text-center text-lg font-bold text-snow transition duration-200 ease-settle hover:bg-pine-700 active:scale-[0.98] max-md:w-full max-md:bg-transparent max-md:text-base max-md:font-semibold max-md:text-ink max-md:ring-1 max-md:ring-ink/40"
    >
      <StorefrontIcon aria-hidden size={24} className="shrink-0 max-md:hidden [[data-big-text]_&]:hidden" />
      <span className="min-w-0 wrap-anywhere">
        {t("reveal.openStore")} ({store})
      </span>
      <ArrowSquareOutIcon aria-hidden size={22} className="shrink-0 [[data-big-text]_&]:hidden" />
      <span className="sr-only">{t("reveal.newTab")}</span>
    </a>
  );
}
