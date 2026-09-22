"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared vertical-ellipsis overflow menu for the panel list cards (sprint 441).
 * Keeps cards clean: ONE primary action stays visible next to this; the SECONDARY
 * actions live here. Used identically by the professional and client Solicitudes sections and
 * Mis proyectos. Opens UPWARD (the footer sits at the card bottom) so it stays in
 * view, and the cards no longer use `overflow-hidden` (rounded button corners fix the
 * hover-clip instead) so this dropdown is never clipped.
 */
export type CardAction = {
  label: string;
  onClick: () => void;
  /** Rojo: borra o cierra algo sin vuelta atras. */
  destructive?: boolean;
  /**
   * Azul: la accion que uno viene a hacer desde aqui —«Volver a publicar» en
   * una publicacion cerrada—. Una por menu, o ninguna.
   */
  primary?: boolean;
  icon?: ReactNode;
};

export function CardActionsMenu({ actions, label, placement = "up", triggerClassName, menuClassName, itemClassName }: { actions: CardAction[]; label: string; placement?: "up" | "down"; triggerClassName?: string; menuClassName?: string; itemClassName?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Los tres puntos horizontales, iguales en toda la app. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e7eb] text-[#718096] transition-colors hover:border-[#b9c8d6] hover:bg-[#f3f4f6] hover:text-[#162543]",
          triggerClassName,
        )}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            // UNA SOLA MEDIDA PARA TODOS LOS «···» DEL PANEL. Empleos y
            // Promociones pintaban el suyo a mano, con otro relleno, otra
            // sombra y la letra en negrita; Proyectos y Cotizaciones usaban
            // este, mas palido. El dibujo que gana es el de Empleos —negrita y
            // color, que es lo que hace legible un menu de cuatro palabras— y
            // ahora vive aqui, no copiado en cada seccion.
            "absolute right-0 z-50 max-h-[calc(100dvh-2rem)] min-w-[190px] overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]",
            placement === "down" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
            menuClassName,
          )}
        >
          {actions.map((a, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); a.onClick(); }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors",
                a.destructive
                  ? "text-red-700 hover:bg-red-50"
                  : a.primary
                    ? "text-[#008fc3] hover:bg-[#f0f9fc]"
                    : "text-[#162543] hover:bg-[#f4f8fb]",
                itemClassName,
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
