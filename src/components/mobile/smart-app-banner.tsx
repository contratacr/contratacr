"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useNativeApp } from "@/hooks/use-native-app";
import { smartAppBannerContent } from "@/lib/mobile/smart-app-banner";

/** Keep Apple's native banner destination current after client-side navigation. */
export function SmartAppBanner() {
  const native = useNativeApp();
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    const update = () => {
      const content = native ? null : smartAppBannerContent(location.pathname + location.search + location.hash);
      let meta = document.querySelector<HTMLMetaElement>('meta[name="apple-itunes-app"]');
      if (!content) { meta?.remove(); return; }
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "apple-itunes-app";
        document.head.appendChild(meta);
      }
      meta.content = content;
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [native, pathname, params]);
  return null;
}
