"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

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

  const measure = useCallback(() => {
    const container = containerRef.current;
    const measurer = measureRef.current;
    if (!container || !measurer) return;

    const iconSpace = verified ? 18 : 0;
    const available = Math.max(0, container.clientWidth - iconSpace);
    const widthOf = (value: string) => {
      measurer.textContent = value;
      return measurer.getBoundingClientRect().width;
    };

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
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <span ref={containerRef} className="relative flex w-full min-w-0 items-center">
      <span className="min-w-0 whitespace-nowrap">{visibleName}</span>
      {verified && (
        <CheckCircle2
          aria-label={verifiedLabel}
          className="ml-1 h-3.5 w-3.5 shrink-0 text-[#009FD9]"
        />
      )}
      <span ref={measureRef} aria-hidden="true" className="pointer-events-none absolute invisible whitespace-nowrap" />
    </span>
  );
}
