"use client";

import { isSigningOut } from "@/lib/auth/sign-out";

export function DashboardRouteLoading() {
  return <PageRouteLoading />;
}

/**
 * Espera entre pantallas: lienzo neutro con la barra, nunca la marca. El
 * logotipo a pantalla completa hacía ver cada navegación como un arranque; el
 * contenido que tarda se dibuja con esqueletos en su propia sección.
 */
export function PageRouteLoading() {
  if (isSigningOut()) return null;
  return (
    <div className="ccr-page-route-loading fixed inset-0 z-[200] bg-[#f4f7fa]" aria-busy="true" role="status">
      <div className="h-16 bg-white shadow-[0_1px_0_#e5e7eb]" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
