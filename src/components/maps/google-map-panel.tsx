"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { MapPin } from "lucide-react";
import { BRAND_MAP_STYLE } from "@/lib/maps/map-style";

export interface MapProfessional {
  id: string;
  slug: string;
  fullName: string;
  avatarUrl?: string | null;
  ratingAvg: number;
  reviewCount: number;
  categoryLabel?: string;
  hourlyRate?: number | null;
  provinceName?: string;
  lat?: number | null;
  lng?: number | null;
}

interface GoogleMapPanelProps {
  apiKey: string;
  professionals: MapProfessional[];
  locale?: string;
}

// Approximate province centroids — fallback for professionals who travel to
// the client (no fixed coordinates), pinned to the province they serve.
const PROVINCE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  "San José": { lat: 9.9281, lng: -84.0907 },
  Alajuela: { lat: 10.0162, lng: -84.2116 },
  Cartago: { lat: 9.8644, lng: -83.9194 },
  Heredia: { lat: 9.9985, lng: -84.1165 },
  Guanacaste: { lat: 10.6267, lng: -85.4437 },
  Puntarenas: { lat: 9.9762, lng: -84.8384 },
  Limón: { lat: 9.9907, lng: -83.0359 },
};

const CR_CENTER = { lat: 9.9281, lng: -84.0907 };

// Deterministic small offset so multiple pins in the same canton don't overlap.
function jitter(seed: string): { dlat: number; dlng: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = ((h % 1000) / 1000 - 0.5) * 0.04;
  const b = (((h >> 10) % 1000) / 1000 - 0.5) * 0.04;
  return { dlat: a, dlng: b };
}

function positionFor(pro: MapProfessional): { lat: number; lng: number } | null {
  if (typeof pro.lat === "number" && typeof pro.lng === "number") {
    return { lat: pro.lat, lng: pro.lng };
  }
  const centroid = pro.provinceName ? PROVINCE_CENTROIDS[pro.provinceName] : null;
  if (!centroid) return null;
  const { dlat, dlng } = jitter(pro.id);
  return { lat: centroid.lat + dlat, lng: centroid.lng + dlng };
}

function starsHtml(rating: number): string {
  return `<span style="color:#ff9b32;font-weight:700;">★ ${rating.toFixed(1)}</span>`;
}

export function GoogleMapPanel({ apiKey, professionals, locale = "es" }: GoogleMapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundsRef = useRef<any>(null);
  const hasMarkersRef = useRef(false);
  const markerCountRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clustererRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoRef = useRef<any>(null);

  // Single location → center + zoom in on it. Multiple → fit all markers so every
  // result is visible at once.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fitToMarkers(map: any, g: any, bounds: any, count: number) {
    if (count === 0) return;
    if (count === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(14);
      return;
    }
    map.fitBounds(bounds, 48);
    const listener = g.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 15) map.setZoom(15);
    });
    void listener;
  }

  // Create the map exactly once.
  function ensureMap() {
    if (mapInstanceRef.current || !mapRef.current) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clusterer = (window as any).markerClusterer;
    if (!g || !clusterer) return null;
    initialized.current = true;
    const map = new g.Map(mapRef.current, {
      center: CR_CENTER,
      zoom: 9,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: "greedy",
      styles: BRAND_MAP_STYLE,
    });
    mapInstanceRef.current = map;
    infoRef.current = new g.InfoWindow();
    return map;
  }

  // (Re)build markers from the current `professionals` — called on every change
  // so the map refreshes in sync with the filtered results (no full reload).
  function renderMarkers() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clusterer = (window as any).markerClusterer;
    if (!g || !clusterer) return; // wait for both scripts
    const map = mapInstanceRef.current ?? ensureMap();
    if (!map) return;

    const info = infoRef.current;
    const bounds = new g.LatLngBounds();

    const pinIcon = {
      path: "M12 0C7.03 0 3 4.03 3 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z",
      fillColor: "#009FD9",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
      scale: 1.6,
      anchor: new g.Point(12, 24),
      labelOrigin: new g.Point(12, 9),
    };

    const markers = professionals
      .map((pro) => {
        const pos = positionFor(pro);
        if (!pos) return null;
        bounds.extend(pos);
        const marker = new g.Marker({ position: pos, icon: pinIcon });
        marker.addListener("click", () => {
          const href = `/${locale}/profesionales/${pro.slug}`;
          const avatar = pro.avatarUrl
            ? `<img src="${pro.avatarUrl}" alt="" style="width:48px;height:48px;border-radius:9999px;object-fit:cover;flex-shrink:0;" />`
            : `<div style="width:48px;height:48px;border-radius:9999px;background:#EBF5FB;color:#009FD9;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">${pro.fullName.charAt(0)}</div>`;
          info.setContent(`
            <div style="font-family:Inter,Arial,sans-serif;max-width:240px;padding:4px;">
              <div style="display:flex;gap:10px;align-items:center;">
                ${avatar}
                <div style="min-width:0;">
                  <div style="font-weight:700;color:#111827;font-size:14px;line-height:1.2;">${pro.fullName}</div>
                  ${pro.categoryLabel ? `<div style="color:#6b7280;font-size:12px;margin-top:2px;">${pro.categoryLabel}</div>` : ""}
                  <div style="font-size:12px;margin-top:3px;">${starsHtml(pro.ratingAvg)} <span style="color:#9ca3af;">(${pro.reviewCount})</span></div>
                </div>
              </div>
              <a href="${href}" style="display:block;text-align:center;margin-top:12px;background:#009FD9;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 0;border-radius:8px;min-height:44px;box-sizing:border-box;line-height:22px;">Ver perfil</a>
            </div>`);
          info.open({ map, anchor: marker });
        });
        return marker;
      })
      .filter(Boolean);

    // Brand-colored numbered cluster bubbles
    const renderer = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: ({ count, position }: any) =>
        new g.Marker({
          position,
          icon: {
            path: g.SymbolPath.CIRCLE,
            fillColor: "#009FD9",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 16 + Math.min(count, 30) * 0.4,
          },
          label: { text: String(count), color: "#ffffff", fontSize: "12px", fontWeight: "700" },
          zIndex: 1000 + count,
        }),
    };

    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.addMarkers(markers);
    } else {
      clustererRef.current = new clusterer.MarkerClusterer({ map, markers, renderer });
    }

    boundsRef.current = bounds;
    hasMarkersRef.current = markers.length > 0;
    markerCountRef.current = markers.length;
    fitToMarkers(map, g, bounds, markers.length);
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps && (window as any).markerClusterer) renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionals]);

  // When the container becomes visible (e.g. mobile list→map toggle) or resizes,
  // tell Google Maps to relayout and re-fit the pins — otherwise a map first
  // rendered inside a hidden panel paints blank/grey.
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google?.maps;
      const map = mapInstanceRef.current;
      if (!g || !map || el.offsetWidth === 0) return;
      g.event.trigger(map, "resize");
      if (hasMarkersRef.current && boundsRef.current) {
        fitToMarkers(map, g, boundsRef.current, markerCountRef.current);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
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
        src="https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js"
        strategy="afterInteractive"
        onLoad={renderMarkers}
      />
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}`}
        strategy="afterInteractive"
        onLoad={renderMarkers}
      />
      <div ref={mapRef} className="w-full h-full" />
    </>
  );
}
