"use client";

import { cn } from "@/lib/utils";

// Shared pill status-filter tabs — used identically in the client and professional
// panels for solicitudes and proyectos so both feel the same.
export type FilterTab = { id: string; label: string };

export function StatusFilterTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly FilterTab[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-colors",
            value === t.id ? "bg-[#009FD9] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Canonical tab sets (consistent labels everywhere). No "Todas/Todos" — the
// status tabs already cover every lifecycle state, so an all-bucket only added
// noise. Default to the most relevant ACTIVE tab in each consumer.
export const SOLICITUD_TABS: readonly FilterTab[] = [
  { id: "activas", label: "Activas" },
  { id: "finalizadas", label: "Finalizadas" },
  { id: "canceladas", label: "Canceladas" },
];

export const PROYECTO_TABS: readonly FilterTab[] = [
  { id: "abiertos", label: "Abiertos" },
  { id: "encurso", label: "En curso" },
  { id: "finalizados", label: "Finalizados" },
  { id: "cancelados", label: "Cancelados" },
];

// Status → group helpers (one source of truth for both panels).
const SOLICITUD_ACTIVE = ["pending", "confirmed", "in_progress", "awaiting_confirmation"];
export function solicitudMatches(filter: string, status: string): boolean {
  if (filter === "activas") return SOLICITUD_ACTIVE.includes(status);
  if (filter === "finalizadas") return status === "completed";
  if (filter === "canceladas") return status === "cancelled" || status === "rescheduled";
  return true; // todas
}
export function proyectoMatches(filter: string, status: string): boolean {
  if (filter === "abiertos") return status === "open";
  if (filter === "encurso") return status === "in_progress" || status === "awaiting_confirmation";
  if (filter === "finalizados") return status === "completed";
  if (filter === "cancelados") return status === "cancelled";
  return true; // todos
}
