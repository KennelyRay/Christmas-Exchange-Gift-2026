"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "gift-chain-muted";
const listeners = new Set<() => void>();
let context: AudioContext | undefined;

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let muted: boolean | undefined;
const isMuted = () => (muted ??= readMuted());

export function toggleMuted() {
  muted = !isMuted();
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Private browsing: the toggle still works for this visit.
  }
  listeners.forEach((notify) => notify());
}

export function useMuted() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    isMuted,
    () => false,
  );
}

/** Browsers only allow audio after a gesture, so call this from a press handler. */
export function unlockAudio() {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
}

function bell(frequency: number, delay: number, duration: number, volume: number) {
  if (!context || isMuted()) return;
  const start = context.currentTime + delay;

  // A bell is a bright fundamental plus a quieter, inharmonic overtone.
  for (const [ratio, level] of [
    [1, 1],
    [2.76, 0.35],
  ]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency * ratio;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume * level, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}

export const playTick = () => bell(1400, 0, 0.05, 0.05);

export function playChime() {
  [659.25, 783.99, 1046.5].forEach((note, i) => bell(note, i * 0.11, 0.9, 0.16));
}

export function playFanfare() {
  [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((note, i) => bell(note, i * 0.16, 1.3, 0.18));
}
