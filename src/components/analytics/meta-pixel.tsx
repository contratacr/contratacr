"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { enviarEventosMetaPendientes, hayEventosMetaPendientes, trackMetaPageView } from "@/lib/analytics/meta-pixel";
import { readAttribution } from "@/lib/analytics/attribution";
import { isNativeAppRuntime } from "@/hooks/use-native-app";

interface MetaPixelProps {
  pixelId?: string;
}

const CONSENT_KEY = "contratacr:analytics-consent";
type MeasurementState = "loading" | "enabled" | "declined";
type Carga = "lazyOnload" | "afterInteractive";

// Solo el sitio de verdad le habla a Meta. Antes el píxel también recibía
// visitas de localhost y de test (Events Manager listaba «localhost +4 more»),
// y con eso Meta aprendía de nuestras propias pruebas (7-oct-2026).
const HOSTS_DE_PRODUCCION = new Set(["contratacr.com", "www.contratacr.com"]);

// Quien llega desde un anuncio necesita el píxel enseguida: Meta solo cuenta la
// visita (y optimiza por ella) cuando el píxel avisa, y con la carga diferida eso
// pasaba a los ~9 s en un celular con 4G; quien se iba antes no existía para Meta.
function vieneDeUnAnuncio(): boolean {
  const query = new URLSearchParams(window.location.search);
  if (query.has("fbclid") || query.get("utm_medium") === "paid") return true;
  return readAttribution()?.medium === "paid";
}

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
  const [carga, setCarga] = useState<Carga>("lazyOnload");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // The native app never loads the pixel: 220 KB of tracking script on every
      // cold start, and third-party tracking inside the app needs its own consent.
      if (isNativeAppRuntime() || !HOSTS_DE_PRODUCCION.has(window.location.hostname)) {
        setMeasurement("declined");
        return;
      }
      if (vieneDeUnAnuncio() || hayEventosMetaPendientes()) setCarga("afterInteractive");
      const stored = window.localStorage.getItem(CONSENT_KEY);
      setMeasurement(stored === "declined" ? "declined" : "enabled");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Lo que pasó antes de que el script de Meta bajara (una búsqueda, el registro
  // de la página anterior) se manda apenas esté listo.
  useEffect(() => {
    if (!id || !ready) return;
    let intentos = 0;
    const timer = window.setInterval(() => {
      intentos += 1;
      if (typeof window.fbq?.callMethod === "function") {
        enviarEventosMetaPendientes();
        window.clearInterval(timer);
      } else if (intentos > 80) {
        window.clearInterval(timer);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [id, ready]);

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
          // lazyOnload: el píxel (242 KB entre el cargador y fbevents) sale del
          // camino crítico y entra cuando la página ya está ociosa. Las
          // llamadas a fbq() de mientras quedan en cola y se envían igual.
          // Quien viene de un anuncio lo carga enseguida (ver vieneDeUnAnuncio).
          strategy={carga}
          onReady={() => setReady(true)}
          dangerouslySetInnerHTML={{
            __html: `
              if (navigator.webdriver || document.cookie.indexOf('ccr_sin_analitica=1') !== -1) { window.fbq = function(){}; } else
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              if (!(navigator.webdriver || document.cookie.indexOf('ccr_sin_analitica=1') !== -1)) fbq('init', '${id}');
            `,
          }}
        />
      )}
    </>
  );
}
