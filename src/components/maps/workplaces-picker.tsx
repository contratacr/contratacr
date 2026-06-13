"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, X, Plus } from "lucide-react";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps/loader";
import { PROVINCES, getCantonsByProvince, getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { cn } from "@/lib/utils";

export type Workplace = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  // Authoritative administrative areas. These drive the search results. The pin
  // (lat/lng) is the exact visual marker. When a pin is placed we PREFILL these
  // from it (editable); the values in the selects always win.
  provinciaId?: string;
  cantonId?: string;
};

interface WorkplacesPickerProps {
  value: Workplace[];
  onChange: (next: Workplace[]) => void;
  apiKey?: string;
  /** Map viewport height in px (default 220). Lets callers render a more compact map. */
  mapHeight?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;

const COSTA_RICA_CENTER = { lat: 9.7489, lng: -83.7534 };

function genId() {
  return `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Add one or more fixed work locations. NEW ORDER (no duplicate questions):
 *  1. The pro picks **provincia → cantón** first — the authoritative areas that
 *     drive /buscar filtering (cantón is disabled until a provincia is chosen).
 *  2. THEN, optionally, they mark the exact spot on the map (search / click /
 *     "use my location") for visual precision. The pin is coordinates ONLY — it
 *     never re-asks or overwrites the provincia/cantón already chosen.
 * Every added location is listed and removable. Multiple locations are supported.
 */
export function WorkplacesPicker({ value, onChange, apiKey, mapHeight = 220 }: WorkplacesPickerProps) {
  const t = useTranslations("workplacesPicker");
  const mapRef = useRef<HTMLDivElement>(null);
  const pacContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<GMaps>(null);
  const geocoderRef = useRef<GMaps>(null);
  const markersRef = useRef<GMaps[]>([]);
  const valueRef = useRef<Workplace[]>(value);
  valueRef.current = value;

  // Draft for the location being added (manual provincia/cantón + optional pin).
  const [province, setProvince] = useState("");
  const [canton, setCanton] = useState("");
  const [label, setLabel] = useState("");
  const [draftPin, setDraftPin] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const draftPinRef = useRef<typeof draftPin>(null);
  draftPinRef.current = draftPin;
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const cantons = getCantonsByProvince(province);
  const effectiveKey = apiKey ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getMaps(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).google?.maps;
  }

  function commitWorkplace(wp: { provinciaId: string; cantonId: string; lat?: number; lng?: number; address?: string }) {
    const cantonName = getCantonById(wp.cantonId)?.name ?? "";
    const provinceName = getProvinceById(wp.provinciaId)?.name ?? "";
    // `name` is the READABLE label shown in listings: the pro's chosen label, else a
    // general locality (cantón, provincia) — never the raw Plus Code. `address`
    // keeps the exact geocoded string for the MAP marker only.
    const readable = label.trim() || [cantonName, provinceName].filter(Boolean).join(", ") || "Ubicación";
    onChange([
      ...valueRef.current,
      {
        id: genId(),
        name: readable,
        address: wp.address || "",
        lat: wp.lat,
        lng: wp.lng,
        provinciaId: wp.provinciaId,
        cantonId: wp.cantonId,
      },
    ]);
    setProvince("");
    setCanton("");
    setLabel("");
    setDraftPin(null);
  }

  // A pin (search / map click / current location) is VISUAL PRECISION ONLY: it
  // sets the draft's coordinates and never touches provincia/cantón — the pro
  // already chose those explicitly, so we never re-ask or overwrite them. Only one
  // draft pin at a time; it's saved onto the current location by "Agregar lugar".
  function onPinPlaced(lat: number, lng: number, address: string) {
    setGeoError(null);
    setDraftPin({ lat, lng, address });
  }

  // Manual "Agregar lugar": uses the selected provincia + cantón (+ draft pin if any).
  function addManual() {
    if (!province || !canton) return;
    const pin = draftPinRef.current;
    commitWorkplace({ provinciaId: province, cantonId: canton, lat: pin?.lat, lng: pin?.lng, address: pin?.address });
  }

  function removeWorkplace(id: string) {
    onChange(valueRef.current.filter((w) => w.id !== id));
  }

  function renderMarkers() {
    const maps = getMaps();
    const map = mapInstanceRef.current;
    if (!maps || !map) return;
    markersRef.current.forEach((m) => { m.map = null; });
    markersRef.current = [];
    const bounds = new maps.LatLngBounds();
    let count = 0;
    const pins = [
      ...valueRef.current.filter((w) => w.lat != null && w.lng != null).map((w) => ({ lat: w.lat!, lng: w.lng!, title: w.name })),
      ...(draftPinRef.current ? [{ lat: draftPinRef.current.lat, lng: draftPinRef.current.lng, title: "Nuevo lugar" }] : []),
    ];
    for (const p of pins) {
      markersRef.current.push(new maps.marker.AdvancedMarkerElement({ position: { lat: p.lat, lng: p.lng }, map, title: p.title }));
      bounds.extend({ lat: p.lat, lng: p.lng });
      count++;
    }
    if (count === 1) {
      map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
      map.setZoom(15);
    } else if (count > 1) {
      map.fitBounds(bounds, 48);
    }
  }

  function initMap() {
    if (!mapRef.current || mapInstanceRef.current) return;
    const maps = getMaps();
    if (!maps) return;

    const first = value.find((w) => w.lat != null && w.lng != null);
    const map = new maps.Map(mapRef.current, {
      center: first ? { lat: first.lat, lng: first.lng } : COSTA_RICA_CENTER,
      zoom: first ? 14 : 8,
      mapId: MAP_ID,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "greedy",
    });
    mapInstanceRef.current = map;
    geocoderRef.current = new maps.Geocoder();

    // NEW Places Autocomplete (web component), CR-restricted.
    if (pacContainerRef.current && maps.places?.PlaceAutocompleteElement && pacContainerRef.current.childElementCount === 0) {
      const pac = new maps.places.PlaceAutocompleteElement({ includedRegionCodes: ["cr"] });
      pac.style.width = "100%";
      pac.setAttribute("placeholder", t("searchPlaceholder"));
      pacContainerRef.current.appendChild(pac);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pac.addEventListener("gmp-select", async (e: any) => {
        const prediction = e.placePrediction ?? e.place;
        if (!prediction) return;
        const place = typeof prediction.toPlace === "function" ? prediction.toPlace() : prediction;
        await place.fetchFields({ fields: ["location", "formattedAddress", "addressComponents"] });
        if (!place.location) return;
        const loc = place.location;
        map.setCenter(loc);
        map.setZoom(15);
        const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
        const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
        onPinPlaced(lat, lng, place.formattedAddress || "");
      });
    }

    map.addListener("click", (e: { latLng: GMaps }) => {
      if (!e.latLng) return;
      const latLng = e.latLng;
      geocoderRef.current?.geocode({ location: latLng }, (results: GMaps, status: string) => {
        const ok = status === "OK" && results?.[0];
        onPinPlaced(
          latLng.lat(),
          latLng.lng(),
          ok ? (results[0].formatted_address as string) : ""
        );
      });
    });

    renderMarkers();
  }

  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) { setGeoError(t("geoUnsupported")); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const map = mapInstanceRef.current;
        if (map) { map.setCenter({ lat, lng }); map.setZoom(15); }
        if (geocoderRef.current) {
          geocoderRef.current.geocode({ location: { lat, lng } }, (results: GMaps, status: string) => {
            const ok = status === "OK" && results?.[0];
            onPinPlaced(lat, lng, ok ? (results[0].formatted_address as string) : "");
            setLocating(false);
          });
        } else { onPinPlaced(lat, lng, ""); setLocating(false); }
      },
      () => { setGeoError(t("geoFailed")); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  useEffect(() => {
    if (!effectiveKey) return;
    loadGoogleMaps(effectiveKey).then(initMap).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, draftPin]);

  const selectCls =
    "h-10 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all cursor-pointer";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Lead: explains the new order — area first, optional pin after. */}
      <p className="text-[11px] text-[#9ca3af]">{t("lead")}</p>

      {/* 1 ─ Authoritative area: provincia → cantón (drives /buscar filtering).
          Cantón is disabled until a provincia is chosen (the disabled state
          communicates the dependency — no instructional text). */}
      <div className="grid grid-cols-2 gap-2">
        <select value={province} onChange={(e) => { setProvince(e.target.value); setCanton(""); }} className={selectCls} aria-label={t("provincePlaceholder")}>
          <option value="">{t("provincePlaceholder")}</option>
          {PROVINCES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={canton} onChange={(e) => setCanton(e.target.value)} disabled={!province} className={cn(selectCls, !province && "opacity-50 cursor-not-allowed")} aria-label={t("cantonPlaceholder")}>
          <option value="">{t("cantonPlaceholder")}</option>
          {cantons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Optional place name */}
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t("namePlaceholder")}
        className="h-10 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
      />

      {/* 2 ─ OPTIONAL exact point on the map (precision only — never re-asks the
          provincia/cantón already chosen above). */}
      {effectiveKey ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-[#6b7280]">{t("mapOptional")}</p>
          {/* New PlaceAutocompleteElement renders its own input here */}
          <div ref={pacContainerRef} className="cr-pac w-full" />
          <button type="button" onClick={useMyLocation} disabled={locating} className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-60">
            <MapPin className="h-4 w-4" />
            {locating ? t("locating") : t("useMyLocation")}
          </button>
          {geoError && <p className="text-xs text-amber-600">{geoError}</p>}
          <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: mapHeight }}>
            <div ref={mapRef} className="w-full h-full" />
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#9ca3af]">{t("mapUnavailable")}</p>
      )}

      {/* 3 ─ Add. Blocked until provincia AND cantón are set (the pin is optional). */}
      <button
        type="button"
        onClick={addManual}
        disabled={!province || !canton}
        className="self-start inline-flex items-center gap-1.5 rounded-xl bg-[#009FD9] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0089bb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" /> {t("addPlace")}
      </button>
      {(label || draftPin) && (!province || !canton) && (
        <p className="text-[11px] text-amber-600 -mt-1">{t("hintSelectArea")}</p>
      )}

      {/* Added workplaces */}
        {value.length > 0 && (
          <div className="flex flex-col gap-2 mt-1">
            <p className="text-xs font-medium text-[#374151]">{t("addedPlaces", { count: value.length })}</p>
            {value.map((wp) => (
              <div key={wp.id} className="flex items-center gap-2 bg-[#EBF5FB] rounded-xl px-3 py-2">
                <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#0089bb] truncate">{wp.name}</p>
                  <p className="text-[10px] text-[#6b7280] truncate">
                    {[getCantonById(wp.cantonId ?? "")?.name, getProvinceById(wp.provinciaId ?? "")?.name].filter(Boolean).join(", ")}
                  </p>
                </div>
                <button type="button" onClick={() => removeWorkplace(wp.id)} className="rounded-md p-0.5 text-[#9ca3af] hover:text-red-500 transition-colors shrink-0" aria-label={t("removePlace")}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
