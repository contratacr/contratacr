"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { List, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleMapPanel, type MapProfessional } from "@/components/maps/google-map-panel";

interface SearchResultsLayoutProps {
  children: React.ReactNode; // server-rendered list column (cards + pagination)
  filters: React.ReactNode; // the <SearchFilters/> control
  mapData: MapProfessional[];
  apiKey: string;
  locale: string;
  /** proId → card number (1..N) for THIS page, mirrored on the map pins. */
  numbering?: Record<string, number>;
}

/**
 * Responsive search shell that maximises how many professionals are visible:
 *  - Desktop (xl+): three columns — sticky filters sidebar · results list · sticky
 *    map. The list sits high in the viewport, no tall filter block pushing it down.
 *  - Laptop (lg–xl): two columns — results list · map. Filters move behind a
 *    "Filtros" button (slide-over drawer) so the list+map stay wide.
 *  - Tablet/phone (<lg): one column. A "Filtros" button opens the drawer and a
 *    List/Map toggle swaps the results and the map.
 */
export function SearchResultsLayout({ children, filters, mapData, apiKey, locale, numbering }: SearchResultsLayoutProps) {
  const t = useTranslations("search");
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div>
      {/* Controls bar — "Filtros" button below xl; List/Map toggle below lg. */}
      <div className="xl:hidden sticky top-16 z-30 mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-sm font-medium text-[#374151] shadow-sm"
        >
          <SlidersHorizontal className="h-4 w-4" /> {t("filters.title")}
        </button>
        <div className="lg:hidden inline-flex bg-white border border-[#e5e7eb] rounded-full p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMobileView("list")}
            aria-pressed={mobileView === "list"}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
              mobileView === "list" ? "bg-[#009FD9] text-white" : "text-[#6b7280]"
            )}
          >
            <List className="h-4 w-4" /> {t("list")}
          </button>
          <button
            type="button"
            onClick={() => setMobileView("map")}
            aria-pressed={mobileView === "map"}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
              mobileView === "map" ? "bg-[#009FD9] text-white" : "text-[#6b7280]"
            )}
          >
            <MapIcon className="h-4 w-4" /> {t("map")}
          </button>
        </div>
      </div>

      {/* Filters drawer (below xl) */}
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
            {filters}
            <button
              onClick={() => setShowFilters(false)}
              className="mt-4 w-full rounded-xl bg-[#009FD9] py-2.5 text-sm font-semibold text-white"
            >
              {t("viewResults")}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-5">
        {/* Filters sidebar — xl+ only */}
        <aside className="hidden xl:block w-64 shrink-0">
          <div className="sticky top-20">{filters}</div>
        </aside>

        {/* Results list — grows. Hidden on phones when the map is shown. */}
        <div className={cn("min-w-0 flex-1", mobileView === "map" ? "hidden lg:block" : "block")}>
          {children}
        </div>

        {/* Map — inline sticky column on lg+; the toggled full-width panel on phones. */}
        <aside
          className={cn(
            "lg:block lg:w-[40%] xl:w-[38%] lg:shrink-0",
            mobileView === "map" ? "block w-full" : "hidden"
          )}
        >
          <div
            className={cn(
              "lg:sticky lg:top-20 w-full overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white",
              "h-[calc(100dvh-200px-env(safe-area-inset-bottom))] lg:h-[calc(100vh-104px)]"
            )}
          >
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} numbering={numbering} />
          </div>
        </aside>
      </div>
    </div>
  );
}
