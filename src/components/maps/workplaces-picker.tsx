"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, X, Plus, ChevronDown, Check } from "lucide-react";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps/loader";
import { PROVINCES, getCantonsByProvince, getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { cn } from "@/lib/utils";

export type Workplace = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  // Authoritative administrative areas — chosen by the pro in the selects. These
  // drive /buscar. The pin (lat/lng) is an OPTIONAL exact marker only; it never
  // changes the provincia/cantón the pro picked.
  provinciaId?: string;
  cantonId?: string;
};

interface WorkplacesPickerProps {
  value: Workplace[];
  onChange: (next: Workplace[]) => void;
  apiKey?: string;
  /** Map viewport height in px (default 200). */
  mapHeight?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;

const COSTA_RICA_CENTER = { lat: 9.7489, lng: -83.7534 };

function genId() {
  return `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Add one or more work zones — Uber/Airbnb style: the STRUCTURED field comes
 * first (provincia → cantón, the authoritative data used by search), then an
 * OPTIONAL map pin refines the exact spot. The pin only stores lat/lng; it never
 * re-asks or overrides the provincia/cantón the pro already chose. Multiple zones
 * are supported; each is listed and removable.
 */
export function WorkplacesPicker({ value, onChange, apiKey, mapHeight = 200 }: WorkplacesPickerProps) {
  const t = useTranslations("workplacesPicker");
  const mapRef = useRef<HTMLDivElement>(null);
  const pacContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<GMaps>(null);
  const geocoderRef = useRef<GMaps>(null);
  const markersRef = useRef<GMaps[]>([]);
  const valueRef = useRef<Workplace[]>(value);
  valueRef.current = value;

  // Draft for the zone being added: provincia/cantón (+ optional pin). The exact
  // place SEARCH now lives inside the map option (no separate "name" field).
  const [province, setProvince] = useState("");
  const [canton, setCanton] = useState("");
  const [showMap, setShowMap] = useState(false);
  // The draft form is shown while adding; once a zone is committed it collapses
  // behind an explicit "+ Agregar otra ubicación" action so the flow is clear.
  const [adding, setAdding] = useState(value.length === 0);
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

  function commitWorkplace() {
    if (!province || !canton) return;
    const pin = draftPinRef.current;
    const cantonName = getCantonById(canton)?.name ?? "";
    const provinceName = getProvinceById(province)?.name ?? "";
    // `name` is the READABLE label shown in listings: cantón, provincia.
    // `address` keeps the exact geocoded string for the optional pin.
    const readable = [cantonName, provinceName].filter(Boolean).join(", ") || "Ubicación";
    onChange([
      ...valueRef.current,
      {
        id: genId(),
        name: readable,
        address: pin?.address || "",
        lat: pin?.lat,
        lng: pin?.lng,
        provinciaId: province,
        cantonId: canton,
      },
    ]);
    setProvince("");
    setCanton("");
    setDraftPin(null);
    setShowMap(false);
    setAdding(false);
  }

  // A pin placed via search / map click / current location → just stores lat/lng.
  // It does NOT touch provincia/cantón (the selects are the source of truth).
  function onPinPlaced(lat: number, lng: number, address: string) {
    setGeoError(null);
    setDraftPin({ lat, lng, address });
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

  // Mount a place-search box. Prefer the new PlaceAutocompleteElement; if it isn't
  // available OR errors at runtime (e.g. "Places API (New)" not enabled on the key
  // while the legacy Places API is), fall back to the legacy Autocomplete widget so
  // search keeps working. Either way a pick becomes a draft pin.
  function mountAutocomplete(map: GMaps, container: HTMLElement) {
    const maps = getMaps();
    if (!maps?.places) return;

    function mountLegacy() {
      if (!maps.places?.Autocomplete || container.childElementCount > 0) return;
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = t("searchPlaceholder");
      input.className = "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent";
      container.appendChild(input);
      const ac = new maps.places.Autocomplete(input, { componentRestrictions: { country: "cr" }, fields: ["geometry", "formatted_address"] });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;
        const lat = loc.lat(), lng = loc.lng();
        map.setCenter({ lat, lng }); map.setZoom(15);
        onPinPlaced(lat, lng, place.formatted_address || "");
      });
    }

    if (maps.places.PlaceAutocompleteElement) {
      try {
        const pac = new maps.places.PlaceAutocompleteElement({ includedRegionCodes: ["cr"], requestedRegion: "cr" });
        pac.style.width = "100%";
        pac.setAttribute("placeholder", t("searchPlaceholder"));
        container.appendChild(pac);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pac.addEventListener("gmp-select", async (e: any) => {
          const prediction = e.placePrediction ?? e.place;
          if (!prediction) return;
          const place = typeof prediction.toPlace === "function" ? prediction.toPlace() : prediction;
          await place.fetchFields({ fields: ["location", "formattedAddress"] });
          if (!place.location) return;
          const loc = place.location;
          map.setCenter(loc); map.setZoom(15);
          const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
          const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
          onPinPlaced(lat, lng, place.formattedAddress || "");
        });
        // If the new backend is blocked, the element fires an error → use legacy.
        pac.addEventListener("gmp-error", () => { try { pac.remove(); } catch {} mountLegacy(); });
        return;
      } catch { /* fall through to legacy */ }
    }
    mountLegacy();
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

    if (pacContainerRef.current && pacContainerRef.current.childElementCount === 0) {
      mountAutocomplete(map, pacContainerRef.current);
    }

    map.addListener("click", (e: { latLng: GMaps }) => {
      if (!e.latLng) return;
      const latLng = e.latLng;
      geocoderRef.current?.geocode({ location: latLng }, (results: GMaps, status: string) => {
        const ok = status === "OK" && results?.[0];
        onPinPlaced(latLng.lat(), latLng.lng(), ok ? (results[0].formatted_address as string) : "");
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

  // Initialize the map only once the optional refinement is opened (the container
  // doesn't exist until then). On CLOSE, drop the map instance so the next open
  // re-binds to the freshly-mounted container + re-mounts the search box.
  useEffect(() => {
    if (!effectiveKey) return;
    if (!showMap) { mapInstanceRef.current = null; return; }
    loadGoogleMaps(effectiveKey).then(initMap).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap]);

  useEffect(() => {
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, draftPin]);

  const selectCls =
    "h-11 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all cursor-pointer";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Draft form for ONE zone — shown while adding; collapses after a commit. */}
      {adding && (
      <div className="flex flex-col gap-2.5">
      {/* 1 — Structured field FIRST: provincia → cantón (authoritative for search). */}
      <div className="grid grid-cols-2 gap-2">
        {/* `appearance-none` + `pr-10` + an overlaid chevron gives the dropdown arrow
            comfortable inset from the right border (the native arrow sat too close). */}
        <div className="relative">
          <select value={province} onChange={(e) => { setProvince(e.target.value); setCanton(""); }} className={cn(selectCls, "w-full appearance-none pr-10")}>
            <option value="">{t("provincePlaceholder")}</option>
            {PROVINCES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
        </div>
        <div className="relative">
          <select value={canton} onChange={(e) => setCanton(e.target.value)} disabled={!province} className={cn(selectCls, "w-full appearance-none pr-10", !province && "opacity-50 cursor-not-allowed")}>
            <option value="">{t("cantonPlaceholder")}</option>
            {cantons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className={cn("pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]", !province && "opacity-50")} />
        </div>
      </div>

      {/* 3 — Add THIS zone (the one selected above). Enabled once provincia + cantón
             are chosen, so it's clear it commits the current selection. */}
      <button
        type="button"
        onClick={commitWorkplace}
        disabled={!province || !canton}
        className="self-start inline-flex items-center gap-1.5 rounded-xl bg-[#009FD9] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0089bb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" /> {t("addThisPlace")}
      </button>
      {province && !canton && <p className="text-[11px] text-amber-600 -mt-1">{t("hintCanton")}</p>}
      </div>
      )}

      {/* Added zones */}
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
                  {wp.lat != null && wp.lng != null ? ` · ${t("pinnedTag")}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => removeWorkplace(wp.id)} className="rounded-md p-0.5 text-[#9ca3af] hover:text-red-500 transition-colors shrink-0" aria-label={t("removePlace")}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* OPTIONAL exact pin (refinement) — placed BELOW the added-zones list. A clean
          expandable link reveals the address search + map only when the pro chooses to
          pin the exact spot; it refines the current draft (shown only while adding). */}
      {adding && (effectiveKey ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            aria-expanded={showMap}
            className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline cursor-pointer"
          >
            <MapPin className="h-4 w-4" />
            <span>{t("markOnMap")}</span>
            {/* When collapsed, a check confirms a pin is already set. */}
            {draftPin && !showMap && <Check className="h-3.5 w-3.5 text-[#16a34a]" />}
            <ChevronDown className={cn("h-4 w-4 transition-transform", showMap && "rotate-180")} />
          </button>
          {showMap && (
            <div className="flex flex-col gap-2">
              {/* Address search → drops the pin. */}
              <div ref={pacContainerRef} className="cr-pac w-full" />
              <button type="button" onClick={useMyLocation} disabled={locating} className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-60">
                <MapPin className="h-4 w-4" />
                {locating ? t("locating") : t("useMyLocation")}
              </button>
              {geoError && <p className="text-xs text-amber-600">{geoError}</p>}
              <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: mapHeight }}>
                <div ref={mapRef} className="w-full h-full" />
              </div>
              {draftPin && (
                <div className="flex items-center gap-2 text-xs text-[#16a34a]">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{draftPin.address || t("pinPlaced")}</span>
                  <button type="button" onClick={() => setDraftPin(null)} className="text-[#9ca3af] hover:text-red-500 shrink-0">{t("clearPin")}</button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[#9ca3af]">{t("mapUnavailable")}</p>
      ))}

      {/* Separate, explicit way to add ANOTHER zone (only when the draft is closed). */}
      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline cursor-pointer"
        >
          <Plus className="h-4 w-4" /> {t("addAnotherPlace")}
        </button>
      )}
    </div>
  );
}
