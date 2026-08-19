"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { NATIVE_ONBOARDING_COMPLETED_KEY } from "@/lib/mobile-onboarding";

function isSearchPath(pathname: string) {
  return /(^|\/)buscar(\/|$)/.test(pathname);
}

export function MobileAppBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    document.documentElement.classList.add("ccr-native-app");
    document.body.classList.add("ccr-native-app");

    const firstRunPending = window.localStorage.getItem(NATIVE_ONBOARDING_COMPLETED_KEY) !== "1";

    if (firstRunPending) {
      document.documentElement.classList.add("ccr-native-first-run-pending");
    }

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let observer: MutationObserver | null = null;

    const hideSplash = () => {
      if (cancelled) return;
      void import("@capacitor/splash-screen")
        .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 0 }))
        .catch(() => {});
    };

    const hideAfterPaint = () => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(hideSplash);
      });
    };

    if (firstRunPending) {
      const readySelector = '[data-testid="native-first-run-onboarding"][data-native-onboarding-ready="true"]';
      const firstRunScreenReady = () => Boolean(document.querySelector(readySelector));

      if (firstRunScreenReady()) {
        hideAfterPaint();
      } else {
        observer = new MutationObserver(() => {
          if (!firstRunScreenReady()) return;
          observer?.disconnect();
          hideAfterPaint();
        });
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-native-onboarding-ready"],
          childList: true,
          subtree: true,
        });
      }
    } else {
      hideAfterPaint();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      document.documentElement.classList.remove("ccr-native-app");
      document.body.classList.remove("ccr-native-app");
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    const isSearchRoute = isSearchPath(pathname);
    document.documentElement.classList.toggle("ccr-native-search-route", isSearchRoute);
    document.body.classList.toggle("ccr-native-search-route", isSearchRoute);
    document.documentElement.classList.remove("ccr-native-web-parity");
    document.body.classList.remove("ccr-native-web-parity");
    return () => {
      document.documentElement.classList.remove("ccr-native-search-route");
      document.body.classList.remove("ccr-native-search-route");
      document.documentElement.classList.remove("ccr-native-web-parity");
      document.body.classList.remove("ccr-native-web-parity");
    };
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    let haptics: typeof import("@capacitor/haptics")["Haptics"] | null = null;

    void import("@capacitor/haptics")
      .then((mod) => {
        haptics = mod.Haptics;
      })
      .catch(() => {});

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest("button, a, [role='button']");
      if (!action || action.getAttribute("aria-disabled") === "true") return;
      void haptics?.selectionStart().catch(() => {});
    };

    const onPointerUp = () => {
      void haptics?.selectionEnd().catch(() => {});
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerup", onPointerUp, { passive: true });
    document.addEventListener("pointercancel", onPointerUp, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return null;
}
