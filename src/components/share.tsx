"use client";

import { CheckCircleIcon, CopyIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { canNativeShare, copyText, isPhone, nativeShare } from "@/lib/device";
import { useT } from "@/lib/i18n";
import { Button, buttonClass, Dialog } from "./ui";

const COPIED_MS = 3000;

type ShareButtonProps = {
  slug: string;
  name: string;
  variant?: "primary" | "ghost" | "text";
  className?: string;
};

/** Phones get a sheet with the family's usual apps. Computers just copy the link. */
export function ShareButton({ slug, name, variant = "ghost", className = "" }: ShareButtonProps) {
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const [url, setUrl] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const linkToShare = () => `${window.location.origin}/x/${slug}`;

  async function copyLink(link: string) {
    const copied = await copyText(link);
    setCopy(copied ? "copied" : "failed");
    clearTimeout(timer.current);
    if (copied) timer.current = setTimeout(() => setCopy("idle"), COPIED_MS);
  }

  function start() {
    const link = linkToShare();
    setUrl(link);
    if (isPhone()) {
      setCopy("idle");
      setHasNativeShare(canNativeShare());
      setSheetOpen(true);
    } else {
      void copyLink(link);
    }
  }

  const message = t("share.message", { name });

  return (
    <>
      <Button variant={variant} size={variant === "text" ? "md" : "lg"} fit={variant === "text"} onClick={start} className={className}>
        {variant !== "text" && <ShareNetworkIcon aria-hidden size={24} className="shrink-0 max-md:hidden" />}
        {t("share.cta")}
      </Button>

      {!sheetOpen && copy === "copied" && (
        <div role="status" className="fixed inset-x-4 bottom-8 z-30 mx-auto flex max-w-lg items-center justify-center gap-4 rounded-card bg-gold px-6 py-4 text-ink shadow-card">
          <CheckCircleIcon aria-hidden size={32} weight="fill" className="shrink-0" />
          <div>
            <p className="text-xl font-bold">{t("share.copied")}</p>
            <p className="text-base">{t("share.copiedHelp")}</p>
          </div>
        </div>
      )}

      {!sheetOpen && copy === "failed" && (
        <div role="alert" className="fixed inset-x-4 bottom-8 z-30 mx-auto grid max-w-lg gap-1 rounded-card bg-paper px-6 py-4 text-ink shadow-card">
          <p className="text-base font-bold">{t("share.copyFailed")}</p>
          <p className="text-base break-all select-all">{url}</p>
        </div>
      )}

      <Dialog open={sheetOpen} title={t("share.title")} onClose={() => setSheetOpen(false)}>
        <p className="text-lg">{t("share.body")}</p>
        <div className="grid gap-2">
          {hasNativeShare && (
            <Button onClick={() => void nativeShare({ title: name, text: message, url })}>
              <ShareNetworkIcon aria-hidden size={24} className="shrink-0" />
              {t("share.native")}
            </Button>
          )}
          <a href={`fb-messenger://share/?link=${encodeURIComponent(url)}`} className={buttonClass({ variant: "ghost", size: "lg" })}>
            {t("share.messenger")}
          </a>
          <a href={`viber://forward?text=${encodeURIComponent(`${message} ${url}`)}`} className={buttonClass({ variant: "ghost", size: "lg" })}>
            {t("share.viber")}
          </a>
          <Button variant="ghost" size="lg" onClick={() => void copyLink(url)}>
            <CopyIcon aria-hidden size={24} className="shrink-0" />
            {t("share.copy")}
          </Button>
        </div>

        <div aria-live="polite">
          {copy === "copied" && (
            <div className="flex items-center gap-4 rounded-tile bg-gold/50 p-4 text-ink">
              <CheckCircleIcon aria-hidden size={32} weight="fill" className="shrink-0" />
              <div>
                <p className="text-xl font-bold">{t("share.copied")}</p>
                <p className="text-base">{t("share.copiedHelp")}</p>
              </div>
            </div>
          )}
          {copy === "failed" && (
            <div className="grid gap-1 text-ink">
              <p className="text-base font-bold">{t("share.copyFailed")}</p>
              <p className="text-base break-all select-all">{url}</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
