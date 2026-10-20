"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { enviarEventosMetaPendientes, trackMetaPageView } from "@/lib/analytics/meta-pixel";
import { subscribeOptionalConsent } from "@/lib/privacy/optional-consent";

/** First-party, strictly filtered measurement. Does not load Meta Pixel. */
export function MetaPixel({ pixelId }: { pixelId?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (!pixelId) return;
    enviarEventosMetaPendientes();
    trackMetaPageView();
    return subscribeOptionalConsent(trackMetaPageView);
  }, [pixelId, pathname, search]);
  return null;
}
