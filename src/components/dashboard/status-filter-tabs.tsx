"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Shared pill status-filter tabs — used identically in the client and professional
// panels for solicitudes AND proyectos so both feel the same. The SAME four buckets
// (Pendientes · Confirmadas · Finalizadas · Canceladas) organize both lifecycles.
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
   *  (e.g. the profession filter), no counts. */
  variant?: "underline" | "pills";
}) {
  const tr = useTranslations("statusTabs");
  const label = (id: string) => (labelFor ? labelFor(id) : tr(id));

  // PILLS — rounded chips, no counts (used for the profession filter). A wrapping row.
  if (variant === "pills") {
    return (
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors",
                active ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]"
              )}
            >
              {label(tab.id)}
              {dotFor?.(tab.id) && <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9] shrink-0" aria-hidden />}
            </button>
          );
        })}
      </div>
    );
  }

  // UNDERLINE — status tabs with a clean count badge after each label (owner image):
  // active = brand-blue underline + blue text + a filled blue count pill; inactive = grey
  // text + a light-grey count pill. A wrapping row sharing one bottom hairline.
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#eef0f2]">
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "group -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13px] font-semibold transition-colors sm:text-[14px]",
              active ? "border-[#009FD9] text-[#009FD9]" : "border-transparent text-[#6b7280] hover:text-[#162543]"
            )}
          >
            {label(tab.id)}
            {count > 0 && (
              <span className={cn(
                "shrink-0 text-[11px] font-semibold leading-none tabular-nums transition-colors",
                active ? "text-[#0089bb]" : "text-[#9ca3af] group-hover:text-[#6b7280]"
              )}>
                {count > 99 ? "99+" : count}
              </span>
            )}
            {dotFor?.(tab.id) && <span className="h-1.5 w-1.5 rounded-full bg-[#009FD9] shrink-0" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

// ONE consistent set everywhere (sprint 430): bookings AUTO-CONFIRM and published
// solicitudes are simply live until they finish, so there is no real "Pendiente"
// stage anymore. The three lifecycles (bookings, published projects, a pro's
// proposals) all use **Activas · Finalizadas · Canceladas** — "Activas" replaces the
// old "Confirmadas"/"Pendientes" (an active/ongoing item), so the names match the
// auto-confirm reality and read the same across solicitudes recibidas, mis
// projects and opportunities.
const STATUS_TABS: readonly FilterTab[] = [
  { id: "activas" },
  { id: "finalizadas" },
  { id: "canceladas" },
];
export const PROYECTO_TABS = STATUS_TABS;
export const SOLICITUD_TABS = STATUS_TABS;

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
  if (status === "cancelled" || status === "rescheduled") return "canceladas";
  if (status === "completed" || status === "awaiting_confirmation") return "finalizadas";
  if (isPastAppointment(scheduledDate)) return "finalizadas";
  // pending (legacy) + confirmed + in_progress are all active → Activas.
  return "activas";
}
export function solicitudMatches(filter: string, status: string, scheduledDate?: string | null): boolean {
  return solicitudBucket(status, scheduledDate) === filter;
}

// ── PROYECTOS (a CLIENT's published project) ────────────────────────────────
// open (receiving proposals) → Pendientes; assigned/in progress → Confirmadas;
// completed → Finalizadas; cancelled → Canceladas.
export function proyectoBucket(status: string): string {
  if (status === "cancelled") return "canceladas";
  if (status === "completed") return "finalizadas";
  // open (receiving propuestas) + in_progress + awaiting are all live → Activas.
  return "activas";
}
export function proyectoMatches(filter: string, status: string): boolean {
  return proyectoBucket(status) === filter;
}

// ── PROYECTOS (a PRO's own proposal) ────────────────────────────────────────
// Bucketed by the PROPOSAL first (so a declined proposal lands in Canceladas even
// if the project moved on with someone else), then the project's lifecycle once
// the proposal was accepted.
export function proposalBucket(proposalStatus: string, projectStatus?: string | null): string {
  if (proposalStatus === "declined") return "canceladas";
  if (proposalStatus === "pending") return "activas"; // your live proposal (awaiting a decision)
  // accepted → follow the project
  if (projectStatus === "cancelled") return "canceladas";
  if (projectStatus === "completed") return "finalizadas";
  return "activas";
}
export function proposalMatches(filter: string, proposalStatus: string, projectStatus?: string | null): boolean {
  return proposalBucket(proposalStatus, projectStatus) === filter;
}

// Build a {bucket: count} map for the count badges. Pass the items' resolved buckets.
export function bucketCounts(buckets: string[]): Record<string, number> {
  const counts: Record<string, number> = { activas: 0, finalizadas: 0, canceladas: 0 };
  for (const b of buckets) counts[b] = (counts[b] ?? 0) + 1;
  return counts;
}

// ── In-card status badge: REDUNDANT-status detection ────────────────────────
// Because the view is ALWAYS inside a status tab (no all/mixed view), a card whose
// granular status is the bucket's PRIMARY status just repeats the tab → don't show
// the badge again. Genuine SUB-states (in_progress, awaiting_confirmation,
// rescheduled, declined-vs-cancelled, …) return false → the badge IS still shown.
const SOLICITUD_PRIMARY: Record<string, string[]> = {
  activas: ["confirmed", "pending"], // both read as an active appointment
  finalizadas: ["completed", "confirmed"], // a past confirmed also reads as finalizada
  canceladas: ["cancelled"],
};
export function solicitudStatusRedundant(status: string, scheduledDate?: string | null): boolean {
  return SOLICITUD_PRIMARY[solicitudBucket(status, scheduledDate)]?.includes(status) ?? false;
}
const PROYECTO_PRIMARY: Record<string, string[]> = {
  // Inside "Activas", `open` (receiving proposals) and `in_progress` (already assigned)
  // are the normal active states, so their badges repeat the tab/details. Awaiting
  // confirmation still shows because it needs the client's attention.
  activas: ["open", "in_progress"],
  finalizadas: ["completed"],
  canceladas: ["cancelled"],
};
export function proyectoStatusRedundant(status: string): boolean {
  return PROYECTO_PRIMARY[proyectoBucket(status)]?.includes(status) ?? false;
}
export function proposalStatusRedundant(proposalStatus: string, projectStatus?: string | null): boolean {
  if (proposalStatus === "declined") return false; // Show "No seleccionada" inside Canceladas.
  if (proposalStatus === "accepted") {
    if (projectStatus === "in_progress") return true; // Activas (primary)
    if (projectStatus === "completed") return true; // Finalizadas (primary)
  }
  // pending (En espera, awaiting a decision) + accepted+awaiting + accepted+cancelled →
  // keep the sub-state badge so the live "Activas" tab still distinguishes them.
  return false;
}
