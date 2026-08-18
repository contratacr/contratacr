"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

export function isNativeAppRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return (
    Capacitor.isNativePlatform() ||
    Boolean(capacitor?.isNativePlatform?.()) ||
    document.documentElement.classList.contains("ccr-native-app")
  );
}

export function useNativeApp(): boolean {
  const [nativeApp, setNativeApp] = useState(() => isNativeAppRuntime());

  useEffect(() => {
    if (nativeApp) return;
    const update = () => setNativeApp(isNativeAppRuntime());
    update();
    const timers = [0, 50, 250, 750].map((delay) => window.setTimeout(update, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [nativeApp]);

  return nativeApp;
}
