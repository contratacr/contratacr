# Fotos del directorio: fuentes libres y atribución

Las fotos de lugares importados (OpenStreetMap) solo pueden venir de fuentes con licencia libre. Hay dos fases.

## Fuentes permitidas

| Fase | Fuente | Cómo se encuentra | Estado de la foto |
|---|---|---|---|
| 1 | Wikimedia Commons | Etiquetas OSM `wikimedia_commons=File:...`, `image=` apuntando a commons/upload.wikimedia.org, o `wikidata=Q...` (imagen P18 de Wikidata) | Activa (la coincidencia es exacta: el propio objeto OSM la nombra) |
| 2 | Openverse (https://api.openverse.org/v1/images/) | Búsqueda "nombre + cantón + Costa Rica", solo si el título o las etiquetas contienen el nombre del lugar | **Pendiente**: aparece en la cola de moderación de fotos y solo se publica si el equipo la aprueba |

Licencias aceptadas (ambas fases): CC0, dominio público (PDM / Public domain), CC BY y CC BY-SA, cualquier versión. Permiten uso comercial y copias, con la atribución que exigen.

## Fuentes NO permitidas

- Google Maps / Google Imágenes, Waze, TripAdvisor, Facebook, Instagram y cualquier sitio web de negocio: son contenido con derechos reservados, sus términos prohíben copiarlo y no hay licencia que nos autorice.
- Licencias NC (no comercial) y ND (sin derivadas): ContrataCR es un servicio comercial y recodifica las fotos (tres tamaños, sin metadatos), lo que sería una obra derivada.
- GFDL o GPL solas, "fair use", marcas registradas o archivos con la restricción "nonfree": no se aceptan.
- CC BY / CC BY-SA sin nombre del autor: se omiten, porque no se podría cumplir la atribución.

## Reglas de atribución

Cada foto guarda en `dir_place_media.attribution` (jsonb): `source`, `file`, `author`, `license`, `licenseUrl`, `sourceUrl` y, en Openverse, `provider` (por ejemplo Flickr), `openverseId` y `note`. Al abrir la foto a pantalla completa la galería muestra "Foto: <Autor> · <Licencia> · Wikimedia Commons" (o el proveedor), con enlaces a la licencia y a la página de origen. La galería lee el crédito de `GET /api/fotos-lugar/<id>?meta=1`. Las fotos subidas por personas no tienen atribución y no muestran crédito. No se debe quitar ni abreviar este crédito.

## Cómo ejecutar

Siempre primero en local (`source ~/bin/pro-local-env.sh`). Ambos scripts son dry-run por defecto y rechazan una base de datos que no sea local salvo `--remote-ok`.

```
node scripts/directory/commons-photos.mjs                 # informe: etiquetas, licencias, secciones
node scripts/directory/commons-photos.mjs --apply         # descarga (1600 px), guarda y publica; idempotente
node scripts/directory/openverse-photos.mjs --section restaurant,lodging --max-queries 140          # dry run
node scripts/directory/openverse-photos.mjs --apply --section lodging --max-queries 140             # guarda PENDIENTES
```

Límites de cortesía: Commons/Wikidata máx. 2 solicitudes por segundo (las descargas de archivos, una cada 3 s: upload.wikimedia.org responde 429 con espera de 10 minutos si se le hacen ráfagas; el script espera y reintenta, y se puede relanzar sin riesgo); Openverse máx. 1 por segundo (anónimo: 1000 consultas por día, 100 por minuto). User-Agent genérico, sin correo personal. Secciones de Openverse por orden de prioridad: restaurantes, cafés y bares, hospedaje, atracciones, tours, belleza. Máximo 1 candidata por lugar.

Migraciones: 540 (columna `attribution`, origen `commons`) y 541 (origen `openverse`, nota para el revisor en la cola). Se aplican con el flujo normal de migraciones.

## Test y producción

No ejecutar en test ni en producción sin autorización de Isaac. Con su autorización: aplicar primero las migraciones 540 y 541, luego correr los scripts con las variables del proyecto correspondiente y `--remote-ok`. Los scripts guardan las fotos en el bucket privado `dir-place-photos` de Supabase (`photo_store='supabase'`); si se quieren en R2, hay que subirlas con el binding del Worker (el script no usa R2). Revisar el informe del dry run antes de `--apply` y moderar las pendientes de Openverse en Admin, Fotos.
