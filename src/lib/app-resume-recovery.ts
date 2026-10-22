import { App } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { APP_RESUME_EVENT } from "@/lib/app-events";
import { recoverBodyScrollLock } from "@/lib/body-scroll-lock";
import { createClient } from "@/lib/supabase/client";

const LONG_SLEEP_MS = 60_000;
const WAKE_THROTTLE_MS = 2_000;

/** One coordinator for browser/PWA and Capacitor lifecycle signals.
 * Never reload the document, replace auth storage or remount a form to recover.
 * A failed network request is not evidence that the user has signed out.
 */
export function installAppResumeRecovery(refreshRoute: () => void): () => void {
  let stopped = false;
  let hiddenSince: number | null = null;
  let lastWake = -Infinity;
  let lastTouch = Date.now();
  let wasOffline = !navigator.onLine;
  let needsRevalidation = false;
  let refreshTimer: number | undefined;
  let nativeTimer: number | undefined;
  let nativeForeground = false;
  const nativeHandles: PluginListenerHandle[] = [];

  const suspend = () => {
    hiddenSince ??= Date.now();
    nativeForeground = false;
    window.clearTimeout(refreshTimer);
    refreshTimer = undefined;
    window.clearTimeout(nativeTimer);
  };
  const visible = () => document.visibilityState !== "hidden" || nativeForeground;
  const scheduleRefresh = () => {
    if (!needsRevalidation || !navigator.onLine || refreshTimer !== undefined) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined;
      if (stopped || !visible()) return;
      needsRevalidation = false;
      // Editors, chat attachments and open dialogs stay mounted, including
      // drafts that exist only in memory. Their data listeners recover quietly.
      if (document.querySelector('form, input:not([type="hidden"]), textarea, select, [contenteditable="true"], [role="dialog"][aria-modal="true"]')) return;
      refreshRoute();
    }, 250);
  };
  const wake = (force = false, native = false) => {
    if (stopped) return;
    if (native) nativeForeground = true;
    if (!visible()) return;
    const now = Date.now();
    const slept = hiddenSince === null ? 0 : now - hiddenSince;
    hiddenSince = null;
    needsRevalidation ||= force || slept >= LONG_SLEEP_MS;
    if (now - lastWake < WAKE_THROTTLE_MS) { scheduleRefresh(); return; }
    lastWake = now;
    lastTouch = now;
    recoverBodyScrollLock();
    // Auth reconciliation is bounded in useAuth; lists, maps, chat and viewport
    // repair themselves without hiding the current content behind a loader.
    window.dispatchEvent(new Event(APP_RESUME_EVENT));
    if (navigator.onLine && needsRevalidation) {
      try {
        const realtime = createClient().realtime;
        if (realtime.getChannels().length) {
          realtime.connect();
          // Detect a stale socket immediately instead of waiting for the next
          // scheduled heartbeat. The SDK owns reconnects and channel rejoining.
          void realtime.sendHeartbeat().catch(() => {});
        }
      } catch { /* Cached content and drafts remain usable without a network. */ }
    }
    scheduleRefresh();
  };
  const onVisibility = () => document.visibilityState === "hidden" ? suspend() : wake();
  const onFocus = () => wake();
  const onPageShow = (event: PageTransitionEvent) => wake(event.persisted);
  const onResume = () => wake();
  const onOffline = () => { wasOffline = true; };
  const onOnline = () => { const force = wasOffline; wasOffline = false; wake(force); };
  const onTouch = () => {
    const now = Date.now();
    if (now - lastTouch >= LONG_SLEEP_MS) wake(true);
    lastTouch = now;
  };
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("freeze", suspend);
  document.addEventListener("resume", onResume);
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("focus", onFocus);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  window.addEventListener("pointerdown", onTouch, { capture: true, passive: true });

  if (Capacitor.isNativePlatform()) {
    const retain = (pending: Promise<PluginListenerHandle>) => {
      void pending.then(handle => {
        if (stopped) void handle.remove().catch(() => {});
        else nativeHandles.push(handle);
      }).catch(() => {});
    };
    retain(App.addListener("appStateChange", ({ isActive }) => isActive ? wake(false, true) : suspend()));
    retain(App.addListener("pause", suspend));
    retain(App.addListener("resume", () => {
      // iOS willEnterForeground can precede the document's visibility update.
      window.clearTimeout(nativeTimer);
      nativeTimer = window.setTimeout(() => wake(false, true), 100);
    }));
  }

  return () => {
    stopped = true;
    window.clearTimeout(refreshTimer);
    window.clearTimeout(nativeTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("freeze", suspend);
    document.removeEventListener("resume", onResume);
    window.removeEventListener("pagehide", suspend);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("pointerdown", onTouch, { capture: true });
    nativeHandles.forEach(handle => { void handle.remove().catch(() => {}); });
  };
}
