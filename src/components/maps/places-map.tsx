"use client";

// Embedded directory map (place page, brand page, vertical lists): MapLibre GL +
// OpenFreeMap. The library is imported only when the map scrolls near the
// viewport, so the page itself stays as light as before. Markers are real links
// (or labelled images for a single place), the map uses cooperative gestures so
// one finger keeps scrolling the page on mobile, and the OpenStreetMap /
// OpenFreeMap attribution comes from the tile source.

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { MapLibreModule } from "@/lib/maps/maplibre";
import { createMap, loadMapLibre, sheetAwarePadding, supportsWebGL } from "@/lib/maps/maplibre";
// Static on purpose (route CSS, not a runtime <link>): see src/lib/maps/maplibre-runtime.ts.
import "maplibre-gl/dist/maplibre-gl.css";
import { PIN_CSS, esc, initials, teardropEl } from "@/lib/maps/pins";

export type PlacesMapPoint = {
  id: string;
  lat: number;
  lng: number;
  /** Accessible name of the marker (place or branch name). */
  label: string;
  /** When set, the marker is a link to this page. */
  href?: string;
  /** Result number (1..N) mirrored from the list card, drawn on the pin (directory result lists). */
  rank?: number;
  /** Mini-card data (same card as the professionals map): plain name, «sección · tipo», rating. */
  name?: string;
  sub?: string;
  rating?: number | null;
  ratingCount?: number;
};

const SOURCE = "ccr-places";

// Selection state shared by every pin of this map: id → its pin elements, the open popup and the highlighted card.
type Ctx = {
  lib: MapLibreModule;
  map: MapLibreMap;
  en: boolean;
  byId: Map<string, HTMLElement>;
  popup: Marker | null;
  popupId: string | null;
  active: string | null;
  canHover: boolean;
};

function highlightCard(id: string, on: boolean, scroll: boolean) {
  const el = document.querySelector<HTMLElement>(`[data-search-item="p:${CSS.escape(id)}"]`);
  if (!el) return;
  el.classList.toggle("ring-2", on);
  el.classList.toggle("ring-[#008ce0]", on);
  el.classList.toggle("shadow-lg", on);
  if (on && scroll) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function setActive(ctx: Ctx, id: string | null, on: boolean, scroll = false) {
  if (!id) return;
  const el = ctx.byId.get(id);
  if (el) { el.classList.toggle("is-active", on); el.style.zIndex = on ? "9999" : ""; }
  highlightCard(id, on, scroll);
}
function closePopup(ctx: Ctx) {
  ctx.popup?.remove();
  ctx.popup = null;
  ctx.popupId = null;
}
function hidePopup(ctx: Ctx) {
  if (ctx.active) { setActive(ctx, ctx.active, false); ctx.active = null; }
  closePopup(ctx);
}

// The same white mini-card as the professionals map (.ccr-pop), with the place's data.
function openPopup(ctx: Ctx, p: PlacesMapPoint) {
  if (ctx.popup && ctx.popupId === p.id) return;
  closePopup(ctx);
  ctx.popupId = p.id;
  const name = p.name ?? p.label;
  const rate = p.rating != null && (p.ratingCount ?? 0) > 0
    ? `<div class="ccr-pop-rate"><span class="star">★</span><span class="score">${esc(p.rating.toFixed(1))}</span><span class="count">${esc(`${p.ratingCount} ${ctx.en ? (p.ratingCount === 1 ? "review" : "reviews") : (p.ratingCount === 1 ? "reseña" : "reseñas")}`)}</span></div>`
    : "";
  const wrap = document.createElement("div");
  wrap.className = "ccr-popwrap";
  wrap.innerHTML =
    `<div class="ccr-pop">` +
      `<button type="button" class="ccr-pop-x" aria-label="${ctx.en ? "Close" : "Cerrar"}">×</button>` +
      `<div class="ccr-pop-top">` +
        `<div class="ccr-av">${esc(initials(name))}</div>` +
        `<div style="min-width:0;">` +
          `<div class="ccr-pop-name"><a href="${esc(p.href ?? "#")}" class="ccr-pop-name-text" style="color:inherit;text-decoration:none">${esc(name)}</a></div>` +
          (p.sub ? `<div class="ccr-pop-prof"><span>${esc(p.sub)}</span></div>` : "") +
          rate +
        `</div>` +
      `</div>` +
    `</div>`;
  wrap.querySelector(".ccr-pop-x")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hidePopup(ctx); });
  wrap.querySelector(".ccr-pop")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (p.href) window.location.assign(p.href); });
  ctx.popup = new ctx.lib.Marker({ element: wrap, anchor: "bottom", offset: [0, -46] }).setLngLat([p.lng, p.lat]).addTo(ctx.map);
  ctx.popup.getElement().style.zIndex = "100000";
}

