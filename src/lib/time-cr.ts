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

/**
 * Earliest valid HH:MM for a given date (CR). For a future date → "00:00"; for
 * today → now + LEAD_MINUTES rounded up to the next minute, clamped to 23:59.
 * Lets a picker OFFER only valid times instead of validating after the fact.
 */
export function earliestValidTimeCR(dateISO: string, lead: number = LEAD_MINUTES): string {
  const { date, hour, minute } = crParts();
  if (dateISO > date) return "00:00";
  if (dateISO < date) return "24:00"; // nothing valid in the past
  const total = Math.min(hour * 60 + minute + lead, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Earliest sensible "Desde" start time when configuring availability: the next
 * ROUNDED full hour (e.g. at 9:55 → "10:00"; at 9:00 exactly → "09:00"). For a
 * future date → "00:00". Past date → "24:00" (nothing valid).
 */
export function nextFullHourCR(dateISO: string): string {
  const { date, hour, minute } = crParts();
  if (dateISO > date) return "00:00";
  if (dateISO < date) return "24:00";
  const h = minute > 0 ? hour + 1 : hour; // round up to the next o'clock
  if (h > 23) return "23:59";
  return `${String(h).padStart(2, "0")}:00`;
}

/** Costa Rica display date dd/mm/aaaa from a YYYY-MM-DD string. */
export function crDatePretty(dateISO: string): string {
  const [y, m, d] = dateISO.split("-");
  if (!y || !m || !d) return dateISO;
  return `${d}/${m}/${y}`;
}
