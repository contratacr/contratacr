"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeAppRuntime } from "@/hooks/use-native-app";

function isSearchPath(pathname: string) {
  return /(^|\/)buscar(\/|$)/.test(pathname);
}

export function MobileAppBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    document.documentElement.classList.add("ccr-native-app");
    document.body.classList.add("ccr-native-app");

    const capacitor = window as unknown as {
      Capacitor?: { Plugins?: { SplashScreen?: { hide?: () => Promise<void> } } };
    };
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void capacitor.Capacitor?.Plugins?.SplashScreen?.hide?.().catch(() => {});
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      document.documentElement.classList.remove("ccr-native-app");
      document.body.classList.remove("ccr-native-app");
    };
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) return;
    const webParity = isSearchPath(pathname);
    document.documentElement.classList.toggle("ccr-native-search-route", webParity);
    document.body.classList.toggle("ccr-native-search-route", webParity);
    document.documentElement.classList.toggle("ccr-native-web-parity", webParity);
    document.body.classList.toggle("ccr-native-web-parity", webParity);
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
