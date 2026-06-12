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
}: {
  tabs: readonly FilterTab[];
  value: string;
  onChange: (id: string) => void;
}) {
  const tr = useTranslations("statusTabs");
  return (
    <div className="flex gap-1.5 flex-wrap">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-colors",
            value === tab.id ? "bg-[#009FD9] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
          )}
        >
          {tr(tab.id)}
        </button>
      ))}
    </div>
  );
}

// Canonical tab sets (consistent labels everywhere). No "Todas/Todos" — the
// status tabs already cover every lifecycle state, so an all-bucket only added
// noise. Default to the most relevant ACTIVE tab in each consumer.
export const SOLICITUD_TABS: readonly FilterTab[] = [
  { id: "activas" },
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

// Status → group helpers (one source of truth for both panels).
const SOLICITUD_ACTIVE = ["pending", "confirmed", "in_progress", "awaiting_confirmation"];
export function solicitudMatches(filter: string, status: string): boolean {
  if (filter === "activas") return SOLICITUD_ACTIVE.includes(status);
  if (filter === "finalizadas") return status === "completed";
  if (filter === "canceladas") return status === "cancelled" || status === "rescheduled";
  return true; // todas
}
const PROYECTO_ACTIVE = ["open", "in_progress", "awaiting_confirmation"];
export function proyectoMatches(filter: string, status: string): boolean {
  if (filter === "activos") return PROYECTO_ACTIVE.includes(status);
  if (filter === "finalizados") return status === "completed";
  if (filter === "cancelados") return status === "cancelled";
  return true; // todos
}
