"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared vertical-ellipsis overflow menu for the panel list cards (sprint 441).
 * Keeps cards clean: ONE primary action stays visible next to this; the SECONDARY
 * actions live here. Used identically by the professional and client Solicitudes sections and
 * Mis proyectos. Prefers opening upward and flips/clamps to the visual viewport.
 * The body portal prevents scrolling cards and transformed parents from clipping it.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const viewport = window.visualViewport;
      const pad = 10;
      const viewLeft = (viewport?.offsetLeft ?? 0) + pad;
      const viewTop = (viewport?.offsetTop ?? 0) + pad;
      const viewWidth = (viewport?.width ?? window.innerWidth) - pad * 2;
      const viewHeight = (viewport?.height ?? window.innerHeight) - pad * 2;
      menu.style.minWidth = `${Math.min(190, Math.max(1, viewWidth))}px`;
      menu.style.maxWidth = `${Math.max(1, viewWidth)}px`;
      menu.style.maxHeight = `${Math.max(1, viewHeight)}px`;
      const anchor = trigger.getBoundingClientRect();
      const box = menu.getBoundingClientRect();
      const below = viewTop + viewHeight - anchor.bottom - 6;
      const above = anchor.top - viewTop - 6;
      const up = placement === "up" ? above >= box.height || above > below : below < box.height && above > below;
      const desiredTop = up ? anchor.top - box.height - 6 : anchor.bottom + 6;
      menu.style.top = `${Math.max(viewTop, Math.min(desiredTop, viewTop + viewHeight - box.height))}px`;
      menu.style.left = `${Math.max(viewLeft, Math.min(anchor.right - box.width, viewLeft + viewWidth - box.width))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    if (menuRef.current) observer.observe(menuRef.current);
    if (triggerRef.current) observer.observe(triggerRef.current);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open, placement, actions]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Los tres puntos horizontales, iguales en toda la app. */}
      <button
        ref={triggerRef}
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
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className={cn(
            // UNA SOLA MEDIDA PARA TODOS LOS «···» DEL PANEL. Empleos y
            // Promociones pintaban el suyo a mano, con otro relleno, otra
            // sombra y la letra en negrita; Proyectos y Cotizaciones usaban
            // este, mas palido. El dibujo que gana es el de Empleos —negrita y
            // color, que es lo que hace legible un menu de cuatro palabras— y
            // ahora vive aqui, no copiado en cada seccion.
            "fixed z-[1200] max-h-[calc(100dvh-2rem)] min-w-[190px] overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]",
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
        </div>,
        document.body,
      )}
    </div>
  );
}
