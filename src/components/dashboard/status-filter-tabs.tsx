"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ScrollRail } from "@/components/ui/scroll-rail";

// Segmented groups are a grid; rails scroll and hint the overflow with a chevron.
function RailOrGrid({ scroll, className, children }: { scroll: boolean; className: string; children: React.ReactNode }) {
  return scroll ? <ScrollRail className={className}>{children}</ScrollRail> : <div className={className}>{children}</div>;
}

// Shared pill status-filter tabs — used identically in the client and professional
// panels for solicitudes AND proyectos so both feel the same. The SAME four buckets
// El ritmo es el mismo en toda la app —esperando → trabajando → cerrado— pero
// cada pantalla nombra su primer paso con la palabra que le corresponde
// (Enviadas, Publicados). Las solicitudes se auto-confirman, así que ahí no hay
// paso de espera: solo En curso y Finalizadas. Lo terminado y lo cancelado
// comparten pestaña; la tarjeta dice cuál de los dos fue.
// `id` doubles as the statusTabs i18n key, so labels translate per locale.
export type FilterTab = { id: string };

export function StatusFilterTabs({
  tabs,
  value,
  onChange,
  counts,
  labelFor,
  dotFor,
  variant = "underline",
  mobileLayout = "equal",
}: {
  tabs: readonly FilterTab[];
  value: string;
  onChange: (id: string) => void;
  /** Per-filter item counts → rendered as a small badge after the label (sprint 479,
   *  owner reference image). Only shown in the "underline" variant when count > 0. */
  counts?: Record<string, number>;
  /** Custom label per tab id (else the `statusTabs` i18n key is used). */
  labelFor?: (id: string) => string;
  /** Show a small "needs attention" red dot on a tab (e.g. an unread reply). */
  dotFor?: (id: string) => boolean;
  /** "underline" (default) = status tabs with count badges; "pills" = filter chips
   *  (e.g. the profession filter), no counts; "chips" = small outlined pills on a
   *  rail, for a FILTER that sits near a segmented view switcher and must not
   *  look like a second one. */
  variant?: "underline" | "pills" | "chips";
  /** Short status labels can share the available mobile width evenly. Long,
   * dynamic labels (such as professions) wrap into complete, visible rows. */
  mobileLayout?: "scroll" | "wrap" | "equal";
}) {
  const tr = useTranslations("statusTabs");
  const label = (id: string) => (labelFor ? labelFor(id) : tr(id));
  // Con una sola etapa no hay nada que elegir: un control con un botón miente.
  // Se resume en una línea, como hacen las listas que solo tienen un estado.
  if (tabs.length === 1 && variant === "underline") {
    const unica = tabs[0];
    const total = counts?.[unica.id] ?? 0;
    return (
      <p data-status-filter-tabs="" data-filter-layout="summary" className="px-1 text-[13px] font-semibold text-[#6b7280]">
        {label(unica.id)}
        {total > 0 && <span className="ml-1.5 font-extrabold text-[#162543]">{total}</span>}
      </p>
    );
  }
  const useSegmentedLayout = tabs.length >= 2 && tabs.length <= 5 && mobileLayout !== "scroll";
  const useScrollableLayout = !useSegmentedLayout;
  // Una celda segmentada es angosta en 320 px: con cuatro o más etapas el
  // conteo se apila bajo el rótulo para que ninguno se corte.
  const shortLabels = tabs.every((tab) => label(tab.id).length <= 12);

  // PILLS — same segmented language, without count badges. Used for profession
  // filters where labels can be long; 2–4 fit the row, 5+ become a clean rail.
  // CHIPS — visually distinct from segmented sub-navs: small outlined pills,
  // active in light blue, with count badges, on a scrollable rail.
  if (variant === "chips") {
    return (
      <div data-status-filter-tabs="" data-filter-layout="chips" className="relative w-full max-w-full min-w-0 overflow-hidden">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto py-0">
          {tabs.map((tab) => {
            const active = value === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(active ? "" : tab.id)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
                  active
                    ? "border-[#009FD9] bg-[#009FD9] text-white"
                    : "border-[#dfe6ec] bg-white text-[#526277] hover:border-[#c3d2de]",
                )}
              >
                <span className="max-w-[14rem] truncate">{label(tab.id)}</span>
                {dotFor?.(tab.id) && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-white" : "bg-[#009FD9]")} aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === "pills") {
    const usePillSegmentedLayout = tabs.length >= 2 && tabs.length <= 4;
    return (
      <div
        data-status-filter-tabs=""
        data-filter-layout={usePillSegmentedLayout ? "segmented-pills" : "scroll-pills"}
        className={cn(
          "relative w-full max-w-full min-w-0",
          usePillSegmentedLayout ? "rounded-xl bg-[#e6edf4] p-1" : "overflow-hidden",
        )}
      >
        <RailOrGrid
          scroll={!usePillSegmentedLayout}
          className={cn(
            usePillSegmentedLayout
              ? "grid items-stretch gap-1"
              : "flex gap-1 rounded-xl bg-[#e6edf4] p-1",
            usePillSegmentedLayout && tabs.length === 2 && "grid-cols-2",
            usePillSegmentedLayout && tabs.length === 3 && "grid-cols-3",
            usePillSegmentedLayout && tabs.length === 4 && "grid-cols-4",
          )}
        >
          {tabs.map((tab) => {
            const active = value === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={cn(
                  "inline-flex min-h-10 max-w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-center text-[13px] font-semibold leading-tight transition-all",
                  usePillSegmentedLayout
                    ? "min-w-0 whitespace-normal [overflow-wrap:anywhere]"
                    : "min-w-[8.25rem] flex-none whitespace-normal [overflow-wrap:anywhere]",
                  active ? "bg-white text-[#009FD9] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                )}
              >
                {label(tab.id)}
                {dotFor?.(tab.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#009FD9]" aria-hidden />}
              </button>
            );
          })}
        </RailOrGrid>
      </div>
    );
  }

  // ESTADOS — pastilla segmentada: fondo gris, la activa en blanco. Con dos a
  // cinco etapas se reparte el ancho; con dos se ajusta a su contenido para no
  // ocupar la pantalla entera por dos opciones.
  return (
    <div
      className={cn(
        "relative w-full max-w-full min-w-0",
        useSegmentedLayout && "rounded-xl bg-[#e6edf4] p-1",
        useScrollableLayout && "overflow-hidden",
      )}
      data-status-filter-tabs=""
      data-filter-layout={useSegmentedLayout ? "segmented" : "scroll"}
    >
      <RailOrGrid scroll={!useSegmentedLayout} className={cn(
        useSegmentedLayout
          ? "grid items-stretch gap-1"
          : "flex gap-1 rounded-xl bg-[#e6edf4] p-1",
        useSegmentedLayout && tabs.length === 2 && "grid-cols-2",
        useSegmentedLayout && tabs.length === 3 && "grid-cols-3",
        useSegmentedLayout && tabs.length === 4 && "grid-cols-4",
        useSegmentedLayout && tabs.length === 5 && "grid-cols-5",
      )}>
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "group relative inline-flex min-h-9 max-w-full items-center justify-center gap-1 rounded-lg py-1.5 text-center font-semibold leading-tight transition-all",
              useSegmentedLayout
                ? cn(
                    "min-w-0 px-1.5 text-[12px] min-[400px]:text-[13px] sm:px-3",
                    shortLabels
                      ? cn("whitespace-nowrap", tabs.length >= 4 && "flex-col gap-0.5 min-[520px]:flex-row min-[520px]:gap-1.5")
                      : "whitespace-normal [overflow-wrap:anywhere]",
                  )
                : "min-w-[8.25rem] flex-none whitespace-normal px-3 text-[13px] [overflow-wrap:anywhere]",
              active
                ? "bg-white text-[#009FD9] shadow-sm"
                : "text-[#6b7280] hover:text-[#374151]"
            )}
            aria-pressed={active}
          >
            <span className={cn("min-w-0 max-w-full", shortLabels ? "truncate" : "whitespace-normal [overflow-wrap:anywhere]")}>
              {label(tab.id)}
            </span>
            {count > 0 && (
              // El conteo es parte del rótulo, no adorno: azul de marca en la
              // activa, pizarra en el resto, siempre legible de un vistazo.
              <span className={cn(
                "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold leading-none tabular-nums transition-colors",
                active
                  ? "bg-[#009FD9] text-white"
                  : "bg-[#d5dfe8] text-[#3f4f63] group-hover:bg-[#c8d5e0]"
              )}>
                {count > 99 ? "99+" : count}
              </span>
            )}
            {dotFor?.(tab.id) && <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9] shrink-0" aria-hidden />}
          </button>
        );
      })}
      </RailOrGrid>
    </div>
  );
}

// ONE consistent set everywhere (sprint 430): bookings AUTO-CONFIRM and published
// solicitudes are simply live until they finish, so there is no real "Pendiente"
// stage anymore. The three lifecycles (bookings, published projects, a pro's
// proposals) all use **Activas · Finalizadas · Canceladas** — "Activas" replaces the
// old "Confirmadas"/"Pendientes" (an active/ongoing item), so the names match the
// auto-confirm reality and read the same across Solicitudes and Proyectos.
// Solicitudes publicadas (proyectos): la app ya no asigna ni confirma — una
// solicitud está viva hasta que el cliente la resuelve o la cancela.
export const PROYECTO_TABS: readonly FilterTab[] = [
  { id: "activas" },
  { id: "finalizadas" },
];
// El profesional solo distingue lo que aún no respondió de lo que ya respondió.
export const PROPUESTA_TABS: readonly FilterTab[] = [
  { id: "nuevas" },
  { id: "respondidas" },
];
export const SOLICITUD_TABS: readonly FilterTab[] = [
  { id: "en_curso" },
  { id: "finalizadas" },
];

// A booking's appointment day has fully passed (compared to now, end-of-day).
function isPastAppointment(scheduledDate?: string | null): boolean {
  if (!scheduledDate) return false;
  const [y, m, d] = scheduledDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime() < Date.now();
}

// ── SOLICITUDES (bookings) ──────────────────────────────────────────────────
// Status (+ scheduled date) → the four buckets. A CONFIRMED/in-progress
// appointment whose date already passed is treated as Finalizada.
export function solicitudBucket(status: string, scheduledDate?: string | null): string {
  if (status === "cancelled" || status === "rescheduled") return "finalizadas";
  if (status === "completed" || status === "awaiting_confirmation") return "finalizadas";
  if (isPastAppointment(scheduledDate)) return "finalizadas";
  // pending es herencia: desde el auto-confirmado ninguna cita queda esperando
  // aprobación, así que esas viejas se leen como citas vivas.
  return "en_curso";
}
export function solicitudMatches(filter: string, status: string, scheduledDate?: string | null): boolean {
  return solicitudBucket(status, scheduledDate) === filter;
}

// ── PROYECTOS (a CLIENT's published project) ────────────────────────────────
// open (receiving proposals) → Pendientes; assigned/in progress → Confirmadas;
// completed → Finalizadas; cancelled → Canceladas.
export function proyectoBucket(status: string): string {
  if (status === "cancelled" || status === "completed") return "finalizadas";
  // open, y los estados heredados in_progress / awaiting_confirmation: sigue viva.
  return "activas";
}
export function proyectoMatches(filter: string, status: string): boolean {
  return proyectoBucket(status) === filter;
}

// ── PROYECTOS (a PRO's own proposal) ────────────────────────────────────────
// Bucketed by the PROPOSAL first (so a declined proposal lands in Canceladas even
// if the project moved on with someone else), then the project's lifecycle once
// the proposal was accepted.
export function proposalBucket(): string {
  // Toda respuesta enviada vive en "Respondidas"; el estado de la solicitud se
  // lee en la tarjeta, no en una pestaña.
  return "respondidas";
}
export function proposalMatches(filter: string): boolean {
  if (!filter) return true; // toggle cleared → all proposals
  return proposalBucket() === filter;
}

// Build a {bucket: count} map for the count badges. Pass the items' resolved buckets.
export function bucketCounts(buckets: string[]): Record<string, number> {
  const counts: Record<string, number> = { activas: 0, en_curso: 0, finalizadas: 0 };
  for (const b of buckets) counts[b] = (counts[b] ?? 0) + 1;
  return counts;
}

// ── In-card status badge: REDUNDANT-status detection ────────────────────────
// Because the view is ALWAYS inside a status tab (no all/mixed view), a card whose
// granular status is the bucket's PRIMARY status just repeats the tab → don't show
// the badge again. Genuine SUB-states (in_progress, awaiting_confirmation,
// rescheduled, declined-vs-cancelled, …) return false → the badge IS still shown.
const SOLICITUD_PRIMARY: Record<string, string[]> = {
  en_curso: ["confirmed", "in_progress", "pending"],
  // En Finalizadas conviven completadas y canceladas: la insignia debe distinguirlas.
  finalizadas: [],
};
export function solicitudStatusRedundant(status: string, scheduledDate?: string | null): boolean {
  return SOLICITUD_PRIMARY[solicitudBucket(status, scheduledDate)]?.includes(status) ?? false;
}
const PROYECTO_PRIMARY: Record<string, string[]> = {
  activas: ["open", "in_progress", "awaiting_confirmation"],
  finalizadas: [],
};
export function proyectoStatusRedundant(status: string): boolean {
  return PROYECTO_PRIMARY[proyectoBucket(status)]?.includes(status) ?? false;
}
export function proposalStatusRedundant(proposalStatus: string, projectStatus?: string | null): boolean {
  // La única insignia útil es la de la solicitud (resuelta / cancelada / te eligió).
  return proposalStatus === "pending" && (!projectStatus || projectStatus === "open");
}
