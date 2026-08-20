"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

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
  xl: "sm:max-w-5xl",
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
  /** Optional validation/status notice pinned immediately above the footer. */
  footerNotice?: ReactNode;
  /** aria-label for the X button. */
  closeLabel?: string;
  /** Extra classes on the body wrapper (e.g. remove default padding). */
  bodyClassName?: string;
  /** Small alerts can stay centered on mobile; long forms keep the bottom sheet. */
  mobilePresentation?: "sheet" | "center" | "fullscreen";
  /** Extra classes on the pinned footer. */
  footerClassName?: string;
}

export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  footer,
  footerNotice,
  closeLabel = "Cerrar",
  bodyClassName,
  mobilePresentation = "sheet",
  footerClassName,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const releaseBodyScroll = lockBodyScroll();
    return () => { document.removeEventListener("keydown", onKey); releaseBodyScroll(); };
  }, [open, onClose]);

  if (!open) return null;

  const centeredMobile = mobilePresentation === "center";
  const fullscreenMobile = mobilePresentation === "fullscreen";

  return (
    <div
      className={cn(
        "app-modal-screen fixed inset-0 z-[100] flex justify-center",
        centeredMobile && "app-centered-modal-screen",
        fullscreenMobile ? "items-stretch sm:items-center sm:p-4" : centeredMobile ? "items-center p-4" : "items-end sm:items-center sm:p-4"
      )}
    >
      {/* Dimmed backdrop — click to close */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog: full-width bottom-sheet on mobile, centered card on desktop. */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl",
          fullscreenMobile
            ? "app-fullscreen-modal h-[var(--app-visual-viewport-height)] max-h-[var(--app-visual-viewport-height)] rounded-none sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
            : centeredMobile
              ? "app-centered-modal max-h-[calc(var(--app-visual-viewport-height)-2rem)] rounded-2xl"
              : "max-h-[92vh] rounded-t-2xl",
          "app-bottom-sheet min-h-0",
          SIZES[size]
        )}
      >
        {/* Header (pinned) */}
        <div
          className={cn(
            "flex shrink-0 gap-3 border-b border-[#f3f4f6] px-5 py-4 sm:px-6",
            fullscreenMobile
              ? "relative items-center justify-center sm:static sm:items-start sm:justify-between"
              : "items-start justify-between",
          )}
        >
          <div className={cn("min-w-0", fullscreenMobile && "px-10 text-center sm:px-0 sm:text-left")}>
            <h2 className="text-lg font-bold text-[#111827] leading-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#6b7280]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]",
              fullscreenMobile && "absolute left-4 top-1/2 -translate-y-1/2 sm:static sm:translate-y-0",
            )}
          >
            {fullscreenMobile ? (
              <>
                <ArrowLeft className="h-5 w-5 sm:hidden" />
                <X className="hidden h-5 w-5 sm:block" />
              </>
            ) : (
              <X className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Body (scrolls) */}
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6", bodyClassName)}>
          {children}
        </div>

        {footerNotice && (
          <div className="shrink-0 border-t border-[#f3f4f6] bg-white px-5 pt-3 sm:px-6">
            {footerNotice}
          </div>
        )}

        {/* Footer (pinned) */}
        {footer && (
          <div className={cn("flex shrink-0 justify-end gap-3 px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 sm:pb-4", !footerNotice && "border-t border-[#f3f4f6]", footerClassName)}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
