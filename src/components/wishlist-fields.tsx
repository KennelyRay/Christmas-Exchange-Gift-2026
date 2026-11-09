"use client";

import { CameraIcon, CheckIcon, ClipboardTextIcon, ImagesIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { linkFromText, readClipboard } from "@/lib/device";
import { friendlyError, useT } from "@/lib/i18n";
import { compressImage, MAX_SOURCE_BYTES } from "@/lib/images";
import { formatPeso, parsePesoToCentavos } from "@/lib/money";
import { normalizeWebUrl, storeNameFor } from "@/lib/stores";
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

function PhotoButton({ icon, label, capture, disabled, onPick, className = "" }: { icon: ReactNode; label: string; capture?: boolean; disabled: boolean; onPick: (file: File | undefined) => void; className?: string }) {
  return (
    <label className={`relative flex min-h-tap-lg cursor-pointer items-center justify-center gap-2 rounded-full px-6 py-2 text-center text-lg font-bold ring-2 ring-ink/50 transition duration-200 ease-settle focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-wax-deep hover:bg-ink/5 ${className}`}>
      {icon}
      {label}
      <input
        type="file"
        accept={capture ? "image/*" : "image/jpeg,image/png,image/webp,image/heic"}
        capture={capture ? "environment" : undefined}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

export function PhotoPicker({ slug, imageUrl, onChange, onBusy, compact }: { slug: string; imageUrl: string | null; onChange: (url: string | null) => void; onBusy: (busy: boolean) => void; compact?: boolean }) {
  const t = useT();
  const [uploading, setUploadingValue] = useState(false);
  const [error, setError] = useState("");

  function setUploading(value: boolean) {
    setUploadingValue(value);
    onBusy(value);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > MAX_SOURCE_BYTES) {
      setError(t("err.photoBig"));
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", await compressImage(file), "photo");
      const { url } = await api<{ url: string }>(`/api/exchanges/${slug}/uploads`, { form });
      onChange(url);
    } catch (caught) {
      setError(caught instanceof ClientApiError ? friendlyError(caught, t) : t("err.photoRead"));
    } finally {
      setUploading(false);
    }
  }

  if (compact) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <p className="text-lg font-bold">{t("wiz.item.photoLabel")}</p>
        {uploading ? (
          <p role="status" className="flex min-h-tap items-center text-lg font-bold">
            {t("wiz.item.uploading")}
          </p>
        ) : imageUrl ? (
          <div className="flex items-center gap-2">
            {/* Blob photos are already compressed client-side, so next/image would only add cost. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" width={56} height={56} className="size-14 shrink-0 rounded-field object-cover" />
            <PhotoButton icon={null} label={t("wiz.item.changeShort")} disabled={uploading} onPick={(file) => void pick(file)} className="min-w-0 flex-1 px-2! text-base!" />
            <Button variant="ghost" fit onClick={() => onChange(null)}>
              {t("common.remove")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <PhotoButton icon={<CameraIcon aria-hidden size={22} className="shrink-0" />} label={t("wiz.item.camera")} capture disabled={uploading} onPick={(file) => void pick(file)} className="hidden px-2! text-base! leading-tight pointer-coarse:flex" />
            <PhotoButton icon={<ImagesIcon aria-hidden size={22} className="shrink-0" />} label={t("wiz.item.gallery")} disabled={uploading} onPick={(file) => void pick(file)} className="px-2! text-base! leading-tight" />
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-lg font-bold">{t("wiz.item.photoLabel")}</p>
      {imageUrl && (
        // Blob photos are already compressed client-side, so next/image would only add cost.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" width={160} height={160} className="size-40 rounded-tile object-cover" />
      )}
      {uploading ? (
        <p role="status" className="flex min-h-tap-lg items-center text-lg font-bold">
          {t("wiz.item.uploading")}
        </p>
      ) : imageUrl ? (
        <div className="grid gap-2">
          <PhotoButton icon={<ImagesIcon aria-hidden size={24} />} label={t("wiz.item.changePhoto")} disabled={uploading} onPick={(file) => void pick(file)} />
          <Button variant="ghost" onClick={() => onChange(null)} className="w-full">
            {t("wiz.item.removePhoto")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {/* Computers have no camera to open, so this only shows on touch screens. */}
          <PhotoButton icon={<CameraIcon aria-hidden size={24} />} label={t("wiz.item.camera")} capture disabled={uploading} onPick={(file) => void pick(file)} className="hidden pointer-coarse:flex" />
          <PhotoButton icon={<ImagesIcon aria-hidden size={24} />} label={t("wiz.item.gallery")} disabled={uploading} onPick={(file) => void pick(file)} />
        </div>
      )}
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
      {item.imageUrl && (
        // Blob photos are already compressed client-side, so next/image would only add cost.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" width={80} height={80} loading="lazy" className="size-20 shrink-0 rounded-tile object-cover" />
      )}
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
