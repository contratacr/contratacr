"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { APP_RESUME_EVENT } from "@/lib/app-events";

const RECOVERY_THROTTLE_MS = 2_000;

export function AppResumeRecovery() {
  const router = useRouter();
  const lastRecoveryRef = useRef(0);
  // Solo un corte de red REAL justifica reconciliar contra el servidor: al
  // volver de segundo plano iOS dispara `online` sin haber estado sin red.
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const path = window.location.pathname;
    const locale = path.startsWith("/en") ? "en" : "es";
    const localeRoot = path === `/${locale}` || path === `/${locale}/`;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    const isRecoveryHash =
      hashParams.get("type") === "recovery" ||
      (!!hashParams.get("access_token") && !!hashParams.get("refresh_token"));
    const hasRecoveryCode = localeRoot && !!searchParams.get("code");

    if (localeRoot && isRecoveryHash) {
      window.location.replace(`/${locale}/reset-password${window.location.hash}`);
      return;
    }

    if (hasRecoveryCode) {
      window.location.replace(`/${locale}/reset-password${window.location.search}`);
      return;
    }

    const recover = (forceRefresh = false) => {
      if (document.visibilityState === "hidden") return;

      const now = Date.now();
      window.dispatchEvent(new Event(APP_RESUME_EVENT));

      if (forceRefresh) {
        if (now - lastRecoveryRef.current < RECOVERY_THROTTLE_MS) return;
        lastRecoveryRef.current = now;
        // Let Supabase resume its token refresh first, then reconcile server data.
        window.setTimeout(() => router.refresh(), 100);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      recover();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      recover(event.persisted);
    };

    const onFocus = () => recover();
    const onOffline = () => {
      wasOfflineRef.current = true;
    };
    const onOnline = () => {
      const force = wasOfflineRef.current;
      wasOfflineRef.current = false;
      recover(force);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
