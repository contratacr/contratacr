"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cldThumb, cldLarge } from "@/lib/cloudinary";
import { ProgressiveImage } from "@/components/ui/progressive-image";

// Client-facing work gallery: a grid of optimized Cloudinary thumbnails that
// open a larger lightbox/carousel. Sizes are URL transforms (no stored copies).
export function ProfileGallery({ urls }: { urls: string[] }) {
  const t = useTranslations("gallery");
  const [index, setIndex] = useState<number | null>(null);

  const close = useCallback(() => setIndex(null), []);
  const prev = useCallback(() => setIndex((i) => (i === null ? i : (i - 1 + urls.length) % urls.length)), [urls.length]);
  const next = useCallback(() => setIndex((i) => (i === null ? i : (i + 1) % urls.length)), [urls.length]);

  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, close, prev, next]);

  if (!urls || urls.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className="aspect-square rounded-xl overflow-hidden border border-[#e5e7eb] hover:opacity-90 transition-opacity"
          >
            <ProgressiveImage src={cldThumb(url, 400)} alt={t("workAlt", { n: i + 1 })} fit="cover" wrapperClassName="h-full w-full" />
          </button>
        ))}
      </div>

      {index !== null && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4" onClick={close}>
          <button onClick={close} className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label={t("close")}>
            <X className="h-7 w-7" />
          </button>
          {urls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-4 text-white/80 hover:text-white p-2"
              aria-label={t("prev")}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}
          <ProgressiveImage
            key={urls[index]}
            src={cldLarge(urls[index], 1280)}
            alt={t("workAlt", { n: index + 1 })}
            fit="contain"
            priority
            wrapperClassName="inline-block bg-transparent"
            className="max-h-[85vh] max-w-[90vw] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {urls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-4 text-white/80 hover:text-white p-2"
              aria-label={t("next")}
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}
          <span className="absolute bottom-4 text-white/70 text-sm">{index + 1} / {urls.length}</span>
        </div>
      )}
    </>
  );
}
