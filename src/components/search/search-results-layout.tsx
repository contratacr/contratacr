"use client";

import { useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoogleMapPanel, type MapProfessional } from "@/components/maps/google-map-panel";

interface SearchResultsLayoutProps {
  children: React.ReactNode; // server-rendered list column (cards + pagination)
  mapData: MapProfessional[];
  apiKey: string;
  locale: string;
}

/**
 * Responsive results + map shell.
 *  - Mobile (<md): a List/Map toggle; defaults to the list. Only one panel shows.
 *  - Tablet/desktop (md+): list and map share the row, map sticky on its side.
 * The map respects the bottom safe-area inset so nothing hides behind the home bar.
 */
export function SearchResultsLayout({ children, mapData, apiKey, locale }: SearchResultsLayoutProps) {
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  return (
    <div>
      {/* Mobile-only view toggle */}
      <div className="md:hidden sticky top-16 z-30 mb-4 flex justify-center">
        <div className="inline-flex bg-white border border-[#e5e7eb] rounded-full p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMobileView("list")}
            aria-pressed={mobileView === "list"}
            className={cn(
              "flex items-center gap-1.5 px-5 py-1.5 rounded-full text-sm font-medium transition-colors",
              mobileView === "list" ? "bg-[#009FD9] text-white" : "text-[#6b7280]"
            )}
          >
            <List className="h-4 w-4" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setMobileView("map")}
            aria-pressed={mobileView === "map"}
            className={cn(
              "flex items-center gap-1.5 px-5 py-1.5 rounded-full text-sm font-medium transition-colors",
              mobileView === "map" ? "bg-[#009FD9] text-white" : "text-[#6b7280]"
            )}
          >
            <MapIcon className="h-4 w-4" /> Mapa
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* List column */}
        <div className={cn("flex-1 min-w-0", mobileView === "map" && "hidden md:block")}>
          {children}
        </div>

        {/* Map column */}
        <aside
          className={cn(
            "shrink-0 md:block md:w-[360px] lg:w-[460px] xl:w-[560px]",
            mobileView === "map" ? "block w-full" : "hidden"
          )}
        >
          <div
            className={cn(
              "md:sticky md:top-20 w-full overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white",
              // Mobile: fill the viewport minus header+toggle and the bottom safe area.
              "h-[calc(100dvh-200px-env(safe-area-inset-bottom))] md:h-[calc(100vh-88px)]"
            )}
          >
            <GoogleMapPanel apiKey={apiKey} professionals={mapData} locale={locale} />
          </div>
        </aside>
      </div>
    </div>
  );
}
