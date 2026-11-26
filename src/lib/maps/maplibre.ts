// Map DISPLAY for the whole app: MapLibre GL JS + OpenFreeMap vector tiles
// (owner decision 2026-11-18). Google is kept ONLY for address autocomplete and
// geocoding (src/lib/maps/loader.ts), loaded when the user focuses an address
// field, so pages that only show a map never request Google.
//
// MapLibre (~1 MB minified, WebGL2) is never in a page's initial bundle: every
// map component calls `loadMapLibre()` from an effect, which `import()`s
// ./maplibre-runtime (library and worker URL) as a separate client-only chunk.
// Its stylesheet is a static import of each map component (see the note in
// ./maplibre-runtime). MapLibre 6 is ESM-only: a namespace import, no default.
//
// Tiles/style: `NEXT_PUBLIC_MAP_STYLE_URL` (any MapLibre style JSON). Default is
// OpenFreeMap «liberty», toned down by `brandMapStyle()` (2026-11-19: positron was
// greyscale and the owner found it dull). See
// docs/maps-maplibre.md for the fallbacks (MapTiler, Stadia, self-hosted PMTiles)
// and the CSP hosts each one needs.

import type { Map as MapLibreMap, MapOptions, StyleSpecification } from "maplibre-gl";

export type MapLibreModule = typeof import("maplibre-gl");

export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function mapStyleUrl(): string {
  const configured = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
  return configured && /^https:\/\//.test(configured) ? configured : DEFAULT_MAP_STYLE_URL;
}

// Map label glyphs (Noto Sans, OFL) for the ranges Costa Rica needs — Latin,
// Latin Extended and general punctuation — are served from our own origin
// (public/map-fonts). Same-origin fetches avoid Safari's cross-origin errors on
// cancelled glyph requests and spare a third-party round trip; any other range
// still comes from the style's own glyph server.
const LOCAL_GLYPH_STACKS: Record<string, string> = {
  "Noto Sans Regular": "noto-sans-regular",
  "Noto Sans Bold": "noto-sans-bold",
  "Noto Sans Italic": "noto-sans-italic",
};
const LOCAL_GLYPH_RANGES = new Set(["0-255", "256-511", "8192-8447"]);

/** Rewrites an OpenFreeMap glyph URL to the self-hosted copy when we have it. */
export function localGlyphUrl(url: string, origin: string): string | null {
  const match = /^https:\/\/tiles\.openfreemap\.org\/fonts\/([^/]+)\/(\d+-\d+)\.pbf$/.exec(url);
  if (!match) return null;
  let stack: string;
  try {
    stack = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const folder = LOCAL_GLYPH_STACKS[stack];
  if (!folder || !LOCAL_GLYPH_RANGES.has(match[2])) return null;
  return `${origin}/map-fonts/${folder}/${match[2]}.pbf`;
}

// Map colours (owner, 2026-11-19: «muy apagado»). OpenFreeMap «liberty» as is
// paints every street yellow, shows bus/shop icons from zoom 15 and extrudes
// buildings: our cyan pins got lost. `brandMapStyle()` keeps its colour (green
// parks and forest, blue water, shaded relief at country zoom, pink hospitals)
// and (2026-11-21) matches the production Google map: light-grey land, aqua water, mint parks, blue-grey
// streets, no third-party POI icons, flat buildings. Only
// colours/visibility change, so it needs no extra request; it applies only to
// the OpenFreeMap liberty style (a custom NEXT_PUBLIC_MAP_STYLE_URL is left as is).
type StyleLayer = StyleSpecification["layers"][number];
const BRAND_FILLS: Record<string, string> = {
  // Production (Google) map: light-mint land everywhere, mint parks, light-grey urban areas, aqua water.
  background: "#cdf1de",
  water: "#83d7ea",
  park: "#c2e9d2",
  landcover_wood: "hsla(150,45%,76%,0.45)",
  landcover_grass: "#c4ecd5",
  landuse_residential: "#f2f2f2",
  landuse_hospital: "#f8e3e8",
  building: "#e6e8ec",
};
const BRAND_WATERWAYS = new Set(["waterway_river", "waterway_other", "waterway_tunnel"]);
// natural_earth is the grey shaded-relief raster of the country view: it made the land read grey and hatched.
const HIDDEN_LAYER = /^poi_|^building-3d$|one_way_arrow|^natural_earth$|^park_outline$/;

function brandRoadColor(id: string): string | null {
  // Same blue-grey streets as the production (Google) results map: white streets vanish on its light land.
  const casing = id.includes("casing");
  if (id.includes("motorway")) return casing ? "#a2b0c2" : "#b4c1d1";
  if (id.includes("trunk_primary")) return casing ? "#b2bfce" : "#c3cedb";
  if (/secondary_tertiary|_link|street|minor|service_track/.test(id)) return casing ? "#c3ccd8" : "#d3dbe5";
  return null;
}

function brandLayer(layer: StyleLayer): StyleLayer | null {
  if (HIDDEN_LAYER.test(layer.id)) return null;
  const fill = BRAND_FILLS[layer.id];
  // Land: mint from country to district zoom, easing to the light grey of built-up streets at street zoom (the
  // production map is grey where it is urban and mint where it is green; parks and grass stay mint on top).
  if (fill && layer.type === "background") return { ...layer, paint: { ...layer.paint, "background-color": ["interpolate", ["linear"], ["zoom"], 11.5, fill, 13.5, "#f3f4f4"] } };
  if (fill && layer.type === "fill") return { ...layer, paint: { ...layer.paint, "fill-color": fill, ...(layer.id === "park" ? { "fill-outline-color": "rgba(0,0,0,0)" } : {}) } };
  if (layer.type === "line" && BRAND_WATERWAYS.has(layer.id)) return { ...layer, paint: { ...layer.paint, "line-color": "#83d7ea" } };
  if (layer.type === "line" && layer["source-layer"] === "transportation") {
    const color = brandRoadColor(layer.id);
    if (color) return { ...layer, paint: { ...layer.paint, "line-color": color } };
  }
  if (layer.type === "symbol" && layer.id === "waterway_line_label") return { ...layer, paint: { ...layer.paint, "text-color": "#3d6f9e" } };
  return layer;
}

/** Recolours OpenFreeMap «liberty» for ContrataCR; any other style is returned unchanged. */
export function brandMapStyle(style: StyleSpecification, styleUrl: string): StyleSpecification {
  if (!/^https:\/\/tiles\.openfreemap\.org\/styles\/liberty\/?$/.test(styleUrl)) return style;
  return { ...style, layers: style.layers.flatMap((layer) => brandLayer(layer) ?? []) };
}

let modulePromise: Promise<MapLibreModule> | null = null;

export function loadMapLibre(): Promise<MapLibreModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("MapLibre is client-only"));
  if (!modulePromise) {
    modulePromise = import("./maplibre-runtime")
      .then(({ maplibre }) => maplibre)
      .catch((error: unknown) => {
        modulePromise = null;
        throw error;
      });
  }
  return modulePromise;
}

