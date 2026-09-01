"use client";

import { BrandLoadingMark } from "@/components/ui/content-loading";
import { isSigningOut } from "@/lib/auth/sign-out";
import { LOADING_MARK_HANDOFF_SCRIPT } from "@/lib/loading-mark-handoff";

export function DashboardRouteLoading() {
  return <PageRouteLoading />;
}

export function PageRouteLoading() {
  if (isSigningOut()) return null;

  // Al cambiar de idioma la pantalla no se está cargando de cero: mostrar la
  // marca de carga haría parpadear algo que ya estaba ahí.
  if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-locale-switch")) {
    return <div className="ccr-page-route-loading fixed inset-0 z-[200] bg-[#f4f7fa]" aria-hidden />;
  }

  return (
    <>
      <BrandLoadingMark className="ccr-page-route-loading fixed inset-0 z-[200] bg-[#f4f7fa] text-[#162543]" />
      <script dangerouslySetInnerHTML={{ __html: LOADING_MARK_HANDOFF_SCRIPT }} />
    </>
  );
}
