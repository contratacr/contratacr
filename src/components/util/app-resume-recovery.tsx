"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { APP_RESUME_EVENT } from "@/lib/app-events";
import { recoverBodyScrollLock } from "@/lib/body-scroll-lock";

const STALE_AFTER_MS = 60_000;
const RECOVERY_THROTTLE_MS = 2_000;

export function AppResumeRecovery() {
  const router = useRouter();
  const hiddenAtRef = useRef<number | null>(null);
  const lastRecoveryRef = useRef(0);

  useEffect(() => {
    const updateViewportVars = () => {
      const root = document.documentElement;
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const width = vv?.width ?? window.innerWidth;
      const top = vv?.offsetTop ?? 0;
      const left = vv?.offsetLeft ?? 0;
      const scale = vv?.scale ?? 1;
      const keyboardInset = Math.max(0, window.innerHeight - height - top);

      root.style.setProperty("--app-visual-viewport-height", `${height}px`);
      root.style.setProperty("--app-visual-viewport-width", `${width}px`);
      root.style.setProperty("--app-visual-viewport-top", `${top}px`);
      root.style.setProperty("--app-visual-viewport-left", `${left}px`);
      root.style.setProperty("--app-visual-viewport-center-y", `${top + height / 2}px`);
      root.style.setProperty("--app-visual-viewport-scale", `${scale}`);
      root.style.setProperty("--app-keyboard-inset-bottom", `${keyboardInset}px`);
      root.toggleAttribute("data-keyboard-open", keyboardInset > 80);
    };

    const markHidden = () => {
      hiddenAtRef.current ??= Date.now();
    };

    const dispatchRecoverySignals = () => {
      recoverBodyScrollLock();
      updateViewportVars();
      window.dispatchEvent(new Event(APP_RESUME_EVENT));
      window.dispatchEvent(new Event("resize"));
      document.documentElement.classList.add("ccr-app-resuming");
      window.requestAnimationFrame(updateViewportVars);
      window.setTimeout(updateViewportVars, 80);
      window.setTimeout(updateViewportVars, 250);
      window.setTimeout(() => document.documentElement.classList.remove("ccr-app-resuming"), 350);
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
      hiddenAtRef.current ??= Date.now() - STALE_AFTER_MS;
      recover(event.persisted);
    };

    const onFocus = () => recover();
    const onOnline = () => recover(true);
    const onPageHide = () => markHidden();

    if (document.visibilityState === "hidden") markHidden();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
