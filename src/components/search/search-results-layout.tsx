"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { GoogleMapPanel, type MapFocusTarget, type MapProfessional } from "@/components/maps/google-map-panel";

interface SearchResultsLayoutProps {
  children: React.ReactNode; // server-rendered list column (cards + pagination)
  filters: React.ReactNode; // the <SearchFilters/> desktop sidebar control
  quickFilters?: React.ReactNode;
  /** The drawer variant of the filters (a <SearchFilters closable/> whose header X
   *  dispatches `ccr:close-filters`). Falls back to `filters` if omitted. */
  drawerFilters?: React.ReactNode;
  /** Mobile-only "<N> profesionales en <área>" count shown in the sheet header. */
  countLabel?: string;
  mapData: MapProfessional[];
  apiKey: string;
  locale: string;
  /** proId → card number (1..N) for THIS page, mirrored on the map pins. */
  numbering?: Record<string, number>;
  hasActiveFilters?: boolean;
  mapFocusTarget?: MapFocusTarget | null;
  resetKey?: string;
}

// Bottom-sheet snap points (fraction of the viewport height). PEEK = collapsed (map is the
// dominant background, a compact card-list peek over the bottom); FULL = expanded
// (browse the whole list, header still visible on top). FOCUS = the rest height the sheet
// springs to when a map pin is tapped, so the focused card is comfortably visible.
const PEEK = 0.32;
const FULL = 0.72;
const FOCUS = 0.58;
const MIN = 0.18;
const MAX = 0.74;

/**
 * Responsive search shell — ONE map instance + ONE card list, repositioned via classes.
 *  - Mobile (<lg): a polished map-search experience (Yelp/Airbnb/Hulihealth) — a compact
 *    HEADER (search + a "Filtros" control; the site navbar above is the menu), the MAP as a
 *    full-bleed BACKGROUND filling the rest of the viewport, and the professional cards in a
 *    DRAGGABLE BOTTOM SHEET floating over the map. Swipe the handle up → the sheet expands
 *    (covers more map); swipe down → it collapses to a peek (more map). Tapping a pin springs
 *    the sheet open and scrolls to that card; the pin mini-card still works.
 *  - Laptop (lg–xl): two columns — results · map; filters behind a "Filtros" drawer.
 *  - Desktop (xl+): three columns — sticky filters sidebar · results · sticky map.
 *  DESKTOP is unchanged (same `lg:` classes). The bottom-sheet wrapper is `lg:contents`, so on
 *  desktop it dissolves and the card column (`lg:order-2`) drops into the 3-column flex shell.
 */
