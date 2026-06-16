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
 * Responsive search shell — ONE map instance, repositioned via responsive classes.
 *  - Mobile (<lg): a clean VERTICAL flow (Yelp-style) — search bar → horizontal filter
 *    chips → a FIXED-height map (~42vh) → the count → the stacked card list. The whole
 *    page scrolls normally; cards never overlap the map (no bottom-sheet).
 *  - Laptop (lg–xl): two columns — results · map; filters behind a "Filtros" drawer.
 *  - Desktop (xl+): three columns — sticky filters sidebar · results · sticky map.
 *  DESKTOP is unchanged; only the mobile presentation differs (vertical vs the old
 *  draggable bottom-sheet).
 */
export function SearchResultsLayout({ children, filters, mobileFilters, mobileSearch, countLabel, mapData, apiKey, locale, numbering }: SearchResultsLayoutProps) {
  const t = useTranslations("search");
  const [showFilters, setShowFilters] = useState(false); // lg–xl drawer

  return (
    <div>
      {/* Controls bar — "Filtros" drawer button ONLY at lg–xl (mobile uses the inline
          chips row; xl+ uses the sidebar). */}
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

      {/* ONE flex container: vertical stack on mobile (flow order = DOM order), reflowed
          into the 3-column shell on desktop via `lg:order-*`. The map + the card list each
          render exactly ONCE. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-5">
        {/* Filters sidebar — desktop xl+ only (order-1). Hidden on mobile + lg–xl (drawer). */}
        <aside className="hidden xl:block lg:order-1 w-64 shrink-0">
          <div className="sticky top-20">{filters}</div>
        </aside>

        {/* MOBILE — search bar + horizontal filter chips, ABOVE the map (lg:hidden). */}
        <div className="lg:hidden flex flex-col gap-2.5">
          {mobileSearch}
          {/* Edge-to-edge horizontal scroll for the chips (never wraps). */}
          <div className="-mx-4 px-4 sm:-mx-6 sm:px-6">{mobileFilters}</div>
        </div>

        {/* Map — mobile: a fixed-height block in the flow (below the chips). Desktop: the
            sticky right column (order-3, fills remaining width). ONE instance. */}
        <aside className="lg:order-3 lg:flex-1 lg:min-w-0">
          <div className="relative isolate h-[42vh] min-h-[260px] w-full overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white lg:h-[calc(100vh-104px)] lg:sticky lg:top-20">
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} numbering={numbering} />
          </div>
        </aside>

        {/* Count — mobile only (desktop shows it in the page header). */}
        {countLabel && <p className="lg:hidden px-0.5 text-[13px] font-medium text-[#374151]">{countLabel}</p>}

        {/* Cards — mobile: below the count (flow). Desktop: the middle column (order-2). */}
        <div className="min-w-0 lg:order-2 lg:w-[640px] lg:flex-none lg:shrink-0 xl:w-[700px] 2xl:w-[820px]">
          {children}
        </div>
      </div>
    </div>
  );
}
