"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export const APP_RESUME_EVENT = "contratacr:app-resume";

const STALE_AFTER_MS = 60_000;
const RECOVERY_THROTTLE_MS = 2_000;

export function AppResumeRecovery() {
  const router = useRouter();
  const hiddenAtRef = useRef<number | null>(null);
  const lastRecoveryRef = useRef(0);

  useEffect(() => {
    const markHidden = () => {
      hiddenAtRef.current ??= Date.now();
    };

    const dispatchRecoverySignals = () => {
      window.dispatchEvent(new Event(APP_RESUME_EVENT));
      window.dispatchEvent(new Event("resize"));
      document.documentElement.classList.add("ccr-app-resuming");
      window.setTimeout(() => document.documentElement.classList.remove("ccr-app-resuming"), 250);
    };

    const recover = (forceRefresh = false) => {
      if (document.visibilityState === "hidden") return;

      const now = Date.now();
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      if (now - lastRecoveryRef.current < RECOVERY_THROTTLE_MS) return;
      lastRecoveryRef.current = now;

      dispatchRecoverySignals();

      if (forceRefresh || (hiddenAt !== null && now - hiddenAt >= STALE_AFTER_MS)) {
        window.requestAnimationFrame(() => {
          router.refresh();
          window.setTimeout(dispatchRecoverySignals, 250);
        });
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markHidden();
        return;
      }
      recover();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      recover(event.persisted);
    };

    const onFocus = () => recover();
    const onOnline = () => recover(true);

    if (document.visibilityState === "hidden") markHidden();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
