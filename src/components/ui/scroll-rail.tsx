"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// A horizontal rail (chips, tabs, section names) that says "there is more" the
// honest way: the last visible item is always cut mid-way at the right edge —
// never a fade, never a single stray letter, never a tidy full item that looks
// like the end. The rail measures where its edge falls and clips itself (a
// clip-path, so nothing reflows and the measurement never feeds back into the
// layout) so the cut lands at 30–50 % of an item; at the end of the scroll the
// clip goes away and the last item reads whole.
const MIN_PEEK_RATIO = 0.3;
const MAX_PEEK_RATIO = 0.5;

export function ScrollRail({
  className,
  children,
  "aria-label": ariaLabel,
  role,
}: {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  role?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [trim, setTrim] = useState(0);

  const measure = useCallback(() => {
    const rail = ref.current;
    if (!rail) return;
    const available = rail.clientWidth;
    if (available <= 0) return;
    const atEnd = rail.scrollWidth - rail.scrollLeft - available <= 1;
    if (rail.scrollWidth <= available || atEnd) {
      setTrim((current) => (current === 0 ? current : 0));
      return;
    }
    const railLeft = rail.getBoundingClientRect().left;
    const edge = railLeft + available;
    let nextTrim = 0;
    for (const child of Array.from(rail.children) as HTMLElement[]) {
      const box = child.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.left < edge && box.right > edge) {
        // An item straddles the edge: make sure enough of it shows.
        const visible = (edge - box.left) / box.width;
        if (visible < MIN_PEEK_RATIO) {
          // Too little of it shows to read as "cut": cut the previous item instead.
          const previous = child.previousElementSibling as HTMLElement | null;
          if (previous) {
            const prev = previous.getBoundingClientRect();
            nextTrim = Math.round(edge - (prev.left + prev.width * MAX_PEEK_RATIO));
          }
        } else if (visible > MAX_PEEK_RATIO) nextTrim = Math.round(edge - (box.left + box.width * MAX_PEEK_RATIO));
        break;
      }
      if (box.left >= edge) {
        // The edge falls in the gap between items: cut the previous one instead.
        const previous = child.previousElementSibling as HTMLElement | null;
        if (previous) {
          const prev = previous.getBoundingClientRect();
          nextTrim = Math.round(edge - (prev.left + prev.width * MAX_PEEK_RATIO));
        }
        break;
      }
    }
    nextTrim = Math.max(0, Math.min(nextTrim < 0 ? 0 : nextTrim, Math.round(available * 0.4)));
    setTrim((current) => (Math.abs(current - nextTrim) <= 1 ? current : nextTrim));
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
      <div
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        data-rail-trim={trim || undefined}
        style={trim ? { clipPath: `inset(0 ${trim}px 0 0)` } : undefined}
        className={cn("scrollbar-none overflow-x-auto", className)}
      >
        {children}
      </div>
    </div>
  );
}
