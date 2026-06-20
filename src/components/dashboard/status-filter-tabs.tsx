"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Shared pill status-filter tabs — used identically in the client and professional
// panels for solicitudes and proyectos so both feel the same.
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
  /** Optional per-tab count badge (e.g. Pendientes needing action). 0/undefined → no badge. */
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
            {count > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[11px] font-bold leading-none",
                  active ? "bg-white/25 text-white" : "bg-amber-50 text-amber-700"
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

// Canonical SOLICITUD tabs (consistent labels everywhere). "Activas" was dropped —
// it was ambiguous (it merged Pendientes with Confirmadas). Pendientes leads (it's
// what needs the professional's action) and carries the count badge; Confirmadas is
// the upcoming agenda; a confirmed appointment whose date has passed falls to
// Finalizadas automatically (see solicitudBucket).
export const SOLICITUD_TABS: readonly FilterTab[] = [
  { id: "pendientes" },
  { id: "confirmadas" },
  { id: "finalizadas" },
  { id: "canceladas" },
];

// Projects use the SAME three-bucket scheme as solicitudes (Activos / Finalizados
// / Cancelados) so both panels read identically. "Activos" covers every live
// state — open (receiving proposals), assigned, and awaiting confirmation — and
// the per-card status badge ("Abierto" vs "En curso · Asignado") keeps the
// finer distinction visible without an extra confusing tab.
export const PROYECTO_TABS: readonly FilterTab[] = [
  { id: "activos" },
  { id: "finalizados" },
  { id: "cancelados" },
];

// A booking's appointment day has fully passed (compared to now, end-of-day).
function isPastAppointment(scheduledDate?: string | null): boolean {
  if (!scheduledDate) return false;
  const [y, m, d] = scheduledDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime() < Date.now();
}

// Status (+ scheduled date) → the four solicitud buckets. One source of truth for
// both panels. A CONFIRMED/in-progress appointment whose date already passed is
// treated as Finalizada (the pro's agenda only shows upcoming confirmadas).
export function solicitudBucket(status: string, scheduledDate?: string | null): string {
  if (status === "cancelled" || status === "rescheduled") return "canceladas";
  if (status === "completed" || status === "awaiting_confirmation") return "finalizadas";
  if (status === "pending") return "pendientes";
  // confirmed | in_progress
  if (isPastAppointment(scheduledDate)) return "finalizadas";
  return "confirmadas";
}
export function solicitudMatches(filter: string, status: string, scheduledDate?: string | null): boolean {
  return solicitudBucket(status, scheduledDate) === filter;
}

const PROYECTO_ACTIVE = ["open", "in_progress", "awaiting_confirmation"];
export function proyectoMatches(filter: string, status: string): boolean {
  if (filter === "activos") return PROYECTO_ACTIVE.includes(status);
  if (filter === "finalizados") return status === "completed";
  if (filter === "cancelados") return status === "cancelled";
  return true; // todos
}
