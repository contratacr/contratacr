"use client";

import { useState } from "react";
import { categoryImageUrl, categoryImageSrcSet, categoryImagePosition, categoryGroupId } from "@/lib/data/category-images";
import { getCategoryGroupVisual } from "@/lib/data/category-group-visuals";
import { cn } from "@/lib/utils";
import { ProgressiveImage } from "@/components/ui/progressive-image";

// The service's visual identity: a real catalog photo when available, else a branded
// gradient + the shared group icon. A small icon badge overlays every card.
// `sizes`: el ancho de foto que hace falta. La foto es horizontal (3:2) y la
// tarjeta vertical (4:5), así que el recorte necesita ~1,9 veces el ancho de la
// tarjeta (media pantalla en el teléfono, ~280 px en computadora).
// `diferida`: no pide la foto hasta que se la pida la sección.
export function ServiceImage({ categoryId, className, badge = true, sizes = "(max-width: 1023px) 94vw, 525px", diferida = false }: { categoryId: string; className?: string; badge?: boolean; sizes?: string; diferida?: boolean }) {
  const url = categoryImageUrl(categoryId);
  const [failed, setFailed] = useState(false);
  const { from, to, Icon } = getCategoryGroupVisual(categoryGroupId(categoryId));
  const showPhoto = !!url && !failed && !diferida;

  return (
    <div
      className={cn("relative overflow-hidden bg-[#eef1f5]", className)}
      style={showPhoto ? undefined : { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {showPhoto ? (
        <ProgressiveImage src={url} srcSet={categoryImageSrcSet(categoryId)} sizes={sizes} alt="" fit="cover" style={{ objectPosition: categoryImagePosition(categoryId) }} onError={() => setFailed(true)} wrapperClassName="h-full w-full" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Icon className="h-[34%] w-[34%] text-white/85" strokeWidth={1.5} />
        </div>
      )}
      {badge && (
        <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-[#009FD9] shadow-sm backdrop-blur">
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
      )}
    </div>
  );
}
