"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared modal/dialog primitive — the single source of truth for the app's modal
// chrome (used by "Nuevo servicio", "Agregar profesión", "Publicar proyecto",
// "Soporte", …). Dimmed backdrop + centered white rounded dialog with a PINNED
// header (title + X) and an optional PINNED footer, and a SCROLLING body
// (max-height ~90vh) so a tall form never gets cut off. Closes on X, backdrop
// click and Esc; locks background scroll. Full-width bottom-sheet on mobile.

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
} as const;

interface ModalProps {
  /** Render-when-mounted is fine; defaults to open. */
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: keyof typeof SIZES;
  children: ReactNode;
  /** Optional pinned footer (e.g. Cancelar / Guardar). */
  footer?: ReactNode;
  /** aria-label for the X button. */
  closeLabel?: string;
  /** Extra classes on the body wrapper (e.g. remove default padding). */
  bodyClassName?: string;
}

export function Modal({ open = true, onClose, title, subtitle, size = "md", children, footer, closeLabel = "Cerrar", bodyClassName }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="app-modal-screen fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      {/* Dimmed backdrop — click to close */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog: full-width bottom-sheet on mobile, centered card on desktop. */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex w-full max-h-[92vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl",
          "app-bottom-sheet min-h-0",
          SIZES[size]
        )}
      >
        {/* Header (pinned) */}
        <div className="flex items-start justify-between gap-3 border-b border-[#f3f4f6] px-5 py-4 shrink-0 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#111827] leading-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#6b7280]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body (scrolls) */}
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6", bodyClassName)}>
          {children}
        </div>

        {/* Footer (pinned) */}
        {footer && (
          <div className="flex shrink-0 justify-end gap-3 border-t border-[#f3f4f6] px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
