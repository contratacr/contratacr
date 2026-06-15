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

      <div className="flex flex-col lg:flex-row lg:gap-5">
        {/* MOBILE service-search — pinned at the top, above the map. */}
        {mobileSearch && <div className="order-1 lg:hidden mb-3">{mobileSearch}</div>}

        {/* Filters sidebar — xl+ only. */}
        <aside className="hidden xl:block xl:order-1 w-64 shrink-0">
          <div className="sticky top-20">{filters}</div>
        </aside>

        {/* Map — TOP on mobile (~45vh), RIGHT sticky column on desktop. ONE instance,
            repositioned via flex `order`; on desktop it takes the remaining width
            (`lg:flex-1`) next to the hugging results column. */}
        <aside className="order-2 lg:order-3 w-full lg:flex-1 lg:min-w-0 mb-3 lg:mb-0">
          <div className="h-[45vh] lg:h-[calc(100vh-104px)] lg:sticky lg:top-20 w-full overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} numbering={numbering} />
          </div>
        </aside>

        {/* Results panel — below the map on mobile; the middle column on desktop. It hugs
            the wider two-column card on desktop (responsive width). */}
        <div className="order-3 lg:order-2 min-w-0 w-full lg:w-[620px] xl:w-[680px] 2xl:w-[880px] lg:shrink-0">
          {/* MOBILE: horizontal filter chips row. */}
          {mobileFilters && <div className="lg:hidden mb-3">{mobileFilters}</div>}
          {/* MOBILE: result count above the list. */}
          {countLabel && <p className="lg:hidden mb-2 text-sm font-medium text-[#374151]">{countLabel}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
