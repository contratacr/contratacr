"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLoadingMark } from "@/components/ui/content-loading";
import { useNativeApp } from "@/hooks/use-native-app";
import { useTranslations } from "next-intl";

export function FormLoadingState({ label, minHeight = "min-h-[360px]" }: { label?: string; minHeight?: string }) {
  const nativeApp = useNativeApp();
  const t = useTranslations("loading");
  const resolvedLabel = label ?? t("generic");
  if (nativeApp) {
    return (
      <BrandLoadingMark className={cn("ccr-form-loading-state px-5 py-10 sm:px-6", minHeight)}>
        <span className="sr-only">{resolvedLabel}</span>
      </BrandLoadingMark>
    );
  }
  return (
    <div className={cn("ccr-delayed-loading ccr-form-loading-state flex flex-1 items-center justify-center px-5 py-10 sm:px-6", minHeight)}>
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" />
        <p className="text-sm font-medium text-[#6b7280]">{resolvedLabel}</p>
      </div>
    </div>
  );
}

export function CardListSkeleton({ rows = 3, withFilters = true, label, className }: { rows?: number; withFilters?: boolean; label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      {label ? (
        <div className="flex items-center gap-2 text-sm font-medium text-[#6b7280]">
          <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />
          <span>{label}</span>
        </div>
      ) : null}
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
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-[#eaf7fd]" />
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
