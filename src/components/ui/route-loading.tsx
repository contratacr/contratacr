"use client";

import { BrandLoadingMark } from "@/components/ui/content-loading";
import { isSigningOut } from "@/lib/auth/sign-out";
import { LOADING_MARK_HANDOFF_SCRIPT } from "@/lib/loading-mark-handoff";

export function DashboardRouteLoading() {
  return <PageRouteLoading />;
}

export function PageRouteLoading() {
  if (isSigningOut()) return null;

  return (
    <>
      <BrandLoadingMark className="ccr-page-route-loading fixed inset-0 z-[200] bg-[#f4f7fa] text-[#162543]" />
      <script dangerouslySetInnerHTML={{ __html: LOADING_MARK_HANDOFF_SCRIPT }} />
    </>
  );
}
