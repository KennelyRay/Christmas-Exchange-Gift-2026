"use client";

import { CheckCircleIcon, CheckIcon, CopyIcon, DownloadSimpleIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { groupCode, renderCodeCard } from "@/lib/code-card";
import { copyText, nativeShare, saveImage } from "@/lib/device";
import { useT } from "@/lib/i18n";
import { Button, Dialog } from "./ui";

const COPIED_MS = 3000;

type SecretCodeProps = {
  label: string;
  code: string;
  explanation: ReactNode;
  confirmLabel: string;
  onDone: () => void;
  doneLabel: string;
  /** Printed on the picture, so it's clear whose code it is. */
  ownerName?: string;
  exchangeName?: string;
  sendLabel?: string;
  sendText?: string;
};

type Picture = { blob: Blob; dataUrl: string };

/** Shown exactly once. The server keeps only a hash, so leaving is guarded. */
export function SecretCode({ label, code, explanation, confirmLabel, onDone, doneLabel, ownerName, exchangeName, sendLabel, sendText }: SecretCodeProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [pictureSaved, setPictureSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isNumeric = /^\d+$/.test(code);
  const shown = groupCode(code);

  useEffect(() => {
    if (saved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved]);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    setNote("");
    if (await copyText(code)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }
  }

  async function makePicture() {
    if (drawing) return;
    setDrawing(true);
    setNote("");
    setPictureSaved(false);
    try {
      setPicture(await renderCodeCard({ code, label, note: t("code.cardKeep"), name: ownerName, exchangeName }));
    } catch {
      setNote(t("code.pictureFailed"));
    } finally {
      setDrawing(false);
    }
  }

  async function downloadPicture() {
    if (!picture) return;
    if (await saveImage(picture.blob, "secret-code.png")) setPictureSaved(true);
  }

  async function send() {
    setNote("");
    const text = sendText ?? t("code.sendText", { name: exchangeName ?? label, code: shown });
    if ((await nativeShare({ text })) === "unavailable") {
      if (await copyText(text)) setNote(t("code.sendFallback"));
    }
  }

  return (
    <div className="grid gap-6 max-md:gap-3">
      <div className="rounded-tile border-2 border-dashed border-gold-deep bg-gold/40 p-6 text-center max-md:p-4">
        <p className="text-lg font-bold">{label}</p>
        <p
          className={`mt-2 font-display font-semibold ${isNumeric ? "text-[clamp(3.25rem,16vw,5.5rem)] max-md:text-[clamp(2.75rem,13vw,4rem)] leading-none tracking-wide whitespace-nowrap tabular-nums" : "text-3xl wrap-anywhere"}`}
        >
          {shown}
        </p>
      </div>

      <p className="text-lg text-ink-soft">{explanation}</p>

      <div className="grid gap-2">
        <p className="text-lg font-bold">{t("code.saveAll")}</p>
        <Button variant="gold" onClick={() => void makePicture()} busy={drawing}>
          {!drawing && <DownloadSimpleIcon aria-hidden size={24} className="shrink-0" />}
          {drawing ? t("code.pictureBusy") : t("code.picture")}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => void copy()}>
          {copied ? <CheckIcon aria-hidden size={24} className="shrink-0" /> : <CopyIcon aria-hidden size={24} className="shrink-0" />}
          <span aria-live="polite">{copied ? t("code.copied") : t("code.copy")}</span>
        </Button>
        <Button variant="ghost" size="lg" onClick={() => void send()}>
          <PaperPlaneTiltIcon aria-hidden size={24} className="shrink-0" />
          {sendLabel ?? t("code.send")}
        </Button>
        {note && (
          <p role="status" className="rounded-tile bg-paper-deep p-4 text-base font-bold">
            {note}
          </p>
        )}
      </div>

      <label className="flex min-h-tap-lg cursor-pointer items-center gap-4 rounded-tile bg-paper-deep/70 p-4 text-lg font-bold">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-8 shrink-0 accent-[#a3262b] max-md:size-6" />
        {confirmLabel}
      </label>

      <div className="grid gap-2">
        <Button onClick={onDone} disabled={!saved} className="w-full">
          {doneLabel}
        </Button>
        {!saved && <p className="text-center text-base text-ink-soft">{t("code.confirmFirst")}</p>}
      </div>

      <Dialog open={picture !== null} title={t("code.pictureTitle")} onClose={() => setPicture(null)}>
        {picture && (
          <>
            {/* A data URL so that press-and-hold saving works, including in Messenger's browser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={picture.dataUrl} alt={`${label}: ${shown}`} className="mx-auto w-full max-w-xs rounded-tile" />
            <p className="text-lg">{t("code.pictureHold")}</p>
            <Button onClick={() => void downloadPicture()} className="w-full">
              <DownloadSimpleIcon aria-hidden size={24} className="shrink-0" />
              {t("code.pictureSave")}
            </Button>
            {pictureSaved && (
              <p role="status" className="flex items-center gap-2 text-lg font-bold text-ink">
                <CheckCircleIcon aria-hidden size={28} weight="fill" className="shrink-0 text-pine-700" />
                {t("code.pictureSaved")}
              </p>
            )}
          </>
        )}
      </Dialog>
    </div>
  );
}
