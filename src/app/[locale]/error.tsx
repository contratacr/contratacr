"use client";

import { useEffect } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

// Friendly "fuera de servicio" boundary — replaces the abrupt
// "This page couldn't load" failure (e.g. a transient error after logout).
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f4f7fa] px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fef3c7] mb-5">
        <AlertTriangle className="h-7 w-7 text-[#b45309]" />
      </div>
      <h1 className="text-2xl font-bold text-[#111827]">Algo salió mal</h1>
      <p className="text-[#6b7280] mt-2 max-w-sm">
        Estamos teniendo un problema temporal. Probá recargar la página; si continúa, intentá de nuevo en unos minutos.
      </p>
      <div className="flex gap-3 mt-6">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-sm px-5 py-3 transition-all active:scale-[0.98]"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
        <a
          href="/es"
          className="inline-flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white text-[#374151] font-bold text-sm px-5 py-3 hover:border-[#009FD9]"
        >
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
