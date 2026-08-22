"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// A horizontal rail (chips, tabs, section names) that shows there is more to
// the right with a solid chevron at the edge — no fading, the last item stays
// in full colour and simply cuts at the border. The chevron disappears at the
// end of the rail and scrolls the rail by most of its width when tapped.
export function ScrollRail({
  className,
  children,
  hintClassName,
  "aria-label": ariaLabel,
  role,
}: {
  className?: string;
  children: ReactNode;
  hintClassName?: string;
  "aria-label"?: string;
  role?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);

  const measure = useCallback(() => {
    const rail = ref.current;
    if (!rail) return;
    setMore(rail.scrollWidth - rail.clientWidth - rail.scrollLeft > 12);
  }, []);

  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const frame = requestAnimationFrame(measure);
    rail.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    for (const child of Array.from(rail.children)) observer.observe(child);
    return () => {
      cancelAnimationFrame(frame);
      rail.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, children]);

  return (
    <div className="relative min-w-0">
      <div ref={ref} role={role} aria-label={ariaLabel} className={cn("scrollbar-none overflow-x-auto", className)}>
        {children}
      </div>
      {more && (
        <button
          type="button"
          data-rail-hint=""
          aria-label="Ver más"
          onClick={() => ref.current?.scrollBy({ left: Math.round(ref.current.clientWidth * 0.7), behavior: "smooth" })}
          className={cn(
            "absolute right-1 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-[#d5dfe8] bg-white text-[#162543] shadow-sm",
            hintClassName,
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
