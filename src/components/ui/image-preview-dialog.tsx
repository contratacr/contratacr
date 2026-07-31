"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

type ImagePreviewDialogProps = {
  src?: string | null;
  alt: string;
  children: ReactNode;
  className?: string;
  imageClassName?: string;
  openLabel?: string;
  closeLabel?: string;
};

export function ImagePreviewDialog({
  src,
  alt,
  children,
  className,
  imageClassName,
  openLabel = "Ver foto en grande",
  closeLabel = "Cerrar",
}: ImagePreviewDialogProps) {
  if (!src) return <>{children}</>;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={openLabel}
          className={cn(
            "group relative inline-flex shrink-0 cursor-zoom-in rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] focus-visible:ring-offset-2",
            className
          )}
        >
          {children}
          <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-[#111827]/0 text-white opacity-0 transition group-hover:bg-[#111827]/35 group-hover:opacity-100 group-focus-visible:bg-[#111827]/35 group-focus-visible:opacity-100">
            <ZoomIn className="h-5 w-5 drop-shadow" />
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-[#111827]/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[221] max-h-[90vh] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 outline-none">
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
