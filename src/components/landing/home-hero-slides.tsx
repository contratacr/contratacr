"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type HeroSlide = { key: string; image: string; title: string; button: string; href: string };

const SLIDE_MS = 6000;

/**
 * Phone hero with the directory on (owner 2026-11-26, like Yelp): photos that cross-fade with a slow zoom, each with its
 * own headline and one search button, and progress bars that fill while each photo is shown. The next photo is loaded
 * before its turn, so the change is smooth. Tapping a bar jumps to that slide.
 */
export function HomeHeroSlides({ slides }: { slides: HeroSlide[] }) {
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([0]));
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Load the next photo ahead of its turn.
  useEffect(() => {
    const next = (current + 1) % slides.length;
    if (loaded.has(next)) return;
    const img = new Image();
    img.onload = () => setLoaded((s) => new Set([...s, next]));
    img.src = slides[next]!.image;
  }, [current, slides, loaded]);

  const advance = () => setCurrent((i) => {
    const next = (i + 1) % slides.length;
    return loaded.has(next) ? next : i;
  });

  if (!slides.length) return null;
  const slide = slides[current]!;
  return (
    <section data-home-hero-slides className="relative isolate h-[500px] overflow-hidden bg-[#162543] text-white">
      {slides.map((s, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- remote hero photos, sized by the CDN
        <img key={s.key} src={i === 0 || loaded.has(i) ? s.image : undefined} alt="" aria-hidden fetchPriority={i === 0 ? "high" : "auto"}
          className={cn("absolute inset-0 h-full w-full object-cover transition-[opacity] duration-[900ms] ease-out",
            i === current ? "opacity-100" : "opacity-0",
            !reduced && i === current && "animate-[ccr-hero-zoom_7s_ease-out_forwards]")} />
      ))}
      <span aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,20,40,0.78)_0%,rgba(10,20,40,0.3)_45%,rgba(10,20,40,0.1)_80%,rgba(10,20,40,0.45)_100%)]" />

      {/* Progress bars, like stories: the current one fills over the slide's time. */}
      <div className="absolute inset-x-4 top-[136px] z-10 flex gap-1.5">
        {slides.map((s, i) => (
          <button key={s.key} type="button" aria-label={s.button} onClick={() => setCurrent(i)} className="h-4 flex-1 py-1.5">
            <span className="block h-1 w-full overflow-hidden rounded-full bg-white/40 shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
              <span
                className={cn("block h-full rounded-full bg-white", i < current ? "w-full" : "w-0")}
                style={i === current ? { animation: `ccr-hero-progress ${SLIDE_MS}ms linear forwards` } : undefined}
                onAnimationEnd={i === current ? advance : undefined}
              />
            </span>
          </button>
        ))}
      </div>

      <div key={slide.key} className="absolute inset-x-0 bottom-0 z-10 px-5 pb-7 animate-[ccr-hero-text_600ms_ease-out]">
        <h1 className="text-[clamp(1.25rem,5.6vw,2.2rem)] font-extrabold leading-[1.15] tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]" data-titular-portada="">{slide.title}</h1>
        <Link href={slide.href} prefetch={false} data-hero-slide-search={slide.key} className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-[#009FD9] px-5 text-[15px] font-bold text-white shadow-[0_8px_22px_rgba(0,159,217,0.35)]">
          <Search className="h-4 w-4" strokeWidth={2.4} aria-hidden />{slide.button}
        </Link>
      </div>
    </section>
  );
}