// Desktop: the mini-card closes once the cursor leaves the pin+card region (distance based, never flickers on the pin edge).
function hoverProximity(ctx: Ctx, e: React.MouseEvent) {
  if (!ctx.popup || !ctx.canHover || !ctx.active) return;
  const anchor = ctx.byId.get(ctx.active);
  if (!anchor) return;
  const m = 14, x = e.clientX, y = e.clientY;
  const a = anchor.getBoundingClientRect();
  const pr = ctx.popup.getElement().firstElementChild?.getBoundingClientRect();
  const inRect = (r: DOMRect, mm: number) => x >= r.left - mm && x <= r.right + mm && y >= r.top - mm && y <= r.bottom + mm;
  const inBridge = pr ? x >= a.left - m && x <= a.right + m && y >= Math.min(pr.bottom, a.top) - m && y <= a.bottom + m : false;
  if (!inRect(a, m) && !(pr && inRect(pr, m)) && !inBridge) hidePopup(ctx);
}

function pointMarker(ctx: Ctx | null, lib: MapLibreModule, p: PlacesMapPoint): Marker {
  const interactive = !!p.href;
  const el = teardropEl(p.rank ?? "", p.label, interactive ? "a" : "button");
  el.title = p.label;
  if (p.href) (el as HTMLAnchorElement).href = p.href;
  else { el.setAttribute("role", "img"); el.setAttribute("tabindex", "-1"); }
  if (p.rank != null) el.style.zIndex = String(1000 - p.rank);
  if (ctx && interactive) {
    ctx.byId.set(p.id, el);
    const show = () => {
      if (ctx.active && ctx.active !== p.id) setActive(ctx, ctx.active, false);
      ctx.active = p.id;
      setActive(ctx, p.id, true, true);
      openPopup(ctx, p);
    };
    if (ctx.canHover) {
      el.addEventListener("mouseenter", show);
      el.addEventListener("focus", show);
    } else {
      // Phones: the first tap opens the stable mini-card, tapping the card opens the place.
      el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); show(); });
    }
  }
  return new lib.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]);
}

/**
 * Clustered markers for many points (brand branches, list results): a GeoJSON source with `cluster: true` decides what
 * is grouped; clusters and single points are drawn as HTML markers with the SAME teardrop (a cluster carries its count,
 * a place its card number), so they stay focusable links/buttons. A cluster click zooms to the level where it splits.
 * The list on the page remains the accessible fallback for points hidden inside a pin.
 */
