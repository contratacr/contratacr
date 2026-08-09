"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, RefreshCw, Search } from "lucide-react";
import { loadGoogleMaps, MAP_ID } from "@/lib/maps/loader";
import { getProfessionalDisplayName } from "@/lib/display-name";

export interface MapProfessional {
  id: string;
  /** Canonical professional id (the pin id may carry a workplace suffix). The
   *  card↔pin highlight + numbering both key off this. */
  proId?: string;
  slug: string;
  fullName: string;
  businessName?: string;
  publicBusinessNameOnly?: boolean;
  avatarUrl?: string | null;
  ratingAvg: number;
  reviewCount: number;
  categoryLabel?: string;
  /** Profession labels for the popup (already localized). */
  professions?: string[];
  /** True → the brand-blue "Verificado" pill in the popup (matches the profile badge). */
  verified?: boolean;
  hourlyRate?: number | null;
  /** Pre-formatted "from" price for the popup (e.g. "₡10 000 /hora"). */
  priceLabel?: string | null;
  provinceName?: string;
  lat?: number | null;
  lng?: number | null;
}

export type MapFocusTarget = {
  key: string;
  label?: string;
  lat?: number;
  lng?: number;
  zoom?: number;
};

interface GoogleMapPanelProps {
  apiKey: string;
  professionals: MapProfessional[];
  locale?: string;
  /** proId → card number (1..N) for the current page; drawn on the pins. */
  numbering?: Record<string, number>;
  /** Active location filter. When present, the map centers here instead of fitting all result pins. */
  focusTarget?: MapFocusTarget | null;
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

// Default view: the Greater Metropolitan Area (GAM), ~zoom 11–12. The map OPENS centered on
// Costa Rica but pans/zooms FREELY — there is NO `restriction` bounds (which used to lock the
// center inside CR and made it impossible to reach the coasts) and a low `minZoom` so the user
// can zoom out to the region and beyond.
const GAM_CENTER = { lat: 9.9325, lng: -84.08 };

const PIN_BASE = "#009FD9";
const PIN_HOVER = "#162543";

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
  ".ccr-pin.is-active path{fill:" + PIN_HOVER + ";}" +
  ".ccr-popwrap{transform:translateY(-52px);pointer-events:none;}" +
  ".ccr-pop{pointer-events:auto;position:relative;width:240px;background:#fff;border-radius:14px;box-shadow:0 10px 30px -8px rgba(15,23,42,.30),0 2px 6px rgba(15,23,42,.10);padding:12px;font-family:Inter,system-ui,sans-serif;text-decoration:none;display:block;}" +
  ".ccr-pop-x{position:absolute;top:6px;right:6px;width:22px;height:22px;border:0;background:transparent;color:#9ca3af;font-size:16px;line-height:1;cursor:pointer;border-radius:6px;}" +
  ".ccr-pop-x:hover{background:#f3f4f6;color:#374151;}" +
  ".ccr-pop-top{display:flex;gap:10px;align-items:flex-start;}" +
  ".ccr-av{width:42px;height:42px;border-radius:9999px;background:#EBF5FB;color:#009FD9;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;}" +
  ".ccr-pop-name{font-weight:700;color:#111827;font-size:14px;line-height:1.25;padding-right:14px;}" +
  ".ccr-pop-sub{color:#6b7280;font-size:11px;font-weight:600;line-height:1.25;margin-top:2px;}" +
  // "Verificado" pill — EXACTLY the /buscar card's badge: solid brand-blue #009FD9
  // rounded-full pill, white text, font-size 10px / weight 600, padding 2px 8px
  // (= card `rounded-full bg-[#009FD9] px-2 py-0.5 text-[10px] font-semibold text-white`).
  // NO green, NO check icon.
  ".ccr-ver{display:inline-flex;align-items:center;border-radius:9999px;background:#009FD9;color:#fff;font-size:10px;font-weight:600;line-height:1.2;padding:2px 8px;margin-left:5px;white-space:nowrap;vertical-align:middle;}" +
  ".ccr-pop-prof{color:#6b7280;font-size:12px;margin-top:2px;line-height:1.3;}" +
  ".ccr-pop-rate{font-size:12px;margin-top:4px;color:#ff9b32;font-weight:700;}" +
  ".ccr-pop-rate span{color:#9ca3af;font-weight:500;}" +
  ".ccr-pop-price{font-size:13px;font-weight:700;color:" + PIN_BASE + ";margin-top:6px;}" +
  // Cluster preview popup — a compact list of the grouped pros (each row → profile), so a
  // cluster is never a dead marker. (No zoom button — pinch / wheel-zoom separates them.)
  ".ccr-clpop{pointer-events:auto;position:relative;width:250px;background:#fff;border-radius:14px;box-shadow:0 10px 30px -8px rgba(15,23,42,.30),0 2px 6px rgba(15,23,42,.10);padding:10px;font-family:Inter,system-ui,sans-serif;}" +
  ".ccr-clpop-h{font-weight:700;color:#111827;font-size:12px;padding:0 18px 6px 2px;}" +
  ".ccr-cllist{display:flex;flex-direction:column;gap:1px;max-height:208px;overflow-y:auto;}" +
  ".ccr-clrow{display:flex;gap:8px;align-items:center;padding:6px;border-radius:9px;text-decoration:none;}" +
  ".ccr-clrow:hover{background:#f4f7fa;}" +
  ".ccr-av-sm{width:32px;height:32px;font-size:12px;}" +
  ".ccr-clname{font-weight:700;color:#111827;font-size:12px;line-height:1.2;display:flex;align-items:center;flex-wrap:wrap;}" +
  ".ccr-clsub{color:#6b7280;font-size:10.5px;line-height:1.2;margin-top:1px;}" +
  ".ccr-clmeta{color:#6b7280;font-size:11px;margin-top:1px;}" +
  ".ccr-clmeta b{color:#ff9b32;font-weight:700;}" +
  ".ccr-clmore{color:#9ca3af;font-size:11px;padding:5px 2px 0;}";

function pinSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 24 32">` +
    `<path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z" fill="${PIN_BASE}" stroke="#ffffff" stroke-width="1.5"/></svg>`
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
  return null;
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

export function GoogleMapPanel({ apiKey, professionals, locale = "es", numbering, focusTarget }: GoogleMapPanelProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundsRef = useRef<any>(null);
  const markerCountRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const popupRef = useRef<any>(null);
  // The key of the pro/cluster the popup is CURRENTLY showing. The hover preview is
  // recreated only when this key changes — so re-entering the SAME pin (or a stray
  // enter/leave loop in the pin↔card overlap zone) no longer tears down + rebuilds the
  // mini-card every mousemove (that rebuild was the "vibration"/flicker).
  const popupKeyRef = useRef<string | null>(null);
  // The proId of the currently highlighted / popup'd pin. Used to clear the PREVIOUS pin's
  // highlight when the cursor moves to a different pin, and on hide. The popup NEVER closes on a
  // pin's own mouseleave (that boundary toggling was the flicker) — only on map-leave/click/switch.
  const activePinRef = useRef<string | null>(null);
  // The DOM element the popup is anchored to (the active pin OR cluster) + the popup's
  // content element — measured on each mousemove to hide the card PROMPTLY once the
  // cursor leaves a TIGHT region around the pin/card (instead of lingering until the
  // cursor leaves the whole map). Distance-based, so it never toggles the pin's own
  // hover boundary → the anti-flicker fix stays intact.
  const activeAnchorElRef = useRef<HTMLElement | null>(null);
  const popupContentElRef = useRef<HTMLElement | null>(null);
  const canHoverRef = useRef(false);
  // proId → its pin elements (a pro can have several workplace pins).
  const pinsByProRef = useRef<Map<string, HTMLElement[]>>(new Map());
  const hoverCardRef = useRef<string | null>(null);
  const lastFocusKeyRef = useRef<string | null>(null);
  // "Buscar en esta área": show the button only after a USER move (suppress while we
  // programmatically fit the map to the results).
  const router = useRouter();
  const [showArea, setShowArea] = useState(false);
  const [areaSearching, setAreaSearching] = useState(false);
  const suppressMoveRef = useRef(false);
  const searchMapReadyRef = useRef(false);

  function setSearchAreaVisible(visible: boolean) {
    setShowArea(visible);
    if (!visible) setAreaSearching(false);
    window.dispatchEvent(new CustomEvent("ccr:search-area-visible", { detail: visible }));
  }

  function markSearchMapLoading() {
    searchMapReadyRef.current = false;
    (window as typeof window & { __ccrSearchMapReady?: boolean }).__ccrSearchMapReady = false;
    (window as typeof window & { __ccrSearchMapLoading?: boolean }).__ccrSearchMapLoading = true;
    window.dispatchEvent(new CustomEvent("ccr:search-map-loading"));
  }

  useLayoutEffect(() => {
    markSearchMapLoading();
  }, [professionals, numbering]);

  function markSearchMapReady() {
    if (searchMapReadyRef.current) return;
    searchMapReadyRef.current = true;
    (window as typeof window & { __ccrSearchMapReady?: boolean }).__ccrSearchMapReady = true;
    (window as typeof window & { __ccrSearchMapLoading?: boolean }).__ccrSearchMapLoading = false;
    window.dispatchEvent(new CustomEvent("ccr:search-map-ready"));
  }

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

  // Proximity hide: with a popup open, hide it as soon as the cursor leaves a TIGHT region
  // — the pin, a narrow corridor straight up to the card, and the card itself — so the
  // mini-card no longer lingers far from the pin. We hide by DISTANCE on mousemove, NEVER
  // by the pin's mouseenter/leave, so the pin↔popup boundary never toggles (the flicker
  // fix stays intact). Desktop (hover) only; mobile keeps tap-to-close.
  function handleHoverProximity(e: React.MouseEvent) {
    if (!popupRef.current || !canHoverRef.current) return;
    const anchor = activeAnchorElRef.current;
    if (!anchor) return;
    const m = 14; // small margin so micro-jitter never closes it
    const x = e.clientX, y = e.clientY;
    const a = anchor.getBoundingClientRect();
    const p = popupContentElRef.current?.getBoundingClientRect();
    const inRect = (r: DOMRect, mm: number) =>
      x >= r.left - mm && x <= r.right + mm && y >= r.top - mm && y <= r.bottom + mm;
    const onPin = inRect(a, m);
    const onCard = p ? inRect(p, m) : false;
    // Narrow vertical corridor directly above the pin, bridging the gap to the card so
    // moving pin→card never crosses "dead" space (which would otherwise hide+reopen).
    const inBridge = p
      ? x >= a.left - m && x <= a.right + m && y >= Math.min(p.bottom, a.top) - m && y <= a.bottom + m
      : false;
    if (!onPin && !onCard && !inBridge) hidePopup();
  }

  function closePopup() {
    if (popupRef.current) { popupRef.current.map = null; popupRef.current = null; }
    popupContentElRef.current = null;
    popupKeyRef.current = null;
  }
  // Hide the popup AND clear the highlighted pin. Called ONLY when the cursor leaves the whole
  // map area, on a map click, or before showing a DIFFERENT pin/cluster — never on a pin's own
  // mouseleave. (That pin↔popup boundary toggling — open on enter, close on leave — was the
  // flicker: the popup/scale momentarily steals the pin's hover → mouseleave → close → the
  // cursor is back on the pin → mouseenter → reopen → loop.)
  function hidePopup() {
    if (activePinRef.current) { setActive(activePinRef.current, false, false); activePinRef.current = null; }
    closePopup();
  }

  // ANTI-FLICKER (the definitive, structure-independent fix). The popup is a SEPARATE
  // AdvancedMarkerElement anchored at the pin/cluster; Google's `<gmp-advanced-marker>` wrapper has
  // a transparent hit-box that sits ON TOP OF the pin (the card is only shifted up *visually* by a
  // CSS transform). With its default `pointer-events:auto` that wrapper STEALS the pin's hover →
  // mouseleave → close → mouseenter → … the flicker loop. THE FIX: make the popup NEVER capture the
  // pointer. `AdvancedMarkerElement` extends `HTMLElement`, so we set `pointer-events:none` directly
  // on the marker element (reliable, no DOM-structure assumptions), PLUS walk the rendered wrapper as
  // a belt-and-suspenders fallback. The card/rows keep their own `pointer-events:auto` (CSS) — a
  // child's `auto` overrides the wrapper's `none` — so they stay fully clickable. The cursor passes
  // straight THROUGH the popup to the pin: zero steal, rock stable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function neutralizePopup(marker: any, wrap: HTMLElement) {
    try { if (marker?.style) marker.style.pointerEvents = "none"; } catch { /* not an element in this build */ }
    const apply = () => {
      let node: HTMLElement | null = wrap.parentElement;
      let guard = 0;
      while (node && guard++ < 5) {
        node.style.pointerEvents = "none";
        if ((node.tagName || "").toLowerCase() === "gmp-advanced-marker") break; // stop AT the marker root, never the shared pane
        node = node.parentElement;
      }
    };
    apply();
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(apply);
  }

