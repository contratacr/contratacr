"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { MapPin, Navigation, RotateCcw, Search } from "lucide-react";
import { BRAND_MAP_STYLE } from "@/lib/maps/map-style";

export type PickedLocation = {
  lat: number;
  lng: number;
  formattedAddress: string;
};

interface LocationPickerProps {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation | null) => void;
  apiKey?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;

const COSTA_RICA_CENTER = { lat: 9.7489, lng: -83.7534 };

export function LocationPicker({ value, onChange, apiKey }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const markerRef = useRef<GMaps>(null);
  const mapInstanceRef = useRef<GMaps>(null);
  const geocoderRef = useRef<GMaps>(null);
  const autocompleteRef = useRef<GMaps>(null);
  const [locating, setLocating] = useState(false);
  const [addressInput, setAddressInput] = useState(value?.formattedAddress ?? "");
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

    const map = new maps.Map(mapRef.current, {
      center,
      zoom,
      mapTypeControl: false,
      streetViewControl: false,
      // Expand control + natural wheel zoom (no Ctrl), matching the search map.
      fullscreenControl: true,
      gestureHandling: "greedy",
      styles: BRAND_MAP_STYLE,
    });
    mapInstanceRef.current = map;
    geocoderRef.current = new maps.Geocoder();

    // Initialize Places Autocomplete on the address input
    if (inputRef.current && maps.places?.Autocomplete) {
      const autocomplete = new maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "cr" },
        fields: ["geometry", "formatted_address"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.geometry?.location) {
          const loc = place.geometry.location;
          placeMarker(loc);
          map.setCenter(loc);
          map.setZoom(16);
          const address = place.formatted_address ?? "";
          setAddressInput(address);
          onChange({ lat: loc.lat(), lng: loc.lng(), formattedAddress: address });
        }
      });
      autocompleteRef.current = autocomplete;
    }

    if (value) {
      placeMarker(new maps.LatLng(value.lat, value.lng));
    }

    // Click on map to pick location
    map.addListener("click", (e: { latLng: GMaps }) => {
      if (!e.latLng) return;
      placeMarker(e.latLng);
      reverseGeocode(e.latLng);
    });
  }

  function placeMarker(latLng: GMaps) {
    const maps = getMaps();
    if (!maps || !mapInstanceRef.current) return;

    if (markerRef.current) markerRef.current.setMap(null);

    const marker = new maps.Marker({
      position: latLng,
      map: mapInstanceRef.current,
      draggable: true,
      animation: maps.Animation.DROP,
    });
    marker.addListener("dragend", (e: { latLng: GMaps }) => {
      if (e.latLng) reverseGeocode(e.latLng);
    });
    markerRef.current = marker;
    mapInstanceRef.current.panTo(latLng);
  }

  function reverseGeocode(latLng: GMaps) {
    if (!geocoderRef.current) return;
    geocoderRef.current.geocode(
      { location: latLng },
      (results: GMaps, status: string) => {
        const address =
          status === "OK" && results?.[0]
            ? results[0].formatted_address
            : `${latLng.lat().toFixed(6)}, ${latLng.lng().toFixed(6)}`;
        setAddressInput(address);
        onChange({ lat: latLng.lat(), lng: latLng.lng(), formattedAddress: address });
      }
    );
  }

  function geocodeManual() {
    if (!addressInput.trim() || !geocoderRef.current) return;
    geocoderRef.current.geocode(
      { address: addressInput + ", Costa Rica" },
      (results: GMaps, status: string) => {
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
          placeMarker(loc);
          mapInstanceRef.current?.setCenter(loc);
          mapInstanceRef.current?.setZoom(15);
          const address = results[0].formatted_address;
          setAddressInput(address);
          onChange({ lat: loc.lat(), lng: loc.lng(), formattedAddress: address });
        }
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
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    setAddressInput("");
    onChange(null);
    mapInstanceRef.current?.setCenter(COSTA_RICA_CENTER);
    mapInstanceRef.current?.setZoom(8);
  }

  useEffect(() => {
    if (getMaps()) initMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* Load Maps JS API with Places library for address autocomplete */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${effectiveKey}&libraries=places`}
        strategy="lazyOnload"
        onLoad={initMap}
      />

      <div className="flex flex-col gap-2">
        {/* Address input with autocomplete */}
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-[#9ca3af] pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); geocodeManual(); } }}
            placeholder="Buscá la dirección de tu local… ej. Escazú Centro"
            className="w-full pl-9 pr-4 h-10 rounded-xl border border-[#e5e7eb] text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          />
        </div>

        {/* Map */}
        <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: 260 }}>
          <div ref={mapRef} className="w-full h-full" />
          {!value && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-[#374151] shadow border border-[#e5e7eb] whitespace-nowrap pointer-events-none">
              Buscá una dirección arriba o hacé clic en el mapa
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
            {locating ? "Localizando…" : "Usar mi ubicación"}
          </button>
          {value && (
            <button
              type="button"
              onClick={clearLocation}
              className="flex items-center gap-1.5 text-xs font-medium text-[#9ca3af] hover:text-red-500 ml-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Borrar
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
    </>
  );
}
