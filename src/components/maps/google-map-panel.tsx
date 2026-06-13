"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { MapPin } from "lucide-react";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps/loader";

export interface MapProfessional {
  id: string;
  /** Canonical professional id (the pin id may carry a workplace suffix). */
  proId?: string;
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
  /** proId → card number (1..N) for the current page; drawn on the pins. */
  numbering?: Record<string, number>;
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

// AdvancedMarkerElement content: a brand teardrop pin with the card number.
function makePinContent(num?: number): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:30px;height:40px;cursor:pointer;";
  el.innerHTML = `
    <svg width="30" height="40" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z" fill="#009FD9" stroke="#ffffff" stroke-width="1.5"/>
    </svg>
    ${num ? `<span style="position:absolute;top:5px;left:0;width:30px;text-align:center;color:#fff;font-size:11px;font-weight:700;font-family:Inter,Arial,sans-serif;">${num}</span>` : ""}`;
  return el;
}

// Cluster bubble content.
function makeClusterContent(count: number): HTMLElement {
  const size = 32 + Math.min(count, 30) * 0.8;
  const el = document.createElement("div");
  el.style.cssText = `display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:#009FD9;border:2px solid #fff;color:#fff;font-weight:700;font-size:12px;font-family:Inter,Arial,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.3);`;
  el.textContent = String(count);
  return el;
}

// Cross-component highlight: on pin hover, ring + scroll the matching list card.
function setCardHighlight(proId: string | undefined, on: boolean) {
  if (!proId || typeof document === "undefined") return;
  const el = document.getElementById(`pro-card-${proId}`);
  if (!el) return;
  if (on) {
    el.classList.add("ring-2", "ring-[#009FD9]", "shadow-lg");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    el.classList.remove("ring-2", "ring-[#009FD9]", "shadow-lg");
  }
}

export function GoogleMapPanel({ apiKey, professionals, locale = "es", numbering }: GoogleMapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null);
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

  // Single location → center + zoom. Multiple → fit all markers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fitToMarkers(map: any, g: any, bounds: any, count: number) {
    if (count === 0) return;
    if (count === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(14);
      return;
    }
    map.fitBounds(bounds, 48);
    g.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 15) map.setZoom(15);
    });
  }

  function ensureMap() {
    if (mapInstanceRef.current || !mapRef.current) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps;
    if (!g) return null;
    const map = new g.Map(mapRef.current, {
      center: CR_CENTER,
      zoom: 9,
      mapId: MAP_ID,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: "greedy",
    });
    mapInstanceRef.current = map;
    infoRef.current = new g.InfoWindow();
    return map;
  }

  function renderMarkers() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clusterer = (window as any).markerClusterer;
    if (!g?.marker?.AdvancedMarkerElement || !clusterer) return; // wait for both
    const map = mapInstanceRef.current ?? ensureMap();
    if (!map) return;

    const info = infoRef.current;
    const bounds = new g.LatLngBounds();

    const markers = professionals
      .map((pro) => {
        const pos = positionFor(pro);
        if (!pos) return null;
        bounds.extend(pos);
        const num = numbering?.[pro.proId ?? pro.id];
        const content = makePinContent(num);
        const marker = new g.marker.AdvancedMarkerElement({
          position: pos,
          content,
          zIndex: num ? 500 - num : 1,
        });

        const openPreview = () => {
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
              <a href="${href}" style="display:block;text-align:center;margin-top:12px;background:#009FD9;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 0;border-radius:8px;min-height:44px;box-sizing:border-box;line-height:22px;outline:none;border:none;box-shadow:none;">Ver perfil</a>
            </div>`);
          info.open({ map, anchor: marker });
        };
        // AdvancedMarkerElement: attach DOM listeners to its content element.
        content.addEventListener("mouseenter", () => { openPreview(); setCardHighlight(pro.proId ?? pro.id, true); });
        content.addEventListener("mouseleave", () => setCardHighlight(pro.proId ?? pro.id, false));
        content.addEventListener("click", openPreview);
        return marker;
      })
      .filter(Boolean);

    // Brand-colored cluster bubbles (AdvancedMarkerElement renderer).
    const renderer = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: ({ count, position }: any) =>
        new g.marker.AdvancedMarkerElement({
          position,
          content: makeClusterContent(count),
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

  // Load the Maps JS API (async) once, then render whenever inputs change.
  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(renderMarkers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionals, numbering]);

  // Relayout + re-fit when the container becomes visible / resizes.
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
            Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para activar el mapa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* MarkerClusterer is a separate (non-Google) lib; the Maps JS API itself
          loads via the async loader. */}
      <Script
        src="https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js"
        strategy="afterInteractive"
        onLoad={renderMarkers}
      />
      {/* Single clean info-window card: kill Google's default focus ring on the
          auto-focused "Ver perfil" link (it read as a double border on the button)
          and flatten the inner content wrapper so only ONE rounded card shows. */}
      <style>{`
        .gm-style-iw-c { padding: 0 !important; }
        .gm-style-iw-d { overflow: hidden !important; }
        .gm-style-iw, .gm-style-iw-d, .gm-style-iw a, .gm-style-iw a:focus, .gm-style-iw a:focus-visible { outline: none !important; box-shadow: none !important; }
        .gm-style-iw-c a:focus-visible { outline: none !important; }
      `}</style>
      <div ref={mapRef} className="w-full h-full" />
    </>
  );
}
