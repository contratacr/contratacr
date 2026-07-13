"use client";

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
