"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { trackMetaPageView } from "@/lib/analytics/meta-pixel";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";

interface MetaPixelProps {
  pixelId?: string;
}

const CONSENT_KEY = "contratacr:analytics-consent";
type Consent = "accepted" | "declined" | "unknown";

function cleanPixelId(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

export function MetaPixel({ pixelId }: MetaPixelProps) {
  const id = cleanPixelId(pixelId);
  const locale = useLocale();
  const en = locale === "en";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedUrl = useRef<string>("");
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<Consent>("unknown");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(CONSENT_KEY);
      setConsent(stored === "accepted" || stored === "declined" ? stored : "unknown");
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

  function chooseConsent(value: Exclude<Consent, "unknown">) {
    window.localStorage.setItem(CONSENT_KEY, value);
    setConsent(value);
  }

  if (!id) return null;

  return (
    <>
      {consent === "accepted" && (
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
      {consent === "unknown" && (
        <aside
          role="dialog"
          aria-label={en ? "Privacy preferences" : "Preferencias de privacidad"}
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[150] mx-auto max-w-xl rounded-xl border border-[#d7e2ea] bg-white p-4 shadow-[0_18px_55px_-18px_rgba(22,37,67,0.45)] sm:bottom-5 sm:p-5"
        >
          <p className="text-sm font-bold text-[#162543]">{en ? "Privacy and measurement" : "Privacidad y medición"}</p>
          <p className="mt-1.5 text-xs leading-5 text-[#526277] sm:text-sm">
            {en
              ? "We use essential storage for ContrataCR to work. With your permission, we also measure campaigns with Meta Pixel to improve how we promote the platform."
              : "Usamos almacenamiento esencial para que ContrataCR funcione. Con su permiso, también medimos campañas con Meta Pixel para mejorar cómo damos a conocer la plataforma."}{" "}
            <Link href="/privacidad#cookies" className="font-semibold text-[#0089BB] hover:underline">{en ? "Learn more" : "Más información"}</Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => chooseConsent("declined")} className="min-h-10 rounded-lg border border-[#cdd8e1] px-3 text-sm font-bold text-[#526277] hover:border-[#9fb5c5]">
              {en ? "Essential only" : "Solo esenciales"}
            </button>
            <button type="button" onClick={() => chooseConsent("accepted")} className="min-h-10 rounded-lg bg-[#009FD9] px-3 text-sm font-bold text-white hover:bg-[#0089BB]">
              {en ? "Allow measurement" : "Aceptar medición"}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
