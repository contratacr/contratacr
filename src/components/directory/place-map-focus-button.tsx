"use client";
import { MapPinned } from "lucide-react";

/** «Ver en el mapa» on a result card: folds the results sheet to the map and opens this place's pin card there. */
export function PlaceMapFocusButton({ id, label, className }: { id: string; label: string; className?: string }) {
  return (
    <button type="button" data-place-map-focus={id} aria-label={label} title={label} className={className}
      onClick={() => {
        window.dispatchEvent(new CustomEvent("ccr:set-search-view", { detail: { view: "map" } }));
        window.dispatchEvent(new CustomEvent("ccr:places-map-focus", { detail: { id } }));
      }}>
      <MapPinned className="h-5 w-5" aria-hidden />
    </button>
  );
}
