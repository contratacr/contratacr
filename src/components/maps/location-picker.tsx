"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { MapPin, Navigation, RotateCcw } from "lucide-react";

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
  const markerRef = useRef<GMaps>(null);
  const mapInstanceRef = useRef<GMaps>(null);
  const geocoderRef = useRef<GMaps>(null);
  const [locating, setLocating] = useState(false);
  const [addressInput, setAddressInput] = useState(value?.formattedAddress ?? "");
  const [geocoding, setGeocoding] = useState(false);
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
      fullscreenControl: false,
      styles: [{ featureType: "poi.business", stylers: [{ visibility: "off" }] }],
    });
    mapInstanceRef.current = map;
    geocoderRef.current = new maps.Geocoder();

    if (value) {
      placeMarker(new maps.LatLng(value.lat, value.lng));
    }

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

  function geocodeAddress() {
    if (!addressInput.trim() || !geocoderRef.current) return;
    setGeocoding(true);
    geocoderRef.current.geocode(
      { address: addressInput + ", Costa Rica" },
      (results: GMaps, status: string) => {
        setGeocoding(false);
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
          placeMarker(loc);
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
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${effectiveKey}`}
        strategy="lazyOnload"
        onLoad={initMap}
      />

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); geocodeAddress(); } }}
            placeholder="Escribí la dirección de tu local, estudio u oficina…"
            className="flex-1 h-10 rounded-xl border border-[#e5e7eb] px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
          />
          <button
            type="button"
            onClick={geocodeAddress}
            disabled={geocoding || !addressInput.trim()}
            className="h-10 px-4 rounded-xl bg-[#009FD9] text-white text-sm font-semibold hover:bg-[#0089bb] transition-colors disabled:opacity-50"
          >
            {geocoding ? "…" : "Buscar"}
          </button>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-[#e5e7eb]" style={{ height: 260 }}>
          <div ref={mapRef} className="w-full h-full" />
          {!value && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-[#374151] shadow border border-[#e5e7eb] whitespace-nowrap pointer-events-none">
              Hacé clic en el mapa para marcar tu ubicación
            </div>
          )}
        </div>

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
              Borrar ubicación
            </button>
          )}
        </div>

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
