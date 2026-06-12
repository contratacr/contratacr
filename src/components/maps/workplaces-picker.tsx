"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, X, Plus } from "lucide-react";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps/loader";
import { PROVINCES, getCantonsByProvince, getCantonById, getProvinceById, matchProvinceCanton } from "@/lib/data/cr-geography";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveAdmin(components: any[]): { provinciaId?: string; cantonId?: string } {
  if (!Array.isArray(components)) return {};
  // Handles legacy geocoder (long_name) AND new Place.addressComponents (longText).
  const find = (type: string) => {
    const c = components.find((x) => Array.isArray(x.types) && x.types.includes(type));
    return (c?.long_name ?? c?.longText) as string | undefined;
  };
  const provinceName = find("administrative_area_level_1");
  const cantonName = find("administrative_area_level_2") || find("locality");
  const { provinceId, cantonId } = matchProvinceCanton(provinceName, cantonName);
  return { provinciaId: provinceId, cantonId };
}

/**
 * Add one or more fixed work locations. A pro can:
 *  - drop a pin (search a place / click the map / use current location) — we
 *    reverse-geocode it, prefill provincia + cantón, and add it to the list; or
 *  - pick provincia → cantón manually (cantón is disabled until a provincia is
 *    chosen) and add a location without a precise pin.
 * Every added location is listed and removable. Multiple locations are supported.
 */
export function WorkplacesPicker({ value, onChange, apiKey, mapHeight = 220 }: WorkplacesPickerProps) {
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

  // Called when a pin is placed via search / map click / current location. The pin
  // becomes the CURRENT draft (only one at a time) and prefills provincia/cantón
  // from reverse-geocoding (editable). It is NOT added until the pro confirms its
  // provincia + cantón via "Agregar lugar" — so a second pin can't be added until
  // the current one is confirmed and saved.
  function onPinPlaced(lat: number, lng: number, address: string, admin: { provinciaId?: string; cantonId?: string }) {
    setGeoError(null);
    setDraftPin({ lat, lng, address });
    if (admin.provinciaId) {
      setProvince(admin.provinciaId);
      setCanton(admin.cantonId ?? "");
    }
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
      pac.setAttribute("placeholder", "Busca un lugar o toca el mapa para marcar tu ubicación");
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
        onPinPlaced(lat, lng, place.formattedAddress || "", deriveAdmin(place.addressComponents));
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
          ok ? (results[0].formatted_address as string) : "",
          ok ? deriveAdmin(results[0].address_components) : {}
        );
      });
    });

    renderMarkers();
  }

  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) { setGeoError("Tu navegador no permite geolocalización."); return; }
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
            onPinPlaced(lat, lng, ok ? (results[0].formatted_address as string) : "", ok ? deriveAdmin(results[0].address_components) : {});
            setLocating(false);
          });
        } else { onPinPlaced(lat, lng, "", {}); setLocating(false); }
      },
      () => { setGeoError("No pudimos obtener tu ubicación. Revisa los permisos."); setLocating(false); },
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
    <>
      <div className="flex flex-col gap-2">
        {/* Map — search / click / current location places ONE draft pin at a time. */}
        {effectiveKey ? (
          <>
            {/* New PlaceAutocompleteElement renders its own input here */}
            <div ref={pacContainerRef} className="cr-pac w-full" />
            <button type="button" onClick={useMyLocation} disabled={locating} className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-60">
              <MapPin className="h-4 w-4" />
              {locating ? "Obteniendo tu ubicación…" : "Usar mi ubicación actual"}
            </button>
            {geoError && <p className="text-xs text-amber-600">{geoError}</p>}
            <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: mapHeight }}>
              <div ref={mapRef} className="w-full h-full" />
            </div>
          </>
        ) : (
          <p className="text-xs text-[#9ca3af]">Mapa no disponible — configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Puedes agregar el lugar igual con provincia y cantón.</p>
        )}

        {/* Provincia + cantón for the CURRENT location. The cantón field is disabled
            until a provincia is chosen (the disabled state communicates the
            dependency — no instructional text). */}
        <p className="text-[11px] text-[#9ca3af] mt-1">{draftPin ? "Confirma la provincia y el cantón de tu punto marcado:" : "Agrega un lugar por provincia y cantón (o márcalo en el mapa):"}</p>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nombre del lugar (opcional)… ej. Clínica Bíblica"
          className="h-10 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
        />
        <div className="grid grid-cols-2 gap-2">
          <select value={province} onChange={(e) => { setProvince(e.target.value); setCanton(""); }} className={selectCls}>
            <option value="">Provincia</option>
            {PROVINCES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={canton} onChange={(e) => setCanton(e.target.value)} disabled={!province} className={cn(selectCls, !province && "opacity-50 cursor-not-allowed")}>
            <option value="">Cantón</option>
            {cantons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* "Agregar lugar" is blocked until the current location's provincia AND
            cantón are set — so a second pin can't be added until this one is saved. */}
        <button
          type="button"
          onClick={addManual}
          disabled={!province || !canton}
          className="self-start inline-flex items-center gap-1.5 rounded-xl bg-[#009FD9] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0089bb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> Agregar lugar
        </button>
        {(draftPin || province) && (!province || !canton) && (
          <p className="text-[11px] text-amber-600 -mt-1">
            {!province
              ? "Elige la provincia y el cantón para guardar este lugar."
              : "Elige el cantón para guardar este lugar."}
          </p>
        )}

        {/* Added workplaces */}
        {value.length > 0 && (
          <div className="flex flex-col gap-2 mt-1">
            <p className="text-xs font-medium text-[#374151]">Lugares agregados ({value.length})</p>
            {value.map((wp) => (
              <div key={wp.id} className="flex items-center gap-2 bg-[#EBF5FB] rounded-xl px-3 py-2">
                <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#0089bb] truncate">{wp.name}</p>
                  <p className="text-[10px] text-[#6b7280] truncate">
                    {[getCantonById(wp.cantonId ?? "")?.name, getProvinceById(wp.provinciaId ?? "")?.name].filter(Boolean).join(", ")}
                  </p>
                </div>
                <button type="button" onClick={() => removeWorkplace(wp.id)} className="rounded-md p-0.5 text-[#9ca3af] hover:text-red-500 transition-colors shrink-0" aria-label="Quitar lugar">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
