"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

type ImagePreviewDialogProps = {
  src?: string | null;
  alt: string;
  children?: ReactNode;
  className?: string;
  imageClassName?: string;
  openLabel?: string;
  closeLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Para una galería: moverse entre fotos SIN cerrar. Sin estas dos, el visor
   * se queda como estaba —una sola foto— y no pinta flechas.
   */
  onPrev?: () => void;
  onNext?: () => void;
  /** «2/3», al pie, como en la galería de la que viene. */
  counter?: string;
  prevLabel?: string;
  nextLabel?: string;
};

export function ImagePreviewDialog({
  src,
  alt,
  children,
  className,
  imageClassName,
  openLabel = "Ver foto en grande",
  closeLabel = "Cerrar",
  open,
  onOpenChange,
  onPrev,
  onNext,
  counter,
  prevLabel = "Ver imagen anterior",
  nextLabel = "Ver siguiente imagen",
}: ImagePreviewDialogProps) {
  const galeria = Boolean(onPrev && onNext);
  if (!src) return <>{children}</>;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children ? <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={openLabel}
          className={cn(
            "group relative inline-flex shrink-0 cursor-zoom-in rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] focus-visible:ring-offset-2",
            className
          )}
        >
          {children}
          {/* Solo con puntero fino: en el teléfono el :hover se queda pegado tras el
              toque y la foto parecía cambiar (capa oscura + lupa encima). */}
          <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-[#111827]/0 text-white opacity-0 transition [@media(hover:hover)]:group-hover:bg-[#111827]/35 [@media(hover:hover)]:group-hover:opacity-100 group-focus-visible:bg-[#111827]/35 group-focus-visible:opacity-100">
            <ZoomIn className="h-5 w-5 drop-shadow" />
          </span>
        </button>
      </Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-[#111827]/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[221] max-h-[90vh] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 outline-none"
          // Con la foto en grande, las flechas del teclado son lo primero que
          // uno intenta. Radix ya se queda con Escape.
          onKeyDown={(event) => {
            if (!galeria) return;
            if (event.key === "ArrowLeft") { event.preventDefault(); onPrev?.(); }
            if (event.key === "ArrowRight") { event.preventDefault(); onNext?.(); }
          }}
        >
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          <Dialog.Close
            aria-label={closeLabel}
            className="absolute -right-2 -top-12 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-[#111827]/80 text-white shadow-lg transition-colors hover:bg-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:-right-12 sm:top-0"
          >
            <X className="h-5 w-5" />
          </Dialog.Close>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className={cn(
              "max-h-[82vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl sm:max-h-[86vh] sm:max-w-[720px]",
              imageClassName
            )}
          />
          {galeria && (
            <>
              <button
                type="button"
                aria-label={prevLabel}
                onClick={onPrev}
                className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#111827]/70 text-white transition hover:bg-[#111827] sm:-left-14"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label={nextLabel}
                onClick={onNext}
                className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#111827]/70 text-white transition hover:bg-[#111827] sm:-right-14"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              {counter && (
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#111827]/80 px-3 py-1 text-xs font-extrabold text-white">
                  {counter}
                </span>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
