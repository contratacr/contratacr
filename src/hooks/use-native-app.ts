"use client";

import { useEffect, useState } from "react";

const MOBILE_APP_HOSTS = new Set(["test.contratacr.com", "contratacr-mobile-test.vercel.app"]);

export function isMobileAppHost(hostname?: string): boolean {
  if (typeof window === "undefined" && !hostname) return false;

  const host = (hostname ?? window.location.hostname).toLowerCase();
  return MOBILE_APP_HOSTS.has(host) || host.endsWith(".contratacr-mobile-test.vercel.app");
}

export function isNativeAppRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return (
    Boolean(capacitor?.isNativePlatform?.()) ||
    isMobileAppHost() ||
    document.documentElement.classList.contains("ccr-native-app")
  );
}

export function useNativeApp(): boolean {
  const [nativeApp, setNativeApp] = useState(() => isNativeAppRuntime());

  useEffect(() => {
    if (nativeApp) return;
    const update = () => setNativeApp(isNativeAppRuntime());
    update();
    const id = window.setTimeout(update, 0);
    return () => window.clearTimeout(id);
  }, [nativeApp]);

  return nativeApp;
}