function addClusteredMarkers(ctx: Ctx, points: PlacesMapPoint[]) {
  const { lib, map, en } = ctx;
  const byId = new Map(points.map((p) => [p.id, p]));
  map.addSource(SOURCE, {
    type: "geojson",
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 15,
    data: {
      type: "FeatureCollection",
      features: points.map((p) => ({ type: "Feature", properties: { id: p.id }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
    },
  });
  // Invisible layer: a source is only tiled while a layer uses it.
  map.addLayer({ id: `${SOURCE}-hit`, type: "circle", source: SOURCE, paint: { "circle-radius": 1, "circle-opacity": 0 } });
  let shown = new Map<string, Marker>();
  const cache = new Map<string, Marker>();
  const refresh = () => {
    if (!map.getSource(SOURCE) || !map.isSourceLoaded(SOURCE)) return;
    const next = new Map<string, Marker>();
    for (const f of map.querySourceFeatures(SOURCE)) {
      const props = f.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; id?: string };
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const key = props.cluster ? `c${props.cluster_id}` : `p${props.id}`;
      if (next.has(key)) continue;
      let marker = cache.get(key);
      if (!marker) {
        if (props.cluster) {
          const count = props.point_count ?? 0;
          const btn = teardropEl(count, en ? `${count} businesses here: zoom in` : `${count} negocios aquí: acercar`);
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
            const z = await source?.getClusterExpansionZoom(props.cluster_id!).catch(() => null);
            map.easeTo({ center: [lng, lat], zoom: z ?? map.getZoom() + 2 });
          });
          marker = new lib.Marker({ element: btn, anchor: "bottom" }).setLngLat([lng, lat]);
        } else {
          const point = props.id ? byId.get(props.id) : undefined;
          if (!point) continue;
          marker = pointMarker(ctx, lib, point);
        }
        cache.set(key, marker);
      }
      next.set(key, marker);
      if (!shown.has(key)) marker.addTo(map);
    }
    for (const [key, marker] of shown) if (!next.has(key)) marker.remove();
    shown = next;
  };
  map.on("render", refresh);
}

/** Small maps start with the attribution folded into its «i» button (still one tap away, as OSM allows). */
function foldAttribution(container: HTMLElement) {
  if (container.offsetWidth > 640) return;
  const attrib = container.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact");
  attrib?.classList.remove("maplibregl-compact-show");
  attrib?.removeAttribute("open");
}

