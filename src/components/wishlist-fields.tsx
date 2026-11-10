"use client";

import { ArrowClockwiseIcon, CameraIcon, CheckIcon, ClipboardTextIcon, ImagesIcon } from "@phosphor-icons/react";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { ClientApiError } from "@/lib/client-api";
import { linkFromText, readClipboard } from "@/lib/device";
import { friendlyError, useT } from "@/lib/i18n";
import { PhotoProblem, preparePhoto } from "@/lib/images";
import { formatPeso, parsePesoToCentavos } from "@/lib/money";
import { discardPhoto, uploadPhoto } from "@/lib/photo-upload";
import type { UploadedPhoto } from "@/lib/photos";
import { normalizeWebUrl, storeNameFor } from "@/lib/stores";
import { ItemPhoto } from "./item-photo";
import { StoreChip } from "./store-chip";
import { Button, ErrorNote, Field, inputClass } from "./ui";
import type { Draft } from "./use-wishlist-wizard";

/** Adds the commas as you type: "1299.5" becomes "1,299.5". */
function formatPriceInput(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cleaned.includes(".") ? `${grouped}.${rest.join("").slice(0, 2)}` : grouped;
}

type FieldBindings = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

export function PriceInput({ value, onChange, bindings }: { value: string; onChange: (value: string) => void; bindings: FieldBindings }) {
  return (
    <div className="relative">
      <span aria-hidden className="absolute top-1/2 left-4 -translate-y-1/2 text-xl font-bold text-ink">
        ₱
      </span>
      <input
        {...bindings}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        className={`${inputClass} pl-10`}
        onChange={(event) => {
          const input = event.target;
          const caret = input.selectionStart ?? input.value.length;
          const charsBeforeCaret = input.value.slice(0, caret).replace(/[^\d.]/g, "").length;
          const next = formatPriceInput(input.value);
          onChange(next);
          // Commas shift the text, so put the cursor back after the same digit.
          requestAnimationFrame(() => {
            let position = 0;
            for (let seen = 0; position < next.length && seen < charsBeforeCaret; position++) {
              if (/[\d.]/.test(next[position])) seen++;
            }
            input.setSelectionRange(position, position);
          });
        }}
      />
    </div>
  );
}

function PhotoButton({ icon, label, capture, disabled, onPick, className = "" }: { icon: ReactNode; label: ReactNode; capture?: boolean; disabled: boolean; onPick: (file: File | undefined) => void; className?: string }) {
  return (
    <label className={`relative flex min-h-tap-lg max-md:min-h-tap cursor-pointer items-center justify-center gap-2 rounded-full px-6 py-2 text-center text-lg font-bold ring-2 ring-ink/50 transition duration-200 ease-settle focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-wax-deep hover:bg-ink/5 has-disabled:cursor-not-allowed has-disabled:opacity-50 ${className}`}>
      {icon}
      {label}
      <input
        type="file"
        accept="image/*"
        capture={capture ? "environment" : undefined}
        disabled={disabled}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </label>
  );
}

type PhotoStatus =
  | { kind: "preparing" }
  | { kind: "uploading"; preview: string; progress: number }
  | { kind: "failed"; message: string; retry: Blob | null; preview: string | null };

type PhotoPickerProps = {
  exchangeId: string;
  photo: UploadedPhoto | null;
  onChange: (photo: UploadedPhoto | null) => void;
  onBusy: (busy: boolean) => void;
  compact?: boolean;
  error?: string;
  itemName: string;
};

/**
 * Pick or take a photo, shrink it on the device, and upload it straight away,
 * so the final submit has nothing heavy left to send.
 */
