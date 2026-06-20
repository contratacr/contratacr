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
}: {
  tabs: readonly FilterTab[];
  value: string;
  onChange: (id: string) => void;
  /** Per-tab item count. When provided, EVERY tab shows its count (including 0). */
  counts?: Record<string, number>;
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
            {tr(tab.id)}
            {counts && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[11px] font-bold leading-none",
                  active ? "bg-white/25 text-white" : "bg-[#eef1f4] text-[#6b7280]"
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

// The ONE canonical 4-bucket tab set, shared by solicitudes AND proyectos so the
// two read identically. "Activas/Activos" was dropped — it was ambiguous (it merged
// pendientes with confirmadas). Pendientes leads (it's what needs action).
const STATUS_TABS: readonly FilterTab[] = [
  { id: "pendientes" },
  { id: "confirmadas" },
  { id: "finalizadas" },
  { id: "canceladas" },
];
export const SOLICITUD_TABS = STATUS_TABS;
export const PROYECTO_TABS = STATUS_TABS;

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
  if (status === "pending") return "pendientes";
  if (isPastAppointment(scheduledDate)) return "finalizadas";
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
