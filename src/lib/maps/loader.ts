// Single async loader for the Google Maps JS API. Uses the `loading=async`
// best-practice pattern (removes the "loaded directly without loading=async"
// console warning) and preloads the NEW libraries we use:
//   - marker     → google.maps.marker.AdvancedMarkerElement
//   - places     → google.maps.places.PlaceAutocompleteElement
//   - geocoding  → google.maps.Geocoder
// Works with a key restricted to "Places API (New)" + Maps JavaScript API +
// Geocoding API — no legacy "Places API" required.

let readyPromise: Promise<void> | null = null;

// Google Cloud generates 16-character hexadecimal Map IDs. Values such as
// DEMO_MAP_ID and CI placeholders are intentionally rejected: using a public
// demo ID with an application key can trigger configuration/CORS failures and
// makes a test deployment depend on somebody else's cloud map configuration.
export function normalizeGoogleMapsMapId(value: string | null | undefined): string | undefined {
  const candidate = value?.trim() ?? "";
  return /^[a-f0-9]{16}$/i.test(candidate) ? candidate : undefined;
}

export const MAP_ID = normalizeGoogleMapsMapId(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID);

export function withConfiguredMapId<T extends Record<string, unknown>>(
  options: T,
  mapId: string | null | undefined = MAP_ID,
): T & { mapId?: string } {
  return mapId ? { ...options, mapId } : options;
}

type GoogleMarkerOptions = {
  map: unknown;
  position: unknown;
  title?: string;
  content?: HTMLElement;
  zIndex?: number;
  gmpDraggable?: boolean;
};

// Advanced markers remain the production path when a real cloud Map ID is
// configured. Without one, a small adapter provides the same interface using
// the classic marker or an OverlayView for our HTML pins. This keeps maps usable
// in isolated/test environments without silently borrowing DEMO_MAP_ID.
export function createGoogleMarker(
  maps: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  options: GoogleMarkerOptions,
  mapId: string | null | undefined = MAP_ID,
): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (mapId && maps.marker?.AdvancedMarkerElement) {
    return new maps.marker.AdvancedMarkerElement(options);
  }

  if (!options.content) {
    const marker = new maps.Marker({
      map: options.map,
      position: options.position,
      title: options.title,
      zIndex: options.zIndex,
      draggable: options.gmpDraggable,
    });
    return Object.defineProperties(
      {
        addListener: marker.addListener.bind(marker),
      },
      {
        map: {
          get: () => marker.getMap(),
          set: (map: unknown) => marker.setMap(map),
        },
        position: {
          get: () => marker.getPosition(),
          set: (position: unknown) => marker.setPosition(position),
        },
        zIndex: {
          get: () => marker.getZIndex(),
          set: (zIndex: number) => marker.setZIndex(zIndex),
        },
      },
    );
  }

  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.transform = "translate(-50%, -100%)";
  host.style.zIndex = String(options.zIndex ?? 0);
  host.title = options.title ?? "";
  host.appendChild(options.content);

  const overlay = new maps.OverlayView();
  let position = options.position;
  let currentMap = options.map;
  overlay.onAdd = () => overlay.getPanes()?.overlayMouseTarget.appendChild(host);
  overlay.draw = () => {
    const literal = position as { lat?: number | (() => number); lng?: number | (() => number) };
    const lat = typeof literal?.lat === "function" ? literal.lat() : literal?.lat;
    const lng = typeof literal?.lng === "function" ? literal.lng() : literal?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    const pixel = overlay.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(lat, lng));
    if (!pixel) return;
    host.style.left = `${pixel.x}px`;
    host.style.top = `${pixel.y}px`;
  };
  overlay.onRemove = () => host.remove();
  overlay.setMap(options.map);

  return Object.defineProperties(
    {
      style: host.style,
      addListener: (eventName: string, listener: EventListener) =>
        maps.event.addDomListener(host, eventName, listener),
    },
    {
      map: {
        get: () => currentMap,
        set: (map: unknown) => {
          currentMap = map;
          overlay.setMap(map);
        },
      },
      position: {
        get: () => position,
        set: (nextPosition: unknown) => {
          position = nextPosition;
          overlay.draw();
        },
      },
      zIndex: {
        get: () => Number(host.style.zIndex || 0),
        set: (zIndex: number) => {
          host.style.zIndex = String(zIndex);
        },
      },
    },
  );
}

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.google?.maps?.Map && w.google?.maps?.places?.PlaceAutocompleteElement) {
    return Promise.resolve();
  }
  if (readyPromise) return readyPromise;
  if (!apiKey) return Promise.reject(new Error("Missing Google Maps API key"));

  readyPromise = new Promise<void>((resolve, reject) => {
    const cb = "__gmapsReady__";
    w[cb] = () => resolve();
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      libraries: "marker,places,geocoding",
      callback: cb,
    });
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.onerror = () => { readyPromise = null; reject(new Error("Google Maps failed to load")); };
    document.head.appendChild(s);
  });
  return readyPromise;
}
