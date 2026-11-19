"use client";

// «Ver en el mapa» for the directory result lists (/restaurantes, /farmacias…).
// Closed by default: MapLibre is not even downloaded until the visitor opens it.

import { useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { PlacesMap, type PlacesMapPoint } from "./places-map";

export function ResultsMapToggle({ points, locale }: { points: PlacesMapPoint[]; locale: string }) {
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  if (points.length === 0) return null;
  return (
    <div className="space-y-3" data-results-map-toggle>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="dir-results-map"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#162543] bg-white px-5 font-semibold text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]"
      >
        <MapIcon className="h-4 w-4" aria-hidden="true" />
        {open ? (en ? "Hide map" : "Ocultar mapa") : (en ? `Show ${points.length} on the map` : `Ver ${points.length} en el mapa`)}
      </button>
      {open && (
        <div id="dir-results-map">
          <PlacesMap
            cluster
            points={points}
            locale={locale}
            className="h-80 sm:h-[28rem]"
            label={en ? `Map of ${points.length} results` : `Mapa de ${points.length} resultados`}
          />
        </div>
      )}
    </div>
  );
}
