"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { GoogleMapPanel, type MapProfessional } from "@/components/maps/google-map-panel";

interface SearchResultsLayoutProps {
  children: React.ReactNode; // server-rendered list column (cards + pagination)
  filters: React.ReactNode; // the <SearchFilters/> sidebar/drawer control
  /** Mobile-only horizontal filter chips (<SearchFilters variant="chips"/>). */
  mobileFilters?: React.ReactNode;
  /** Mobile-only service-search bar (<MobileServiceSearch/>), pinned at the top. */
  mobileSearch?: React.ReactNode;
  /** Mobile-only "<N> profesionales" count shown above the list. */
  countLabel?: string;
  mapData: MapProfessional[];
  apiKey: string;
  locale: string;
  /** proId → card number (1..N) for THIS page, mirrored on the map pins. */
  numbering?: Record<string, number>;
}

/**
 * Responsive search shell:
 *  - Desktop (xl+): three columns — sticky filters sidebar · results list · sticky map.
 *  - Laptop (lg–xl): two columns — results list · map; filters behind a "Filtros" drawer.
 *  - Mobile (<lg): Yelp-style — service search pinned at the top, the map on TOP
 *    (~45vh), then a results panel (horizontal filter chips · count · the vertical
 *    card list). The SAME single map is repositioned via flex `order` (no 2nd instance).
 */
export function SearchResultsLayout({ children, filters, mobileFilters, mobileSearch, countLabel, mapData, apiKey, locale, numbering }: SearchResultsLayoutProps) {
  const t = useTranslations("search");
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div>
      {/* Controls bar — "Filtros" drawer button ONLY at lg–xl (mobile uses the chips
          row; xl+ uses the sidebar). */}
      <div className="hidden lg:flex xl:hidden sticky top-16 z-30 mb-4 items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-sm font-medium text-[#374151] shadow-sm"
        >
          <SlidersHorizontal className="h-4 w-4" /> {t("filters.title")}
        </button>
      </div>

      {/* Filters drawer (lg–xl, opened from the button above) */}
      {showFilters && (
        <div className="xl:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-y-0 left-0 w-[88%] max-w-xs bg-[#f4f7fa] shadow-xl overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[#111827]">{t("filters.title")}</span>
              <button onClick={() => setShowFilters(false)} aria-label={t("close")} className="rounded-full p-1.5 text-[#9ca3af] hover:bg-[#e5e7eb]">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Filters apply INSTANTLY (no apply button); X + backdrop both dismiss. */}
            {filters}
          </div>
        </div>
      )}

      {/* MOBILE = a single clean vertical flow in NORMAL DOM ORDER (search → chips → map →
          count → list). NO sticky/absolute/order/negative-margins on mobile, so NOTHING
          overlaps — the whole page just scrolls. DESKTOP (lg+) switches to flex-row and uses
          `lg:order-*` to arrange the three columns (sidebar · results · map). */}
      <div className="flex flex-col lg:flex-row lg:gap-5">
        {/* 1) MOBILE service-search (top). */}
        {mobileSearch && <div className="lg:hidden mb-3">{mobileSearch}</div>}

        {/* 2) MOBILE filter chips — a single horizontal-scroll row ABOVE the map. */}
        {mobileFilters && <div className="lg:hidden mb-3">{mobileFilters}</div>}

        {/* Filters sidebar — xl+ only (desktop: first column). */}
        <aside className="hidden xl:block lg:order-1 w-64 shrink-0">
          <div className="sticky top-20">{filters}</div>
        </aside>

        {/* 3) Map — mobile: a fixed ~40vh block in normal flow (`relative` + `overflow-hidden`
            so the map canvas never escapes its box; NOT sticky on mobile). Desktop: the right
            column, sticky, taking the remaining width. */}
        <aside className="lg:order-3 w-full lg:flex-1 lg:min-w-0 mb-3 lg:mb-0">
          <div className="relative h-[40vh] lg:h-[calc(100vh-104px)] w-full overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white lg:sticky lg:top-20">
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} numbering={numbering} />
          </div>
        </aside>

        {/* 4) count + 5) list — mobile: below the map; desktop: the middle column. The
            desktop column HUGS the single-column card (~500px; reverted from the wider
            two-column widths) and the map (lg:flex-1) takes the rest. */}
        <div className="lg:order-2 min-w-0 w-full lg:w-[500px] lg:shrink-0">
          {countLabel && <p className="lg:hidden mb-2 text-sm font-medium text-[#374151]">{countLabel}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
