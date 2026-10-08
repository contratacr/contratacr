// Costa Rica time helpers. CR is America/Costa_Rica (UTC-6, no DST). We derive
// the CR wall-clock from any Date via Intl so it's correct regardless of where
// the code runs (browser in another tz, or a UTC server).

function crParts(d: Date = new Date()): { date: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Today's date in Costa Rica as YYYY-MM-DD. */
export function crTodayISO(): string {
  return crParts().date;
}
