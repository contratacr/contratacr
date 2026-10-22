"use client";

import { useLocale } from "next-intl";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { cldThumb } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

/** Isolate photo clicks from the list card's navigation and selection. */
export function ProfilePhotoPreview({ src, name, className, square = false, priority = false, eager = false }: {
  src: string;
  name: string;
  className?: string;
  square?: boolean;
  priority?: boolean;
  eager?: boolean;
}) {
  const en = useLocale() === "en";
  return (
    <span className={cn("relative z-[2] inline-flex shrink-0 pointer-events-auto", className)} onClick={(event) => event.stopPropagation()}>
      <ImagePreviewDialog
        src={src}
        alt={name}
        openLabel={en ? "View profile photo" : "Ver foto de perfil"}
        closeLabel={en ? "Close" : "Cerrar"}
        className={cn("h-full w-full", square && "rounded-lg overflow-hidden")}
      >
        <ProgressiveImage priority={priority} loading={priority || eager ? "eager" : "lazy"} src={cldThumb(src, 160)} alt={name} fit="cover" wrapperClassName={cn("h-full w-full", square ? "rounded-lg" : "rounded-full")} className={square ? "rounded-lg" : "rounded-full"} />
      </ImagePreviewDialog>
    </span>
  );
}
