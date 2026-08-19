"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { NATIVE_ONBOARDING_COMPLETED_KEY } from "@/lib/mobile-onboarding";

function isSearchPath(pathname: string) {
  return /(^|\/)buscar(\/|$)/.test(pathname);
}

function isNativeMarketplaceListPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const withoutLocale = normalized.replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
  return withoutLocale === "/ofertas" || withoutLocale === "/empleos";
}

function getNativeLocalizedPath(pathname: string) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (/^\/(?:es|en)(?=\/|$)/.test(normalized)) return normalized;

  const currentLocale = window.location.pathname.match(/^\/(es|en)(?=\/|$)/)?.[1] ?? "es";
  return `/${currentLocale}${normalized}`;
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

    if (!firstRunPending) {
      hideAfterPaint();
    }

    return () => {
      cancelled = true;
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

    const onNativeMarketplaceClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;

      let url: URL;
      try {
        url = new URL(rawHref, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (!isNativeMarketplaceListPath(url.pathname)) return;

      const targetPath = getNativeLocalizedPath(url.pathname);
      const targetHref = `${targetPath}${url.search}${url.hash}`;
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (targetHref === currentHref) return;

      event.preventDefault();
      event.stopPropagation();
      // Marketplace list pages are server-rendered. In the native WebView, SPA
      // transitions to these routes can race the RSC payload and land on the
      // global error screen, while a full localized navigation loads cleanly.
      window.location.assign(targetHref);
    };

    document.addEventListener("click", onNativeMarketplaceClick, true);
    return () => document.removeEventListener("click", onNativeMarketplaceClick, true);
  }, []);

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
