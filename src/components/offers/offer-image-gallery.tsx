"use client";

import { useRef, useState } from "react";
import { cldLarge, cldThumb } from "@/lib/cloudinary";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { useDeslizar } from "@/hooks/use-deslizar";
import { useArrastreHorizontal } from "@/hooks/use-arrastre-horizontal";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";

type OfferImageGalleryProps = {
  images: string[];
  title: string;
  className?: string;
};

const verEnGrande = "Ver la foto en grande";

export function OfferImageGallery({ images, title, className }: OfferImageGalleryProps) {
  const safeImages = images.filter(Boolean).slice(0, 8);
  const [activeIndex, setActiveIndex] = useState(0);
  const [enGrande, setEnGrande] = useState(false);
  const miniaturasRef = useRef<HTMLDivElement | null>(null);
  useArrastreHorizontal(miniaturasRef);
  const activeImage = safeImages[activeIndex];

  function goTo(nextIndex: number) {
    if (safeImages.length === 0) return;
    setActiveIndex((nextIndex + safeImages.length) % safeImages.length);
  }
  const deslizar = useDeslizar((direccion) => goTo(direccion === "siguiente" ? activeIndex + 1 : activeIndex - 1));

  if (!activeImage) {
    return (
      <div className={cn("grid aspect-[16/9] w-full place-items-center rounded-xl bg-[#eaf7fc] text-3xl font-extrabold text-[#009fd9]", className)}>
        {title.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* touch-pan-y: el dedo desliza las fotos y la página sigue bajando. */}
      <div
        className="relative grid min-h-[240px] touch-pan-y select-none place-items-center overflow-hidden rounded-lg bg-white sm:min-h-[320px] lg:min-h-0"
        {...(safeImages.length > 1 ? deslizar : {})}
      >
        <button
          type="button"
          onClick={() => setEnGrande(true)}
          aria-label={verEnGrande}
          className="group block w-full cursor-zoom-in"
        >
          <ProgressiveImage
            key={activeImage}
            src={cldLarge(activeImage, 1280)}
            alt={title}
            fit="contain"
            priority
            wrapperClassName="block w-full"
            className="max-h-[62vh] min-h-0 w-full sm:max-h-[520px] lg:aspect-[4/3] lg:max-h-[560px]"
          />
          {/* La señal de que se puede agrandar, discreta y solo con ratón: en
              el teléfono el :hover se queda pegado después del toque. */}
          <span className="pointer-events-none absolute right-3 top-3 hidden h-9 w-9 place-items-center rounded-full bg-[#111827]/55 text-white opacity-0 transition [@media(hover:hover)]:grid group-hover:opacity-100">
            <Expand className="h-4 w-4" />
          </span>
        </button>
        {safeImages.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Ver imagen anterior"
              onClick={() => goTo(activeIndex - 1)}
              className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#162543] shadow-sm transition hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Ver siguiente imagen"
              onClick={() => goTo(activeIndex + 1)}
              className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#162543] shadow-sm transition hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-[#162543]/85 px-2.5 py-1 text-xs font-extrabold text-white">
              {activeIndex + 1}/{safeImages.length}
            </span>
          </>
        )}
      </div>
      {safeImages.length > 1 && (
        <div ref={miniaturasRef} className="ccr-carril scrollbar-none overflow-x-auto">
          <div className="mx-auto flex w-fit gap-2">
          {safeImages.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              aria-label={`Ver imagen ${index + 1}`}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "h-16 w-20 shrink-0 overflow-hidden rounded-lg border bg-white transition",
                index === activeIndex ? "border-[#009fd9] ring-2 ring-[#009fd9]/20" : "border-[#d8e4ee] hover:border-[#9bdcf2]"
              )}
            >
              <ProgressiveImage src={cldThumb(url, 160)} alt="" fit="contain" wrapperClassName="h-full w-full" className="p-1" />
            </button>
          ))}
          </div>
        </div>
      )}
      <ImagePreviewDialog
        open={enGrande}
        onOpenChange={setEnGrande}
        src={cldLarge(activeImage, 1600)}
        alt={title}
        imageClassName="sm:max-h-[88vh] sm:max-w-[92vw]"
        {...(safeImages.length > 1
          ? {
              onPrev: () => goTo(activeIndex - 1),
              onNext: () => goTo(activeIndex + 1),
              counter: `${activeIndex + 1}/${safeImages.length}`,
            }
          : {})}
      />
    </div>
  );
}
