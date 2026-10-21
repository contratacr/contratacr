"use client";

import { useLocale } from "next-intl";
import { useNativeApp } from "@/hooks/use-native-app";

/** A permanent store entry when Safari remembers dismissing its own banner. */
export function MobileAppStoreMenuLink({ onClick, className }: { onClick: () => void; className: string }) {
  const native = useNativeApp();
  const en = useLocale() === "en";
  if (native) return null;
  // Store redirects need a full document request, never an RSC prefetch.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a data-testid="mobile-menu-store-link" href="/descargar" onClick={onClick} className={className}>
    <span>{en ? "Download app" : "Descargar app"}</span>
  </a>;
}
