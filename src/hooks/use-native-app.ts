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

// While a full-height overlay (a task modal, a photo viewer) is open on a phone
// in the app, the native chrome (app header + bottom nav) must not float above
// it. This marks the layer; the shell CSS hides the chrome for it.
export function useNativeFullscreenLayer(active: boolean) {
  useEffect(() => {
    if (!active || !isNativeAppRuntime()) return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const roots = [document.documentElement, document.body];
    for (const root of roots) root.classList.add("ccr-native-fullscreen-layer");
    return () => {
      for (const root of roots) root.classList.remove("ccr-native-fullscreen-layer");
    };
  }, [active]);
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
