"use client";

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff, AlertTriangle } from "lucide-react";
import { ErrorScreen, errorPrimaryBtn, errorSecondaryBtn } from "@/components/error/error-screen";

// On-brand boundary for unexpected errors. Detects an offline/connection issue
// and shows a calmer, specific message; otherwise a friendly generic error with
// clear recovery actions (Reintentar + Ir al inicio).
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    console.error("[app error boundary]", error);
    if (typeof navigator !== "undefined" && navigator.onLine === false) setOffline(true);
  }, [error]);

  if (offline) {
    return (
      <ErrorScreen
        icon={<WifiOff className="h-7 w-7" />}
        title="Sin conexión a internet"
        message="Parece que perdiste la conexión. Revisa tu internet y vuelve a intentarlo; tus datos están a salvo."
      >
        <button onClick={reset} className={errorPrimaryBtn}>
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
        <a href="/" className={errorSecondaryBtn}>Ir al inicio</a>
      </ErrorScreen>
    );
  }

  return (
    <ErrorScreen
      icon={<AlertTriangle className="h-7 w-7" />}
      title="Algo salió mal"
      message="Tuvimos un problema temporal al mostrar esta página. Prueba recargar; si continúa, intenta de nuevo en unos minutos."
    >
      <button onClick={reset} className={errorPrimaryBtn}>
        <RefreshCw className="h-4 w-4" /> Reintentar
      </button>
      <a href="/" className={errorSecondaryBtn}>Ir al inicio</a>
    </ErrorScreen>
  );
}
