"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { MapPin } from "lucide-react";
import { loadGoogleMaps } from "@/lib/maps/loader";

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
  /** Pre-formatted "from" price for the hover/tap preview (e.g. "₡10 000 /hora"). */
  priceLabel?: string | null;
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

// Clean, light "Positron"-style basemap (close to the CARTO example): muted grey
// land, white roads, light-blue water, POI/transit clutter hidden, only locality
// labels kept. Inline `styles` require a NON-vector map (no mapId) + legacy markers.
const LIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f6f7f9" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7a828c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 2 }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f6f7f9" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#eef1f4" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e7eaee" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#eef0f3" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#e0e4e9" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe3ee" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9bb3c0" }] },
];

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

// NAVY teardrop pin (legacy Marker icon) — matches the navy (#162543) rank badge on
// each result card. The card number is drawn as the marker LABEL, centered in the head.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pinIcon(g: any) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 24 32">` +
    `<path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z" fill="#162543" stroke="#ffffff" stroke-width="1.5"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.Size(30, 40),
    anchor: new g.Point(15, 40),
    labelOrigin: new g.Point(15, 13), // in the circular head, not the tip
  };
}

// Navy cluster bubble (legacy Marker icon); count drawn as the label.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clusterIcon(g: any, count: number) {
  const size = Math.round(34 + Math.min(count, 30) * 0.8);
  const r = size / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r - 2}" fill="#162543" stroke="#ffffff" stroke-width="2"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.Size(size, size),
    anchor: new g.Point(r, r),
    labelOrigin: new g.Point(r, r),
  };
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
  // Pending close for the hover preview — a tiny delay debounces moving between nearby pins.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single location → center + zoom. Multiple → fit the pin cluster (generous
  // padding) but cap zoom at 12 (maxZoom) so a tight cluster stays focused on the
  // result area instead of zooming the whole country in/out.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fitToMarkers(map: any, g: any, bounds: any, count: number) {
    if (count === 0) return;
    if (count === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(13);
      return;
    }
    map.fitBounds(bounds, 64);
    g.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 12) map.setZoom(12);
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
      // NO mapId → the inline light `styles` apply (CARTO-like basemap). Legacy
      // markers are used below (AdvancedMarkerElement would require a vector mapId).
      styles: LIGHT_STYLE,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      clickableIcons: false,
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
    if (!g?.Marker || !clusterer) return; // wait for the API + clusterer lib
    const map = mapInstanceRef.current ?? ensureMap();
    if (!map) return;

    const info = infoRef.current;
    const bounds = new g.LatLngBounds();
    // Hover preview on devices with a real pointer; TAP preview on touch.
    const canHover = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches;
    const cancelClose = () => { if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; } };
    const verPerfil = locale === "en" ? "View profile" : "Ver perfil";

    const markers = professionals
      .map((pro) => {
        const pos = positionFor(pro);
        if (!pos) return null;
        bounds.extend(pos);
        const num = numbering?.[pro.proId ?? pro.id];
        const marker = new g.Marker({
          position: pos,
          icon: pinIcon(g),
          label: num
            ? { text: String(num), color: "#ffffff", fontSize: "11px", fontWeight: "700" }
            : undefined,
          zIndex: num ? 500 - num : 1,
          title: pro.fullName,
        });

        const href = `/${locale}/profesionales/${pro.slug}`;
        // The mini-card: photo · name · profession · rating · price. On touch we add a
        // "Ver perfil" button (tap = the only action); on desktop the card is a quick hover
        // preview and CLICKING the pin navigates, so no button is needed.
        const openPreview = (withButton: boolean) => {
          const avatar = pro.avatarUrl
            ? `<img src="${pro.avatarUrl}" alt="" style="width:46px;height:46px;border-radius:9999px;object-fit:cover;flex-shrink:0;" />`
            : `<div style="width:46px;height:46px;border-radius:9999px;background:#EBF5FB;color:#009FD9;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0;">${pro.fullName.charAt(0)}</div>`;
          const price = pro.priceLabel
            ? `<div style="font-size:13px;font-weight:700;color:#009FD9;margin-top:3px;">${pro.priceLabel}</div>`
            : "";
          const button = withButton
            ? `<a href="${href}" style="display:block;text-align:center;margin-top:10px;background:#009FD9;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 0;border-radius:8px;min-height:44px;box-sizing:border-box;line-height:24px;">${verPerfil}</a>`
            : "";
          info.setContent(
            `<div style="font-family:Inter,Arial,sans-serif;max-width:236px;padding:2px;">` +
              `<div style="display:flex;gap:10px;align-items:flex-start;">` +
                avatar +
                `<div style="min-width:0;">` +
                  `<div style="font-weight:700;color:#111827;font-size:14px;line-height:1.25;">${pro.fullName}</div>` +
                  (pro.categoryLabel ? `<div style="color:#6b7280;font-size:12px;margin-top:1px;">${pro.categoryLabel}</div>` : "") +
                  `<div style="font-size:12px;margin-top:3px;">${starsHtml(pro.ratingAvg)} <span style="color:#9ca3af;">(${pro.reviewCount})</span></div>` +
                  price +
                `</div>` +
              `</div>` +
              button +
            `</div>`
          );
          info.open({ map, anchor: marker });
        };

        // Legacy Marker events. DESKTOP: hover shows the preview, leaving hides it (small
        // debounce so moving between nearby pins isn't janky); clicking the pin navigates.
        // TOUCH: tap shows the preview (with the "Ver perfil" button); Google's × closes it.
        marker.addListener("mouseover", () => {
          if (!canHover) return;
          cancelClose();
          openPreview(false);
          setCardHighlight(pro.proId ?? pro.id, true);
        });
        marker.addListener("mouseout", () => {
          if (!canHover) return;
          setCardHighlight(pro.proId ?? pro.id, false);
          cancelClose();
          closeTimerRef.current = setTimeout(() => info.close(), 130);
        });
        marker.addListener("click", () => {
          if (canHover) { window.location.href = href; return; }
          openPreview(true);
          setCardHighlight(pro.proId ?? pro.id, true);
        });
        return marker;
      })
      .filter(Boolean);

    // Navy cluster bubbles (legacy Marker renderer).
    const renderer = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: ({ count, position }: any) =>
        new g.Marker({
          position,
          icon: clusterIcon(g, count),
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
      {/* `relative` makes THIS the containing block for the map's absolutely-positioned
          canvas, so it can NEVER escape its box and overlap siblings (e.g. the result cards
          below it on mobile) even if a parent forgets to be a positioning context. */}
      <div ref={mapRef} className="relative w-full h-full" />
    </>
  );
}
