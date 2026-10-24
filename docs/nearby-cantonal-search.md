# Near-me canton reference

Implemented 2026-10-23 in the shared professional search (SSR and pagination API).

Coordinate-only searches default to proximity unless the user explicitly chooses another sort. Results prioritize the containing canton, then cantons within 25 km of the user's point measured to the canton boundary, then other declared workplaces or coverage in the reference province. Province-wide and nationwide mobile coverage remain eligible; video-only national coverage does not become a local establishment. A professional needs no public map pin to qualify by declared canton. Existing category, visibility, modality and other filters still apply. Pagination remains 20 items in the same order as the initial page.

The polygon snapshot covers all 84 application cantons and was retrieved from the public ARESEP administrative-limits service on 2026-10-23:

https://mapas.aresep.go.cr/server/rest/services/Limites/L%C3%ADmites_administrativos/FeatureServer/6

Query: `where=1=1&outFields=nom_cant,nom_prov,cod_canton,cod_prov_&outSR=4326&geometryPrecision=4&maxAllowableOffset=0.0003&f=geojson`.

Source official codes were matched to the application's existing province/canton IDs, and all 84 names validated (Vazquez/Vasquez spelling normalized). The checked-in JSON preserves polygon holes and bounding boxes. Refresh by repeating the query and validating the official-code mapping against `cr-geography.ts` before replacing the snapshot.

This is approximate geographic proximity, not driving time. Polygon simplification is approximately 30 m; search coordinates are normalized to three decimal places to agree with the existing query cache. A point up to 2 km outside the coastline/border may use the closest canton as a GPS fallback. No external geocoding request is made for this classification.

Regression: `search-nearby-cantons.spec.ts` covers boundary classification, legacy/no-pin workplaces, coverage, sorting preferences and real local-Supabase API/SSR ordering across browser projects. `search-ranking.spec.ts` preserves existing rating behavior. No database migration or native permission changes.
