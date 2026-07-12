"use client";

import { useLocale } from "next-intl";

const pulse = "animate-pulse motion-reduce:animate-none";

export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden className={`ccr-delayed-loading ${pulse} block bg-[#e9eef3] ${className}`} />;
}

export function PanelSectionLoading(_props: { rows?: number } = {}) {
  void _props;
  const locale = useLocale();
  const label = locale === "en" ? "Loading..." : "Cargando...";
  return (
    <div className="ccr-delayed-loading flex min-h-24 items-center justify-center py-6" aria-busy="true" role="status">
      <div className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-medium text-[#4b5563] shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1 ring-[#e5e9ed]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#009FD9] motion-reduce:animate-none" aria-hidden />
        <span>{label}</span>
      </div>
    </div>
  );
}
