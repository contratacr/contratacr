// Single async loader for the Google Maps JS API. Uses the `loading=async`
// best-practice pattern (removes the "loaded directly without loading=async"
// console warning) and preloads the NEW libraries we use:
//   - marker     → google.maps.marker.AdvancedMarkerElement
//   - places     → google.maps.places.PlaceAutocompleteElement
//   - geocoding  → google.maps.Geocoder
// Works with a key restricted to "Places API (New)" + Maps JavaScript API +
// Geocoding API — no legacy "Places API" required.

let readyPromise: Promise<void> | null = null;

// AdvancedMarkerElement requires a Map ID. Provide one via env for cloud-based
// styling; fall back to Google's DEMO id so markers still render out of the box.
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.google?.maps?.marker?.AdvancedMarkerElement && w.google?.maps?.places?.PlaceAutocompleteElement) {
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
