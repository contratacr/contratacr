"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { MapPin } from "lucide-react";

interface GoogleMapPanelProps {
  apiKey: string;
}

export function GoogleMapPanel({ apiKey }: GoogleMapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  function initMap() {
    if (initialized.current || !mapRef.current) return;
    initialized.current = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maps = (window as any).google?.maps;
    if (!maps) return;

    new maps.Map(mapRef.current, {
      center: { lat: 9.7489, lng: -83.7534 },
      zoom: 8,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      styles: [
        { featureType: "poi.business", stylers: [{ visibility: "off" }] },
        { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
      ],
    });
  }

  useEffect(() => {
    // If the script was already loaded (e.g. hot reload), initialize immediately
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps) {
      initMap();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!apiKey) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center p-6">
        <div className="w-14 h-14 rounded-full bg-[#EBF5FB] flex items-center justify-center">
          <MapPin className="h-7 w-7 text-[#009FD9]" />
        </div>
        <div>
          <p className="font-semibold text-[#1a2744] mb-1">Mapa no disponible</p>
          <p className="text-xs text-[#9ca3af] max-w-[200px]">
            Configurá NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para activar el mapa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`}
        strategy="lazyOnload"
        onLoad={initMap}
      />
      <div ref={mapRef} className="w-full h-full" />
    </>
  );
}
