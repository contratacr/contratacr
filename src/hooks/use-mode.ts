"use client";

import { useCallback, useEffect, useState } from "react";

// Airbnb-style FULL mode switch. The account has two worlds:
//   • "use"   → Modo cliente   (busco servicios — search/hire, mis solicitudes)
//   • "offer" → Modo profesional (ofrezco servicios — pro profile, solicitudes recibidas…)
// Switching flips the ENTIRE experience (panel sections + notifications). It's the
// SAME account — mode is just context. The choice is persisted in localStorage and
// synced across every mounted consumer (navbar bell + account menu + the panel) via a
// window event, and across tabs via the native `storage` event.

export type Mode = "use" | "offer";

const KEY = "contratacr_mode";
const EVENT = "ccr:mode-changed";

export function readStoredMode(): Mode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "use" || v === "offer" ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredMode(mode: Mode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

/**
 * Global client-side mode. Pass whether the account CAN offer (has a professional
 * profile): a seeker has no "offer" world, so the mode is always clamped to "use".
 * A provider uses their stored choice, defaulting to "offer" (their primary world).
 */
export function useMode(canOffer: boolean): { mode: Mode; setMode: (m: Mode) => void } {
  const [stored, setStored] = useState<Mode | null>(() => readStoredMode());

  useEffect(() => {
    function onEvent(e: Event) {
      const next = (e as CustomEvent).detail;
      if (next === "use" || next === "offer") setStored(next);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === KEY && (e.newValue === "use" || e.newValue === "offer")) setStored(e.newValue);
    }
    window.addEventListener(EVENT, onEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // A non-provider is always "use" (no offer world to switch into); a provider uses
  // the stored choice, defaulting to "offer".
  const mode: Mode = !canOffer ? "use" : stored ?? "offer";

  const setMode = useCallback((m: Mode) => {
    writeStoredMode(m);
    setStored(m);
  }, []);

  return { mode, setMode };
}
