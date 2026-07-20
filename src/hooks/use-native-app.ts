"use client";

import { useEffect, useState } from "react";

export function isNativeAppRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.()) || document.documentElement.classList.contains("ccr-native-app");
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
