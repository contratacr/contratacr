"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MapPinned, Navigation, X } from "lucide-react";
import { WazeIcon, GoogleMapsIcon } from "@/components/ui/nav-app-icons";

/**
 * «Cómo llegar» on a result card (owner 2026-11-27): instead of jumping straight to Google Maps, a small sheet offers
 * «Ver en el mapa» (folds the results to the map and opens this place's pin there, when the screen has a map), Waze and
 * Google Maps. Plain links, no tracking; closes on the X, the backdrop, Escape and after choosing.
 */
export function CardDirections({ id, name, maps, en, className, withMap = true }: { id: string; name: string; maps: { google: string; waze: string }; en: boolean; className: string; withMap?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const row = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold text-[#162543] hover:bg-[#f1f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]";
  return (
    <>
      <button type="button" data-place-action="directions" aria-haspopup="dialog" className={className} onClick={() => setOpen(true)}>
        <Navigation className="h-4 w-4 shrink-0" aria-hidden />{en ? "Directions" : "Cómo llegar"}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[10080]" role="dialog" aria-modal="true" aria-label={en ? `Directions to ${name}` : `Cómo llegar a ${name}`} data-card-directions>
          <button type="button" aria-label={en ? "Close" : "Cerrar"} className="absolute inset-0 bg-black/35" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 shadow-2xl sm:bottom-6 sm:rounded-2xl">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[16px] font-extrabold text-[#162543]">{name}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label={en ? "Close" : "Cerrar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-full"><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <div className="flex flex-col gap-1">
              {withMap && (
                <button type="button" data-directions-app="map" className={row} onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent("ccr:set-search-view", { detail: { view: "map" } }));
                  window.dispatchEvent(new CustomEvent("ccr:places-map-focus", { detail: { id } }));
                }}>
                  <MapPinned className="h-5 w-5 text-[#0083b0]" aria-hidden />{en ? "See on the map" : "Ver en el mapa"}
                </button>
              )}
              <a data-directions-app="waze" href={maps.waze} target="_blank" rel="noopener noreferrer" className={row} onClick={() => setOpen(false)}>
                <WazeIcon className="h-5 w-5" />Waze
              </a>
              <a data-directions-app="google" href={maps.google} target="_blank" rel="noopener noreferrer" className={row} onClick={() => setOpen(false)}>
                <GoogleMapsIcon className="h-5 w-5" />Google Maps
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
