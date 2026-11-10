"use client";

import { useSyncExternalStore } from "react";
import { ClientApiError } from "./client-api";
import { en, tl, type MessageKey } from "./messages";

export type Locale = "en" | "tl";
export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

const STORAGE_KEY = "app-language";
const listeners = new Set<() => void>();
let current: Locale | null = null;

function readStored(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === "tl" ? "tl" : "en";
  } catch {
    return "en";
  }
}

const getLocale = () => (current ??= readStored());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const htmlLang = (locale: Locale) => (locale === "tl" ? "fil" : "en");

export function setLocale(locale: Locale) {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Without storage the choice just lasts until the page closes.
  }
  listeners.forEach((notify) => notify());
}

/** English during server render, so hydration matches before the saved choice applies. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => "en");
}

export function useT(): Translate {
  const messages = useLocale() === "tl" ? tl : en;
  return (key, values) =>
    (messages[key] as string).replace(/\{(\w+)\}/g, (slot, name: string) => (values && name in values ? String(values[name]) : slot));
}

const FRIENDLY_ERRORS: Record<string, MessageKey> = {
  network: "err.network",
  wrong_code: "err.wrongCode",
  rate_limited: "err.tooMany",
  pool_locked: "err.closed",
  pool_full: "err.full",
  name_taken: "err.nameTaken",
  invalid_image: "err.photoFailed",
  uploads_unavailable: "err.photoOff",
  file_too_large: "err.photoBig",
  unsupported_file: "err.photoType",
  photo_missing: "err.photoUpload",
  upload_failed: "err.photoUpload",
  photo_locked: "err.photoFailed",
};

/** Server messages are written for logs and tests; the family sees these instead. */
export function friendlyError(error: unknown, t: Translate) {
  if (error instanceof ClientApiError) {
    const key = FRIENDLY_ERRORS[error.code];
    return key ? t(key) : error.message;
  }
  return error instanceof Error ? error.message : t("err.network");
}
