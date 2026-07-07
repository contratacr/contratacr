"use client";

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff, AlertTriangle } from "lucide-react";
import { ErrorScreen, errorPrimaryBtn, errorSecondaryBtn } from "@/components/error/error-screen";
import { ServiceUnavailableScreen } from "@/components/error/service-unavailable-screen";
import { getRuntimeErrorKind } from "@/lib/errors/runtime-error-kind";

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
    if (typeof navigator !== "undefined" && navigator.onLine === false) setOffline(true);
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/en")) setLang("en");
  }, [error]);

  const t = COPY[lang];
  const retry = unstable_retry ?? reset ?? (() => window.location.reload());
  const errorKind = getRuntimeErrorKind(error, offline);

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
