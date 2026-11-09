"use client";

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { api } from "./client-api";

const subscribeToSeconds = (notify: () => void) => {
  const timer = setInterval(notify, 1000);
  return () => clearInterval(timer);
};
const currentSecond = () => Math.floor(Date.now() / 1000) * 1000;

/** Current time ticking each second. Null during server render, so hydration matches. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribeToSeconds, currentSecond, () => null);
}

/** Flips once at the moment, so a whole page needn't re-render every second to watch it. */
export function useHasPassed(timestamp: number) {
  return useSyncExternalStore(
    subscribeToSeconds,
    () => Date.now() >= timestamp,
    () => false,
  );
}

const deviceListeners = new Set<() => void>();
const subscribeToDevice = (notify: () => void) => {
  deviceListeners.add(notify);
  return () => deviceListeners.delete(notify);
};

function readDeviceValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A small note remembered on this device. Never put a code in here. */
export function useDeviceValue(key: string) {
  const value = useSyncExternalStore(
    subscribeToDevice,
    () => readDeviceValue(key),
    () => null,
  );
  return [value, (next: string) => setDeviceValue(key, next)] as const;
}

export function setDeviceValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage it's simply forgotten, and the app still works.
  }
  deviceListeners.forEach((notify) => notify());
}

/** Polls only while the tab is visible, which also lets the Neon compute sleep. */
export function usePoll<T>(url: string, initial: T, intervalMs: number, onChange?: (previous: T, next: T) => void) {
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState(false);

  const receive = useEffectEvent((next: T) => {
    onChange?.(data, next);
    setData(next);
    setStale(false);
  });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const next = await api<T>(url);
          if (active) receive(next);
        } catch {
          if (active) setStale(true);
        }
      }
      if (active) timer = setTimeout(tick, intervalMs);
    };

    timer = setTimeout(tick, intervalMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [url, intervalMs]);

  return { data, stale, setData };
}
