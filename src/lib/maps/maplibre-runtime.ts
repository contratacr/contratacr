// Client-only MapLibre entry, imported lazily by `loadMapLibre()` so neither the
// library nor the worker URL reach a page's initial bundle.
//
// The stylesheet is NOT imported here: a CSS import inside a lazy chunk makes
// Next/React insert a `<link rel=stylesheet>` at runtime, and React keeps a
// load promise on it that nobody handles. When the page is left while that
// stylesheet is still loading, WebKit fires `error` on the cancelled link and
// the page reports «Unhandled Promise Rejection: [object Event]». The map
// components import `maplibre-gl/dist/maplibre-gl.css` statically instead
// (part of the route's server-rendered CSS, ~10 KB gzip).
//
// MapLibre 6 is ESM-only and runs its tile worker from a separate module file
// (`maplibre-gl-worker.mjs`). Inside a bundler `import.meta.url` of the library
// does not point at that file, so the worker URL is declared here: webpack and
// Turbopack emit the worker as a hashed, same-origin asset (CSP `worker-src
// 'self'`, no `blob:` needed).

import * as maplibre from "maplibre-gl";

maplibre.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

export { maplibre };
