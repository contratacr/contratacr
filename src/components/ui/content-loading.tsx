"use client";

import type { ElementType, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { LoadingMarkImage } from "@/components/ui/loading-mark-image";

export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden className={`ccr-delayed-loading ccr-skeleton-shimmer block ${className}`} />;
}

export function BrandLoadingMark({ className, children }: { className?: string; children?: ReactNode } = {}) {
  const t = useTranslations("loading");
  return (
    <div className={cn("grid place-items-center", className)} aria-busy="true" role="status">
      <LoadingMarkImage />
      {children ?? <span className="sr-only">{t("generic")}</span>}
    </div>
  );
}

export function PanelSectionLoading({ title, description, className }: { rows?: number; title?: ReactNode; description?: ReactNode; className?: string } = {}) {
  const t = useTranslations("loading");
  return (
    <div data-panel-loading="" className={cn("ccr-delayed-loading ccr-panel-section-loading flex min-h-[14rem] flex-col items-center justify-center gap-2 px-4 py-8 text-center sm:min-h-[16rem]", className)} aria-busy="true" role="status">
      <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" aria-hidden />
      <div>
        <p className="text-sm font-extrabold text-[#162543]">{title ?? t("generic")}</p>
        {description && <p className="mt-1 text-xs font-medium text-[#6b7280]">{description}</p>}
      </div>
    </div>
  );
}

export function PanelListSkeleton({
  rows = 3,
  withTabs = false,
  withSearch = false,
  hasData = false,
  className,
}: {
  rows?: number;
  withTabs?: boolean;
  withSearch?: boolean;
  /** Only draw record-shaped placeholders when this section already has records. */
  hasData?: boolean;
  className?: string;
}) {
  const t = useTranslations("loading");
  if (!hasData) {
    // The first request cannot know whether this collection is empty yet. Keep
    // a visible, stable loading surface in the panel instead of returning null:
    // returning null leaves the section header above a blank card until the
    // network request resolves (and can last several seconds on a cold load).
    return <PanelSectionLoading className={className} />;
  }

  return (
    <div data-panel-loading="" className={cn("ccr-delayed-loading space-y-4", className)} aria-busy="true" role="status">
      <span className="sr-only">{t("generic")}</span>
      {withSearch && (
        <div className="rounded-2xl border border-[#e5edf4] bg-white p-3 shadow-sm">
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      )}
      {withTabs && (
        <div className="flex w-full max-w-md gap-1 rounded-2xl bg-[#eef3f7] p-1">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-[#dfe8f0] bg-white p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.7)] sm:p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <Skeleton className="h-4 w-2/3 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
                <Skeleton className="h-3 w-5/6 rounded-full" />
              </div>
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PanelEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: ElementType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ccr-empty-state flex min-h-[20rem] flex-col items-center justify-center px-4 py-16 text-center sm:min-h-[22rem]", className)}>
      <Icon className="mx-auto mb-3 h-12 w-12 text-[#e5e7eb]" />
      <p className="font-semibold text-[#374151]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[#6b7280]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
