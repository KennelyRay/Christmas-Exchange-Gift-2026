const MANILA_UTC_OFFSET_HOURS = 8;

const manilaInstant = (year: number, month: number, day: number, hour: number) =>
  new Date(Date.UTC(year, month, day, hour - MANILA_UTC_OFFSET_HOURS));

/** Christmas Day begins at midnight in the Philippines, wherever the viewer is. */
export function nextChristmas(now: Date) {
  const manilaYear = new Date(now.getTime() + MANILA_UTC_OFFSET_HOURS * 3_600_000).getUTCFullYear();
  const thisYear = manilaInstant(manilaYear, 11, 25, 0);
  // The whole of 25 December still counts as "today".
  return now.getTime() < thisYear.getTime() + 86_400_000
    ? thisYear
    : manilaInstant(manilaYear + 1, 11, 25, 0);
}

/** Default Christmas Night: 8 PM on Noche Buena, 24 December in Manila. */
export function defaultRevealAt(now: Date) {
  const christmas = nextChristmas(now);
  const year = new Date(christmas.getTime() + MANILA_UTC_OFFSET_HOURS * 3_600_000).getUTCFullYear();
  const candidate = manilaInstant(year, 11, 24, 20);
  return candidate.getTime() > now.getTime() ? candidate : manilaInstant(year + 1, 11, 24, 20);
}

export function formatManila(date: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

/** "YYYY-MM-DDTHH:mm" in Manila time, the format a datetime-local input expects. */
export function toManilaInputValue(date: Date | string) {
  const shifted = new Date(new Date(date).getTime() + MANILA_UTC_OFFSET_HOURS * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}

export function fromManilaInputValue(value: string) {
  return new Date(`${value}:00+08:00`);
}

export function timeParts(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}