export function PhotoPicker({ exchangeId, photo, onChange, onBusy, compact, error, itemName }: PhotoPickerProps) {
  const t = useT();
  const [status, setStatus] = useState<PhotoStatus | null>(null);
  const [dragging, setDragging] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const preview = useRef<string | null>(null);
  const reportBusy = useEffectEvent(onBusy);

  const working = status?.kind === "preparing" || status?.kind === "uploading";

  function showPreview(blob: Blob | null) {
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = blob ? URL.createObjectURL(blob) : null;
    return preview.current;
  }

  useEffect(
    () => () => {
      controller.current?.abort();
      if (preview.current) URL.revokeObjectURL(preview.current);
      reportBusy(false);
    },
    [],
  );

  function messageFor(problem: unknown) {
    if (problem instanceof PhotoProblem) {
      return t(problem.kind === "notPhoto" ? "err.photoNotImage" : problem.kind === "tooBig" ? "err.photoBig" : "err.photoRead");
    }
    return problem instanceof ClientApiError ? friendlyError(problem, t) : t("err.photoUpload");
  }

  async function send(blob: Blob, previous: UploadedPhoto | null) {
    const attempt = new AbortController();
    controller.current = attempt;
    const shown = showPreview(blob)!;
    setStatus({ kind: "uploading", preview: shown, progress: 0 });
    onBusy(true);
    try {
      const uploaded = await uploadPhoto(
        exchangeId,
        blob,
        (progress) => setStatus((current) => (current?.kind === "uploading" ? { ...current, progress } : current)),
        attempt.signal,
      );
      onChange(uploaded);
      // Never overwrite: the old photo had its own key, so it's deleted instead.
      if (previous && previous.key !== uploaded.key) discardPhoto(previous.key);
      showPreview(null);
      setStatus(null);
    } catch (problem) {
      if (attempt.signal.aborted) return;
      setStatus({ kind: "failed", message: messageFor(problem), retry: blob, preview: shown });
    } finally {
      if (!attempt.signal.aborted) onBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file || working) return;
    controller.current?.abort();
    setStatus({ kind: "preparing" });
    onBusy(true);
    let prepared: Blob;
    try {
      prepared = await preparePhoto(file);
    } catch (problem) {
      setStatus({ kind: "failed", message: messageFor(problem), retry: null, preview: showPreview(null) });
      onBusy(false);
      return;
    }
    await send(prepared, photo);
  }

  function remove() {
    controller.current?.abort();
    showPreview(null);
    setStatus(null);
    onBusy(false);
    if (photo) discardPhoto(photo.key);
    onChange(null);
  }

  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void pick(event.dataTransfer.files[0]);
    },
  };

  const thumbSize = compact ? "size-16" : "size-40";
  const iconSize = compact ? 22 : 24;
  const buttonText = compact ? "px-2! text-base! leading-tight" : "";

  const pickButtons = (
    <div className={compact ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
      {/* Computers have no camera to open, so this only shows on touch screens. */}
      <PhotoButton icon={<CameraIcon aria-hidden size={iconSize} className="shrink-0" />} label={t("wiz.item.camera")} capture disabled={working} onPick={(file) => void pick(file)} className={`hidden pointer-coarse:flex ${buttonText}`} />
      <PhotoButton
        icon={<ImagesIcon aria-hidden size={iconSize} className="shrink-0" />}
        label={
          <>
            <span className="pointer-coarse:hidden">{t("wiz.item.choosePhoto")}</span>
            <span className="hidden pointer-coarse:inline">{t("wiz.item.gallery")}</span>
          </>
        }
        disabled={working}
        onPick={(file) => void pick(file)}
        className={`${compact ? "pointer-fine:col-span-2" : ""} ${buttonText}`}
      />
      <p aria-hidden className="hidden text-center text-base text-ink-soft pointer-fine:block">
        {dragging ? t("wiz.item.dropNow") : t("wiz.item.dropPhoto")}
      </p>
    </div>
  );

  return (
    <div
      {...dropHandlers}
      className={`grid min-w-0 grid-cols-1 gap-2 rounded-tile transition duration-200 ease-settle ${dragging ? "bg-gold/30 outline-3 outline-dashed outline-gold-deep" : ""}`}
    >
      <p className="text-lg font-bold">{t("wiz.item.photoLabel")}</p>

      {status?.kind === "preparing" && (
        <p role="status" className={`flex items-center text-lg font-bold ${compact ? "min-h-tap" : "min-h-tap-lg"}`}>
          {t("wiz.item.photoPreparing")}
        </p>
      )}

      {status?.kind === "uploading" && (
        <div className="flex items-center gap-4">
          <div className={`relative shrink-0 overflow-hidden rounded-tile bg-paper-deep ${thumbSize}`}>
            {/* A photo still on the device, so next/image has nothing to fetch. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={status.preview} alt="" className="size-full object-cover opacity-70" />
            <div className="absolute inset-x-0 bottom-0 h-2 bg-ink/25">
              <div className="h-full origin-left bg-gold transition-transform duration-200" style={{ transform: `scaleX(${status.progress})` }} />
            </div>
          </div>
          <p role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progress * 100)} className="text-lg font-bold tabular-nums">
            {t("wiz.item.photoProgress", { percent: Math.round(status.progress * 100) })}
          </p>
        </div>
      )}

      {status?.kind === "failed" && (
        <>
          {status.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={status.preview} alt="" className={`rounded-tile object-cover opacity-60 ${thumbSize}`} />
          )}
          <ErrorNote>{status.message}</ErrorNote>
          {status.retry && (
            <Button size="lg" onClick={() => void send(status.retry!, photo)} className="w-full">
              <ArrowClockwiseIcon aria-hidden size={iconSize} className="shrink-0" />
              {t("wiz.item.photoRetry")}
            </Button>
          )}
          <p className="text-base text-ink-soft">{t("wiz.item.photoSkip")}</p>
        </>
      )}

      {!status && photo && (
        <div className={compact ? "flex items-center gap-2" : "grid gap-2"}>
          <div className={compact ? "relative shrink-0" : "relative w-fit"}>
            <ItemPhoto src={photo.url} alt={itemName} sizes={compact ? "64px" : "160px"} className={`rounded-tile ${thumbSize}`} />
            <span className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full bg-pine-700 text-snow ring-2 ring-paper">
              <CheckIcon aria-hidden size={18} weight="bold" />
            </span>
          </div>
          <p role="status" className={`font-bold ${compact ? "sr-only" : "text-lg"}`}>
            {t("wiz.item.photoDone")}
          </p>
          <div className={compact ? "flex min-w-0 flex-1 gap-2" : "grid gap-2"}>
            <PhotoButton
              icon={compact ? null : <ImagesIcon aria-hidden size={24} />}
              label={compact ? t("wiz.item.changeShort") : t("wiz.item.changePhoto")}
              disabled={working}
              onPick={(file) => void pick(file)}
              className={compact ? "min-w-0 flex-1 px-2! text-base!" : ""}
            />
            <Button variant="ghost" fit={compact} onClick={remove} className={compact ? "" : "w-full"}>
              {compact ? t("common.remove") : t("wiz.item.removePhoto")}
            </Button>
          </div>
        </div>
      )}

      {((!status && !photo) || status?.kind === "failed") && pickButtons}

      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

export function StoreLinkField({ value, error, onChange, compact }: { value: string; error?: string; onChange: (value: string) => void; compact?: boolean }) {
  const t = useT();
  const [hint, setHint] = useState("");
  const link = value.trim() ? normalizeWebUrl(value) : "";
  const store = link ? storeNameFor(link) : null;

  async function paste() {
    setHint("");
    const text = await readClipboard();
    if (text === null) {
      setHint(t("wiz.item.pasteDenied"));
      return;
    }
    const found = linkFromText(text);
    if (found) onChange(found);
    else setHint(t("wiz.item.pasteEmpty"));
  }

  if (compact) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <Field label={t("wiz.item.linkLabel")} error={error}>
          {(props) => (
            <div className="flex min-w-0 gap-2">
              <input
                {...props}
                value={value}
                onChange={(e) => {
                  setHint("");
                  onChange(linkFromText(e.target.value) || e.target.value);
                }}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`${inputClass} flex-1`}
              />
              {store ? (
                <Button variant="ghost" size="lg" fit onClick={() => onChange("")} className="shrink-0">
                  {t("common.remove")}
                </Button>
              ) : (
                <Button variant="ghost" size="lg" fit onClick={() => void paste()} className="shrink-0">
                  {t("wiz.item.paste")}
                </Button>
              )}
            </div>
          )}
        </Field>
        {store && (
          <p className="flex flex-wrap items-center gap-2 text-base font-bold">
            <CheckIcon aria-hidden size={22} weight="bold" className="text-pine-700" />
            {t("wiz.item.linkAdded")} <StoreChip url={link} />
          </p>
        )}
        {hint && (
          <p role="status" className="text-base font-bold">
            {hint}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Field label={t("wiz.item.linkLabel")} error={error}>
        {(props) => (
          <input
            {...props}
            value={value}
            onChange={(e) => {
              setHint("");
              onChange(linkFromText(e.target.value) || e.target.value);
            }}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={inputClass}
          />
        )}
      </Field>
      {store ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
            <CheckIcon aria-hidden size={24} weight="bold" className="text-pine-700" />
            {t("wiz.item.linkAdded")} <StoreChip url={link} />
          </p>
          <Button variant="ghost" onClick={() => onChange("")} className="w-full">
            {t("wiz.item.removeLink")}
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="lg" onClick={() => void paste()} className="w-full">
          <ClipboardTextIcon aria-hidden size={24} className="shrink-0" />
          {t("wiz.item.paste")}
        </Button>
      )}
      {hint && (
        <p role="status" className="text-base font-bold">
          {hint}
        </p>
      )}
    </div>
  );
}

export function ItemSummary({ item }: { item: Draft }) {
  const centavos = parsePesoToCentavos(item.price);
  const link = item.url.trim() ? normalizeWebUrl(item.url) : "";
  return (
    <div className="flex min-w-0 items-start gap-4">
      {item.photo && <ItemPhoto src={item.photo.url} alt={item.name} sizes="80px" className="size-20 shrink-0 rounded-tile" />}
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-xl leading-snug font-bold wrap-anywhere">{item.name}</p>
        {centavos !== null && <p className="text-lg font-bold text-wax-deep tabular-nums">{formatPeso(centavos)}</p>}
        {link && <StoreChip url={link} />}
      </div>
    </div>
  );
}

export function StepHeading({ headingRef, title, children }: { headingRef: React.RefObject<HTMLHeadingElement | null>; title: string; children?: ReactNode }) {
  return (
    <header>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-4xl font-semibold outline-none">
        {title}
      </h1>
      {children && <p className="mt-2 text-lg">{children}</p>}
    </header>
  );
}
