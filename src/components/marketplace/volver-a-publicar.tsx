"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { RotateCcw } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * LO PROPIO QUE SE CERRÓ SE ABRE IGUAL, Y SE REACTIVA AHÍ MISMO (18-nov-2026).
 *
 * Una solicitud cerrada por inactividad daba «página no encontrada» a su
 * propio dueño, y en empleos y promociones la ficha decía «ya no está
 * disponible» sin decirle qué hacer. Quien la publicó la ve completa, con este
 * aviso arriba y el botón para volver a publicarla, el mismo que hay en el
 * «···» del panel. A cualquier otra persona no se le muestra.
 */

type Tipo = "proyecto" | "empleo" | "promocion";

const API: Record<Tipo, { url: string; estado: string }> = {
  proyecto: { url: "/api/projects", estado: "open" },
  empleo: { url: "/api/jobs/posts", estado: "published" },
  promocion: { url: "/api/offers", estado: "published" },
};

const COPIA = {
  es: {
    proyecto: "Esta solicitud está cerrada: ya no sale en el tablero y los profesionales no la ven.",
    empleo: "Este empleo está cerrado: ya no sale en Empleos y nadie puede postularse.",
    promocion: "Esta promoción no está publicada: ya no sale en Promociones.",
    boton: "Volver a publicar",
    publicando: "Publicando…",
    error: "No se pudo volver a publicar. Intente de nuevo.",
  },
  en: {
    proyecto: "This request is closed: it no longer shows on the board and professionals can't see it.",
    empleo: "This job is closed: it no longer shows in Jobs and nobody can apply.",
    promocion: "This promotion isn't published: it no longer shows in Promotions.",
    boton: "Publish again",
    publicando: "Publishing…",
    error: "It couldn't be published again. Try again.",
  },
} as const;

export function VolverAPublicar({ tipo, id, className }: { tipo: Tipo; id: string; className?: string }) {
  const en = useLocale() === "en";
  const copia = COPIA[en ? "en" : "es"];
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(false);

  async function publicar() {
    setEnviando(true);
    setError(false);
    try {
      const res = await fetch(API[tipo].url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: API[tipo].estado }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(true);
      setEnviando(false);
    }
  }

  return (
    <div role="status" data-testid="volver-a-publicar" className={cn("rounded-xl border border-[#fedf89] bg-[#fffaeb] p-4", className)}>
      <p className="text-sm font-semibold leading-6 text-[#93370d]">{copia[tipo]}</p>
      <button
        type="button"
        disabled={enviando}
        onClick={() => void publicar()}
        className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white transition-colors hover:bg-[#0089bb] disabled:opacity-60"
      >
        <RotateCcw className="h-4 w-4" />
        {enviando ? copia.publicando : copia.boton}
      </button>
      {error && <p role="alert" className="mt-2 text-[13px] font-semibold text-[#b42318]">{copia.error}</p>}
    </div>
  );
}
