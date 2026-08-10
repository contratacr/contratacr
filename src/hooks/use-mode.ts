"use client";

import { useCallback, useSyncExternalStore } from "react";

// Full mode switch for accounts that can both hire and offer services:
// - "use"   -> client context
// - "offer" -> professional context
// The choice is stored per browser tab so the user can keep the client panel
// open in one tab and the professional panel open in another. Components inside
// the same tab stay synced through the custom window event below.

export type Mode = "use" | "offer";

const KEY = "contratacr_mode";
const EVENT = "ccr:mode-changed";

export function readStoredMode(): Mode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(KEY);
    return v === "use" || v === "offer" ? v : null;
  } catch {
    return null;
  }
}

export function writeStoredMode(mode: Mode) {
  try {
    window.sessionStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

/**
 * Global client-side mode. Pass whether the account CAN offer (has a professional
 * profile): a seeker has no "offer" world, so the mode is always clamped to "use".
 * A provider uses their tab choice, defaulting to "offer" (their primary world).
 */
export function useMode(canOffer: boolean): { mode: Mode; setMode: (m: Mode) => void } {
  const stored = useSyncExternalStore(
    (onStoreChange) => {
      const onEvent = () => onStoreChange();
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea === window.sessionStorage && event.key === KEY) onStoreChange();
      };
    window.addEventListener(EVENT, onEvent);
      window.addEventListener("storage", onStorage);
      return () => {
      window.removeEventListener(EVENT, onEvent);
        window.removeEventListener("storage", onStorage);
      };
    },
    readStoredMode,
    () => null,
  );

  // A non-provider is always "use" (no offer world to switch into); a provider uses
  // the tab choice, defaulting to "offer".
  const mode: Mode = !canOffer ? "use" : stored ?? "offer";

  const setMode = useCallback((m: Mode) => {
    writeStoredMode(m);
  }, []);

  return { mode, setMode };
}
