type MetaPixelCommand = "init" | "track" | "trackCustom";

type MetaPixelFunction = {
  (command: "init", pixelId: string): void;
  (command: "track" | "trackCustom", eventName: string, params?: Record<string, unknown>): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: MetaPixelFunction;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
  }
}

export function trackMetaEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", eventName, params);
}

export function trackMetaCustomEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("trackCustom", eventName, params);
}

export function trackMetaPageView() {
  trackMetaEvent("PageView");
}

export type { MetaPixelCommand };