  // The pin mini-card. Opened on hover (desktop) AND click/tap. Position is computed ONCE on open
  // (anchored to the pin), never per-mousemove. Deduped by `pro.id` so re-entering the same pin
  // never rebuilds it. The card stays `pointer-events:auto` (clickable); only the wrapper is
  // killed (see `killWrapperPE`) so it can never steal the pin's hover.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function openPopup(g: any, map: any, pro: MapProfessional, pos: { lat: number; lng: number }) {
    if (popupRef.current && popupKeyRef.current === pro.id) return; // already showing this pin
    closePopup();
    popupKeyRef.current = pro.id;
    const href = `/${locale}/profesionales/${pro.slug}`;
    const profs = (pro.professions ?? []).filter(Boolean).slice(0, 2).join(" · ") || pro.categoryLabel || "";
    const displayName = getProfessionalDisplayName(pro.fullName, pro.businessName);
    const primaryName = displayName.primaryDesktop;
    const secondaryName = displayName.secondaryDesktop;
    const wrap = document.createElement("div");
    wrap.className = "ccr-popwrap";
    wrap.innerHTML =
      `<a class="ccr-pop" href="${href}">` +
        `<button class="ccr-pop-x" aria-label="Cerrar">×</button>` +
        `<div class="ccr-pop-top">` +
          `<div class="ccr-av">${esc(initials(primaryName || pro.fullName))}</div>` +
          `<div style="min-width:0;">` +
            `<div class="ccr-pop-name">${esc(primaryName)}${pro.verified ? `<span class="ccr-ver">${locale === "en" ? "Verified" : "Verificado"}</span>` : ""}</div>` +
            (secondaryName ? `<div class="ccr-pop-sub">${esc(secondaryName)}</div>` : "") +
            (profs ? `<div class="ccr-pop-prof">${esc(profs)}</div>` : "") +
            `<div class="ccr-pop-rate">★ ${pro.ratingAvg.toFixed(1)} <span>(${pro.reviewCount})</span></div>` +
            (pro.priceLabel ? `<div class="ccr-pop-price">${esc(pro.priceLabel)}</div>` : "") +
          `</div>` +
        `</div>` +
      `</a>`;
    wrap.querySelector(".ccr-pop-x")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hidePopup(); });
    popupRef.current = new g.marker.AdvancedMarkerElement({ map, position: pos, content: wrap, zIndex: 100000 });
    popupContentElRef.current = wrap; // measured by the proximity-hide on mousemove
    neutralizePopup(popupRef.current, wrap); // ← belt-and-suspenders: the popup also can't capture the pointer
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fitToMarkers(map: any, g: any, bounds: any, count: number) {
    // Programmatic move → suppress the "search this area" button until it settles.
    suppressMoveRef.current = true;
    const done = () => { suppressMoveRef.current = false; };
    if (count === 0) { map.setCenter(GAM_CENTER); map.setZoom(11); g.event.addListenerOnce(map, "idle", done); return; }
    if (count === 1) { map.setCenter(bounds.getCenter()); map.setZoom(13); g.event.addListenerOnce(map, "idle", done); return; }
    map.fitBounds(bounds, 64);
    g.event.addListenerOnce(map, "idle", () => { if (map.getZoom() > 13) map.setZoom(13); done(); });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function focusMapTarget(map: any, g: any, target: MapFocusTarget | null | undefined) {
    if (!target?.key) return false;
    if (lastFocusKeyRef.current === target.key) return true;
    lastFocusKeyRef.current = target.key;
    suppressMoveRef.current = true;
    const done = () => { suppressMoveRef.current = false; setSearchAreaVisible(false); };
    const zoom = target.zoom ?? 12;
    if (typeof target.lat === "number" && typeof target.lng === "number") {
      map.setCenter({ lat: target.lat, lng: target.lng });
      map.setZoom(zoom);
      g.event.addListenerOnce(map, "idle", done);
      return true;
    }
    if (target.label?.trim() && g.Geocoder) {
      const geocoder = new g.Geocoder();
      geocoder.geocode(
        {
          address: target.label.includes("Costa Rica") ? target.label : `${target.label}, Costa Rica`,
          componentRestrictions: { country: "CR" },
          region: "cr",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (results: any[] | null, status: string) => {
          let moved = false;
          if (status === "OK" && results?.[0]?.geometry) {
            const geometry = results[0].geometry;
            if (geometry.viewport && target.zoom && target.zoom <= 10) {
              map.fitBounds(geometry.viewport, 72);
              moved = true;
            }
            else {
              map.setCenter(geometry.location);
              map.setZoom(zoom);
              moved = true;
            }
          }
          if (moved) g.event.addListenerOnce(map, "idle", done);
          else done();
        }
      );
      return true;
    }
    done();
    return false;
  }

  // The user moved the map → re-search the exact visible viewport. This is more
  // precise than a province/canton filter: if the user is zoomed into Mercedes,
  // "Buscar en esta área" should mean pins/workplaces inside that map rectangle,
  // not every professional who only selected all of Atenas as a broad work zone.
  function searchThisArea() {
    const map = mapInstanceRef.current;
    const bounds = map?.getBounds?.();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const fixed = (n: number) => n.toFixed(6);

    const sp = new URLSearchParams(window.location.search);
    sp.delete("page");
    sp.delete("provincia");
    sp.delete("canton");
    sp.set("n", fixed(ne.lat()));
    sp.set("s", fixed(sw.lat()));
    sp.set("e", fixed(ne.lng()));
    sp.set("w", fixed(sw.lng()));
    setAreaSearching(true);
    router.push(`${window.location.pathname}?${sp.toString()}`);
  }

  useEffect(() => {
    window.addEventListener("ccr:search-this-area", searchThisArea);
    return () => window.removeEventListener("ccr:search-this-area", searchThisArea);
  });

  function ensureMap() {
    if (mapInstanceRef.current || !mapRef.current) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps;
    if (!g?.marker?.AdvancedMarkerElement) return null;
    const useNativeControls = !window.matchMedia?.("(max-width: 1023px)").matches;
    const map = new g.Map(mapRef.current, {
      mapId: MAP_ID,                 // cloud-styled light basemap + enables AdvancedMarkers
      center: GAM_CENTER,    // opens centered on Costa Rica…
      zoom: 11,
      minZoom: 4,            // …but pans/zooms FREELY (no CR bounds restriction; zoom out to the region)
      maxZoom: 18,
      mapTypeControl: false,
      streetViewControl: false,
      rotateControl: false,
      scaleControl: false,
      cameraControl: false,
      fullscreenControl: useNativeControls,
      fullscreenControlOptions: { position: g.ControlPosition.TOP_RIGHT },
      zoomControl: useNativeControls,
      zoomControlOptions: { position: g.ControlPosition.RIGHT_TOP },
      clickableIcons: false,
      gestureHandling: "greedy", // wheel/scroll zooms DIRECTLY over the map (no Ctrl hint); one-finger pan + pinch-zoom on mobile
    });
    mapInstanceRef.current = map;
    map.addListener("click", hidePopup); // tapping the map closes the popup + clears the pin highlight
    map.addListener("idle", markSearchMapReady);
    map.addListener("tilesloaded", markSearchMapReady);
    // Show "Buscar en esta área" after a user pan/zoom (ignored during programmatic fits).
    map.addListener("dragend", () => { if (!suppressMoveRef.current) setSearchAreaVisible(true); });
    map.addListener("zoom_changed", () => { if (!suppressMoveRef.current) setSearchAreaVisible(true); });
    return map;
  }

  function renderMarkers() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps;
    if (!g?.marker?.AdvancedMarkerElement) return;
    const map = mapInstanceRef.current ?? ensureMap();
    if (!map) return;

    closePopup();
    setSearchAreaVisible(false); // fresh results reflect the (just-searched) area
    for (const marker of markersRef.current) marker.map = null;
    markersRef.current = [];
    pinsByProRef.current = new Map();
    const canHover = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches;
    canHoverRef.current = canHover; // so the proximity-hide (mousemove) runs on desktop only
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

      const titleName = getProfessionalDisplayName(pro.fullName, pro.businessName).primaryDesktop || pro.fullName;
      const marker = new g.marker.AdvancedMarkerElement({ map, position: pos, content: el, zIndex: z, title: titleName });
      // Keep a back-ref so setPinActive can raise zIndex without a marker lookup.
      (el as unknown as { _marker: unknown })._marker = marker;
      const list = pinsByProRef.current.get(proId) ?? [];
      list.push(el); pinsByProRef.current.set(proId, list);

      if (canHover) {
        // DESKTOP HOVER → switch the highlight to THIS pin (clearing the previous one) + show the
        // mini-card. There is NO mouseleave handler — the popup is NOT closed when the cursor leaves
        // the pin (that boundary toggle was the flicker). It closes only on map-leave / map-click /
        // hovering a different pin (which re-enters here and switches). Re-entering the SAME pin is a
        // no-op (openPopup dedupes by pro.id). NO scroll on hover (it would shift the sticky map).
        el.addEventListener("mouseenter", () => {
          if (activePinRef.current && activePinRef.current !== proId) setActive(activePinRef.current, false, false);
          activePinRef.current = proId;
          activeAnchorElRef.current = el;
          setActive(proId, true, false);
          openPopup(g, map, pro, pos);
        });
      }
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (canHover) {
          // DESKTOP CLICK → go straight to the professional (reliable navigation).
          hidePopup();
          router.push(`/${locale}/profesionales/${pro.slug}`);
        } else {
          // MOBILE TAP → show the stable mini-card (tap the card itself to open the profile).
          if (activePinRef.current && activePinRef.current !== proId) setActive(activePinRef.current, false, false);
          activePinRef.current = proId;
          activeAnchorElRef.current = el;
          setActive(proId, true, false);
          openPopup(g, map, pro, pos);
        }
      });
      return marker;
    }).filter(Boolean);

    markersRef.current = markers;

    boundsRef.current = bounds;
    markerCountRef.current = markers.length;
    if (!focusMapTarget(map, g, focusTarget)) fitToMarkers(map, g, bounds, markers.length);
  }

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(renderMarkers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionals, numbering, focusTarget?.key]);

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

  // Google Maps keeps the controls it received at construction time. Keep them
  // in sync when DevTools or device rotation crosses the responsive breakpoint.
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const syncNativeControls = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      map.setOptions({
        zoomControl: !media.matches,
        fullscreenControl: !media.matches,
      });
    };

    syncNativeControls();
    media.addEventListener("change", syncNativeControls);
    return () => media.removeEventListener("change", syncNativeControls);
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
      {/* Wrapper is the positioning context; the map fills it and the floating
          "Buscar en esta área" button overlays on top (top-center, like Airbnb/Uber).
          `onMouseMove` hides the hover popup promptly once the cursor leaves the tight
          pin+card region (proximity, not boundary-toggle → no flicker); `onMouseLeave`
          is the backstop for when the cursor leaves the WHOLE map. */}
      <div className="relative w-full h-full" onMouseMove={handleHoverProximity} onMouseLeave={hidePopup}>
        <div ref={mapRef} className="absolute inset-0" />
        {showArea && (
          <button
            type="button"
            onClick={searchThisArea}
            disabled={areaSearching}
            className="absolute left-1/2 top-3 z-20 hidden h-10 -translate-x-1/2 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-[#d8e2ea] bg-white px-4 text-sm font-extrabold text-[#162543] shadow-[0_8px_24px_rgba(15,23,42,0.16)] transition hover:bg-[#f9fafb] active:scale-95 disabled:cursor-wait disabled:opacity-90 lg:inline-flex"
          >
            {areaSearching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#009FD9]" /> : <RefreshCw className="h-4 w-4 shrink-0 text-[#162543]" />}
            <span className="min-w-0 truncate">
              {areaSearching
                ? locale === "en" ? "Searching..." : "Buscando..."
                : locale === "en" ? "Search this area" : "Buscar en esta zona"}
            </span>
          </button>
        )}
      </div>
    </>
  );
}
