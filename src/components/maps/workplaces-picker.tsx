"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { MapPin, Search, X, Plus } from "lucide-react";
import { BRAND_MAP_STYLE } from "@/lib/maps/map-style";
import { PROVINCES, getCantonsByProvince, getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { cn } from "@/lib/utils";

export type Workplace = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  // Authoritative, user-selected administrative areas. These drive /buscar
  // filtering. The pin (lat/lng) is a VISUAL marker only and never overrides them.
  provinciaId?: string;
  cantonId?: string;
};

interface WorkplacesPickerProps {
  value: Workplace[];
  onChange: (next: Workplace[]) => void;
  apiKey?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;

const COSTA_RICA_CENTER = { lat: 9.7489, lng: -83.7534 };

function genId() {
  return `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Add fixed workplaces. The professional FIRST selects provincia → cantón
 * (authoritative for search), THEN optionally drops a pin (search a place or click
 * the map) purely as the exact visual marker. Typed values always win.
 */
export function WorkplacesPicker({ value, onChange, apiKey }: WorkplacesPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapInstanceRef = useRef<GMaps>(null);
  const geocoderRef = useRef<GMaps>(null);
  const markersRef = useRef<GMaps[]>([]);
  const valueRef = useRef<Workplace[]>(value);
  valueRef.current = value;

  // Draft for the workplace being added: typed area first, then an optional pin.
  const [province, setProvince] = useState("");
  const [canton, setCanton] = useState("");
  const [draftPin, setDraftPin] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const draftPinRef = useRef<typeof draftPin>(null);
  draftPinRef.current = draftPin;
  const [search, setSearch] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const cantons = getCantonsByProvince(province);
  const effectiveKey = apiKey ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getMaps(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).google?.maps;
  }

  function addWorkplace() {
    if (!province || !canton) return;
    const pin = draftPinRef.current;
    const cantonName = getCantonById(canton)?.name ?? "";
    const provinceName = getProvinceById(province)?.name ?? "";
    onChange([
      ...valueRef.current,
      {
        id: genId(),
        name: pin?.address || `${cantonName}, ${provinceName}`,
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
    setSearch("");
  }

  function removeWorkplace(id: string) {
    onChange(valueRef.current.filter((w) => w.id !== id));
  }

  function renderMarkers() {
    const maps = getMaps();
    const map = mapInstanceRef.current;
    if (!maps || !map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new maps.LatLngBounds();
    let count = 0;
    const pins = [
      ...valueRef.current.filter((w) => w.lat != null && w.lng != null).map((w) => ({ lat: w.lat!, lng: w.lng!, title: w.name })),
      ...(draftPinRef.current ? [{ lat: draftPinRef.current.lat, lng: draftPinRef.current.lng, title: "Nuevo lugar" }] : []),
    ];
    for (const p of pins) {
      markersRef.current.push(new maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, title: p.title }));
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
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "greedy",
      styles: BRAND_MAP_STYLE,
    });
    mapInstanceRef.current = map;
    geocoderRef.current = new maps.Geocoder();

    if (inputRef.current && maps.places?.Autocomplete) {
      const autocomplete = new maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "cr" },
        fields: ["geometry", "formatted_address", "name"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.geometry?.location) {
          const loc = place.geometry.location;
          setDraftPin({ lat: loc.lat(), lng: loc.lng(), address: place.formatted_address || place.name || "" });
          map.setCenter(loc);
          map.setZoom(15);
        }
      });
    }

    map.addListener("click", (e: { latLng: GMaps }) => {
      if (!e.latLng) return;
      const latLng = e.latLng;
      geocoderRef.current?.geocode({ location: latLng }, (results: GMaps, status: string) => {
        const ok = status === "OK" && results?.[0];
        setDraftPin({ lat: latLng.lat(), lng: latLng.lng(), address: ok ? (results[0].formatted_address as string) : "" });
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
        const finish = (address: string) => {
          setDraftPin({ lat, lng, address });
          if (map) { map.setCenter({ lat, lng }); map.setZoom(15); }
          setLocating(false);
        };
        if (geocoderRef.current) {
          geocoderRef.current.geocode({ location: { lat, lng } }, (results: GMaps, status: string) => {
            finish(status === "OK" && results?.[0] ? (results[0].formatted_address as string) : "");
          });
        } else finish("");
      },
      () => { setGeoError("No pudimos obtener tu ubicación. Revisá los permisos."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  useEffect(() => {
    if (getMaps()) { initMap(); return; }
    const t = setInterval(() => { if (getMaps()) { clearInterval(t); initMap(); } }, 200);
    return () => clearInterval(t);
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
      {effectiveKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${effectiveKey}&libraries=places`}
          strategy="lazyOnload"
          onLoad={initMap}
        />
      )}

      <div className="flex flex-col gap-2">
        {/* Step 1 — authoritative provincia + cantón (drives /buscar). */}
        <div className="grid grid-cols-2 gap-2">
          <select value={province} onChange={(e) => { setProvince(e.target.value); setCanton(""); }} className={selectCls}>
            <option value="">Provincia</option>
            {PROVINCES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={canton} onChange={(e) => setCanton(e.target.value)} disabled={!province} className={cn(selectCls, !province && "opacity-50")}>
            <option value="">{province ? "Cantón" : "Primero provincia"}</option>
            {cantons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Step 2 — optional visual pin. */}
        {effectiveKey ? (
          <>
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-[#9ca3af] pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Marcá el punto exacto (opcional)… buscá un lugar o tocá el mapa"
                className="w-full pl-9 pr-4 h-10 rounded-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
              />
            </div>
            <button type="button" onClick={useMyLocation} disabled={locating} className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-60">
              <MapPin className="h-4 w-4" />
              {locating ? "Obteniendo tu ubicación…" : "Usar mi ubicación actual"}
            </button>
            {geoError && <p className="text-xs text-amber-600">{geoError}</p>}
            <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: 220 }}>
              <div ref={mapRef} className="w-full h-full" />
            </div>
            <p className="text-[11px] text-[#9ca3af]">El pin es solo una marca visual; la provincia y el cantón que elegís arriba son los que definen dónde aparecés.</p>
          </>
        ) : (
          <p className="text-xs text-[#9ca3af]">Mapa no disponible — configurá NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Podés agregar el lugar igual con provincia y cantón.</p>
        )}

        <button
          type="button"
          onClick={addWorkplace}
          disabled={!province || !canton}
          className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Agregar lugar
        </button>

        {/* Added workplaces */}
        {value.length > 0 && (
          <div className="flex flex-col gap-2 mt-1">
            {value.map((wp) => (
              <div key={wp.id} className="flex items-center gap-2 bg-[#EBF5FB] rounded-xl px-3 py-2">
                <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#0089bb]">
                    {[getCantonById(wp.cantonId ?? "")?.name, getProvinceById(wp.provinciaId ?? "")?.name].filter(Boolean).join(", ")}
                  </p>
                  {wp.address && <p className="text-[10px] text-[#6b7280] truncate" title={wp.address}>{wp.address}</p>}
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
