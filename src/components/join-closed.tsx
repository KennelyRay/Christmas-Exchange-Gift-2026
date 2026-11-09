"use client";

import { useT } from "@/lib/i18n";
import { LinkButton, PageShell } from "./ui";

export function JoinClosed({ slug, name }: { slug: string; name: string }) {
  const t = useT();
  return (
    <PageShell slug={slug} narrow>
      <h1 className="font-display text-4xl font-semibold">{t("join.closed.title")}</h1>
      <p className="mt-4 mb-8 text-lg">{t("join.closed.body", { name })}</p>
      <LinkButton href={`/x/${slug}?tab=joined`} variant="gold">
        {t("join.closed.cta")}
      </LinkButton>
    </PageShell>
  );
}
