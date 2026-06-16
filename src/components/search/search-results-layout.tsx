"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
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

// Bottom-sheet snap points (fraction of the viewport height). PEEK = collapsed (filter
// chips + the first card peek over the map); FULL = expanded (browse the whole list,
// leaving the search bar + navbar visible on top).
const PEEK = 0.46;
const FULL = 0.84;
const MIN = 0.22;
const MAX = 0.86;

/**
 * Responsive search shell — ONE map instance + ONE card list, repositioned via classes.
 *  - Mobile (<lg): a Yelp-style experience — a pinned SEARCH bar on top, a LARGE full-bleed
 *    map filling the rest of the viewport, and a draggable BOTTOM SHEET sliding up over the
 *    map's lower part (drag handle → filter-icon + chip row → count → the scrolling card
 *    list). The cards live INSIDE the sheet (a clean contained panel over the map), never
 *    bleeding onto the map.
 *  - Laptop (lg–xl): two columns — results · map; filters behind a "Filtros" drawer.
 *  - Desktop (xl+): three columns — sticky filters sidebar · results · sticky map.
 *  DESKTOP is unchanged (same `lg:` classes); only the mobile presentation differs. The
 *  bottom-sheet wrapper is `lg:contents`, so on desktop it dissolves and the card column
 *  (`lg:order-2`) drops straight into the 3-column flex shell.
 */
export function SearchResultsLayout({ children, filters, mobileFilters, mobileSearch, countLabel, mapData, apiKey, locale, numbering }: SearchResultsLayoutProps) {
  const t = useTranslations("search");
  const params = useSearchParams();
  const [showFilters, setShowFilters] = useState(false); // full-filter drawer (mobile + lg–xl)

  // Any active filter → show a dot on the mobile filter-icon button.
  const hasActiveFilters =
    !!params.get("q") || !!params.get("categoria") || !!params.get("provincia") ||
    !!params.get("canton") || !!params.get("aseguradora") || params.get("verificados") === "1" ||
    !!params.get("lat") || (!!params.get("sortBy") && params.get("sortBy") !== "rating");

  // ── Draggable bottom sheet (mobile) ──────────────────────────────────────────
  const [heightFr, setHeightFr] = useState(PEEK);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const startRef = useRef({ y: 0, h: PEEK });
  const curRef = useRef(PEEK);

  function onHandleDown(e: React.PointerEvent) {
    draggingRef.current = true;
    setDragging(true);
    startRef.current = { y: e.clientY, h: heightFr };
    curRef.current = heightFr;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const vh = window.innerHeight || 1;
    const dy = startRef.current.y - e.clientY; // up = grow
    const h = Math.min(MAX, Math.max(MIN, startRef.current.h + dy / vh));
    curRef.current = h;
    setHeightFr(h);
  }
  function onHandleUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const moved = Math.abs(curRef.current - startRef.current.h);
    if (moved < 0.04) {
      // A tap on the handle → toggle between peek and full.
      setHeightFr(startRef.current.h > (PEEK + 0.02) ? PEEK : FULL);
    } else {
      // A drag → snap to the nearest detent.
      setHeightFr(curRef.current > (PEEK + FULL) / 2 ? FULL : PEEK);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-64px)] flex-col overflow-hidden lg:block lg:h-auto lg:overflow-visible">
      {/* Controls bar — "Filtros" drawer button ONLY at lg–xl (mobile uses the in-sheet
          filter-icon; xl+ uses the sidebar). */}
      <div className="hidden lg:flex xl:hidden sticky top-16 z-30 mb-4 items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-sm font-medium text-[#374151] shadow-sm"
        >
          <SlidersHorizontal className="h-4 w-4" /> {t("filters.title")}
        </button>
      </div>

      {/* Full-filter drawer (opened from the lg–xl button OR the mobile sheet's filter-icon) */}
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

      {/* MOBILE — the search bar pinned at the very top (Yelp), above the big map. */}
      <div className="lg:hidden shrink-0 px-4 pt-0.5 pb-2">{mobileSearch}</div>

      {/* ONE flex container: mobile = the map fills the remaining height (the sheet floats
          over it); desktop = the 3-column shell (filters · cards · map) via `lg:order-*`. */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-0 lg:flex-row lg:gap-5">
        {/* Filters sidebar — desktop xl+ only (order-1). Hidden on mobile + lg–xl (drawer). */}
        <aside className="hidden xl:block lg:order-1 w-64 shrink-0">
          <div className="sticky top-20">{filters}</div>
        </aside>

        {/* Map — mobile: full-bleed, flex-fills the area under the search bar (the sheet
            overlays its lower part). Desktop: the sticky right column (order-3). ONE instance. */}
        <aside className="min-h-0 min-w-0 flex-1 lg:order-3">
          <div className="relative isolate h-full w-full overflow-hidden bg-white lg:h-[calc(100vh-104px)] lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:sticky lg:top-20">
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} numbering={numbering} />
          </div>
        </aside>

        {/* BOTTOM SHEET — mobile: a fixed draggable panel over the map holding the filter row,
            count and the scrolling card list. Desktop: `lg:contents` dissolves it so the card
            column (order-2) and the desktop map sit in the flex shell. */}
        <div
          className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-x border-t border-[#e5e7eb] bg-white shadow-[0_-10px_34px_-14px_rgba(15,23,42,0.30)] lg:static lg:z-auto lg:rounded-none lg:border-0 lg:shadow-none lg:contents"
          style={{ height: `${heightFr * 100}dvh`, transition: dragging ? "none" : "height .28s cubic-bezier(.4,0,.2,1)" }}
        >
          {/* Sheet chrome — mobile only (the desktop column shows none of this). */}
          <div className="shrink-0 lg:hidden">
            {/* Drag handle — drag to resize, tap to toggle peek/full. `touch-none` keeps the
                gesture from scrolling the page. */}
            <div
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              className="flex cursor-grab touch-none justify-center pb-1.5 pt-2.5 active:cursor-grabbing"
              role="button"
              aria-label={t("filters.title")}
            >
              <span className="h-1.5 w-10 rounded-full bg-[#d1d5db]" />
            </div>

            {/* Filter row — a leading filter-icon button (opens the full-filter drawer) + the
                horizontally-scrollable chip row (never wraps). */}
            <div className="flex items-center gap-2 px-3 pb-2">
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                aria-label={t("filters.title")}
                className="relative shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#374151] shadow-sm"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {hasActiveFilters && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#009FD9]" />}
              </button>
              <div className="min-w-0 flex-1">{mobileFilters}</div>
            </div>

            {/* Count */}
            {countLabel && <p className="px-4 pb-2 text-[13px] font-medium text-[#374151]">{countLabel}</p>}
          </div>

          {/* Cards — mobile: the sheet's scrolling body. Desktop: the middle column (order-2). */}
          <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-0.5 lg:flex-none lg:overflow-visible lg:overscroll-auto lg:px-0 lg:pb-0 lg:pt-0 lg:order-2 lg:w-[640px] lg:shrink-0 xl:w-[700px] 2xl:w-[820px]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
