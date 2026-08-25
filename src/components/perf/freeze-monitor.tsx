"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { isNativeAppRuntime } from "@/hooks/use-native-app";

// When a page freezes we want to know where and on what, not guess. Two
// signals, both cheap: a long task the browser reports (script or layout that
// held the main thread for over a second) and a heartbeat that notices the
// screen stopped refreshing for a while (the tab was frozen or the device
// choked). Each report carries the route, the viewport, how many result cards
// are mounted and what the device is, and lands in the admin analytics as a
// "page_freeze" event. At most three reports per page view.

const LONG_TASK_MS = 1000;
const HEARTBEAT_MS = 1000;
const FREEZE_GAP_MS = 2500;
const MAX_REPORTS = 3;

type NavigatorExtras = Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } };

export function FreezeMonitor() {
  const pathname = usePathname();

  useEffect(() => {
    let reports = 0;
    const report = (kind: "long_task" | "heartbeat_gap", durationMs: number) => {
      if (reports >= MAX_REPORTS) return;
      reports += 1;
      const nav = navigator as NavigatorExtras;
      trackInteraction({
        type: "page_freeze",
        source: "perf",
        // The API keeps the first eight keys; these are the eight that matter.
        metadata: {
          kind,
          durationMs: Math.round(durationMs),
          path: pathname ?? location.pathname,
          cards: document.querySelectorAll("article").length,
          native: isNativeAppRuntime(),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          connection: nav.connection?.effectiveType ?? null,
          ua: navigator.userAgent.slice(0, 100),
        },
      });
    };

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (entry.duration >= LONG_TASK_MS) report("long_task", entry.duration);
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      observer = null;
    }

    // A hidden tab is throttled by design; only gaps while visible count.
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const gap = now - last - HEARTBEAT_MS;
      last = now;
      if (gap >= FREEZE_GAP_MS && document.visibilityState === "visible") report("heartbeat_gap", gap);
    }, HEARTBEAT_MS);

    return () => {
      observer?.disconnect();
      window.clearInterval(timer);
    };
  }, [pathname]);

  return null;
}
