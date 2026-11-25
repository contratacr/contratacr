"use client";

import { Briefcase, FolderOpen, Megaphone, ShieldAlert, Star, User, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, type ReportPriority, type ReportStatus } from "@/lib/moderation/report-cases";

// Piezas visuales compartidas por la cola y el detalle de "Reportes y moderación".

export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] focus-visible:ring-offset-2";
export const BTN_PRIMARY = cn("inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#087ca3] px-4 text-sm font-bold text-white transition hover:bg-[#066a8c] disabled:cursor-not-allowed disabled:opacity-50", FOCUS);
export const BTN_SECONDARY = cn("inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#d7e1ea] bg-white px-3 text-sm font-semibold text-[#162543] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50", FOCUS);
export const BTN_DANGER = cn("inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#b91c1c] px-4 text-sm font-bold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:opacity-50", FOCUS);
export const FIELD = cn("block w-full rounded-lg border border-[#d7e1ea] bg-white px-3 py-2 text-sm text-[#162543] placeholder:text-[#68778d]", FOCUS);
export const LINK = cn("inline-flex min-h-10 items-center gap-1 rounded text-sm font-semibold text-[#087ca3] hover:underline", FOCUS);

const PRIORITY_CLASS: Record<ReportPriority, string> = {
  urgent: "bg-[#fee2e2] text-[#b91c1c]",
  high: "bg-[#fef3c7] text-[#92400e]",
  normal: "bg-[#eef2f6] text-[#374151]",
};

export function PriorityChip({ priority }: { priority: ReportPriority }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", PRIORITY_CLASS[priority])}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", priority === "urgent" ? "bg-[#dc2626]" : priority === "high" ? "bg-[#d97706]" : "bg-[#94a3b8]")} />
      Prioridad {PRIORITY_LABEL[priority].toLowerCase()}
    </span>
  );
}

export function StatusChip({ status }: { status: ReportStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", status === "open" ? "bg-[#e0f2fe] text-[#075985]" : "bg-[#dcfce7] text-[#166534]")}>
      {status === "open" ? "Abierto" : "Resuelto"}
    </span>
  );
}

const KIND_ICON: Record<string, typeof User> = {
  professional: UserRound,
  account: User,
  review: Star,
  job: Briefcase,
  project: FolderOpen,
  offer: Megaphone,
};

export function KindIcon({ kind, className }: { kind: string | null; className?: string }) {
  const Icon = KIND_ICON[kind || ""] ?? ShieldAlert;
  return <Icon aria-hidden className={className} />;
}

export function KindTag({ kind, label }: { kind: string | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#334155]">
      <KindIcon kind={kind} className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

/** Control segmentado accesible (botones con aria-pressed). */
export function Segmented<T extends string>({ label, options, value, onChange, disabled }: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]" aria-hidden>{label}</span>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-[#f1f5f9] p-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "min-h-10 rounded-lg px-3 text-[13px] font-semibold transition disabled:opacity-50",
                FOCUS,
                active ? "bg-white text-[#087ca3] shadow-sm" : "text-[#475569] hover:text-[#162543]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
