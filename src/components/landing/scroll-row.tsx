"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A horizontal row that slides. Owner 2026-11-26: the arrows sit on the title row, top right (not over the cards), on
 * phones and computers; each one dims at its end of the row.
 */
export function ScrollRow({ children, title, prevLabel, nextLabel }: { children: ReactNode; title: ReactNode; prevLabel: string; nextLabel: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => { el.removeEventListener("scroll", sync); window.removeEventListener("resize", sync); };
  }, []);
  const move = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  const btn = "grid h-8 w-8 place-items-center rounded-full border border-[#dfe5ec] bg-white text-[#162543] transition active:scale-95 disabled:cursor-default disabled:opacity-35 sm:h-9 sm:w-9 sm:enabled:hover:bg-[#f3f6f9]";
  const scrollable = !(edge.start && edge.end);
  return (
    <div className="relative mx-auto max-w-6xl">
      <div className="relative mb-3 flex items-center px-4">
        <div className="min-w-0 flex-1">{title}</div>
        {scrollable && (
          <div className="absolute right-4 flex gap-1.5">
            <button type="button" aria-label={prevLabel} disabled={edge.start} onClick={() => move(-1)} className={btn}><ChevronLeft className="h-4 w-4" strokeWidth={2.4} /></button>
            <button type="button" aria-label={nextLabel} disabled={edge.end} onClick={() => move(1)} className={btn}><ChevronRight className="h-4 w-4" strokeWidth={2.4} /></button>
          </div>
        )}
      </div>
      <ul ref={ref} className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</ul>
    </div>
  );
}
