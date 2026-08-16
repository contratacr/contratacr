"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Navigation, RotateCcw } from "lucide-react";
import { createGoogleMarker, loadGoogleMaps, withConfiguredMapId } from "@/lib/maps/loader";

export type PickedLocation = {
  lat: number;
  lng: number;
  formattedAddress: string;
  // Raw Google admin-area names, used to auto-fill province/canton fields.
  provinceName?: string;
  cantonName?: string;
};

// Works with BOTH shapes: legacy geocoder components (long_name) and the new
// Place.addressComponents (longText).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAdmin(components: any[]): { provinceName?: string; cantonName?: string } {
  if (!Array.isArray(components)) return {};
  const find = (type: string) => {
    const c = components.find((x) => Array.isArray(x.types) && x.types.includes(type));
    return (c?.long_name ?? c?.longText) as string | undefined;
  };
  const cantonName =
    find("administrative_area_level_2") ||
    find("administrative_area_level_3") ||
    find("locality") ||
    find("postal_town");
  return { provinceName: find("administrative_area_level_1"), cantonName };
}

interface LocationPickerProps {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation | null) => void;
  apiKey?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;

const COSTA_RICA_CENTER = { lat: 9.7489, lng: -83.7534 };

// Normalize a LatLng (object with lat()/lng()) or a literal to plain numbers.
function toLatLng(v: GMaps): { lat: number; lng: number } {
  if (!v) return { lat: 0, lng: 0 };
  return { lat: typeof v.lat === "function" ? v.lat() : v.lat, lng: typeof v.lng === "function" ? v.lng() : v.lng };
}

