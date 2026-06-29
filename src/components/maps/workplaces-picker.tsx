"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, X, Plus, ChevronDown, Check, Search } from "lucide-react";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps/loader";
import { PROVINCES, getCantonsByProvince, getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { SelectMenu } from "@/components/ui/select-menu";
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
  const mapInstanceRef = useRef<GMaps>(null);
  const geocoderRef = useRef<GMaps>(null);
  const markersRef = useRef<GMaps[]>([]);
  const valueRef = useRef<Workplace[]>(value);
  valueRef.current = value;

  // Address search — OUR OWN standard input + dropdown (NOT the Google
  // `gmp-place-autocomplete` web component, whose shadow-DOM input draws its own
  // border we can't remove → a double border). Suggestions come from the
  // `AutocompleteSuggestion` data API (same one the homepage hero uses), so the
  // field uses the app's standard input chrome with ONE clean border.
  const mapsReadyRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);
  const addrFieldRef = useRef<HTMLDivElement>(null);
  const [addrQuery, setAddrQuery] = useState("");
  const [addrSug, setAddrSug] = useState<{ placeId: string; label: string }[]>([]);
  const [addrOpen, setAddrOpen] = useState(false);

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
    setAddrQuery("");
    setAddrSug([]);
    setAddrOpen(false);
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

  // Picking an address suggestion → resolve its lat/lng + formatted address and
  // drop the pin (same outcome the old web component produced). The provincia/
  // cantón selects stay the source of truth; the pin is just the exact marker.
  async function selectAddress(placeId: string, label: string) {
    setAddrOpen(false);
    setAddrQuery(label);
    setAddrSug([]);
    try {
      const maps = getMaps();
      const place = new maps.places.Place({ id: placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      const loc = place.location;
      if (!loc) return;
      const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
      const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
      const map = mapInstanceRef.current;
      if (map) { map.setCenter({ lat, lng }); map.setZoom(15); }
      onPinPlaced(lat, lng, place.formattedAddress || label);
      sessionTokenRef.current = null; // end the Places session after a selection
    } catch { /* keep the typed label; the map click still works */ }
  }

  function initMap() {
    if (!mapRef.current || mapInstanceRef.current) return;
    const maps = getMaps();
    if (!maps) return;
    mapsReadyRef.current = true;

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
  // doesn't exist until then). On CLOSE, drop the map instance + clear the search.
  useEffect(() => {
    if (!effectiveKey) return;
    if (!showMap) { mapInstanceRef.current = null; setAddrQuery(""); setAddrSug([]); setAddrOpen(false); return; }
    loadGoogleMaps(effectiveKey).then(initMap).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap]);

  useEffect(() => {
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, draftPin]);

  // Debounced Costa Rica address predictions (new AutocompleteSuggestion API).
  // Best-effort: any failure just leaves the map click + "use my location" working.
  useEffect(() => {
    const q = addrQuery.trim();
    if (q.length < 3) { setAddrSug([]); return; }
    const id = setTimeout(async () => {
      try {
        const maps = getMaps();
        if (!mapsReadyRef.current || !maps?.places?.AutocompleteSuggestion) { setAddrSug([]); return; }
        if (!sessionTokenRef.current) sessionTokenRef.current = new maps.places.AutocompleteSessionToken();
        const { suggestions } = await maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q, includedRegionCodes: ["cr"], sessionToken: sessionTokenRef.current,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (suggestions ?? []).map((s: any) => s.placePrediction).filter(Boolean).slice(0, 5).map((p: any) => ({
          placeId: p.placeId as string, label: (p.text?.text ?? p.text ?? "").toString(),
        })).filter((a: { placeId: string; label: string }) => a.placeId && a.label);
        setAddrSug(items);
      } catch { setAddrSug([]); }
    }, 250);
    return () => clearTimeout(id);
  }, [addrQuery]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Added zones — listed FIRST, above the add-another-location form. */}
      {value.length > 0 && (
        <div className="flex flex-col gap-2">
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
              <button
                type="button"
                onClick={() => removeWorkplace(wp.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-red-500"
                aria-label={t("removePlace")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add-another-location form — the COMPLETE group BELOW the list, in order:
          provincia → cantón → optional map pin → "Agregar esta ubicación". Shown
          while adding; collapses behind "Agregar otra ubicación" after a commit. */}
      {adding && (
      <div className="flex flex-col gap-2.5">
      {/* 1 — Structured field FIRST: provincia → cantón (authoritative for search).
          Polished popover dropdowns (shared SelectMenu) — same look/behavior as the
          Disponibilidad time selector. SIDE-BY-SIDE (provincia | cantón), matching the
          publicar-proyecto layout exactly (`grid grid-cols-2 gap-3`). The SelectMenu's
          OPTIONS popup grows to its content + scrolls past `max-h-72` (sprint 301/321), so
          a long cantón name is never cut off in the open list even in a half-width cell. */}
      <div className="grid grid-cols-2 gap-3">
        <SelectMenu
          value={province}
          onChange={(v) => { setProvince(v); setCanton(""); }}
          placeholder={t("provincePlaceholder")}
          options={PROVINCES.map((p) => ({ value: p.id, label: p.name }))}
        />
        <SelectMenu
          value={canton}
          onChange={setCanton}
          disabled={!province}
          placeholder={t("cantonPlaceholder")}
          options={cantons.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>

      {/* 2 — OPTIONAL exact pin (refinement), HIDDEN by default. A clean expandable
             link reveals the address search + map only when the pro chooses to pin. */}
      {effectiveKey ? (
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
              {/* Address search → drops the pin. OUR standard input (single border
                  matching the section's other fields) + the app's shared dropdown. */}
              <div ref={addrFieldRef} className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                <input
                  type="text"
                  value={addrQuery}
                  onChange={(e) => { setAddrQuery(e.target.value); setAddrOpen(true); }}
                  onFocus={() => { if (addrSug.length > 0) setAddrOpen(true); }}
                  onBlur={() => setTimeout(() => setAddrOpen(false), 150)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                />
                <AnchoredDropdown anchorRef={addrFieldRef} open={addrOpen && addrSug.length > 0} maxHeight={240}>
                  <ul className="py-1">
                    {addrSug.map((a) => (
                      <li key={a.placeId}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectAddress(a.placeId, a.label)}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[#374151] hover:bg-[#EBF5FB]"
                        >
                          <MapPin className="h-4 w-4 shrink-0 text-[#009FD9]" />
                          <span className="truncate">{a.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </AnchoredDropdown>
              </div>
              <button type="button" onClick={useMyLocation} disabled={locating} className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-60">
                <MapPin className="h-4 w-4" />
                {locating ? t("locating") : t("useMyLocation")}
              </button>
              {geoError && <p className="text-xs text-amber-600">{geoError}</p>}
              <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: mapHeight }}>
                <div ref={mapRef} className="w-full h-full" />
              </div>
              {draftPin && (
                <div className="flex items-center gap-2 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-xs text-[#166534]">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{draftPin.address || t("pinPlaced")}</span>
                  <button type="button" onClick={() => setDraftPin(null)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 font-semibold text-[#b91c1c] shadow-sm ring-1 ring-[#fecaca] transition-colors hover:bg-red-50 hover:ring-red-200">
                    <X className="h-3.5 w-3.5" />
                    {t("clearPin")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[#9ca3af]">{t("mapUnavailable")}</p>
      )}

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
