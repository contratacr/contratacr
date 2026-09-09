"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/**
 * Aviso corto que aparece abajo y se va solo: "Agregado a favoritos". Es para
 * confirmar una acción que no cambia de pantalla; nada que haya que cerrar a
 * mano ni que tape la barra de abajo de la app.
 */
export function AvisoFlotante({ texto, onFin }: { texto: string; onFin: () => void }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    const id = window.setTimeout(onFin, 2200);
    return () => window.clearTimeout(id);
  }, [onFin, texto]);

  if (!montado || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="ccr-aviso-flotante pointer-events-none fixed inset-x-0 z-[1400] flex justify-center px-4"
      style={{ bottom: "calc(var(--ccr-native-bottom-nav-total, 0px) + max(env(safe-area-inset-bottom), 1rem) + 12px)" }}
    >
      <span className="inline-flex max-w-[92vw] items-center gap-2 rounded-full bg-[#162543] px-4 py-2.5 text-[14px] font-bold text-white shadow-[0_18px_38px_-18px_rgba(15,23,42,0.75)]">
        <Check className="h-4 w-4 shrink-0 text-[#4ade80]" strokeWidth={3} />
        <span className="truncate">{texto}</span>
      </span>
    </div>,
    document.body,
  );
}
