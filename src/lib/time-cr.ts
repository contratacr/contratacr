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



/** Minimum lead time (minutes) before a slot can be booked/published. */
export const LEAD_MINUTES = 15;

/**
 * Is a date + time too soon to be valid (less than LEAD_MINUTES ahead of the
 * current Costa Rica time)? Future dates are always fine; only "today" is gated.
 */
export function isTooSoonCR(dateISO: string, time: string, lead: number = LEAD_MINUTES): boolean {
  const { date, hour, minute } = crParts();
  if (dateISO < date) return true;
  if (dateISO > date) return false;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m < hour * 60 + minute + lead;
}



