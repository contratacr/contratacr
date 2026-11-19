"use client";

// Service-search map (/buscar, /servicios/…): MapLibre GL + OpenFreeMap, replacing
// the former Google Maps panel (google-map-panel.tsx) with the same props and
// behaviour: numbered teardrop pins, pin↔card highlight, hover/tap mini-card,
// fit to results, focus on the chosen canton/province and «Buscar en esta zona».
// MapLibre itself is imported on demand (src/lib/maps/maplibre.ts), so it never
// weighs on the first paint of the result list, and Google is not loaded here.

import { VERIFIED_SEAL_SVG } from "@/lib/verified-seal";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { VerificationExplanation } from "@/components/ui/verification-info";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, RefreshCw } from "lucide-react";
import type { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, FullscreenControl } from "maplibre-gl";
import { createMap, loadMapLibre, sheetAwarePadding, supportsWebGL, type MapLibreModule } from "@/lib/maps/maplibre";
import { areaView } from "@/lib/maps/cr-area-centers";
import { getProfessionalDisplayName } from "@/lib/display-name";
import { APP_RESUME_EVENT } from "@/lib/app-events";
import { filtrosDeRuta, rutaDeBusqueda } from "@/lib/buscar-url";
import { esServicioDelCatalogo } from "@/lib/data/categories";
// Static on purpose (route CSS, not a runtime <link>): see src/lib/maps/maplibre-runtime.ts.
import "maplibre-gl/dist/maplibre-gl.css";

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
  popupMetricLabel?: string | null;
  provinceName?: string;
  lat?: number | null;
  lng?: number | null;
}

export type MapFocusTarget = {
  key: string;
  label?: string;
  lat?: number;
  lng?: number;
  /** Zoom on the Google scale the search page has always used (MapLibre's is one lower). */
  zoom?: number;
};

interface SearchMapPanelProps {
  /** Kept for the existing call site; the map no longer needs a Google key. */
  apiKey?: string;
  professionals: MapProfessional[];
  locale?: string;
  /** proId → card number (1..N) for the current page; drawn on the pins. */
  numbering?: Record<string, number>;
  /** Active location filter. When present, the map centers here instead of fitting all result pins. */
  focusTarget?: MapFocusTarget | null;
}

// Default view: the Greater Metropolitan Area (GAM). The map pans/zooms freely
// (no Costa Rica bounds restriction) so the coasts and the region stay reachable.
const GAM_CENTER: [number, number] = [-84.08, 9.9325];
// MapLibre zoom = Google zoom − 1 (512 px vector tiles vs 256 px raster tiles).
const z = (googleZoom: number) => googleZoom - 1;

const PIN_BASE = "#009FD9";
const PIN_HOVER = "#162543";

