"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { rutaInternaSegura } from "@/lib/navigation/ruta-interna";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { useAuth } from "@/hooks/use-auth";
import { pendingRegistrationPath, registrationComplete } from "@/lib/auth/registration-state";
import { LienzoNeutro } from "@/components/ui/section-skeletons";

// Middleware cannot run when Back restores a cached client route. Keep the same
// check mounted in the panel so a connected identity is not a completed account.
export function RegistrationGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname();
  const pending = !!user && !registrationComplete(user.user_metadata);
  const destination = pendingRegistrationPath(user?.user_metadata);
  useEffect(() => {
    if (loading || !pending) return;
    const resume = () => router.replace(destination);
    resume();
    window.addEventListener("pageshow", resume);
    window.addEventListener("popstate", resume);
    return () => {
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("popstate", resume);
    };
  }, [loading, pending, destination, pathname, router]);
  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    let requestController: AbortController | null = null;
    const reconcile = () => {
      if (!active) return;
      requestController?.abort();
      const version = ++requestVersion;
      void (async () => {
        const controller = new AbortController();
        requestController = controller;
        const timeout = window.setTimeout(() => controller.abort(), 12_000);
        try {
          // First-party, uncached server truth also avoids a restored browser
          // SDK/session snapshot or a suspended auth lock on Safari.
          const response = await fetch("/api/auth/registration-state", { cache: "no-store", signal: controller.signal });
          if (!response.ok || !active || version !== requestVersion) return;
          const state = await response.json() as { complete?: boolean; destination?: string };
          const next = rutaInternaSegura(state.destination);
          if (active && version === requestVersion && state.complete === false && next) {
            window.location.replace(`${prefijoDeIdioma(locale)}${next}`);
          }
        } finally { window.clearTimeout(timeout); }
      })().catch(() => { /* Network failure must not discard a valid session. */ });
    };
    const restored = () => reconcile();
    const visible = () => { if (document.visibilityState === "visible") reconcile(); };
    // Safari may restore cached HTML before React installs pageshow/popstate
    // listeners. Validate on mount/reactivation as well as on those events.
    reconcile();
    window.addEventListener("pageshow", restored);
    window.addEventListener("popstate", reconcile);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      requestController?.abort();
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("popstate", reconcile);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [locale, pathname, user?.id, user?.updated_at]);
  if (loading || pending) return <LienzoNeutro />;
  return children;
}
