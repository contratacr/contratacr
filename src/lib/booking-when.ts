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

/** "2026-09-09" del reloj de Costa Rica, para saber qué es "hoy". */
function hoyCR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/**
 * `relativo`: "Hoy · 10:00 am" y "Mañana · 3:00 pm" en vez de la fecha. Es para
 * las listas, donde uno mira qué toca; los correos y avisos siguen con la fecha
 * completa, porque se leen otro día.
 */
export function formatBookingWhen(scheduledDate?: string | null, scheduledTime?: string | null, dateLocale = "es-CR", relativo = false): string | null {
  if (!scheduledDate) return null;
  const [y, m, d] = scheduledDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  if (relativo) {
    const hoy = hoyCR();
    const etiqueta = scheduledDate === hoy ? (dateLocale.startsWith("en") ? "Today" : "Hoy") : scheduledDate === sumarDias(hoy, 1) ? (dateLocale.startsWith("en") ? "Tomorrow" : "Mañana") : null;
    if (etiqueta) {
      const time = to12h(scheduledTime);
      return `${etiqueta}${time ? ` · ${time}` : ""}`;
    }
  }
  const dt = new Date(y, m - 1, d);
  const wdRaw = dt.toLocaleDateString(dateLocale, { weekday: "short" }).replace(".", "");
  const wd = wdRaw.charAt(0).toUpperCase() + wdRaw.slice(1);
  const dm = dt.toLocaleDateString(dateLocale, { day: "numeric", month: "short" }).replace(".", "");
  const time = to12h(scheduledTime);
  return `${wd}, ${dm}${time ? ` · ${time}` : ""}`;
}

/**
 * El orden de una agenda: en lo activo, lo más próximo arriba y lo que aún no
 * tiene fecha al final (está por coordinar, no compite con un horario); en lo
 * terminado, lo más reciente arriba. Antes las listas iban por fecha de
 * reserva, y una cita de pasado mañana podía quedar debajo de una de dentro de
 * tres semanas solo porque se reservó después.
 */
export function ordenarCitas<T extends { scheduled_date?: string | null; scheduled_time?: string | null; created_at?: string }>(lista: T[], etapa: "activas" | "finalizadas"): T[] {
  const clave = (b: T) => (b.scheduled_date ? `${b.scheduled_date}T${b.scheduled_time ?? "00:00:00"}` : "");
  return [...lista].sort((a, b) => {
    const ka = clave(a);
    const kb = clave(b);
    if (etapa === "activas") {
      if (!ka && !kb) return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      if (!ka) return 1;
      if (!kb) return -1;
      return ka.localeCompare(kb);
    }
    return (kb || (b.created_at ?? "")).localeCompare(ka || (a.created_at ?? ""));
  });
}
