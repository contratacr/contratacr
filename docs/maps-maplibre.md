# Mapas: MapLibre + OpenFreeMap (2026-11-18)

Decisión del dueño (2026-11-18): **mostrar** mapas deja Google Maps JS y pasa a
MapLibre GL JS con teselas vectoriales de OpenFreeMap. **Buscar direcciones**
sigue en Google (Places Autocomplete + Geocoder): en 30 consultas de Costa Rica
Google acertó 29, Photon 22 y Nominatim 24.

Estado: solo local (rama Pro). Nada de esto está desplegado.

## Qué usa cada cosa

| Pieza | Archivo | Proveedor |
|---|---|---|
| Mapa de resultados de servicios (`/buscar`, `/servicios/…`) | `src/components/maps/search-map-panel.tsx` | MapLibre + OpenFreeMap |
| Zonas de trabajo del profesional (registro y perfil) | `src/components/maps/workplaces-picker.tsx` | MapLibre; buscador de dirección y nombre del punto con Google |
| Mapa de un lugar (`/lugar/<slug>`) | `src/components/maps/places-map.tsx` desde `place-page.tsx` | MapLibre |
| Mapa de sucursales (`/marca/<slug>`) | `places-map.tsx` | MapLibre |
| «Ver en el mapa» en las listas del directorio | `src/components/maps/results-map-toggle.tsx` | MapLibre, se descarga al abrirlo |
| Autocompletado de dirección (inicio, filtros de búsqueda, buscador del selector de zonas) | `landing-hero.tsx`, `search-filters.tsx`, `workplaces-picker.tsx` | Google, se carga al enfocar el campo |
| Centrar el mapa en la provincia/cantón filtrado | `src/lib/maps/cr-area-centers.ts` | Tabla fija (límites de OSM), sin geocodificador |
| «Cómo llegar» | `directionsLinks()` en `src/lib/maps/maplibre.ts` | Enlaces simples a OpenStreetMap, Google Maps y Waze (sin API ni clave) |

Las páginas que solo muestran un mapa **no cargan Google**. Google se pide
cuando la persona enfoca un campo de dirección, o en el selector de zonas cuando
marca un punto (para poner nombre a la dirección).

MapLibre (`maplibre-gl@5.24.0`, la última 5.x con más de dos semanas; la 6.x
carga su worker como módulo aparte y hay que servirlo a mano) se importa con
`import()` desde un efecto: es un chunk aparte que no entra en la carga inicial
de ninguna página.

## Variable de entorno

`NEXT_PUBLIC_MAP_STYLE_URL` — URL `https://` de un estilo MapLibre (style JSON).
Sin ella se usa `https://tiles.openfreemap.org/styles/positron` (gris claro, deja
resaltar los marcadores azules de la marca). Otros estilos de OpenFreeMap:
`liberty` y `bright`.

El middleware agrega a la CSP el origen de esa URL. Si el estilo pide teselas,
fuentes o sprites de **otro** dominio, ese dominio hay que agregarlo a
`img-src` y `connect-src` en `src/middleware.ts`.

## Atribución

El control de atribución de MapLibre (compacto, «i» abajo a la derecha) muestra el
texto del TileJSON de OpenFreeMap: «OpenFreeMap © OpenMapTiles Data from
OpenStreetMap». No se debe ocultar: la licencia ODbL de OpenStreetMap la exige.
Si se cambia de proveedor, su estilo trae su propia atribución.

## Plan B si OpenFreeMap falla (no tiene SLA)

Solo hay que cambiar `NEXT_PUBLIC_MAP_STYLE_URL` (y la CSP si cambia el host):

1. **MapTiler Cloud** (Flex, USD 30/mes, 25k sesiones):
   `https://api.maptiler.com/maps/streets-v2/style.json?key=<clave>`. Hosts:
   `api.maptiler.com`. El plan gratis no permite uso comercial.
2. **Stadia Maps** (Starter USD 20/mes):
   `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=<clave>`.
   Hosts: `tiles.stadiamaps.com`. El plan gratis no permite uso comercial.
3. **PMTiles propio** (Protomaps): extracto de Costa Rica en R2/S3, estilo propio
   servido por nosotros, y el protocolo `pmtiles://` registrado en MapLibre
   (`maplibre.addProtocol`). Requiere un cambio pequeño de código y el paquete
   `pmtiles`. Hosts: el del bucket.

No usar `tile.openstreetmap.org` directamente: su política prohíbe el uso
comercial intensivo y puede bloquear sin aviso.

## Comportamiento y accesibilidad

- Marcadores de resultados: `<button>` con nombre accesible («3. Nombre, ver
  perfil»), navegables con Tab; en escritorio el foco o el paso del ratón muestran
  la ficha, el clic abre el perfil; en el teléfono el toque muestra la ficha.
- Mapas del directorio: los marcadores de sucursales son enlaces con nombre; el
  de un solo lugar es una imagen con nombre.
- El mapa de resultados ocupa toda la pantalla en el teléfono, así que conserva el
  arrastre con un dedo. Los mapas incrustados (lugar, marca, listas, selector de
  zonas) usan `cooperativeGestures`: un dedo desplaza la página, dos dedos mueven
  el mapa, y en escritorio hace falta Ctrl/⌘ + rueda para acercar.
- Textos de los controles en español con «usted» (`mapLocale()`).
- Sin WebGL el mapa muestra «Mapa no disponible» y la lista sigue funcionando.
- Zoom: el de MapLibre es uno menos que el de Google (teselas de 512 px).
  `MapFocusTarget.zoom` sigue en la escala de Google y el panel resta 1.

## Letras del mapa (glyphs) servidas desde nuestro sitio

`createMap()` reescribe con `transformRequest` las peticiones de glyphs de
OpenFreeMap para los rangos latinos (`0-255`, `256-511`, `8192-8447`) de
Noto Sans Regular/Bold/Italic hacia `public/map-fonts/` (licencia OFL en
`public/map-fonts/OFL.txt`, unos 740 KB en total). Cualquier otro rango sigue
viniendo de OpenFreeMap. Motivo: Safari registraba errores de «access control
checks» al cancelar peticiones de glyphs de otro dominio; desde el mismo origen
no pasa y se ahorra una conexión externa. Si se cambia de estilo
(`NEXT_PUBLIC_MAP_STYLE_URL`), la reescritura solo aplica a URLs de OpenFreeMap.
