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

    const recover = (forceRefresh = false) => {
      if (document.visibilityState === "hidden") return;

      const now = Date.now();
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      if (now - lastRecoveryRef.current < RECOVERY_THROTTLE_MS) return;
      lastRecoveryRef.current = now;

      window.dispatchEvent(new Event(APP_RESUME_EVENT));

      if (forceRefresh || (hiddenAt !== null && now - hiddenAt >= STALE_AFTER_MS)) {
        window.requestAnimationFrame(() => router.refresh());
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

    if (document.visibilityState === "hidden") markHidden();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