export function LocationPicker({ value, onChange, apiKey }: LocationPickerProps) {
  const t = useTranslations("locationPicker");
  const mapRef = useRef<HTMLDivElement>(null);
  const pacContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<GMaps>(null);
  const mapInstanceRef = useRef<GMaps>(null);
  const geocoderRef = useRef<GMaps>(null);
  const [locating, setLocating] = useState(false);
  const effectiveKey = apiKey ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getMaps(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).google?.maps;
  }

  function initMap() {
    if (!mapRef.current || mapInstanceRef.current) return;
    const maps = getMaps();
    if (!maps) return;

    const center = value ? { lat: value.lat, lng: value.lng } : COSTA_RICA_CENTER;
    const zoom = value ? 15 : 8;

    const map = new maps.Map(mapRef.current, withConfiguredMapId({
      center,
      zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "greedy",
    }));
    mapInstanceRef.current = map;
    geocoderRef.current = new maps.Geocoder();

    // Place search — prefer the new PlaceAutocompleteElement; fall back to the
    // legacy Autocomplete widget if it's unavailable or its backend errors (e.g.
    // "Places API (New)" not enabled while the legacy Places API is).
    const pacEl = pacContainerRef.current;
    if (pacEl && maps.places && pacEl.childElementCount === 0) {
      const mountLegacy = () => {
        if (!maps.places?.Autocomplete || pacEl.childElementCount > 0) return;
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = t("searchPlaceholder");
        input.className = "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent";
        pacEl.appendChild(input);
        const ac = new maps.places.Autocomplete(input, { componentRestrictions: { country: "cr" }, fields: ["geometry", "formatted_address", "address_components"] });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const loc = place.geometry?.location;
          if (!loc) return;
          placeMarker(loc); map.setCenter(loc); map.setZoom(16);
          const { lat, lng } = toLatLng(loc);
          onChange({ lat, lng, formattedAddress: place.formatted_address ?? "", ...extractAdmin(place.address_components) });
        });
      };
      if (maps.places.PlaceAutocompleteElement) {
        const pac = new maps.places.PlaceAutocompleteElement({ includedRegionCodes: ["cr"], requestedRegion: "cr" });
        pac.style.width = "100%";
        pac.setAttribute("placeholder", t("searchPlaceholder"));
        pacEl.appendChild(pac);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pac.addEventListener("gmp-select", async (e: any) => {
          const prediction = e.placePrediction ?? e.place;
          if (!prediction) return;
          const place = typeof prediction.toPlace === "function" ? prediction.toPlace() : prediction;
          await place.fetchFields({ fields: ["location", "formattedAddress", "addressComponents"] });
          if (!place.location) return;
          placeMarker(place.location);
          map.setCenter(place.location);
          map.setZoom(16);
          const address = place.formattedAddress ?? "";
          const { lat, lng } = toLatLng(place.location);
          onChange({ lat, lng, formattedAddress: address, ...extractAdmin(place.addressComponents) });
        });
        pac.addEventListener("gmp-error", () => { try { pac.remove(); } catch {} mountLegacy(); });
      } else {
        mountLegacy();
      }
    }

    if (value) placeMarker(new maps.LatLng(value.lat, value.lng));

    map.addListener("click", (e: { latLng: GMaps }) => {
      if (!e.latLng) return;
      placeMarker(e.latLng);
      reverseGeocode(e.latLng);
    });
  }

  function placeMarker(latLng: GMaps) {
    const maps = getMaps();
    if (!maps || !mapInstanceRef.current) return;

    if (markerRef.current) markerRef.current.map = null;

    const marker = createGoogleMarker(maps, {
      position: latLng,
      map: mapInstanceRef.current,
      gmpDraggable: true,
    });
    marker.addListener("dragend", () => {
      reverseGeocode(marker.position);
    });
    markerRef.current = marker;
    mapInstanceRef.current.panTo(latLng);
  }

  function reverseGeocode(latLng: GMaps) {
    if (!geocoderRef.current) return;
    const { lat, lng } = toLatLng(latLng);
    geocoderRef.current.geocode(
      { location: { lat, lng } },
      (results: GMaps, status: string) => {
        const ok = status === "OK" && results?.[0];
        const address = ok ? results[0].formatted_address : `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        onChange({
          lat,
          lng,
          formattedAddress: address,
          ...(ok ? extractAdmin(results[0].address_components) : {}),
        });
      }
    );
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const maps = getMaps();
        if (!maps || !mapInstanceRef.current) return;
        const latLng = new maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        placeMarker(latLng);
        mapInstanceRef.current.setCenter(latLng);
        mapInstanceRef.current.setZoom(16);
        reverseGeocode(latLng);
      },
      () => setLocating(false)
    );
  }

  function clearLocation() {
    if (markerRef.current) {
      markerRef.current.map = null;
      markerRef.current = null;
    }
    onChange(null);
    mapInstanceRef.current?.setCenter(COSTA_RICA_CENTER);
    mapInstanceRef.current?.setZoom(8);
  }

  useEffect(() => {
    if (!effectiveKey) return;
    loadGoogleMaps(effectiveKey).then(initMap).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!effectiveKey) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] p-4 bg-[#f9fafb] text-center">
        <MapPin className="h-6 w-6 text-[#9ca3af] mx-auto mb-2" />
        <p className="text-sm text-[#9ca3af]">{t("mapUnavailable")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* New PlaceAutocompleteElement renders its own input here */}
      <div ref={pacContainerRef} className="cr-pac w-full" />

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: 260 }}>
        <div ref={mapRef} className="w-full h-full" />
        {!value && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-[#374151] shadow border border-[#e5e7eb] whitespace-nowrap pointer-events-none">
            {t("searchOrClick")}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex items-center gap-1.5 text-xs font-medium text-[#009FD9] hover:underline disabled:opacity-50"
        >
          <Navigation className="h-3.5 w-3.5" />
          {locating ? t("locating") : t("useMyLocation")}
        </button>
        {value && (
          <button
            type="button"
            onClick={clearLocation}
            className="flex items-center gap-1.5 text-xs font-medium text-[#9ca3af] hover:text-red-500 ml-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("clear")}
          </button>
        )}
      </div>

      {/* Coordinates display */}
      {value && (
        <div className="flex items-center gap-2 bg-[#EBF5FB] rounded-xl px-3 py-2">
          <MapPin className="h-4 w-4 text-[#009FD9] shrink-0" />
          <p className="text-xs text-[#374151] truncate">
            {value.formattedAddress || `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`}
          </p>
        </div>
      )}
    </div>
  );
}