const MAP_CSS =
  ".ccr-pin{display:block;width:30px;height:40px;padding:0;border:0;background:transparent;cursor:pointer;}" +
  ".ccr-pin:focus-visible{outline:none;}" +
  ".ccr-pin:focus-visible .ccr-pin-body{outline:3px solid " + PIN_HOVER + ";outline-offset:2px;border-radius:12px;}" +
  ".ccr-pin-body{position:relative;display:block;width:30px;height:40px;transform-origin:center bottom;transition:transform .15s ease;}" +
  ".ccr-pin svg{display:block;width:30px;height:40px;filter:drop-shadow(0 2px 3px rgba(15,23,42,.35));}" +
  ".ccr-pin path{transition:fill .15s ease;}" +
  ".ccr-pin .num{position:absolute;top:6px;left:0;right:0;text-align:center;color:#fff;font:700 12px/1 Inter,system-ui,sans-serif;}" +
  ".ccr-pin.is-active .ccr-pin-body{transform:scale(1.15);}" +
  ".ccr-pin.is-active path{fill:" + PIN_HOVER + ";}" +
  ".ccr-popwrap{pointer-events:none;}" +
  ".ccr-pop{pointer-events:auto;position:relative;width:min(248px,calc(100vw - 32px));background:#fff;border-radius:14px;box-shadow:0 10px 30px -8px rgba(15,23,42,.30),0 2px 6px rgba(15,23,42,.10);padding:12px;font-family:Inter,system-ui,sans-serif;text-decoration:none;display:block;cursor:pointer;}" +
  ".ccr-pop-x{position:absolute;top:6px;right:6px;width:22px;height:22px;border:0;background:transparent;color:#9ca3af;font-size:16px;line-height:1;cursor:pointer;border-radius:6px;}" +
  ".ccr-pop-x:hover{background:#f3f4f6;color:#374151;}" +
  ".ccr-pop-top{display:flex;gap:10px;align-items:flex-start;}" +
  ".ccr-av{position:relative;width:42px;height:42px;border-radius:9999px;overflow:hidden;background:#EBF5FB;color:#009FD9;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;}" +
  ".ccr-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}" +
  ".ccr-pop-name{font-weight:700;color:#111827;font-size:14px;line-height:1.2;padding-right:18px;display:flex;align-items:center;gap:4px;min-width:0;}" +
  ".ccr-pop-name-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
  // Verification seal — the SAME solid badge as <VerifiedSeal />, inlined because this card is raw HTML.
  ".ccr-ver{display:inline-flex;flex:none;width:24px;height:24px;color:#009FD9;border:0;background:transparent;align-items:center;justify-content:center;cursor:pointer;}" +
  ".ccr-ver svg{display:block;width:14px;height:14px;}" +
  ".ccr-pop-prof{display:flex;align-items:center;gap:4px;color:#6b7280;font-size:12px;margin-top:2px;line-height:1.3;}" +
  ".ccr-pop-more{display:inline-flex;align-items:center;font-size:10px;font-weight:800;color:#526277;line-height:1;}" +
  ".ccr-pop-rate{display:flex;align-items:center;gap:3px;font-size:12px;margin-top:4px;color:#5f6f86;font-weight:600;line-height:1;}" +
  ".ccr-pop-rate .star{color:#f59e0b;font-weight:800;}" +
  ".ccr-pop-rate .score{color:#162543;font-weight:800;}" +
  ".ccr-pop-rate .count{color:#5f6f86;font-weight:600;}" +
  ".ccr-pop-price{font-size:12.5px;font-weight:700;color:" + PIN_BASE + ";margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;}" +
  ".ccr-pop-price.is-compact{margin-top:3px;}" +
  // MapLibre attribution: compact «i» that keeps OpenStreetMap/OpenFreeMap credit readable.
  ".ccr-map .maplibregl-ctrl-attrib{font:11px/1.4 Inter,system-ui,sans-serif;}" +
  ".ccr-map .maplibregl-ctrl-attrib a{color:#334155;}";

function pinSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 24 32" aria-hidden="true" focusable="false">` +
    `<path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z" fill="${PIN_BASE}" stroke="#ffffff" stroke-width="1.5"/></svg>`
  );
}