export function SearchResultsLayout({ children, filters, quickFilters, drawerFilters, countLabel, mapData, apiKey, locale, numbering, hasActiveFilters = false, mapFocusTarget = null, resetKey }: SearchResultsLayoutProps) {
  const t = useTranslations("search");
  const [showFilters, setShowFilters] = useState(false); // full-filter drawer (mobile + lg-xl)
  const listRef = useRef<HTMLDivElement | null>(null);
  const [heightFr, setHeightFr] = useState(PEEK);
  const [dragging, setDragging] = useState(false);
  const [areaSearching, setAreaSearching] = useState(false);
  const [searchAreaVisible, setSearchAreaVisible] = useState(false);
  const draggingRef = useRef(false);
  const startRef = useRef({ y: 0, h: PEEK });
  const curRef = useRef(PEEK);
  const lastYRef = useRef(0);
  const velRef = useRef(0); // px/move event; negative = moving up (sheet grows)
  const sheetExpanded = heightFr > (PEEK + FULL) / 2;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return () => {
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    listRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setAreaSearching(false);
  }, [resetKey]);

  // The single-line mobile header (in the navbar) hosts the "Filtros" icon button, which
  // dispatches `ccr:open-filters`; the drawer's in-card X dispatches `ccr:close-filters`.
  useEffect(() => {
    const open = () => setShowFilters(true);
    const close = () => setShowFilters(false);
    const setAreaVisible = (event: Event) => {
      setSearchAreaVisible(Boolean((event as CustomEvent<boolean>).detail));
      if (!(event as CustomEvent<boolean>).detail) setAreaSearching(false);
    };
    window.addEventListener("ccr:open-filters", open);
    window.addEventListener("ccr:close-filters", close);
    window.addEventListener("ccr:search-area-visible", setAreaVisible as EventListener);
    return () => {
      window.removeEventListener("ccr:open-filters", open);
      window.removeEventListener("ccr:close-filters", close);
      window.removeEventListener("ccr:search-area-visible", setAreaVisible as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!showFilters) {
      document.body.classList.remove("ccr-search-filters-open");
      return;
    }
    document.body.classList.add("ccr-search-filters-open");
    return () => {
      document.body.classList.remove("ccr-search-filters-open");
    };
  }, [showFilters]);

  // Draggable bottom sheet (mobile)
  function onHandleDown(e: React.PointerEvent) {
    draggingRef.current = true;
    setDragging(true);
    startRef.current = { y: e.clientY, h: heightFr };
    curRef.current = heightFr;
    lastYRef.current = e.clientY;
    velRef.current = 0;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const vh = window.innerHeight || 1;
    velRef.current = e.clientY - lastYRef.current;
    lastYRef.current = e.clientY;
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
    const v = velRef.current;
    let target: number;
    if (moved < 0.03 && Math.abs(v) < 4) {
      target = startRef.current.h > (PEEK + 0.03) ? PEEK : FULL; // a tap toggles
    } else if (v < -3) {
      target = FULL; // flick up
    } else if (v > 3) {
      target = PEEK; // flick down
    } else {
      target = curRef.current > (PEEK + FULL) / 2 ? FULL : PEEK; // settle to nearest
    }
    setHeightFr(target);
  }

  // Tapping a map pin (mobile) springs the sheet open and scrolls its card into view. The
  // map dispatches `ccr:focus-card` with the proId; the ring highlight is already applied by
  // the map. Desktop ignores this (the sheet doesn't exist there).
  useEffect(() => {
    const onFocus = (e: Event) => {
      if (typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches) return;
      const proId = (e as CustomEvent<string>).detail;
      setHeightFr((h) => Math.max(h, FOCUS));
      // Wait for the sheet to grow before scrolling the card to the middle of the list.
      window.setTimeout(() => {
        document.getElementById(`pro-card-${proId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 260);
    };
    window.addEventListener("ccr:focus-card", onFocus as EventListener);
    return () => window.removeEventListener("ccr:focus-card", onFocus as EventListener);
  }, []);

  return (
    <div className="ccr-search-results-layout flex h-[calc(100dvh-var(--ccr-native-header-height,64px))] flex-col overflow-hidden bg-[#f4f7fa] lg:block lg:h-auto lg:overflow-visible lg:bg-transparent">
      {/* Controls bar — "Filtros" drawer button ONLY at lg–xl (xl+ uses the sidebar). */}
      <div className="hidden lg:flex xl:hidden sticky top-16 z-30 mb-4 items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-sm font-medium text-[#374151] shadow-sm"
        >
          <SlidersHorizontal className="h-4 w-4" /> {t("filters.title")}
        </button>
      </div>

      {/* Full-filter drawer (opened from the lg–xl button OR the mobile header "Filtros").
          The white "Filtros" card sits on a thin gray frame (`p-2.5`) and rises UP near the
          top — its OWN header now holds the title + the close X (the drawer no longer adds a
          separate X row above it, so there's no wasted gap). X + backdrop both dismiss;
          filters apply INSTANTLY (no apply button). */}
      {showFilters && (
        <div className="xl:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-y-0 left-0 w-[88%] max-w-xs overflow-y-auto bg-[#f4f7fa] p-2.5 shadow-xl">
            {drawerFilters ?? filters}
          </div>
        </div>
      )}

      {/* Mobile search lives in the navbar; filters float over the map like modern map apps. */}

      {/* ONE flex container: mobile = the map fills the remaining height (the sheet floats
          over it); desktop = the 3-column shell (filters · cards · map) via `lg:order-*`. */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-0 bg-[#f4f7fa] lg:flex-row lg:gap-5 lg:bg-transparent">
        {/* Filters sidebar — desktop xl+ only (order-1). Hidden on mobile + lg–xl (drawer). */}
        <aside className="hidden xl:block lg:order-1 w-64 shrink-0">
          <div className="sticky top-20">{filters}</div>
        </aside>

        {/* Map — mobile: full-bleed BACKGROUND, flex-fills the area under the header (the sheet
            overlays its lower part). Desktop: the sticky right column (order-3). ONE instance. */}
        <aside className="min-h-0 min-w-0 flex-1 lg:order-3">
          <div className="relative isolate h-full w-full overflow-hidden bg-[#eef2f6] lg:sticky lg:top-20 lg:h-[calc(100vh-104px)] lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:bg-transparent">
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} numbering={numbering} focusTarget={mapFocusTarget} />
          </div>
        </aside>

        {/* BOTTOM SHEET — mobile: a fixed draggable panel over the map holding the count + the
            scrolling card list. Desktop: `lg:contents` dissolves it so the card column
            (order-2) and the desktop map sit in the flex shell. */}
        <div
          className="ccr-search-bottom-sheet fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-visible rounded-t-[20px] border-x border-t border-[#e5e7eb] bg-white shadow-[0_-12px_36px_-14px_rgba(15,23,42,0.32)] lg:static lg:z-auto lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:contents"
          // maxHeight keeps the navbar AND the map controls visible even when the sheet is
          // expanded. The list scrolls inside the sheet; the sheet itself should never cover
          // the filter/map affordances at the top of the mobile map.
          style={{ height: `${heightFr * 100}dvh`, maxHeight: "calc(100dvh - 164px)", transition: dragging ? "none" : "height .3s cubic-bezier(.32,.72,0,1)" }}
        >
          {/* Sheet header (handle + count) — the whole strip is the drag target; drag to
              resize, tap to toggle peek/full. `touch-none` keeps the gesture from scrolling
              the page. Mobile only (the desktop column shows none of this). */}
          <div className="relative z-40 shrink-0 overflow-visible rounded-t-[20px] lg:hidden">
            <div
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              className="cursor-grab touch-none select-none rounded-t-[20px] active:cursor-grabbing"
              role="button"
              aria-label={t("filters.title")}
            >
              <div className="flex justify-center pb-1 pt-2">
                <span className="h-1.5 w-10 rounded-full bg-[#d1d5db]" />
              </div>
            </div>
            {quickFilters && (
              <div className={`px-4 pb-2 pt-1 ${sheetExpanded ? "ccr-search-filter-arrows-down" : "ccr-search-filter-arrows-up"}`}>
                {quickFilters}
              </div>
            )}
            {countLabel && <p className="px-4 pb-2 pt-0.5 text-[13px] font-semibold text-[#111827]">{countLabel}</p>}
          </div>

          {/* Cards — mobile: the sheet's scrolling body. Desktop: the middle column (order-2). */}
          <div ref={listRef} className="ccr-search-sheet-scroll min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-0.5 lg:order-2 lg:w-[640px] lg:flex-none lg:shrink-0 lg:overflow-visible lg:overscroll-auto lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 xl:w-[700px] 2xl:w-[820px]">
            {quickFilters && <div className="mb-3 hidden lg:block xl:hidden">{quickFilters}</div>}
            {children}
          </div>
        </div>
        {searchAreaVisible && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--ccr-native-header-height,124px)+0.75rem)] z-40 flex justify-center px-4 lg:hidden">
          <button
            type="button"
            onClick={() => {
              setAreaSearching(true);
              window.dispatchEvent(new CustomEvent("ccr:search-this-area"));
            }}
            disabled={areaSearching}
            className="pointer-events-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-extrabold text-[#162543] shadow-[0_10px_28px_-18px_rgba(15,23,42,0.65)] ring-1 ring-[#dbe5ec]"
          >
            {areaSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#009FD9]" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {areaSearching
              ? locale === "en" ? "Searching..." : "Buscando..."
              : locale === "en" ? "Search this area" : "Buscar en esta zona"}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
