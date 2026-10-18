"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { prefijoDeIdioma, sinPrefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { rutaInternaSegura } from "@/lib/navigation/ruta-interna";

function inPanel() {
  const path = sinPrefijoDeIdioma(window.location.pathname);
  // This deep link belongs to the native sign-in bridge, not the account UI.
  if (path === "/dashboard/native-auth-return") return false;
  return path === "/dashboard" || path.startsWith("/dashboard/");
}

// Safari can render the registration response after a history redirect while
// retaining the panel URL. This must live above page/locale layouts so it also
// runs on the redirected form and corrects the URL before registration resumes.
export function RegistrationRecovery() {
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    let version = 0;
    let controller: AbortController | null = null;
    const reconcile = () => {
      controller?.abort();
      const current = ++version;
      if (!active || !inPanel()) return;
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 12_000);
      void (async () => {
        try {
          const response = await fetch("/api/auth/registration-state", { cache: "no-store", signal: request.signal });
          if (!response.ok || !active || current !== version || !inPanel()) return;
          const state = await response.json() as { complete?: boolean; destination?: string };
          const next = rutaInternaSegura(state.destination);
          if (active && current === version && inPanel() && state.complete === false && next) {
            const locale = window.location.pathname.startsWith("/en/") || document.documentElement.lang === "en" ? "en" : "es";
            window.location.replace(`${prefijoDeIdioma(locale)}${next}`);
          }
        } finally { window.clearTimeout(timeout); }
      })().catch(() => { /* Keep a valid session during a temporary outage. */ });
    };
    const visible = () => { if (document.visibilityState === "visible") reconcile(); };
    reconcile();
    window.addEventListener("pageshow", reconcile);
    window.addEventListener("popstate", reconcile);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("pageshow", reconcile);
      window.removeEventListener("popstate", reconcile);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [pathname]);
  return null;
}
