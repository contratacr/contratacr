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
    // Measured again whenever the row or its cards change size: measured only once, a row painted before its cards
    // (hidden while the page settles, fonts or photos still loading) read as "fits" and the arrows never came back.
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => { ro.disconnect(); el.removeEventListener("scroll", sync); window.removeEventListener("resize", sync); };
  }, []);
  // Owner 2026-11-27: each arrow tap moves exactly one card, aligned to the row's left edge, and never past the last card
  // (the target is clamped to the real scroll range, so the row never slides into empty space).
  const move = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    if (!items.length) return;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const max = el.scrollWidth - el.clientWidth;
    const current = items.findIndex((it) => it.offsetLeft - pad >= el.scrollLeft - 2);
    const from = current === -1 ? items.length - 1 : current;
    const target = items[Math.min(items.length - 1, Math.max(0, from + dir))]!;
    el.scrollTo({ left: Math.min(max, Math.max(0, target.offsetLeft - pad)), behavior: "smooth" });
  };
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
      <ul ref={ref} className="relative flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</ul>
    </div>
  );
}
