"use client";

import { BrandLoadingMark } from "@/components/ui/content-loading";

export function DashboardRouteLoading() {
  return <PageRouteLoading />;
}

export function PageRouteLoading() {
  return (
    <BrandLoadingMark className="ccr-page-route-loading fixed inset-0 z-[200] bg-[#f4f7fa] text-[#162543]" />
  );
}
