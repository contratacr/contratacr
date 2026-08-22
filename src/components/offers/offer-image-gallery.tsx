"use client";

import { useState } from "react";
import { cldLarge, cldThumb } from "@/lib/cloudinary";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type OfferImageGalleryProps = {
  images: string[];
  title: string;
  className?: string;
};

export function OfferImageGallery({ images, title, className }: OfferImageGalleryProps) {
  const safeImages = images.filter(Boolean).slice(0, 8);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = safeImages[activeIndex];

  function goTo(nextIndex: number) {
    if (safeImages.length === 0) return;
    setActiveIndex((nextIndex + safeImages.length) % safeImages.length);
  }

  if (!activeImage) {
    return (
      <div className={cn("grid aspect-[16/9] w-full place-items-center rounded-xl bg-[#eaf7fc] text-3xl font-extrabold text-[#009fd9]", className)}>
        {title.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative grid min-h-[240px] place-items-center overflow-hidden rounded-lg bg-white sm:min-h-[320px] lg:min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cldLarge(activeImage, 1280)}
          alt={title}
          decoding="async"
          className="max-h-[62vh] min-h-0 w-full object-contain sm:max-h-[520px] lg:aspect-[16/9] lg:max-h-[460px]"
        />
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
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cldThumb(url, 160)} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
