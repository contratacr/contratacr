"use client";
import { useEffect, useRef } from "react";

/** Work photos of a professional card that pass by themselves (and can be swiped); stops when the visitor touches it. */
export function FeedPhotoCarousel({ photos }: { photos: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || photos.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopped = false;
    const stop = () => { stopped = true; };
    el.addEventListener("touchstart", stop, { passive: true });
    const id = window.setInterval(() => {
      if (stopped || !el.isConnected) return;
      const next = Math.round(el.scrollLeft / el.clientWidth) + 1;
      el.scrollTo({ left: (next % photos.length) * el.clientWidth, behavior: "smooth" });
    }, 3500);
    return () => { window.clearInterval(id); el.removeEventListener("touchstart", stop); };
  }, [photos.length]);
  return (
    <div ref={ref} className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {photos.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element -- remote work photos, already resized thumbnails
        <img key={src} src={src} alt="" className="h-full w-full shrink-0 snap-start object-cover" loading="lazy" />
      ))}
    </div>
  );
}
