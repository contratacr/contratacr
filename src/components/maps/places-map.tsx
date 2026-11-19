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
import { createMap, loadMapLibre, supportsWebGL } from "@/lib/maps/maplibre";

export type PlacesMapPoint = {
  id: string;
  lat: number;
  lng: number;
  /** Accessible name of the marker (place or branch name). */
  label: string;
  /** When set, the marker is a link to this page. */
  href?: string;
};

const PIN =
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 24 32" aria-hidden="true" focusable="false">` +
  `<path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 23 9 23s9-16.25 9-23c0-4.97-4.03-9-9-9z" fill="#009FD9" stroke="#ffffff" stroke-width="1.5"/>` +
  `<circle cx="12" cy="9" r="3.4" fill="#ffffff"/></svg>`;

const CSS =
  ".ccr-pmap .maplibregl-ctrl-attrib{font:11px/1.4 Inter,system-ui,sans-serif;}" +
  ".ccr-pmap .maplibregl-ctrl-attrib a{color:#334155;}" +
  ".ccr-pmark{display:block;width:28px;height:38px;cursor:pointer;filter:drop-shadow(0 2px 3px rgba(15,23,42,.35));}" +
  ".ccr-pmark svg{display:block;width:28px;height:38px;}" +
  ".ccr-pmark:hover path,.ccr-pmark:focus-visible path{fill:#162543;}" +
  ".ccr-pmark:focus-visible{outline:3px solid #162543;outline-offset:2px;border-radius:10px;}" +
  ".ccr-pmark[role=img]{cursor:default;}" +
  // Cluster bubble: a real button («12 lugares: acercar»), same brand blue as the pins.
  ".ccr-pclu{display:grid;place-items:center;min-width:36px;height:36px;padding:0 8px;border-radius:9999px;border:3px solid #fff;background:#009FD9;color:#0b1730;font:800 13px/1 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 6px rgba(15,23,42,.35);}" +
  ".ccr-pclu.is-big{min-width:44px;height:44px;font-size:14px;}" +
  ".ccr-pclu:hover,.ccr-pclu:focus-visible{background:#162543;color:#fff;}" +
  ".ccr-pclu:focus-visible{outline:3px solid #162543;outline-offset:2px;}";

const SOURCE = "ccr-places";

function pointMarker(lib: MapLibreModule, p: PlacesMapPoint): Marker {
  const el = document.createElement(p.href ? "a" : "div");
  el.className = "ccr-pmark";
  el.innerHTML = PIN;
  el.setAttribute("aria-label", p.label);
  el.title = p.label;
  if (p.href) (el as HTMLAnchorElement).href = p.href;
  else el.setAttribute("role", "img");
  return new lib.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]);
}

/**
 * Clustered markers for many points (brand branches, list results): a GeoJSON
 * source with `cluster: true` decides what is grouped; both clusters and single
 * points are drawn as HTML markers so they stay focusable links/buttons. A
 * cluster click zooms to the level where it splits. The list on the page
 * remains the accessible fallback for points hidden inside a bubble.
 */
function addClusteredMarkers(lib: MapLibreModule, map: MapLibreMap, points: PlacesMapPoint[], en: boolean) {
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
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `ccr-pclu${count >= 10 ? " is-big" : ""}`;
          btn.textContent = String(count);
          btn.setAttribute("aria-label", en ? `${count} places here: zoom in` : `${count} lugares aquí: acercar`);
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
            const z = await source?.getClusterExpansionZoom(props.cluster_id!).catch(() => null);
            map.easeTo({ center: [lng, lat], zoom: z ?? map.getZoom() + 2 });
          });
          marker = new lib.Marker({ element: btn, anchor: "center" }).setLngLat([lng, lat]);
        } else {
          const point = props.id ? byId.get(props.id) : undefined;
          if (!point) continue;
          marker = pointMarker(lib, point);
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
}) {
  const en = locale === "en";
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
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
            cooperativeGestures: true,
          });
          mapRef.current = map;
          map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
          const bounds = new lib.LngLatBounds();
          for (const p of points) bounds.extend([p.lng, p.lat]);
          const clustered = cluster && points.length > 1;
          if (!clustered) for (const p of points) pointMarker(lib, p).addTo(map);
          if (points.length > 1) map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
          map.once("load", () => {
            if (cancelled) return;
            if (clustered) addClusteredMarkers(lib, map, points, en);
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
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // `key` captures the points; the other props do not change per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (points.length === 0) return null;
  return (
    <div className={`ccr-pmap relative overflow-hidden rounded-2xl border border-[#d7e1ea] bg-[#eef2f6] ${className}`} data-places-map={points.length} data-map-state={state}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
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
