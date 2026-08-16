"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";

type ResponsiveServiceSummaryProps = {
  labels: string[];
  totalCount: number;
  profileHref: string;
  moreTitle: string;
  featuredLabel?: string;
  testId?: string;
  className?: string;
  itemClassName?: string;
  moreClassName?: string;
  itemTestId?: string;
  moreTestId?: string;
};

export function ResponsiveServiceSummary({
  labels,
  totalCount,
  profileHref,
  moreTitle,
  featuredLabel,
  testId = "professional-card-desktop-service-summary",
  className = "relative flex w-full min-w-0 items-center gap-2 overflow-hidden",
  itemClassName = "inline-flex max-w-full shrink-0 items-center whitespace-nowrap text-[11px] font-semibold leading-snug text-[#6b7280]",
  moreClassName = "relative z-10 inline-flex shrink-0 text-[10px] font-bold text-[#6b7280] transition-colors hover:text-[#009FD9]",
  itemTestId,
  moreTestId,
}: ResponsiveServiceSummaryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(Math.min(labels.length, 2));

  const measure = useCallback(() => {
    const container = containerRef.current;
    const measurer = measureRef.current;
    if (!container || !measurer) return;

    const labelWidths = Array.from(measurer.querySelectorAll<HTMLElement>("[data-service-measure]"), (node) => node.offsetWidth);
    const moreWidths = Array.from(measurer.querySelectorAll<HTMLElement>("[data-more-measure]"), (node) => node.offsetWidth);
    const featuredWidth = measurer.querySelector<HTMLElement>("[data-featured-measure]")?.offsetWidth ?? 0;
    const available = container.clientWidth;
    const gap = 8;

    let nextCount = 0;
    for (let count = labels.length; count >= 0; count -= 1) {
      const hiddenCount = Math.max(0, totalCount - count);
      const widths = labelWidths.slice(0, count).reduce((sum, width) => sum + width, 0);
      const moreWidth = hiddenCount > 0 ? (moreWidths[hiddenCount] ?? 0) : 0;
      const itemCount = count + (hiddenCount > 0 ? 1 : 0) + (featuredWidth > 0 ? 1 : 0);
      const required = widths + moreWidth + featuredWidth + Math.max(0, itemCount - 1) * gap;
      if (required <= available) {
        nextCount = count;
        break;
      }
    }
    setVisibleCount((current) => current === nextCount ? current : nextCount);
  }, [labels, totalCount]);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  const shown = labels.slice(0, visibleCount);
  const hiddenCount = Math.max(0, totalCount - shown.length);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      data-visible-count={shown.length}
      data-hidden-count={hiddenCount}
      className={className}
    >
      {shown.map((label) => (
        <span key={label} data-testid={itemTestId} className={itemClassName} title={label}>
          {label}
        </span>
      ))}
      {hiddenCount > 0 && (
        <Link
          href={profileHref}
          title={moreTitle}
          aria-label={moreTitle}
          data-testid={moreTestId}
          className={moreClassName}
        >
          +{hiddenCount}
        </Link>
      )}
      {featuredLabel && (
        <span className="inline-flex shrink-0 items-center rounded-full bg-[#fff8ed] px-2 py-0.5 text-[10px] font-semibold text-[#c74600]">
          {featuredLabel}
        </span>
      )}

      <div ref={measureRef} aria-hidden="true" className="pointer-events-none absolute invisible flex items-center gap-2 whitespace-nowrap">
        {labels.map((label) => (
          <span key={`measure-${label}`} data-service-measure className="text-[11px] font-semibold leading-snug">{label}</span>
        ))}
        {Array.from({ length: totalCount + 1 }, (_, count) => (
          <span key={`more-${count}`} data-more-measure={count} className="text-[10px] font-bold">+{count}</span>
        ))}
        {featuredLabel && <span data-featured-measure className="rounded-full px-2 py-0.5 text-[10px] font-semibold">{featuredLabel}</span>}
      </div>
    </div>
  );
}
