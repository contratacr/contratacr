"use client";

import { BrandLoadingMark } from "@/components/ui/content-loading";
import { isSigningOut } from "@/lib/auth/sign-out";

export function DashboardRouteLoading() {
  return <PageRouteLoading />;
}

export function PageRouteLoading() {
  if (isSigningOut()) return null;

  return (
    <BrandLoadingMark className="ccr-page-route-loading fixed inset-0 z-[100000] bg-[#f4f7fa] text-[#162543]" />
  );
}
