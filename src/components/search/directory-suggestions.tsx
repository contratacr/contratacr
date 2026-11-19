"use client";

import { Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIRECTORY_SECTION_ICONS } from "@/components/landing/directory-nav";
import type { DirectorySectionSuggestion } from "@/lib/search/directory-search";

// «Lugares» group of the unified search (2026-11-19): directory sections that
// match the typed text, under the professional «Servicios» group. Shared by the
// home search, the header search and the mobile search sheet.

export function SuggestionGroupLabel({ children, variant = "dropdown" }: { children: string; variant?: "dropdown" | "sheet" }) {
  return (
    <p
      role="presentation"
      className={variant === "sheet"
        ? "px-2 pb-1 pt-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#7a8797]"
        : "px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a8797]"}
    >
      {children}
    </p>
  );
}

export function DirectorySuggestionRows({
  items,
  locale,
  activeIndex = -1,
  onPick,
  variant = "dropdown",
}: {
  items: DirectorySectionSuggestion[];
  locale: string;
  /** Index inside `items` that the keyboard highlights (-1: none). */
  activeIndex?: number;
  onPick: (item: DirectorySectionSuggestion) => void;
  variant?: "dropdown" | "sheet";
}) {
  if (!items.length) return null;
  const en = locale === "en";
  return (
    <div data-search-places-group="" role="group" aria-label={en ? "Places" : "Lugares"} className="@container">
      <SuggestionGroupLabel variant={variant}>{en ? "Places" : "Lugares"}</SuggestionGroupLabel>
      {items.map((item, i) => {
        const Icon = DIRECTORY_SECTION_ICONS[item.section] ?? Store;
        const active = i === activeIndex;
        return variant === "sheet" ? (
          <button
            key={item.section}
            type="button"
            role="option"
            aria-selected={active}
            data-search-place-section={item.section}
            onClick={() => onPick(item)}
            className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left active:bg-[#eef9fd]", active && "bg-[#eef9fd]")}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eaf7fd]">
              <Icon className="h-5 w-5 text-[#009FD9]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-bold text-[#1A2744]">{item.label}</span>
              <span className="block truncate text-[12px] font-semibold text-[#6b7280]">{en ? "Places and businesses" : "Lugares y negocios"}</span>
            </span>
          </button>
        ) : (
          <button
            key={item.section}
            type="button"
            role="option"
            aria-selected={active}
            data-search-place-section={item.section}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
            className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors", active ? "bg-[#EBF5FB]" : "hover:bg-[#EBF5FB]")}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#eaf7fd]">
              <Icon className="h-4 w-4 text-[#009FD9]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1a2744]">{item.label}</span>
            {/* The header dropdown is as narrow as its field: the hint only where it fits. */}
            <span className="hidden shrink-0 text-[11px] text-gray-400 @sm:inline">{en ? "Places and businesses" : "Lugares y negocios"}</span>
          </button>
        );
      })}
    </div>
  );
}