/** MapLibre's own UI strings (controls, cooperative-gesture hint) in the page language, «usted» in Spanish. */
export function mapLocale(locale: string): Record<string, string> | undefined {
  if (locale === "en") return undefined; // MapLibre defaults are English
  return {
    "AttributionControl.ToggleAttribution": "Mostrar u ocultar la atribución",
    "AttributionControl.MapFeedback": "Comentarios sobre el mapa",
    "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + desplazamiento para acercar o alejar el mapa",
    "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + desplazamiento para acercar o alejar el mapa",
    "CooperativeGesturesHandler.MobileHelpText": "Use dos dedos para mover el mapa",
    "FullscreenControl.Enter": "Ver en pantalla completa",
    "FullscreenControl.Exit": "Salir de pantalla completa",
    "GeolocateControl.FindMyLocation": "Mostrar mi ubicación",
    "GeolocateControl.LocationNotAvailable": "Ubicación no disponible",
    "LogoControl.Title": "Logotipo de MapLibre",
    "Map.Title": "Mapa",
    "Marker.Title": "Marcador del mapa",
    "NavigationControl.ResetBearing": "Arrastre para girar el mapa; pulse para volver al norte",
    "NavigationControl.ZoomIn": "Acercar",
    "NavigationControl.ZoomOut": "Alejar",
    "Popup.Close": "Cerrar",
  };
}

export function supportsWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    // MapLibre 6 dropped WebGL 1: without WebGL 2 the Map constructor throws.
    return !!canvas.getContext("webgl2");
  } catch {
    return false;
  }
}

type CreateMapOptions = Omit<MapOptions, "container" | "style" | "locale"> & { language?: string };

/**
 * One place that builds every map: style from env, page-language UI strings,
 * compact OSM/OpenFreeMap attribution (the style's TileJSON supplies the text),
 * no rotation (pins are flat), and no telemetry/logos beyond MapLibre's default.
 */
export function createMap(
  maplibre: MapLibreModule,
  container: HTMLElement,
  { language = "es", ...options }: CreateMapOptions,
): MapLibreMap {
  const styleUrl = mapStyleUrl();
  return new maplibre.Map({
    container,
    style: styleUrl,
    transformStyle: (_previous, next) => brandMapStyle(next, styleUrl),
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    locale: mapLocale(language),
    transformRequest: (url, resourceType) => {
      if (resourceType !== "Glyphs") return undefined;
      const local = localGlyphUrl(url, window.location.origin);
      return local ? { url: local } : undefined;
    },
    ...options,
  });
}

/**
 * fitBounds padding for a map that sits UNDER the mobile results sheet
 * (SearchResultsLayout: the sheet rests at half the viewport, CARD_PEEK 0.5).
 * Without it the fitted points land behind the sheet and the visible part of
 * the map shows the empty north (Nicaragua) instead of Costa Rica. Desktop and
 * maps that are not under a sheet get the plain padding.
 */
export function sheetAwarePadding(container: HTMLElement, base: number) {
  if (typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches) return base;
  const rect = container.getBoundingClientRect();
  // The results sheet publishes where its top edge is (search-results-layout); 50% of the screen is the old default.
  const sheetTop = (window as unknown as { __ccrSheetTop?: number }).__ccrSheetTop ?? window.innerHeight * 0.5;
  // A floating search card over the map (phones, owner 2026-11-26) also covers the top of the map.
  const top = document.querySelector("[data-quick-nav-floating]") ? Math.max(base, 84) : base;
  const hidden = rect.bottom - sheetTop;
  if (hidden <= 0 || rect.height <= 0) return top === base ? base : { top, left: base, right: base, bottom: base };
  const bottom = Math.min(Math.round(hidden + base / 2), Math.round(rect.height * 0.8));
  return { top, left: base, right: base, bottom: Math.max(base, bottom) };
}

/** Plain-URL directions (no API, no key): Google Maps and Waze open their own app or site. */
export function directionsLinks(lat: number, lng: number) {
  const ll = `${lat},${lng}`;
  return {
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}`,
    waze: `https://waze.com/ul?ll=${encodeURIComponent(ll)}&navigate=yes`,
  };
}
