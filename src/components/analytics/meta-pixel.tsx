"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { trackMetaPageView } from "@/lib/analytics/meta-pixel";
import { isNativeAppRuntime } from "@/hooks/use-native-app";

interface MetaPixelProps {
  pixelId?: string;
}

const CONSENT_KEY = "contratacr:analytics-consent";
type MeasurementState = "loading" | "enabled" | "declined";

function cleanPixelId(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

export function MetaPixel({ pixelId }: MetaPixelProps) {
  const id = cleanPixelId(pixelId);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedUrl = useRef<string>("");
  const [ready, setReady] = useState(false);
  const [measurement, setMeasurement] = useState<MeasurementState>("loading");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // The native app never loads the pixel: 220 KB of tracking script on every
      // cold start, and third-party tracking inside the app needs its own consent.
      if (isNativeAppRuntime()) {
        setMeasurement("declined");
        return;
      }
      const stored = window.localStorage.getItem(CONSENT_KEY);
      setMeasurement(stored === "declined" ? "declined" : "enabled");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!id || !ready) return;
    const query = searchParams.toString();
    const currentUrl = `${pathname}${query ? `?${query}` : ""}`;
    if (lastTrackedUrl.current === currentUrl) return;
    lastTrackedUrl.current = currentUrl;
    trackMetaPageView();
  }, [id, pathname, ready, searchParams]);

  if (!id) return null;

  return (
    <>
      {measurement === "enabled" && (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          onReady={() => setReady(true)}
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${id}');
            `,
          }}
        />
      )}
    </>
  );
}
