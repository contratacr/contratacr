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

