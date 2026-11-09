"use client";

import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react";

/** Tailwind's md breakpoint. Below it the app is the phone layout. */
const PHONE_QUERY = "(width < 48rem)";
const BACK_TIMEOUT_MS = 600;

export const isPhoneWidth = () => window.matchMedia(PHONE_QUERY).matches;

function subscribeToWidth(notify: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

export function useIsPhoneWidth() {
  return useSyncExternalStore(subscribeToWidth, isPhoneWidth, () => false);
}

/**
 * Each thing the back button can undo adds a history entry numbered one deeper
 * than the last, so a popstate can tell whether *this* layer was the one left.
 */
export const historyDepth = () => (window.history.state?.appDepth as number | undefined) ?? 0;

export function pushEntry(url = window.location.href) {
  const appDepth = historyDepth() + 1;
  window.history.pushState({ appDepth }, "", url);
  return appDepth;
}

export function replaceEntry(url: string) {
  window.history.replaceState({ appDepth: historyDepth() }, "", url);
}

let pendingBacks = 0;
const afterBacks: Array<() => void> = [];

function backFinished() {
  pendingBacks = Math.max(0, pendingBacks - 1);
  if (pendingBacks === 0) afterBacks.splice(0).forEach((run) => run());
}

/** history.back() finishes later, and a push made before it lands would be the entry it undoes. */
export function goBack() {
  pendingBacks++;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener("popstate", finish);
    backFinished();
  };
  window.addEventListener("popstate", finish);
  setTimeout(finish, BACK_TIMEOUT_MS);
  window.history.back();
}

export function whenHistorySettled(run: () => void) {
  if (pendingBacks === 0) run();
  else afterBacks.push(run);
}

/**
 * Lets the phone's back button close something, instead of leaving the page.
 * Closing it any other way removes the extra entry again. Unmounting leaves it,
 * because the page may be navigating away and going back would undo that.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const entry = useRef(0);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (open && entry.current === 0 && isPhoneWidth()) {
      entry.current = pushEntry();
    } else if (!open && entry.current > 0) {
      const stillThere = historyDepth() >= entry.current;
      entry.current = 0;
      if (stillThere) goBack();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      if (entry.current > 0 && historyDepth() < entry.current) {
        entry.current = 0;
        close();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);
}
