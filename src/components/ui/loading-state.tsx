"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function FormLoadingState({ label, minHeight = "min-h-[360px]" }: { label?: string; minHeight?: string }) {
  const t = useTranslations("loading");
  const resolvedLabel = label ?? t("generic");
  // Un formulario que carga se anuncia con la silueta de sus campos, no con
  // una ruedita: etiqueta corta, campo, etiqueta, campo y el botón al final.
  return (
    <div className={cn("ccr-delayed-loading ccr-form-loading-state flex-1 px-5 py-8 sm:px-6", minHeight)} aria-busy="true" role="status">
      <span className="sr-only">{resolvedLabel}</span>
      <div className="mx-auto w-full max-w-md space-y-4">
        <span className="ccr-skeleton-shimmer block h-3.5 w-1/3 rounded-full" />
        <span className="ccr-skeleton-shimmer block h-11 w-full rounded-xl" />
        <span className="ccr-skeleton-shimmer block h-3.5 w-2/5 rounded-full" />
        <span className="ccr-skeleton-shimmer block h-11 w-full rounded-xl" />
        <span className="ccr-skeleton-shimmer block h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function CardListSkeleton({ rows = 3, withFilters = true, label, className }: { rows?: number; withFilters?: boolean; label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      {label ? <p className="text-sm font-medium text-[#6b7280]">{label}</p> : null}
      {withFilters ? (
        <div className="flex gap-2 rounded-2xl bg-[#f3f4f6] p-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 flex-1 animate-pulse rounded-xl bg-white/80" />
          ))}
        </div>
      ) : null}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl ccr-caja-icono" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-[#eef2f6]" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-[#f1f5f9]" />
              <div className="h-3 w-3/4 animate-pulse rounded-full bg-[#f1f5f9]" />
            </div>
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-[#f8fafc]" />
          </div>
        </div>
      ))}
    </div>
  );
}
