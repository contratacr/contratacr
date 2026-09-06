// Fecha de la cita como la lee la gente: "Mar, 23 jun · 1:00 pm". La misma en
// Reservas recibidas (profesional) y Mis reservas (cliente).

export function to12h(time?: string | null): string | null {
  if (!time) return null;
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (Number.isNaN(h)) return null;
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(Number.isNaN(m) ? 0 : m).padStart(2, "0")} ${ap}`;
}

export function formatBookingWhen(scheduledDate?: string | null, scheduledTime?: string | null, dateLocale = "es-CR"): string | null {
  if (!scheduledDate) return null;
  const [y, m, d] = scheduledDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  const wdRaw = dt.toLocaleDateString(dateLocale, { weekday: "short" }).replace(".", "");
  const wd = wdRaw.charAt(0).toUpperCase() + wdRaw.slice(1);
  const dm = dt.toLocaleDateString(dateLocale, { day: "numeric", month: "short" }).replace(".", "");
  const time = to12h(scheduledTime);
  return `${wd}, ${dm}${time ? ` · ${time}` : ""}`;
}
