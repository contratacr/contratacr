"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** A horizontal row that slides; arrows on computers (phones swipe), shown only when there is more to see. */
export function ScrollRow({ children, prevLabel, nextLabel }: { children: ReactNode; prevLabel: string; nextLabel: string }) {
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
  const btn = "absolute top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white text-[#162543] shadow-[0_4px_16px_rgba(15,23,42,0.18)] transition hover:scale-105 sm:grid";
  return (
    <div className="relative mx-auto max-w-6xl">
      {!edge.start && <button type="button" aria-label={prevLabel} onClick={() => move(-1)} className={`${btn} left-1`}><ChevronLeft className="h-5 w-5" /></button>}
      <ul ref={ref} className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</ul>
      {!edge.end && <button type="button" aria-label={nextLabel} onClick={() => move(1)} className={`${btn} right-1`}><ChevronRight className="h-5 w-5" /></button>}
    </div>
  );
}
