"use client";

import { BrandLoadingMark } from "@/components/ui/content-loading";
import { isSigningOut } from "@/lib/auth/sign-out";
import { LOADING_MARK_HANDOFF_SCRIPT } from "@/lib/loading-mark-handoff";

export function DashboardRouteLoading() {
  return <PageRouteLoading />;
}

export function PageRouteLoading() {
  if (isSigningOut()) return null;

  // Dentro de la app la marca NUNCA se pinta desde la web: la marca es del
  // splash nativo del arranque. Cualquier otra espera (recarga del WebView por
  // memoria, salida hacia login, OAuth) muestra el lienzo neutro de la app.
  if (typeof document !== "undefined" && document.documentElement.classList.contains("ccr-native-app")) {
    return (
      <div className="ccr-page-route-loading fixed inset-0 z-[200] bg-[#f4f7fa]" aria-busy="true" role="status">
        <div className="h-16 bg-white shadow-[0_1px_0_#e5e7eb]" />
        <span className="sr-only">Cargando…</span>
      </div>
    );
  }

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
