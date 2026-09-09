"use client";

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff, AlertTriangle } from "lucide-react";
import { ErrorScreen, errorPrimaryBtn, errorSecondaryBtn } from "@/components/error/error-screen";
import { ServiceUnavailableScreen } from "@/components/error/service-unavailable-screen";
import { getRuntimeErrorKind, isStaleChunkError } from "@/lib/errors/runtime-error-kind";
import { reportClientError } from "@/lib/report-client-error";

// On-brand boundary for unexpected errors. Detects an offline/connection issue
// and shows a calmer, specific message; otherwise a friendly generic error with
// clear recovery actions (Reintentar + Ir al inicio).
//
// i18n NOTE: this is an error boundary, so it must NOT depend on the next-intl
// provider (the provider tree may be exactly what errored). Locale is read
// directly from the URL and copy comes from a tiny inline map — robust even when
// the rest of the app context is gone.
const COPY = {
  es: {
    offlineTitle: "Sin conexión a internet",
    offlineMessage: "Parece que perdiste la conexión. Revisa tu internet y vuelve a intentarlo; tus datos están a salvo.",
    errorTitle: "Algo salió mal",
    errorMessage: "Tuvimos un problema temporal al mostrar esta página. Prueba recargar; si continúa, intenta de nuevo en unos minutos.",
    retry: "Reintentar",
    home: "Ir al inicio",
  },
  en: {
    offlineTitle: "No internet connection",
    offlineMessage: "It looks like you lost your connection. Check your internet and try again; your data is safe.",
    errorTitle: "Something went wrong",
    errorMessage: "We had a temporary problem showing this page. Try reloading; if it continues, try again in a few minutes.",
    retry: "Retry",
    home: "Go home",
  },
} as const;

export default function LocaleError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const [offline, setOffline] = useState(false);
  const [lang, setLang] = useState<"es" | "en">("es");

  useEffect(() => {
    console.error("[app error boundary]", error);
    // Sin esto, el error se queda en la consola del teléfono de quien lo sufrió.
    reportClientError("boundary", error);
    // Publicamos una versión nueva y la pantalla abierta pide un archivo que ya
    // no está: recargar la arregla. Se hace UNA vez por pantalla para no entrar
    // en un ciclo si el problema fuera otro.
    if (isStaleChunkError(error) && typeof window !== "undefined") {
      const marca = `ccr:recarga-por-version:${window.location.pathname}`;
      let yaIntentado = true;
      try { yaIntentado = window.sessionStorage.getItem(marca) === "1"; } catch { yaIntentado = true; }
      if (!yaIntentado) {
        try { window.sessionStorage.setItem(marca, "1"); } catch { /* sin almacenamiento: no se reintenta */ }
        window.location.reload();
      }
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) setOffline(true);
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/en")) setLang("en");
  }, [error]);

  const t = COPY[lang];
  const retry = unstable_retry ?? reset ?? (() => window.location.reload());
  const errorKind = getRuntimeErrorKind(error, offline);

  // Cuando el problema es de conexión o del servidor, la pantalla se recupera
  // sola: al volver la red, al volver a la pestaña, y con un reintento a los
  // pocos segundos. Antes había que darle a "Reintentar" a mano aunque el
  // servicio ya estuviera de vuelta.
  useEffect(() => {
    if (errorKind !== "unavailable" && errorKind !== "offline") return;
    let intentos = 0;
    const reintentar = () => {
      if (intentos >= 3) return;
      intentos += 1;
      retry();
    };
    const alVolverLaRed = () => { setOffline(false); reintentar(); };
    const alVolverALaPestana = () => { if (document.visibilityState === "visible") reintentar(); };
    const espera = window.setTimeout(reintentar, 5000);
    window.addEventListener("online", alVolverLaRed);
    document.addEventListener("visibilitychange", alVolverALaPestana);
    return () => {
      window.clearTimeout(espera);
      window.removeEventListener("online", alVolverLaRed);
      document.removeEventListener("visibilitychange", alVolverALaPestana);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKind]);

  if (errorKind === "offline") {
    return (
      <ErrorScreen
        icon={<WifiOff className="h-7 w-7" />}
        title={t.offlineTitle}
        message={t.offlineMessage}
      >
        <button onClick={retry} className={errorPrimaryBtn}>
          <RefreshCw className="h-4 w-4" /> {t.retry}
        </button>
        <a href="/" className={errorSecondaryBtn}>{t.home}</a>
      </ErrorScreen>
    );
  }

  if (errorKind === "unavailable") {
    return (
      <ServiceUnavailableScreen locale={lang}>
        <button onClick={retry} className={errorPrimaryBtn}>
          <RefreshCw className="h-4 w-4" /> {t.retry}
        </button>
        <a href="/" className={errorSecondaryBtn}>{t.home}</a>
      </ServiceUnavailableScreen>
    );
  }

  return (
    <ErrorScreen
      icon={<AlertTriangle className="h-7 w-7" />}
      title={t.errorTitle}
      message={t.errorMessage}
    >
      <button onClick={retry} className={errorPrimaryBtn}>
        <RefreshCw className="h-4 w-4" /> {t.retry}
      </button>
      <a href="/" className={errorSecondaryBtn}>{t.home}</a>
    </ErrorScreen>
  );
}
