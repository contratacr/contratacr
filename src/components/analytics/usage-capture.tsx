"use client";
import { configureNativeMeasurement, setNativeMeasurementActor } from "@/lib/analytics/native-measurement";

import { JourneyCapture } from "./journey-capture";
import { isNativeAnalyticsRuntime } from "@/lib/analytics/platform";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNativeApp } from "@/hooks/use-native-app";
import { syncAnalyticsPlatform } from "@/lib/analytics/platform-client";
import { esNavegadorAutomatizado } from "@/lib/analytics/trafico-automatizado";
import { APP_RESUME_EVENT } from "@/lib/app-events";

const SESSION_KEY = "ccr:usage-session:v1";
const FIRST_USE_KEY = "ccr:app-first-use:v1";
const INACTIVITY = 30 * 60_000;
// Serial delivery keeps the first guest request's cookie available to later
// requests, including the same person signing in. StrictMode/retries reuse IDs.
let queue: Promise<unknown> = Promise.resolve();
let fallback = { id: "", at: 0 };
function session(now: number) {
  let current = fallback;
  try { current = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") ?? fallback; } catch { /* unavailable */ }
  if (!/^[a-f0-9-]{36}$/i.test(current.id) || now - current.at >= INACTIVITY || current.at > now) current = { id: crypto.randomUUID(), at: now };
  else current = { ...current, at: now };
  fallback = current;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(current)); } catch { /* memory fallback */ }
  return current.id;
}
export function UsageCapture() {
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "";
  const { user } = useAuth();
  const native = useNativeApp();
  const last = useRef({ route: "", session: "", actor: "", screen: "", runtime: "" });
  useEffect(() => {
    if (esNavegadorAutomatizado()) { void configureNativeMeasurement(true); return; }
    setNativeMeasurementActor(user?.id ?? "");
    const track = () => {
      if (document.visibilityState === "hidden") return;
      const runtime = syncAnalyticsPlatform();
      const isApp = isNativeAnalyticsRuntime(runtime);
      const id = session(Date.now());
      const safeTab = /^[a-z_-]{1,40}$/.test(tab) ? tab : "";
      // Never send OAuth codes, recovery tokens, email addresses or query text.
      const route = `${pathname}|${safeTab}`;
      const actor = user?.id ?? "";
      if (last.current.route === route && last.current.session === id && last.current.actor === actor && last.current.runtime === runtime) return;
      const screen = last.current.route === route && last.current.session === id ? last.current.screen : crypto.randomUUID();
      last.current = { route, session: id, actor, screen, runtime };
      queue = queue.catch(() => undefined).then(async () => {
        let firstUse = false;
        try { firstUse = isApp && localStorage.getItem(FIRST_USE_KEY) !== "1"; } catch { /* no persistence */ }
        const body = JSON.stringify({ session: id, screen, path: pathname, tab: safeTab, firstUse });
        const send = () => fetch("/api/analytics/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" });
        try {
          let response = await send();
          if (!response.ok && response.status >= 500) response = await send();
          if (response.ok && isApp && last.current.actor === actor) await configureNativeMeasurement(response.headers?.get("x-analytics-excluded") === "1", response.headers?.get("x-meta-skan-schema") === "ready");
          if (response.ok && firstUse && response.headers?.get("x-analytics-excluded") !== "1") { try { localStorage.setItem(FIRST_USE_KEY, "1"); } catch { /* optional */ } }
          if (!response.ok && last.current.screen === screen) last.current.actor = "retry";
        } catch { if (last.current.screen === screen) last.current.actor = "retry"; }
      });
    };
    track();
    document.addEventListener("visibilitychange", track);
    window.addEventListener(APP_RESUME_EVENT, track);
    window.addEventListener("online", track);
    // Activity renews the session timestamp; after 30 minutes idle a new
    // session is recorded. No polling requests or event per keystroke.
    let lastTouch = 0;
    const touch = () => { if (Date.now() - lastTouch < 60_000) return; lastTouch = Date.now(); track(); };
    document.addEventListener("pointerdown", touch, { passive: true });
    document.addEventListener("keydown", touch);
    return () => {
      document.removeEventListener("visibilitychange", track);
      window.removeEventListener(APP_RESUME_EVENT, track);
      window.removeEventListener("online", track);
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("keydown", touch);
    };
  }, [pathname, tab, user?.id, native]);
  return <JourneyCapture />;
}
