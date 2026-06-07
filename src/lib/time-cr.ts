// Costa Rica time helpers. CR is America/Costa_Rica (UTC-6, no DST). We derive
// the CR wall-clock from any Date via Intl so it's correct regardless of where
// the code runs (browser in another tz, or a UTC server).

function crParts(d: Date = new Date()): { date: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  // en-CA yields a 24h "24" for midnight in some engines — normalize.
  const hour = Number(parts.hour) % 24;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, minute: Number(parts.minute) };
}

/** Today's date in Costa Rica as YYYY-MM-DD. */
export function crTodayISO(): string {
  return crParts().date;
}

/** Minutes since midnight, Costa Rica time. */
export function crNowMinutes(): number {
  const { hour, minute } = crParts();
  return hour * 60 + minute;
}

/**
 * Is a date (YYYY-MM-DD) + optional time (HH:MM) already in the past in CR?
 * No time → only the date is compared (so "today" is NOT past).
 */
export function isPastDateTimeCR(dateISO: string, time?: string): boolean {
  const { date, hour, minute } = crParts();
  if (dateISO < date) return true;
  if (dateISO > date) return false;
  if (!time) return false;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m <= hour * 60 + minute;
}
