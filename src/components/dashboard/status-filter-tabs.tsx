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
}: {
  tabs: readonly FilterTab[];
  value: string;
  onChange: (id: string) => void;
  /** Per-tab item count. When provided, EVERY tab shows its count (when > 0). */
  counts?: Record<string, number>;
  /** Custom label per tab id (else the `statusTabs` i18n key is used). */
  labelFor?: (id: string) => string;
  /** Show a small "needs attention" red dot on a tab (e.g. an unread reply). */
  dotFor?: (id: string) => boolean;
}) {
  const tr = useTranslations("statusTabs");
  return (
    <div className="flex gap-2 flex-wrap">
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts?.[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors",
              active
                ? "border-[#009FD9] bg-[#009FD9] text-white"
                : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]"
            )}
          >
            {labelFor ? labelFor(tab.id) : tr(tab.id)}
            {/* Optional unread/attention dot (e.g. a new support reply in this status). */}
            {dotFor?.(tab.id) && <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" aria-hidden />}
            {/* Count: a bold, color-contrasted NUMBER right after the label — NOT a circular
                badge. A tiny pill can never perfectly optical-center a single digit (the font
                baseline sits it ~0.5px high), and it kept reading as "off". On the SAME text
                baseline as the label it's aligned by definition, still eye-catching (brand-blue
                on the white pill, white on the active blue pill), and cleaner. Shown only when
                there are items (>0), so a present number always means "there's something here". */}
            {counts && count > 0 && (
              <span
                className={cn(
                  "text-[13px] font-bold tabular-nums leading-none",
                  active ? "text-white" : "text-[#009FD9]"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// PROYECTOS / PROPUESTAS keep the 4 buckets — "Pendientes" is still real there (a
// published solicitud is OPEN/receiving propuestas; a pro's propuesta is awaiting a
// decision). Pendientes leads (it's what needs action).
const STATUS_TABS: readonly FilterTab[] = [
  { id: "pendientes" },
  { id: "confirmadas" },
  { id: "finalizadas" },
  { id: "canceladas" },
];
export const PROYECTO_TABS = STATUS_TABS;

// SOLICITUDES (bookings) — bookings now AUTO-CONFIRM (no manual-accept "pendiente"
// step), so the solicitud tabs drop "Pendientes": Confirmadas (active/upcoming) ·
// Finalizadas · Canceladas. Any legacy `pending` booking is bucketed as Confirmada.
export const SOLICITUD_TABS: readonly FilterTab[] = [
  { id: "confirmadas" },
  { id: "finalizadas" },
  { id: "canceladas" },
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
  if (status === "cancelled" || status === "rescheduled") return "canceladas";
  if (status === "completed" || status === "awaiting_confirmation") return "finalizadas";
  if (isPastAppointment(scheduledDate)) return "finalizadas";
  // pending (legacy) + confirmed + in_progress are all active → Confirmadas.
  return "confirmadas";
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
  if (status === "in_progress" || status === "awaiting_confirmation") return "confirmadas";
  return "pendientes"; // open / anything else
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
  if (proposalStatus === "pending") return "pendientes";
  // accepted → follow the project
  if (projectStatus === "cancelled") return "canceladas";
  if (projectStatus === "completed") return "finalizadas";
  return "confirmadas";
}
export function proposalMatches(filter: string, proposalStatus: string, projectStatus?: string | null): boolean {
  return proposalBucket(proposalStatus, projectStatus) === filter;
}

// Build a {bucket: count} map for the count badges. Pass the items' resolved buckets.
export function bucketCounts(buckets: string[]): Record<string, number> {
  const counts: Record<string, number> = { pendientes: 0, confirmadas: 0, finalizadas: 0, canceladas: 0 };
  for (const b of buckets) counts[b] = (counts[b] ?? 0) + 1;
  return counts;
}

// ── In-card status badge: REDUNDANT-status detection ────────────────────────
// Because the view is ALWAYS inside a status tab (no all/mixed view), a card whose
// granular status is the bucket's PRIMARY status just repeats the tab → don't show
// the badge again. Genuine SUB-states (in_progress, awaiting_confirmation,
// rescheduled, declined-vs-cancelled, …) return false → the badge IS still shown.
const SOLICITUD_PRIMARY: Record<string, string[]> = {
  confirmadas: ["confirmed", "pending"], // both read as an active "Confirmada"
  finalizadas: ["completed", "confirmed"], // a past confirmed also reads as finalizada
  canceladas: ["cancelled"],
};
export function solicitudStatusRedundant(status: string, scheduledDate?: string | null): boolean {
  return SOLICITUD_PRIMARY[solicitudBucket(status, scheduledDate)]?.includes(status) ?? false;
}
const PROYECTO_PRIMARY: Record<string, string[]> = {
  pendientes: ["open"],
  confirmadas: ["in_progress"],
  finalizadas: ["completed"],
  canceladas: ["cancelled"],
};
export function proyectoStatusRedundant(status: string): boolean {
  return PROYECTO_PRIMARY[proyectoBucket(status)]?.includes(status) ?? false;
}
export function proposalStatusRedundant(proposalStatus: string, projectStatus?: string | null): boolean {
  if (proposalStatus === "pending") return true; // Pendientes
  if (proposalStatus === "declined") return true; // Canceladas (primary)
  if (proposalStatus === "accepted") {
    if (projectStatus === "in_progress") return true; // Confirmadas (primary)
    if (projectStatus === "completed") return true; // Finalizadas (primary)
  }
  return false; // accepted+awaiting (En espera), accepted+cancelled (Cancelada) → keep
}
