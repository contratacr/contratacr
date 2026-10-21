"use client";

import { useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useNativeApp } from "@/hooks/use-native-app";
import { smartAppBannerContent, appBannerPresentation } from "@/lib/mobile/smart-app-banner";

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
    standalone.removeEventListener("change", callback);
  };
}

/** React owns this hoisted metadata node throughout locale/route transitions. */
export function SmartAppBanner({ initialContent = null }: { initialContent?: string | null }) {
  const native = useNativeApp();
  const pathname = usePathname();
  const params = useSearchParams();
  const content = useSyncExternalStore(subscribe, () => {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || window.matchMedia("(display-mode: standalone)").matches;
    if (appBannerPresentation(navigator.userAgent, navigator.maxTouchPoints, standalone, native) !== "apple") return null;
    return smartAppBannerContent(pathname + (params.size ? `?${params}` : "") + location.hash);
  }, () => initialContent);
  return content ? <meta name="apple-itunes-app" content={content} /> : null;
}
