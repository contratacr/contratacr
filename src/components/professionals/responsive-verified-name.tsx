"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { VerifiedSeal } from "@/components/ui/verified-seal";

let sharedCanvas: HTMLCanvasElement | null = null;
function measureCanvas() {
  if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
  return sharedCanvas;
}

export function ResponsiveVerifiedName({
  name,
  verified,
  verifiedLabel,
}: {
  name: string;
  verified: boolean;
  verifiedLabel: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [visibleName, setVisibleName] = useState(name);
  // The observer already reports once right after it starts, with layout
  // settled for every card of the batch; measuring again synchronously here
  // would only force an extra layout per card.

  const measure = useCallback(() => {
    const container = containerRef.current;
    const measurer = measureRef.current;
    if (!container || !measurer) return;

    const iconSpace = verified ? 18 : 0;
    const available = Math.max(0, container.clientWidth - iconSpace);
    // Text is measured on a canvas with the element's own font: no DOM writes,
    // so twenty cards mounting together cost one layout instead of one per
    // step of the search below (which used to thrash the page on every batch).
    const context = measureCanvas().getContext("2d");
    if (!context) return;
    context.font = getComputedStyle(measurer).font;
    const widthOf = (value: string) => context.measureText(value).width;

    if (widthOf(name) <= available) {
      setVisibleName(name);
      return;
    }

    const characters = Array.from(name);
    let low = 0;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (widthOf(`${characters.slice(0, middle).join("").trimEnd()}…`) <= available) low = middle;
      else high = middle - 1;
    }
    setVisibleName(`${characters.slice(0, low).join("").trimEnd()}…`);
  }, [name, verified]);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(() => measure());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <span ref={containerRef} className="relative flex w-full min-w-0 items-center">
      <span className="min-w-0 whitespace-nowrap">{visibleName}</span>
      {verified && (
        <VerifiedSeal
          label={verifiedLabel}
          className="ml-1 h-3.5 w-3.5 shrink-0 text-[#009FD9]"
        />
      )}
      <span ref={measureRef} aria-hidden="true" className="pointer-events-none absolute invisible whitespace-nowrap" />
    </span>
  );
}
