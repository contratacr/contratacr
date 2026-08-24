"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativeAppRuntime } from "@/hooks/use-native-app";

function shouldLogRoute(pathname: string | null) {
  const path = pathname ?? "";
  return /\/(?:ofertas|empleos|buscar|login|registro|mensajes|soporte)(?:\/|$)/.test(path);
}

function errorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 1800) ?? null,
    };
  }
  return { message: String(error) };
}

export function NativeDebugLogger() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeAppRuntime() || !shouldLogRoute(pathname)) return;

    const nav = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    console.info("[native-debug] route", {
      pathname,
      href: window.location.href,
      readyState: document.readyState,
      visibility: document.visibilityState,
      navType: nav?.type ?? null,
      userAgent: navigator.userAgent,
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        visualWidth: window.visualViewport?.width ?? null,
        visualHeight: window.visualViewport?.height ?? null,
      },
    });

    const onError = (event: ErrorEvent) => {
      console.error("[native-debug] window-error", {
        pathname: window.location.pathname,
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        error: errorPayload(event.error),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("[native-debug] unhandled-rejection", {
        pathname: window.location.pathname,
        reason: errorPayload(event.reason),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [pathname]);

  return null;
}
