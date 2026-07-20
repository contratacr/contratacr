"use client";

import { useState } from "react";

export function isNativeAppRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

export function useNativeApp(): boolean {
  const [nativeApp] = useState(() => isNativeAppRuntime());

  return nativeApp;
}
