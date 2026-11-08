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
