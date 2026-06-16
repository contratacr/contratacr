"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { MapPin } from "lucide-react";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps/loader";

export interface MapProfessional {
  id: string;
  /** Canonical professional id (the pin id may carry a workplace suffix). The
   *  card↔pin highlight + numbering both key off this. */
  proId?: string;
  slug: string;
  fullName: string;
  avatarUrl?: string | null;
  ratingAvg: number;
  reviewCount: number;
  categoryLabel?: string;
  /** Profession labels for the popup (already localized). */
  professions?: string[];
  /** True → green "Verificado" in the popup. */
  verified?: boolean;
  hourlyRate?: number | null;
  /** Pre-formatted "from" price for the popup (e.g. "₡10 000 /hora"). */
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

// Province centroids — fallback for professionals who travel (no fixed coords).
const PROVINCE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  "San José": { lat: 9.9281, lng: -84.0907 },
  Alajuela: { lat: 10.0162, lng: -84.2116 },
  Cartago: { lat: 9.8644, lng: -83.9194 },
  Heredia: { lat: 9.9985, lng: -84.1165 },
  Guanacaste: { lat: 10.6267, lng: -85.4437 },
  Puntarenas: { lat: 9.9762, lng: -84.8384 },
  Limón: { lat: 9.9907, lng: -83.0359 },
};

// Default view: the Greater Metropolitan Area (GAM), ~zoom 11–12. minZoom 8 +
// a CR bounds restriction keep the map locked onto Costa Rica.
const GAM_CENTER = { lat: 9.9325, lng: -84.08 };
const CR_BOUNDS = { north: 11.35, south: 7.95, west: -86.05, east: -82.45 };

const PIN_NAVY = "#162543";
const PIN_ACTIVE = "#008ce0";

// Brand styling for the pins, active state, and the popup mini-card. The light
// "Voyager"-like TILE style comes from the cloud Map ID (a mapId disables inline
// JSON styles), so it is configured on NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID in the
// Google Cloud console — not here.
const MAP_CSS =
  ".ccr-pin{position:relative;width:30px;height:40px;cursor:pointer;transform-origin:center bottom;transition:transform .15s ease;}" +
  ".ccr-pin svg{display:block;width:30px;height:40px;filter:drop-shadow(0 2px 3px rgba(15,23,42,.35));}" +
  ".ccr-pin path{transition:fill .15s ease;}" +
  ".ccr-pin .num{position:absolute;top:6px;left:0;right:0;text-align:center;color:#fff;font:700 12px/1 Inter,system-ui,sans-serif;}" +
  ".ccr-pin.is-active{transform:scale(1.15);}" +
  ".ccr-pin.is-active path{fill:" + PIN_ACTIVE + ";}" +
  ".ccr-popwrap{transform:translateY(-46px);pointer-events:none;}" +
  ".ccr-pop{pointer-events:auto;position:relative;width:240px;background:#fff;border-radius:14px;box-shadow:0 10px 30px -8px rgba(15,23,42,.30),0 2px 6px rgba(15,23,42,.10);padding:12px;font-family:Inter,system-ui,sans-serif;text-decoration:none;display:block;}" +
  ".ccr-pop-x{position:absolute;top:6px;right:6px;width:22px;height:22px;border:0;background:transparent;color:#9ca3af;font-size:16px;line-height:1;cursor:pointer;border-radius:6px;}" +
  ".ccr-pop-x:hover{background:#f3f4f6;color:#374151;}" +
  ".ccr-pop-top{display:flex;gap:10px;align-items:flex-start;}" +
  ".ccr-av{width:42px;height:42px;border-radius:9999px;background:#EBF5FB;color:#009FD9;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;}" +
  ".ccr-pop-name{font-weight:700;color:#111827;font-size:14px;line-height:1.25;padding-right:14px;}" +
  ".ccr-ver{display:inline-flex;align-items:center;gap:2px;color:#16a34a;font-size:11px;font-weight:600;margin-left:4px;white-space:nowrap;}" +
  ".ccr-pop-prof{color:#6b7280;font-size:12px;margin-top:2px;line-height:1.3;}" +
  ".ccr-pop-rate{font-size:12px;margin-top:4px;color:#ff9b32;font-weight:700;}" +
  ".ccr-pop-rate span{color:#9ca3af;font-weight:500;}" +
  ".ccr-pop-price{font-size:13px;font-weight:700;color:" + PIN_ACTIVE + ";margin-top:6px;}";

function pinSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 24 32">` +
    `<path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z" fill="${PIN_NAVY}" stroke="#ffffff" stroke-width="1.5"/></svg>`
  );
}

// THE single shared marker definition — every map marker (each result pin AND every
// cluster bubble) is built here, so they are visually identical (same teardrop shape,
// size, color, font) and can never drift apart. Only the number inside differs (the
// result number for a pin, the count for a cluster).
function teardropEl(num: string | number): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "ccr-pin";
  el.innerHTML = pinSvg() + (num !== "" ? `<span class="num">${num}</span>` : "");
  return el;
}