// THE single shared marker definition: a real <button> (keyboard + screen reader),
// the same teardrop for every result; only the number inside differs.
function teardropEl(num: string | number, label: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ccr-pin";
  el.setAttribute("aria-label", label);
  el.innerHTML = `<span class="ccr-pin-body">${pinSvg()}${num !== "" ? `<span class="num" aria-hidden="true">${num}</span>` : ""}</span>`;
  return el;
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

export function SearchMapPanel({ professionals, locale = "es", numbering, focusTarget }: SearchMapPanelProps) {
  const en = locale === "en";
  const mapRef = useRef<HTMLDivElement>(null);
  const libRef = useRef<MapLibreModule | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const boundsRef = useRef<LngLatBounds | null>(null);
  const markerCountRef = useRef(0);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Marker | null>(null);
  // The key of the pro the mini-card is showing: re-entering the same pin never rebuilds it.
  const popupKeyRef = useRef<string | null>(null);
  const activePinRef = useRef<string | null>(null);
  // Anchor pin + card element, measured on mousemove to hide the card once the cursor
  // leaves a tight pin+card region (distance-based, so it never flickers on the pin edge).
  const activeAnchorElRef = useRef<HTMLElement | null>(null);
  const popupContentElRef = useRef<HTMLElement | null>(null);
  const canHoverRef = useRef(false);
  // proId → its pin elements (a pro can have several workplace pins).
  const pinsByProRef = useRef<Map<string, HTMLElement[]>>(new Map());
  const hoverCardRef = useRef<string | null>(null);
  const lastFocusKeyRef = useRef<string | null>(null);
  const controlsRef = useRef<{ nav: NavigationControl; full: FullscreenControl } | null>(null);
  const router = useRouter();
  const [verificationOpen, setVerificationOpen] = useState(false);
  const tv = useTranslations("verificationBadge");
  const [showArea, setShowArea] = useState(false);
  const [areaSearching, setAreaSearching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // «Buscar en esta zona» appears only after a USER move; programmatic fits set this.
  const suppressMoveRef = useRef(false);

  function setSearchAreaVisible(visible: boolean) {
    setShowArea(visible);
    if (!visible) setAreaSearching(false);
    window.dispatchEvent(new CustomEvent("ccr:search-area-visible", { detail: visible }));
  }

  function setPinActive(proId: string | undefined, on: boolean) {
    if (!proId) return;
    for (const el of pinsByProRef.current.get(proId) ?? []) {
      el.classList.toggle("is-active", on);
      el.style.zIndex = on ? "9999" : (el.dataset.basez || "1");
    }
  }
  // Shared highlight: a pin AND its card light up together (either direction).
  function setActive(proId: string | undefined, on: boolean, scroll: boolean) {
    setPinActive(proId, on);
    highlightCard(proId, on, scroll);
  }

  function handleHoverProximity(e: React.MouseEvent) {
    if (!popupRef.current || !canHoverRef.current) return;
    const anchor = activeAnchorElRef.current;
    if (!anchor) return;
    const m = 14;
    const x = e.clientX, y = e.clientY;
    const a = anchor.getBoundingClientRect();
    const p = popupContentElRef.current?.getBoundingClientRect();
    const inRect = (r: DOMRect, mm: number) =>
      x >= r.left - mm && x <= r.right + mm && y >= r.top - mm && y <= r.bottom + mm;
    const onPin = inRect(a, m);
    const onCard = p ? inRect(p, m) : false;
    const inBridge = p
      ? x >= a.left - m && x <= a.right + m && y >= Math.min(p.bottom, a.top) - m && y <= a.bottom + m
      : false;
    if (!onPin && !onCard && !inBridge) hidePopup();
  }

  function closePopup() {
    popupRef.current?.remove();
    popupRef.current = null;
    popupContentElRef.current = null;
    popupKeyRef.current = null;
  }
  function hidePopup() {
    if (activePinRef.current) { setActive(activePinRef.current, false, false); activePinRef.current = null; }
    closePopup();
  }

  function profileHref(pro: MapProfessional) {
    const from = encodeURIComponent(window.location.pathname + window.location.search);
    return `${prefijoDeIdioma(locale)}/profesionales/${pro.slug}?from=${from}`;
  }

  // The pin mini-card, as its own HTML marker anchored above the pin.
  function openPopup(lib: MapLibreModule, map: MapLibreMap, pro: MapProfessional, pos: { lat: number; lng: number }) {
    if (popupRef.current && popupKeyRef.current === pro.id) return;
    closePopup();
    popupKeyRef.current = pro.id;
    const href = profileHref(pro);
    const professionLabels = (pro.professions ?? []).filter(Boolean);
    const primaryProfession = professionLabels[0] || pro.categoryLabel || "";
    const extraProfessions = Math.max(0, professionLabels.length - 1);
    const displayName = getProfessionalDisplayName(pro.fullName, pro.businessName);
    const primaryName = displayName.primaryDesktop;
    const verifiedLabel = esc(tv("action"));
    const verifiedMarkup = pro.verified
      ? `<button type="button" class="ccr-ver" aria-haspopup="dialog" aria-label="${verifiedLabel}" title="${verifiedLabel}">${VERIFIED_SEAL_SVG}</button>`
      : "";
    const ratingMetric = pro.popupMetricLabel?.match(/^★\s*([0-9.]+)\s*\((.+)\)$/);
    const metricMarkup = ratingMetric
      ? `<div class="ccr-pop-rate"><span class="star">★</span><span class="score">${esc(ratingMetric[1] ?? "")}</span><span class="count">${esc(ratingMetric[2] ?? "")}</span></div>`
      : pro.popupMetricLabel ? `<div class="ccr-pop-rate"><span class="count">${esc(pro.popupMetricLabel)}</span></div>` : "";
    const priceClass = metricMarkup ? "ccr-pop-price" : "ccr-pop-price is-compact";
    const avatarMarkup = pro.avatarUrl
      ? `${esc(initials(primaryName || pro.fullName))}<img src="${esc(pro.avatarUrl)}" alt="" />`
      : esc(initials(primaryName || pro.fullName));
    const closeLabel = en ? "Close" : "Cerrar";
    const wrap = document.createElement("div");
    wrap.className = "ccr-popwrap";
    wrap.innerHTML =
      `<div class="ccr-pop">` +
        `<button type="button" class="ccr-pop-x" aria-label="${closeLabel}">×</button>` +
        `<div class="ccr-pop-top">` +
          `<div class="ccr-av">${avatarMarkup}</div>` +
          `<div style="min-width:0;">` +
            `<div class="ccr-pop-name"><a href="${href}" class="ccr-pop-name-text" style="color:inherit;text-decoration:none">${esc(primaryName)}</a>${verifiedMarkup}</div>` +
            (primaryProfession ? `<div class="ccr-pop-prof"><span>${esc(primaryProfession)}</span>${extraProfessions > 0 ? `<span class="ccr-pop-more">+${extraProfessions}</span>` : ""}</div>` : "") +
            metricMarkup +
            (pro.priceLabel ? `<div class="${priceClass}">${esc(pro.priceLabel)}</div>` : "") +
          `</div>` +
        `</div>` +
      `</div>`;
    wrap.querySelector(".ccr-pop-x")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hidePopup(); });
    wrap.querySelector(".ccr-pop")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hidePopup(); router.push(href); });
    wrap.querySelector(".ccr-ver")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setVerificationOpen(true); });
    const popup = new lib.Marker({ element: wrap, anchor: "bottom", offset: [0, -46] }).setLngLat([pos.lng, pos.lat]).addTo(map);
    popup.getElement().style.zIndex = "100000";
    popupRef.current = popup;
    popupContentElRef.current = wrap;
  }

  // Programmatic camera move without animation; the "search this area" button stays
  // hidden until it settles (the moveend listener below clears the flag).
  function moveQuietly(map: MapLibreMap, move: () => void) {
    suppressMoveRef.current = true;
    move();
    // jumpTo/fitBounds with duration 0 fire moveend synchronously; this is the backstop.
    window.setTimeout(() => { suppressMoveRef.current = false; }, 0);
  }

  function fitToMarkers(map: MapLibreMap, bounds: LngLatBounds | null, count: number) {
    moveQuietly(map, () => {
      if (!bounds || count === 0) { map.jumpTo({ center: GAM_CENTER, zoom: z(11) }); return; }
      if (count === 1) { map.jumpTo({ center: bounds.getCenter(), zoom: z(13) }); return; }
      // On the phone the results sheet covers the lower half: fit above it.
      map.fitBounds(bounds, { padding: sheetAwarePadding(map.getContainer(), 64), maxZoom: z(13), duration: 0 });
    });
  }

  function focusMapTarget(map: MapLibreMap, target: MapFocusTarget | null | undefined) {
    if (!target?.key) { lastFocusKeyRef.current = null; return false; }
    if (lastFocusKeyRef.current === target.key) return true;
    const zoom = z(target.zoom ?? 12);
    if (typeof target.lat === "number" && typeof target.lng === "number") {
      lastFocusKeyRef.current = target.key;
      moveQuietly(map, () => map.jumpTo({ center: [target.lng!, target.lat!], zoom }));
      setSearchAreaVisible(false);
      return true;
    }
    // Canton/province filters: a static table of area centres (OpenStreetMap
    // boundaries), so the map never needs a geocoder — Google stays unloaded.
    const view = areaView(target.key);
    if (!view) return false;
    lastFocusKeyRef.current = target.key;
    moveQuietly(map, () => {
      if (view.bbox && (target.zoom ?? 12) <= 10) map.fitBounds(view.bbox, { padding: sheetAwarePadding(map.getContainer(), 48), duration: 0 });
      else map.jumpTo({ center: view.center, zoom });
    });
    setSearchAreaVisible(false);
    return true;
  }

  // The user moved the map → re-search the exact visible viewport.
  function searchThisArea() {
    const map = mapInstanceRef.current;
    const bounds = map?.getBounds();
    if (!bounds) return;
    const fixed = (n: number) => n.toFixed(6);

    const sp = new URLSearchParams(window.location.search);
    // El servicio vive en la ruta bonita, no en el «?»: se rescata antes de rearmar.
    const enRuta = filtrosDeRuta(window.location.pathname, esServicioDelCatalogo);
    if (enRuta?.categoria) sp.set("categoria", enRuta.categoria);
    sp.delete("page");
    sp.delete("provincia");
    sp.delete("canton");
    sp.set("n", fixed(bounds.getNorth()));
    sp.set("s", fixed(bounds.getSouth()));
    sp.set("e", fixed(bounds.getEast()));
    sp.set("w", fixed(bounds.getWest()));
    setAreaSearching(true);
    router.push(`${prefijoDeIdioma(locale)}${rutaDeBusqueda(sp)}`);
  }

  useEffect(() => {
    window.addEventListener("ccr:search-this-area", searchThisArea);
    return () => window.removeEventListener("ccr:search-this-area", searchThisArea);
  });

  function syncNativeControls() {
    const map = mapInstanceRef.current;
    const controls = controlsRef.current;
    if (!map || !controls) return;
    const desktop = !window.matchMedia?.("(max-width: 1023px)").matches;
    for (const control of [controls.nav, controls.full]) {
      const added = map.hasControl(control);
      if (desktop && !added) map.addControl(control, "top-right");
      if (!desktop && added) map.removeControl(control);
    }
  }

  function ensureMap(lib: MapLibreModule): MapLibreMap | null {
    if (mapInstanceRef.current) return mapInstanceRef.current;
    if (!mapRef.current) return null;
    const map = createMap(lib, mapRef.current, {
      language: locale,
      center: GAM_CENTER,
      zoom: z(11),
      minZoom: 3,
      maxZoom: 18,
      // This map IS the page on mobile (full-bleed under the results sheet), so
      // one-finger pan and direct wheel zoom stay, as with the previous map.
      cooperativeGestures: false,
    });
    mapInstanceRef.current = map;
    controlsRef.current = {
      nav: new lib.NavigationControl({ showCompass: false }),
      full: new lib.FullscreenControl(),
    };
    syncNativeControls();
    map.on("click", (e) => {
      const target = e.originalEvent?.target as HTMLElement | null;
      if (target?.closest?.(".ccr-pin, .ccr-popwrap")) return;
      hidePopup();
    });
    map.on("moveend", () => { if (!suppressMoveRef.current) setSearchAreaVisible(true); });
    return map;
  }

  function renderMarkers(lib: MapLibreModule) {
    const map = ensureMap(lib);
    if (!map) return;

    closePopup();
    setSearchAreaVisible(false);
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    pinsByProRef.current = new Map();
    const canHover = !!window.matchMedia?.("(hover: hover)").matches;
    canHoverRef.current = canHover;
    const bounds = new lib.LngLatBounds();

    const markers: Marker[] = [];
    for (const pro of professionals) {
      const pos = positionFor(pro);
      if (!pos) continue;
      bounds.extend([pos.lng, pos.lat]);
      const proId = pro.proId ?? pro.id;
      const num = numbering?.[proId];
      const zIndex = num ? 1000 - num : 1;
      const titleName = getProfessionalDisplayName(pro.fullName, pro.businessName).primaryDesktop || pro.fullName;
      const label = num
        ? (en ? `${num}. ${titleName}, view profile` : `${num}. ${titleName}, ver perfil`)
        : (en ? `${titleName}, view profile` : `${titleName}, ver perfil`);

      const el = teardropEl(num ?? "", label);
      el.dataset.basez = String(zIndex);
      el.dataset.proId = proId;
      const marker = new lib.Marker({ element: el, anchor: "bottom" }).setLngLat([pos.lng, pos.lat]).addTo(map);
      el.style.zIndex = String(zIndex);
      const list = pinsByProRef.current.get(proId) ?? [];
      list.push(el); pinsByProRef.current.set(proId, list);

      const showPinPopup = () => {
        if (activePinRef.current && activePinRef.current !== proId) setPinActive(activePinRef.current, false);
        activePinRef.current = proId;
        activeAnchorElRef.current = el;
        setPinActive(proId, true);
        openPopup(lib, map, pro, pos);
      };
      if (canHover) {
        // Desktop: hover (or keyboard focus) previews; there is deliberately no
        // mouseleave close — the proximity check on the wrapper handles it.
        el.addEventListener("mouseenter", showPinPopup);
        el.addEventListener("focus", showPinPopup);
      }
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (canHover) {
          hidePopup();
          router.push(profileHref(pro));
        } else {
          // Mobile tap: the stable mini-card (tap the card to open the profile).
          showPinPopup();
        }
      });
      markers.push(marker);
    }

    markersRef.current = markers;
    boundsRef.current = markers.length ? bounds : null;
    markerCountRef.current = markers.length;
    if (!focusMapTarget(map, focusTarget)) fitToMarkers(map, boundsRef.current, markers.length);
  }

  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((lib) => {
        if (cancelled) return;
        if (!supportsWebGL()) { setUnavailable(true); return; }
        libRef.current = lib;
        try { renderMarkers(lib); } catch { setUnavailable(true); }
      })
      .catch(() => { if (!cancelled) setUnavailable(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionals, numbering, focusTarget?.key]);

  // Remove the WebGL context when the panel unmounts.
  useEffect(() => () => {
    mapInstanceRef.current?.remove();
    mapInstanceRef.current = null;
  }, []);

  // Card → pin: hovering a result card highlights its pin (delegated).
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
    if (!el) return;
    const relayout = () => {
      const map = mapInstanceRef.current;
      if (!map || el.offsetWidth === 0) return;
      map.resize();
      if (boundsRef.current && markerCountRef.current > 0 && !lastFocusKeyRef.current) {
        fitToMarkers(map, boundsRef.current, markerCountRef.current);
      }
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(relayout);
    ro?.observe(el);
    window.addEventListener(APP_RESUME_EVENT, relayout);
    return () => {
      ro?.disconnect();
      window.removeEventListener(APP_RESUME_EVENT, relayout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zoom/fullscreen buttons on desktop only (mobile uses pinch); follow breakpoint changes.
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    media.addEventListener("change", syncNativeControls);
    return () => media.removeEventListener("change", syncNativeControls);
  }, []);

  if (unavailable) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center p-6">
        <div className="w-14 h-14 rounded-full flex items-center justify-center ccr-caja-icono">
          <MapPin className="h-7 w-7 text-[#009FD9]" />
        </div>
        <div>
          <p className="font-semibold text-[#1a2744] mb-1">{en ? "Map unavailable" : "Mapa no disponible"}</p>
          <p className="text-xs text-[#68778d] max-w-[220px]">
            {en ? "Your browser could not show the map. The results list still works." : "Su navegador no pudo mostrar el mapa. La lista de resultados sigue disponible."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <VerificationExplanation open={verificationOpen} onClose={() => setVerificationOpen(false)} />
      <style dangerouslySetInnerHTML={{ __html: MAP_CSS }} />
      <div className="ccr-map relative w-full h-full" data-search-map="maplibre" onMouseMove={handleHoverProximity} onMouseLeave={hidePopup}>
        {/* Inline position: maplibre-gl.css sets `.maplibregl-map{position:relative}`, which beat a Tailwind
            `absolute inset-0` and left the map 0 px tall (clipped by its overflow:hidden). */}
        <div ref={mapRef} style={{ position: "absolute", inset: 0 }} role="region" aria-label={en ? "Map of results" : "Mapa de resultados"} />
        {showArea && (
          <button
            type="button"
            onClick={searchThisArea}
            disabled={areaSearching}
            className="absolute left-1/2 top-3 z-20 hidden h-10 -translate-x-1/2 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-extrabold text-[#162543] shadow-[0_8px_24px_rgba(15,23,42,0.16)] transition hover:bg-[#f9fafb] active:scale-95 disabled:cursor-wait disabled:opacity-90 lg:inline-flex"
          >
            {areaSearching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#009FD9]" /> : <RefreshCw className="h-4 w-4 shrink-0 text-[#162543]" />}
            <span className="min-w-0 truncate">
              {areaSearching
                ? en ? "Searching..." : "Buscando..."
                : en ? "Search this area" : "Buscar en esta zona"}
            </span>
          </button>
        )}
      </div>
    </>
  );
}
