"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { GoogleMapPanel, type MapProfessional } from "@/components/maps/google-map-panel";

interface SearchResultsLayoutProps {
  children: React.ReactNode; // server-rendered list column (cards + pagination)
  filters: React.ReactNode; // the <SearchFilters/> sidebar control (desktop xl+)
  drawerFilters: React.ReactNode; // header-less <SearchFilters hideHeader/> for the mobile/tablet drawer
  /** Mobile-only "<N> profesionales en <área>" count shown in the sheet header. */
  countLabel?: string;
  mapData: MapProfessional[];
  apiKey: string;
  locale: string;
  /** proId → card number (1..N) for THIS page, mirrored on the map pins. */
  numbering?: Record<string, number>;
}

// Bottom-sheet snap points (fraction of the viewport height). PEEK = collapsed (map is the
// dominant background, ~1 card + a peek of the next over the bottom); FULL = expanded
// (browse the whole list, header still visible on top). FOCUS = the rest height the sheet
// springs to when a map pin is tapped, so the focused card is comfortably visible.
const PEEK = 0.44;
const FULL = 0.9;
const FOCUS = 0.64;
const MIN = 0.2;
const MAX = 0.92;

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
export function SearchResultsLayout({ children, filters, drawerFilters, countLabel, mapData, apiKey, locale, numbering }: SearchResultsLayoutProps) {
  const t = useTranslations("search");
  const [showFilters, setShowFilters] = useState(false); // full-filter drawer (mobile + lg–xl)

  // The single-line mobile header (in the navbar) hosts the "Filtros" icon button, which
  // dispatches `ccr:open-filters` — open the drawer when we hear it.
  useEffect(() => {
    const open = () => setShowFilters(true);
    window.addEventListener("ccr:open-filters", open);
    return () => window.removeEventListener("ccr:open-filters", open);
  }, []);

  // ── Draggable bottom sheet (mobile) ──────────────────────────────────────────
  const [heightFr, setHeightFr] = useState(PEEK);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const startRef = useRef({ y: 0, h: PEEK });
  const curRef = useRef(PEEK);
  const lastYRef = useRef(0);
  const velRef = useRef(0); // px/move event; negative = moving up (sheet grows)

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
    <div className="flex h-[calc(100dvh-64px)] flex-col overflow-hidden lg:block lg:h-auto lg:overflow-visible">
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
          A LEFT SIDE DRAWER (NOT full-screen): a white card/panel with a shadow that slides
          in from the left over the page, spanning the FULL viewport height, with a dimmed
          backdrop showing the map behind. The header ("Filtros" + the close X) lives INSIDE
          the white card at the TOP, and the filters start right below it (content pinned to
          the top, body scrolls internally — no blank gap). Tap backdrop or X to close.
          Desktop (xl+) uses the sidebar, not this. */}
      {showFilters && (
        <div className="xl:hidden fixed inset-0 z-50">
          {/* Dimmed backdrop — the page/map stays visible behind it; tap to close. */}
          <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={() => setShowFilters(false)} />
          {/* The white card itself — FULL height (`inset-y-0`), rounded right edge + shadow.
              `flex-col`: a pinned header, then the body flex-fills below it and scrolls. */}
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col rounded-r-2xl bg-white shadow-2xl animate-in slide-in-from-left-full duration-300">
            {/* Header INSIDE the card, at the top — "Filtros" left, close X right, divider below. */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3.5">
              <h2 className="text-base font-bold text-[#111827]">{t("filters.title")}</h2>
              <button onClick={() => setShowFilters(false)} aria-label={t("close")} className="-mr-1 rounded-full p-1.5 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Body — filters start at the TOP, directly under the header (header-less
                instance). `flex-1 min-h-0` fills the height and scrolls internally; the
                filters never leave a blank gap. Filters apply INSTANTLY (no apply button). */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-6">
              {drawerFilters}
            </div>
          </div>
        </div>
      )}

      {/* The mobile search + "Filtros" now live in the navbar's single-line header (see
          page.tsx `mobileInline`); "Filtros" opens this drawer via the `ccr:open-filters`
          event above. So the layout goes straight to the map + sheet on mobile. */}

      {/* ONE flex container: mobile = the map fills the remaining height (the sheet floats
          over it); desktop = the 3-column shell (filters · cards · map) via `lg:order-*`. */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-0 lg:flex-row lg:gap-5">
        {/* Filters sidebar — desktop xl+ only (order-1). Hidden on mobile + lg–xl (drawer). */}
        <aside className="hidden xl:block lg:order-1 w-64 shrink-0">
          <div className="sticky top-20">{filters}</div>
        </aside>

        {/* Map — mobile: full-bleed BACKGROUND, flex-fills the area under the header (the sheet
            overlays its lower part). Desktop: the sticky right column (order-3). ONE instance. */}
        <aside className="min-h-0 min-w-0 flex-1 lg:order-3">
          <div className="relative isolate h-full w-full overflow-hidden bg-[#eef2f6] lg:h-[calc(100vh-104px)] lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:bg-white lg:sticky lg:top-20">
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} numbering={numbering} />
          </div>
        </aside>

        {/* BOTTOM SHEET — mobile: a fixed draggable panel over the map holding the count + the
            scrolling card list. Desktop: `lg:contents` dissolves it so the card column
            (order-2) and the desktop map sit in the flex shell. */}
        <div
          className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[20px] border-x border-t border-[#e5e7eb] bg-white shadow-[0_-12px_36px_-14px_rgba(15,23,42,0.32)] lg:static lg:z-auto lg:rounded-none lg:border-0 lg:shadow-none lg:contents"
          // maxHeight keeps the navbar (logo + search + filters + menu) visible even when fully
          // expanded. On desktop the wrapper is `lg:contents`, so these inline styles have no effect.
          style={{ height: `${heightFr * 100}dvh`, maxHeight: "calc(100dvh - 72px)", transition: dragging ? "none" : "height .3s cubic-bezier(.32,.72,0,1)" }}
        >
          {/* Sheet header (handle + count) — the whole strip is the drag target; drag to
              resize, tap to toggle peek/full. `touch-none` keeps the gesture from scrolling
              the page. Mobile only (the desktop column shows none of this). */}
          <div
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className="shrink-0 cursor-grab touch-none select-none rounded-t-[20px] active:cursor-grabbing lg:hidden"
            role="button"
            aria-label={t("filters.title")}
          >
            <div className="flex justify-center pb-1 pt-2.5">
              <span className="h-1.5 w-10 rounded-full bg-[#d1d5db]" />
            </div>
            {countLabel && <p className="px-4 pb-2.5 pt-0.5 text-[13px] font-semibold text-[#111827]">{countLabel}</p>}
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
