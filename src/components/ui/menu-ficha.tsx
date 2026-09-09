"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type OpcionFicha = {
  id: string;
  icono: ReactNode;
  texto: string;
  onSelect: () => void;
  /** Rojo, para lo que denuncia o borra. */
  peligro?: boolean;
};

/**
 * El "..." de la cabecera de una ficha: guarda lo que no es la acción principal
 * ni la secundaria (compartir, copiar el enlace, reportar). Es el patrón que la
 * gente ya conoce de otras apps, y evita que cada acción menor pelee un lugar
 * junto al botón que sí importa.
 *
 * En el teléfono abre una hoja desde abajo; en computadora, un panel junto al
 * botón. La misma marcación en los dos casos: solo cambian las clases.
 */
export function MenuFicha({ opciones, className }: { opciones: OpcionFicha[]; className?: string }) {
  const t = useTranslations("menuFicha");
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTocarFuera = (e: MouseEvent) => {
      const destino = e.target as Element | null;
      // La hoja del teléfono cuelga del body, fuera de esta caja: sin esta
      // salvedad el mousedown la cerraba antes de que el toque llegara a la
      // opción, y no pasaba nada.
      if (destino?.closest?.("[data-menu-ficha]")) return;
      if (caja.current && !caja.current.contains(destino as Node)) setAbierto(false);
    };
    const alEscapar = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", alTocarFuera);
    document.addEventListener("keydown", alEscapar);
    return () => {
      document.removeEventListener("mousedown", alTocarFuera);
      document.removeEventListener("keydown", alEscapar);
    };
  }, [abierto]);

  if (opciones.length === 0) return null;

  const lista = (
    <div
      role="menu"
      data-menu-ficha=""
      aria-label={t("more")}
      className="ccr-menu-ficha overflow-hidden rounded-t-2xl bg-white pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.45)] lg:rounded-xl lg:border lg:border-[#e5e7eb] lg:pb-2 lg:shadow-[0_18px_38px_-18px_rgba(15,23,42,0.35)]"
    >
      <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-[#d7e1ea] lg:hidden" />
      {opciones.map((opcion) => (
        <button
          key={opcion.id}
          type="button"
          role="menuitem"
          onClick={() => { setAbierto(false); opcion.onSelect(); }}
          className={cn(
            "flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-bold transition-colors hover:bg-[#f4f7fa] lg:px-4 lg:py-2.5 lg:text-sm",
            opcion.peligro ? "text-[#c0392b]" : "text-[#162543]",
          )}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center">{opcion.icono}</span>
          {opcion.texto}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={caja} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={t("more")}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-full text-[#52627a] transition-colors hover:bg-[#eef3f8] hover:text-[#162543]"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {abierto && (
        <>
          {/* Teléfono: hoja desde abajo, colgada del body para que ninguna
              tarjeta la recorte. Computadora: panel junto al botón. */}
          {typeof document !== "undefined" && createPortal(
            <div className="fixed inset-0 z-[1450] lg:hidden">
              <button type="button" aria-label={t("close")} onClick={() => setAbierto(false)} className="absolute inset-0 bg-[#071426]/45" />
              <div className="absolute inset-x-0 bottom-0">{lista}</div>
            </div>,
            document.body,
          )}
          <div className="absolute right-0 top-full z-30 mt-1 hidden w-56 lg:block">{lista}</div>
        </>
      )}
    </div>
  );
}