export function PlacesMap({
  points,
  locale,
  label,
  className = "h-64 sm:h-80",
  zoom = 15,
  cluster = false,
  cooperative = true,
  bare = false,
}: {
  points: PlacesMapPoint[];
  locale: string;
  /** Accessible name of the map region. */
  label: string;
  className?: string;
  /** Zoom for a single point (MapLibre scale). */
  zoom?: number;
  /** Group nearby points into count bubbles (brand branches, list results). */
  cluster?: boolean;
  /** Two-finger / Ctrl+scroll gestures (embedded maps inside a scrolling page). Off for the full-height results map. */
  cooperative?: boolean;
  /** No rounded frame of its own (the results map sits in the search layout's own frame). */
  bare?: boolean;
}) {
  const en = locale === "en";
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const mediaCleanup = useRef<() => void>(() => {});
  const [state, setState] = useState<"idle" | "ready" | "failed">("idle");
  const key = points.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");

  useEffect(() => {
    const box = boxRef.current;
    if (!box || points.length === 0) return;
    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const start = () => {
      observer?.disconnect();
      if (!supportsWebGL()) { setState("failed"); return; }
      loadMapLibre()
        .then((lib) => {
          if (cancelled || !boxRef.current) return;
          const map = createMap(lib, boxRef.current, {
            language: locale,
            center: [points[0].lng, points[0].lat],
            zoom,
            maxZoom: 18,
            cooperativeGestures: cooperative,
          });
          mapRef.current = map;
          const ctx: Ctx = { lib, map, en, byId: new Map(), popup: null, popupId: null, active: null, canHover: !!window.matchMedia?.("(hover: hover)").matches };
          ctxRef.current = ctx;
          // Same controls as the professionals map: zoom (+ fullscreen on the desktop results/branch maps).
          const nav = new lib.NavigationControl({ showCompass: false });
          const full = new lib.FullscreenControl();
          const syncControls = () => {
            const desktop = !window.matchMedia?.("(max-width: 1023px)").matches;
            const wantNav = bare ? desktop : true;
            const wantFull = (bare || cluster) && desktop;
            for (const [control, want] of [[nav, wantNav], [full, wantFull]] as const) {
              const added = map.hasControl(control);
              if (want && !added) map.addControl(control, "top-right");
              if (!want && added) map.removeControl(control);
            }
          };
          syncControls();
          const media = window.matchMedia?.("(max-width: 1023px)");
          media?.addEventListener?.("change", syncControls);
          mediaCleanup.current = () => media?.removeEventListener?.("change", syncControls);
          map.on("click", (e) => {
            const target = e.originalEvent?.target as HTMLElement | null;
            if (target?.closest?.(".ccr-pin, .ccr-popwrap")) return;
            hidePopup(ctx);
          });
          const bounds = new lib.LngLatBounds();
          for (const p of points) bounds.extend([p.lng, p.lat]);
          const clustered = cluster && points.length > 1;
          if (!clustered) for (const p of points) pointMarker(ctx, lib, p).addTo(map);
          // The bare map is the results map under the mobile sheet: keep the points above it.
          if (points.length > 1) map.fitBounds(bounds, { padding: bare ? sheetAwarePadding(boxRef.current, 48) : 48, maxZoom: 15, duration: 0 });
          map.once("load", () => {
            if (cancelled) return;
            if (clustered) addClusteredMarkers(ctx, points);
            foldAttribution(map.getContainer());
            map.once("idle", () => foldAttribution(map.getContainer()));
            setState("ready");
          });
          map.on("error", () => { /* a failed tile keeps the rest of the map */ });
        })
        .catch(() => { if (!cancelled) setState("failed"); });
    };

    if (typeof IntersectionObserver === "undefined") start();
    else {
      observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) start(); }, { rootMargin: "300px" });
      observer.observe(box);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
      mediaCleanup.current();
      ctxRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // `key` captures the points; the other props do not change per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Card → pin: hovering a result card highlights its pin (delegated), like the professionals list.
  useEffect(() => {
    let current: string | null = null;
    const cardId = (t: EventTarget | null): string | null => {
      const c = (t as HTMLElement | null)?.closest?.("[data-search-item^='p:']") as HTMLElement | null;
      return c ? (c.getAttribute("data-search-item") ?? "").slice(2) : null;
    };
    const pin = (id: string | null, on: boolean) => {
      const el = id ? ctxRef.current?.byId.get(id) : null;
      if (el) { el.classList.toggle("is-active", on); el.style.zIndex = on ? "9999" : ""; }
    };
    const onOver = (e: MouseEvent) => {
      const id = cardId(e.target);
      if (id && id !== current) { pin(current, false); current = id; pin(id, true); }
    };
    const onOut = (e: MouseEvent) => {
      if (cardId(e.target) && !cardId(e.relatedTarget)) { pin(current, false); current = null; }
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => { document.removeEventListener("mouseover", onOver); document.removeEventListener("mouseout", onOut); };
  }, []);

  if (points.length === 0) return null;
  return (
    <div className={`ccr-pmap relative overflow-hidden bg-[#eef2f6] ${bare ? "" : "rounded-2xl border border-[#d7e1ea] "}${className}`} data-places-map={points.length} data-map-state={state} onMouseMove={(e) => ctxRef.current && hoverProximity(ctxRef.current, e)} onMouseLeave={() => ctxRef.current && hidePopup(ctxRef.current)}>
      <style dangerouslySetInnerHTML={{ __html: PIN_CSS }} />
      {/* Inline position: maplibre-gl.css sets `.maplibregl-map{position:relative}`, which beat a Tailwind
          `absolute inset-0` and left the map 0 px tall (clipped by its overflow:hidden). */}
      <div ref={boxRef} style={{ position: "absolute", inset: 0 }} role="region" aria-label={label} />
      {state !== "ready" && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-sm text-slate-600" aria-live="polite">
          {state === "failed"
            ? en ? "The map could not be shown in this browser." : "No se pudo mostrar el mapa en este navegador."
            : en ? "Loading map…" : "Cargando mapa…"}
        </p>
      )}
    </div>
  );
}
