"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { GoogleMapPanel, type MapProfessional } from "@/components/maps/google-map-panel";

interface SearchResultsLayoutProps {
  children: React.ReactNode; // server-rendered list column (cards + pagination)
  filters: React.ReactNode; // the <SearchFilters/> sidebar/drawer control
  /** Mobile-only horizontal filter chips (<SearchFilters variant="chips"/>). */
  mobileFilters?: React.ReactNode;
  /** Mobile-only service-search bar (<MobileServiceSearch/>), pinned in the sheet header. */
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
 *  - Mobile (<lg): map-as-background + a DRAGGABLE bottom sheet over it (Yelp/Apple-Maps
 *    pattern). The map fills the screen; the results panel (search · chips · count · card
 *    list) is a sheet the user swipes up/down to see more cards or more map. The SAME single
 *    map instance is repositioned via responsive classes (absolute on mobile → static column
 *    on desktop) — NOT a 2nd instance.
 */

// Bottom-sheet snap points, as the percentage of the region taken by the MAP at the top
// (so the sheet's height is `100 - pct`%). Higher = collapsed (more map, fewer cards). We
// size the sheet by HEIGHT (not a transform) so its inner scroll area always equals the
// visible window — otherwise the last cards would sit below the fold, unreachable.
const SNAP = { full: 12, mid: 52, peek: 80 } as const;
const DETENTS = [SNAP.full, SNAP.mid, SNAP.peek];
const nearestDetent = (pct: number) =>
  DETENTS.reduce((a, b) => (Math.abs(b - pct) < Math.abs(a - pct) ? b : a));

export function SearchResultsLayout({ children, filters, mobileFilters, mobileSearch, countLabel, mapData, apiKey, locale, numbering }: SearchResultsLayoutProps) {
  const t = useTranslations("search");
  const [showFilters, setShowFilters] = useState(false);

  // ── Mobile bottom-sheet drag state ───────────────────────────────────────
  // `isMobile` gates the inline transform so it NEVER leaks onto desktop (inline
  // styles beat Tailwind's `lg:` classes, so desktop must get no inline transform).
  const [isMobile, setIsMobile] = useState(false);
  const [sheetPct, setSheetPct] = useState<number>(SNAP.mid);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startPct: number; h: number; moved: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    const h = wrapRef.current?.getBoundingClientRect().height ?? window.innerHeight;
    drag.current = { startY: e.clientY, startPct: sheetPct, h, moved: 0 };
    setDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  }, [sheetPct]);

  const onHandleMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const deltaY = e.clientY - d.startY;
    d.moved = Math.max(d.moved, Math.abs(deltaY));
    const next = Math.min(SNAP.peek, Math.max(SNAP.full, d.startPct + (deltaY / d.h) * 100));
    setSheetPct(next);
  }, []);

  const onHandleUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (!d) return;
    if (d.moved < 6) {
      // Tap on the grip — toggle expand/collapse.
      const s = d.startPct;
      setSheetPct(s > SNAP.mid ? SNAP.mid : s === SNAP.full ? SNAP.mid : SNAP.full);
    } else {
      setSheetPct((p) => nearestDetent(p));
    }
  }, []);

  const sheetStyle = isMobile ? { height: `${100 - sheetPct}%` } : undefined;

  return (
    <div>
      {/* Controls bar — "Filtros" drawer button ONLY at lg–xl (mobile uses the chips
          row in the sheet; xl+ uses the sidebar). */}
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

      {/* MOBILE = map-as-background + a draggable bottom sheet over it. The region is one
          viewport tall (full-bleed via negative margins), `relative` so its children can be
          absolutely positioned, and `overflow-hidden` so the off-screen part of the sheet is
          clipped. DESKTOP (lg+) RESETS every mobile class (`lg:*`) back to the original
          flex-row 3-column shell so it renders byte-identically. */}
      <div
        ref={wrapRef}
        className="relative -mx-4 -mt-4 h-[calc(100dvh-8rem)] overflow-hidden sm:-mx-6 lg:mx-0 lg:mt-0 lg:flex lg:h-auto lg:flex-row lg:gap-5 lg:overflow-visible"
      >
        {/* Filters sidebar — xl+ only (desktop: first column). */}
        <aside className="hidden xl:block lg:order-1 w-64 shrink-0">
          <div className="sticky top-20">{filters}</div>
        </aside>

        {/* Map — mobile: a full-bleed background filling the region (`absolute inset-0`,
            behind the sheet). Desktop: the sticky right column. The inner box is `relative
            isolate overflow-hidden` so the map canvas can never escape its box. */}
        <aside className="absolute inset-0 z-0 lg:static lg:z-auto lg:order-3 lg:flex-1 lg:min-w-0">
          <div className="relative isolate h-full w-full overflow-hidden bg-white lg:h-[calc(100vh-104px)] lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:sticky lg:top-20">
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} numbering={numbering} />
          </div>
        </aside>

        {/* Results — mobile: a DRAGGABLE bottom sheet over the map (search · chips · count ·
            card list), sized by HEIGHT (`100 - sheetPct`%) and anchored to the bottom. Desktop:
            the middle results column (all the sheet chrome is `lg:hidden`/reset, so it's just the
            card list again). The SSR default `h-[48%]` matches SNAP.mid so there's no flash before
            hydration; once mounted the inline height (mobile only) drives it. */}
        <div
          style={sheetStyle}
          className={`absolute inset-x-0 bottom-0 z-30 flex h-[48%] min-w-0 flex-col overflow-hidden rounded-t-2xl border border-[#e5e7eb] bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:static lg:order-2 lg:h-auto lg:w-[640px] lg:flex-none lg:shrink-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none xl:w-[700px] 2xl:w-[820px] ${dragging ? "" : "transition-[height] duration-300 ease-out lg:transition-none"}`}
        >
          {/* Grab handle — mobile only; the sole drag target (so the card list still scrolls). */}
          <div
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className="lg:hidden flex shrink-0 cursor-grab touch-none select-none flex-col items-center px-3 pt-2.5 pb-1.5 active:cursor-grabbing"
            aria-hidden
          >
            <span className="h-1.5 w-10 rounded-full bg-[#d1d5db]" aria-hidden />
          </div>

          {/* Search + filter chips + count — inside the sheet header (mobile only). */}
          <div className="lg:hidden shrink-0 space-y-2 px-3 pb-2">
            {mobileSearch}
            {mobileFilters}
            {countLabel && <p className="text-sm font-medium text-[#374151]">{countLabel}</p>}
          </div>

          {/* Scroll area — the card list. Mobile: scrolls inside the sheet. Desktop: plain
              flow (no inner scroll), so the sticky map alongside still works. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 lg:flex-none lg:overflow-visible lg:px-0 lg:pb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
