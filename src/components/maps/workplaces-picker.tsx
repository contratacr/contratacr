"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { MapPin, Search, X } from "lucide-react";
import { BRAND_MAP_STYLE } from "@/lib/maps/map-style";
import { matchProvinceCanton, getCantonById, getProvinceById } from "@/lib/data/cr-geography";

export type Workplace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  // Reverse-geocoded administrative areas (single source of truth for location).
  provinciaId?: string;
  cantonId?: string;
  distrito?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deriveAdmin(components: any[]): { provinciaId?: string; cantonId?: string; distrito?: string } {
  if (!Array.isArray(components)) return {};
  const find = (type: string) =>
    components.find((c) => Array.isArray(c.types) && c.types.includes(type))?.long_name as string | undefined;
  const provinceName = find("administrative_area_level_1");
  const cantonName = find("administrative_area_level_2") || find("locality");
  const distrito = find("administrative_area_level_3") || find("sublocality") || find("neighborhood");
  const { provinceId, cantonId } = matchProvinceCanton(provinceName, cantonName);
  return { provinciaId: provinceId, cantonId, distrito };
}

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
 * Add one or more workplaces by searching real places (Google Places
 * autocomplete) or clicking the map. Each appears as a pin and as a workplace
 * entry. This is the single source of "where the professional works".
 */
export function WorkplacesPicker({ value, onChange, apiKey }: WorkplacesPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapInstanceRef = useRef<GMaps>(null);
  const geocoderRef = useRef<GMaps>(null);
  const markersRef = useRef<GMaps[]>([]);
  // Keep a ref to the latest value so map/autocomplete callbacks add (not replace).
  const valueRef = useRef<Workplace[]>(value);
  valueRef.current = value;
  const [search, setSearch] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const effectiveKey = apiKey ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getMaps(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).google?.maps;
  }

  function addWorkplace(wp: Omit<Workplace, "id">) {
    const exists = valueRef.current.some(
      (w) => Math.abs(w.lat - wp.lat) < 1e-6 && Math.abs(w.lng - wp.lng) < 1e-6
    );
    if (exists) return;
    onChange([...valueRef.current, { ...wp, id: genId() }]);
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
    for (const wp of valueRef.current) {
      const marker = new maps.Marker({
        position: { lat: wp.lat, lng: wp.lng },
        map,
        title: wp.name,
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: wp.lat, lng: wp.lng });
    }
    if (valueRef.current.length === 1) {
      map.setCenter({ lat: valueRef.current[0].lat, lng: valueRef.current[0].lng });
      map.setZoom(15);
    } else if (valueRef.current.length > 1) {
      map.fitBounds(bounds, 48);
    }
  }

  function initMap() {
    if (!mapRef.current || mapInstanceRef.current) return;
    const maps = getMaps();
    if (!maps) return;

    const map = new maps.Map(mapRef.current, {
      center: value[0] ? { lat: value[0].lat, lng: value[0].lng } : COSTA_RICA_CENTER,
      zoom: value[0] ? 14 : 8,
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
        fields: ["geometry", "formatted_address", "name", "address_components"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.geometry?.location) {
          const loc = place.geometry.location;
          addWorkplace({
            name: place.name || place.formatted_address || "Ubicación",
            address: place.formatted_address || "",
            lat: loc.lat(),
            lng: loc.lng(),
            ...deriveAdmin(place.address_components),
          });
          setSearch("");
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
        addWorkplace({
          name: ok ? (results[0].formatted_address as string) : "Ubicación marcada",
          address: ok ? (results[0].formatted_address as string) : "",
          lat: latLng.lat(),
          lng: latLng.lng(),
          ...(ok ? deriveAdmin(results[0].address_components) : {}),
        });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const finish = (name: string, address: string, admin: any = {}) => {
          addWorkplace({ name, address, lat, lng, ...admin });
          if (map) { map.setCenter({ lat, lng }); map.setZoom(15); }
          setLocating(false);
        };
        if (geocoderRef.current) {
          geocoderRef.current.geocode({ location: { lat, lng } }, (results: GMaps, status: string) => {
            const ok = status === "OK" && results?.[0];
            finish(
              ok ? (results[0].formatted_address as string) : "Mi ubicación actual",
              ok ? (results[0].formatted_address as string) : "",
              ok ? deriveAdmin(results[0].address_components) : {}
            );
          });
        } else {
          finish("Mi ubicación actual", "");
        }
      },
      () => { setGeoError("No pudimos obtener tu ubicación. Revisá los permisos."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Initialise the map on EVERY mount. The Script's onLoad only fires the first
  // time it loads; when this component unmounts and remounts (e.g. toggling work
  // mode off and on) the script is cached, so we init from this effect instead —
  // fixes the map going blank after fixed → mobile → fixed.
  useEffect(() => {
    if (getMaps()) { initMap(); return; }
    const t = setInterval(() => { if (getMaps()) { clearInterval(t); initMap(); } }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render pins whenever the workplaces change.
  useEffect(() => {
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!effectiveKey) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] p-4 bg-[#f9fafb] text-center">
        <MapPin className="h-6 w-6 text-[#9ca3af] mx-auto mb-2" />
        <p className="text-sm text-[#9ca3af]">Mapa no disponible — configurá NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</p>
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${effectiveKey}&libraries=places`}
        strategy="lazyOnload"
        onLoad={initMap}
      />

      <div className="flex flex-col gap-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-[#9ca3af] pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscá un lugar por nombre… ej. Clínica Bíblica, Mall San Pedro"
            className="w-full pl-9 pr-4 h-10 rounded-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          />
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-[#009FD9] hover:underline disabled:opacity-60"
        >
          <MapPin className="h-4 w-4" />
          {locating ? "Obteniendo tu ubicación…" : "Usar mi ubicación actual"}
        </button>
        {geoError && <p className="text-xs text-amber-600">{geoError}</p>}

        <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: 240 }}>
          <div ref={mapRef} className="w-full h-full" />
          {value.length === 0 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-[#374151] shadow border border-[#e5e7eb] whitespace-nowrap pointer-events-none">
              Buscá un lugar arriba o hacé clic en el mapa
            </div>
          )}
        </div>

        {/* Added workplaces */}
        {value.length > 0 && (
          <div className="flex flex-col gap-2">
            {value.map((wp) => (
              <div key={wp.id} className="flex items-center gap-2 bg-[#EBF5FB] rounded-xl px-3 py-2">
                <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#374151] truncate" title={wp.address || wp.name}>{wp.name}</p>
                  {wp.cantonId && (
                    <p className="text-[10px] text-[#0089bb]">
                      {[getCantonById(wp.cantonId)?.name, getProvinceById(wp.provinciaId ?? "")?.name].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeWorkplace(wp.id)}
                  className="rounded-md p-0.5 text-[#9ca3af] hover:text-red-500 transition-colors shrink-0"
                  aria-label="Quitar lugar"
                >
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
