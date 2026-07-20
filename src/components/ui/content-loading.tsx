"use client";

import type { ElementType, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden className={`ccr-delayed-loading ccr-skeleton-shimmer block ${className}`} />;
}

export function BrandLoadingMark({ className, children }: { className?: string; children?: ReactNode } = {}) {
  return (
    <div className={cn("ccr-delayed-loading grid place-items-center", className)} aria-busy="true" role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark-transparent.png" alt="" width={60} height={60} className="ccr-brand-loading-mark" />
      {children ?? <span className="sr-only">Cargando</span>}
    </div>
  );
}

export function PanelSectionLoading(_props: { rows?: number } = {}) {
  void _props;
  return (
    <div className="ccr-delayed-loading ccr-panel-section-loading flex min-h-24 items-center justify-center py-8" aria-busy="true" role="status">
      <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" aria-label="Cargando" />
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
    <div className={cn("flex min-h-[20rem] flex-col items-center justify-center px-4 py-16 text-center sm:min-h-[22rem]", className)}>
      <Icon className="mx-auto mb-3 h-12 w-12 text-[#e5e7eb]" />
      <p className="font-semibold text-[#374151]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[#6b7280]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