function jitter(seed: string): { dlat: number; dlng: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = ((h % 1000) / 1000 - 0.5) * 0.04;
  const b = (((h >> 10) % 1000) / 1000 - 0.5) * 0.04;
  return { dlat: a, dlng: b };
}

function positionFor(pro: MapProfessional): { lat: number; lng: number } | null {
  if (typeof pro.lat === "number" && typeof pro.lng === "number") return { lat: pro.lat, lng: pro.lng };
  const centroid = pro.provinceName ? PROVINCE_CENTROIDS[pro.provinceName] : null;
  if (!centroid) return null;
  const { dlat, dlng } = jitter(pro.id);
  return { lat: centroid.lat + dlat, lng: centroid.lng + dlng };
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// Highlight the matching result CARD (ring + scroll into view).
function highlightCard(proId: string | undefined, on: boolean, scroll: boolean) {
  if (!proId || typeof document === "undefined") return;
  const el = document.getElementById(`pro-card-${proId}`);
  if (!el) return;
  if (on) {
    el.classList.add("ring-2", "ring-[#008ce0]", "shadow-lg");
    if (scroll) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    el.classList.remove("ring-2", "ring-[#008ce0]", "shadow-lg");
  }
}

export function GoogleMapPanel({ apiKey, professionals, locale = "es", numbering }: GoogleMapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundsRef = useRef<any>(null);
  const markerCountRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clustererRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const popupRef = useRef<any>(null);
  // Debounce closing the hover preview so moving the cursor pin → card (or between
  // nearby pins) doesn't flicker the mini-card shut.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // proId → its pin elements (a pro can have several workplace pins).
  const pinsByProRef = useRef<Map<string, HTMLElement[]>>(new Map());
  const hoverCardRef = useRef<string | null>(null);

  function setPinActive(proId: string | undefined, on: boolean) {
    if (!proId) return;
    for (const el of pinsByProRef.current.get(proId) ?? []) {
      el.classList.toggle("is-active", on);
      const mk = (el as unknown as { _marker?: { zIndex: number } })._marker;
      if (mk) mk.zIndex = on ? 9999 : Number(el.dataset.basez || 1);
    }
  }
  // Shared highlight: a pin AND its card light up together (either direction).
  function setActive(proId: string | undefined, on: boolean, scroll: boolean) {
    setPinActive(proId, on);
    highlightCard(proId, on, scroll);
  }

  function closePopup() {
    if (popupRef.current) { popupRef.current.map = null; popupRef.current = null; }
  }
  function cancelClose() { if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; } }
  function scheduleClose() { cancelClose(); closeTimerRef.current = setTimeout(closePopup, 150); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function openPopup(g: any, map: any, pro: MapProfessional, pos: { lat: number; lng: number }) {
    closePopup();
    const href = `/${locale}/profesionales/${pro.slug}`;
    const profs = (pro.professions ?? []).filter(Boolean).slice(0, 2).join(" · ") || pro.categoryLabel || "";
    const wrap = document.createElement("div");
    wrap.className = "ccr-popwrap";
    wrap.innerHTML =
      `<a class="ccr-pop" href="${href}">` +
        `<button class="ccr-pop-x" aria-label="Cerrar">×</button>` +
        `<div class="ccr-pop-top">` +
          `<div class="ccr-av">${esc(initials(pro.fullName))}</div>` +
          `<div style="min-width:0;">` +
            `<div class="ccr-pop-name">${esc(pro.fullName)}${pro.verified ? `<span class="ccr-ver">✓ ${locale === "en" ? "Verified" : "Verificado"}</span>` : ""}</div>` +
            (profs ? `<div class="ccr-pop-prof">${esc(profs)}</div>` : "") +
            `<div class="ccr-pop-rate">★ ${pro.ratingAvg.toFixed(1)} <span>(${pro.reviewCount})</span></div>` +
            (pro.priceLabel ? `<div class="ccr-pop-price">${esc(pro.priceLabel)}</div>` : "") +
          `</div>` +
        `</div>` +
      `</a>`;
    wrap.querySelector(".ccr-pop-x")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closePopup(); });
    // Keep the hover preview open while the cursor is over the card itself.
    if (typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches) {
      wrap.addEventListener("mouseenter", cancelClose);
      wrap.addEventListener("mouseleave", scheduleClose);
    }
    popupRef.current = new g.marker.AdvancedMarkerElement({ map, position: pos, content: wrap, zIndex: 100000 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fitToMarkers(map: any, g: any, bounds: any, count: number) {
    if (count === 0) { map.setCenter(GAM_CENTER); map.setZoom(11); return; }
    if (count === 1) { map.setCenter(bounds.getCenter()); map.setZoom(13); return; }
    map.fitBounds(bounds, 64);
    g.event.addListenerOnce(map, "idle", () => { if (map.getZoom() > 13) map.setZoom(13); });
  }

  function ensureMap() {
    if (mapInstanceRef.current || !mapRef.current) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps;
    if (!g?.marker?.AdvancedMarkerElement) return null;
    const map = new g.Map(mapRef.current, {
      mapId: MAP_ID,                 // cloud-styled light basemap + enables AdvancedMarkers
      center: GAM_CENTER,
      zoom: 11,
      minZoom: 8,
      maxZoom: 18,
      restriction: { latLngBounds: CR_BOUNDS, strictBounds: false },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      rotateControl: false,
      scaleControl: false,
      zoomControl: true,             // ONLY the zoom control
      clickableIcons: false,
      gestureHandling: "cooperative", // scroll-wheel off until ctrl / two-finger
    });
    mapInstanceRef.current = map;
    map.addListener("click", closePopup);
    return map;
  }

  function renderMarkers() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clusterer = (window as any).markerClusterer;
    if (!g?.marker?.AdvancedMarkerElement || !clusterer) return;
    const map = mapInstanceRef.current ?? ensureMap();
    if (!map) return;

    closePopup();
    pinsByProRef.current = new Map();
    const canHover = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches;
    const bounds = new g.LatLngBounds();

    const markers = professionals.map((pro) => {
      const pos = positionFor(pro);
      if (!pos) return null;
      bounds.extend(pos);
      const proId = pro.proId ?? pro.id;
      const num = numbering?.[proId];
      const z = num ? 1000 - num : 1;

      const el = teardropEl(num ?? "");
      el.dataset.basez = String(z);

      const marker = new g.marker.AdvancedMarkerElement({ position: pos, content: el, zIndex: z, title: pro.fullName });
      // Keep a back-ref so setPinActive can raise zIndex without a marker lookup.
      (el as unknown as { _marker: unknown })._marker = marker;
      const list = pinsByProRef.current.get(proId) ?? [];
      list.push(el); pinsByProRef.current.set(proId, list);

      if (canHover) {
        // Desktop hover: highlight the pin/card AND show the mini-card preview.
        el.addEventListener("mouseenter", () => { cancelClose(); setActive(proId, true, true); openPopup(g, map, pro, pos); });
        el.addEventListener("mouseleave", () => { setActive(proId, false, false); scheduleClose(); });
      }
      el.addEventListener("click", (e) => { e.stopPropagation(); cancelClose(); openPopup(g, map, pro, pos); setActive(proId, true, false); });
      return marker;
    }).filter(Boolean);

    // Clusters reuse the SAME shared teardrop (identical shape/size/color); only the
    // number differs (here the count). No separate marker style → pins can't drift.
    const renderer = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: ({ count, position }: any) =>
        new g.marker.AdvancedMarkerElement({ position, content: teardropEl(count), zIndex: 5000 + count }),
    };

    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.addMarkers(markers);
    } else {
      clustererRef.current = new clusterer.MarkerClusterer({ map, markers, renderer });
    }

    boundsRef.current = bounds;
    markerCountRef.current = markers.length;
    fitToMarkers(map, g, bounds, markers.length);
  }

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(renderMarkers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionals, numbering]);

  // Card → pin: hovering a result card highlights its pin (delegated, so it works
  // with server-rendered cards). Shares the same setActive as pin → card.
  useEffect(() => {
    const cardId = (t: EventTarget | null): string | null => {
      const c = (t as HTMLElement | null)?.closest?.("[id^='pro-card-']") as HTMLElement | null;
      return c ? c.id.slice("pro-card-".length) : null;
    };
    const onOver = (e: MouseEvent) => {
      const id = cardId(e.target);
      if (id && id !== hoverCardRef.current) {
        if (hoverCardRef.current) setPinActive(hoverCardRef.current, false);
        hoverCardRef.current = id; setPinActive(id, true);
      }
    };
    const onOut = (e: MouseEvent) => {
      if (cardId(e.target) && !cardId(e.relatedTarget)) {
        if (hoverCardRef.current) setPinActive(hoverCardRef.current, false);
        hoverCardRef.current = null;
      }
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => { document.removeEventListener("mouseover", onOver); document.removeEventListener("mouseout", onOut); };
  }, []);

  // Relayout + re-fit when the container becomes visible / resizes.
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google?.maps;
      const map = mapInstanceRef.current;
      if (!g || !map || el.offsetWidth === 0) return;
      if (boundsRef.current && markerCountRef.current > 0) fitToMarkers(map, g, boundsRef.current, markerCountRef.current);
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
          <p className="text-xs text-[#9ca3af] max-w-[200px]">Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para activar el mapa.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MAP_CSS }} />
      {/* MarkerClusterer (non-Google lib); the Maps JS API loads via the async loader. */}
      <Script src="https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js" strategy="afterInteractive" onLoad={renderMarkers} />
      <div ref={mapRef} className="relative w-full h-full" />
    </>
  );
}
