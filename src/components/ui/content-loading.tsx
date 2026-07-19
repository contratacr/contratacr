"use client";

import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden className={`ccr-delayed-loading ccr-skeleton-shimmer block ${className}`} />;
}

export function PanelSectionLoading(_props: { rows?: number } = {}) {
  void _props;
  return (
    <div className="ccr-delayed-loading flex min-h-24 items-center justify-center py-8" aria-busy="true" role="status">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent motion-reduce:animate-none" aria-label="Cargando" />
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
