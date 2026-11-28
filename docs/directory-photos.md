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

## Vista de la calle (Mapillary)

Para lugares **sin ninguna foto propia** se muestra una imagen de la calle de Mapillary, rotulada siempre "Vista de la calle" y nunca como foto del negocio. Aprobado por el dueño el 2026-11-27.

- **Licencia**: las imágenes de Mapillary son CC BY-SA 4.0. Crédito obligatorio: "© <usuario creador> · Mapillary · CC BY-SA 4.0", con enlace a la página de la imagen en mapillary.com (`https://www.mapillary.com/app/?pKey=<id>&focus=photo`) y a la licencia. En la ficha el crédito va enlazado bajo la imagen y en la vista grande, con la nota "Imagen de la calle tomada por la comunidad de Mapillary en <mes año>. No es una foto del negocio." En las tarjetas (que ya son un enlace) el crédito va como texto. No quitar ni abreviar el crédito.
- **Sin copias**: no se descargan ni se guardan los archivos. `dir_place_street_view` (migración 543) guarda por lugar el id de la imagen, el creador, la fecha, la distancia, si mira al lugar y las últimas URL de miniatura. `GET /api/vista-calle/<placeId>[?s=2048]` responde 302 a una miniatura fresca de Mapillary (las URL vencen: se vuelven a pedir por id cuando tienen más de 1 h), con caché corta (5 min). La ruta nunca busca imágenes; si Mapillary dice que la imagen ya no existe, el lugar pasa a `none`.
- **Elección** (`src/lib/directory/street-view.ts`, pruebas en `scripts/directory/street-view.test.mjs`): imágenes en un cuadro de 40 m alrededor del lugar y, si no hay ninguna buena, de 80 m; sin panorámicas 360° (se ven deformes en una tarjeta); con creador. Orden: (1) tomada en los últimos 6 años y con la cámara mirando al lugar (rumbo de la imagen al lugar a ±50° de `compass_angle`); (2) de hasta 10 años y mirando al lugar; (3) de los últimos 6 años sin mirar al lugar, solo a 25 m o menos. Dentro de cada nivel gana la más cercana. Solo lugares con ubicación `exact` o `street`.
- **Caché**: también se guardan los resultados `none` para no volver a consultar; el script vuelve a revisar un lugar a los 90 días.
- **Token**: `MAPILLARY_CLIENT_TOKEN` (token de cliente `MLY|...`), solo en el servidor; se manda en el encabezado `Authorization: OAuth ...`, nunca en una URL, en el navegador ni en los registros. En local vive en `~/dl/secrets/mapillary.env` (el valor **entre comillas simples**, porque lleva `|`), que carga `~/bin/pro-local-env.sh`. En Cloudflare es un secreto del Worker; lo agrega Isaac: `npx wrangler secret put MAPILLARY_CLIENT_TOKEN` (en el entorno que corresponda). Sin token la ruta sigue sirviendo la URL guardada si existe y, si no, 404.
- **Límites**: el script hace como máximo 5 consultas por segundo (1 o 2 por lugar), reintenta 429/5xx con espera y se detiene tras 20 fallos seguidos o si el token es rechazado.

```
node scripts/directory/mapillary-streetview.mjs                          # dry run: restaurantes, cafés, hospedaje, belleza, talleres
node scripts/directory/mapillary-streetview.mjs --apply                  # guarda found/none por lugar; se puede cortar y relanzar
node scripts/directory/mapillary-streetview.mjs --apply --all            # todas las secciones
node scripts/directory/mapillary-streetview.mjs --vertical health --limit 50 --slug <slug> --force
```

Test y producción: solo con autorización de Isaac. Aplicar la migración 543, agregar el secreto `MAPILLARY_CLIENT_TOKEN` al Worker y correr el script con las variables del proyecto y `--remote-ok`. Para unos 16 500 lugares de las cinco secciones prioritarias son de 1 a 2 horas.

## Fotos de clientes: categorías, menú y protección (2026-11-27, migración 547)

- **Categoría** por foto (`dir_place_media.category`: `menu`, `food`, `interior`, `exterior`, `other`, o nula). El panel «Agregar fotos» la pide; "Menú" se ofrece solo en lugares de comida (`menuSectionOf` en `src/lib/directory/place-menu-link.ts`: restaurantes, cafés y bares, y panaderías, heladerías, cafeterías y delis de `food_shop`). La pestaña Fotos filtra por categoría. Las fotos de menú aprobadas forman "Menú (fotos de clientes)" en la pestaña Menú y nunca son portada si hay otra foto.
- **Crédito**: "Foto de <nombre del perfil>" (el mismo nombre de las reseñas; el id del autor nunca sale del servidor) y "Foto del negocio" para las del dueño.
- **"Ver menú" externo**: solo se muestra mientras ContrataCR no tiene menú del lugar. Es solo un enlace (`rel="noopener noreferrer nofollow"`). El orden de fuentes es `attributes.menuUrl` (etiquetas OSM `website:menu`, `menu:url`, `contact:menu`, `menu`; script `scripts/directory/backfill-menu-links.mjs`, dry run por defecto), sitio web, Instagram, Facebook y búsqueda de Google Maps.
- **Contra copias**:
  - Solo se guardan derivados de 1600/800/320 px reencodificados sin EXIF/GPS (el pipeline rechaza cualquier metadato). El original nunca se guarda.
  - El bucket de Supabase es privado. R2 se usa solo por binding y sin URL pública `r2.dev`.
  - Las fotos se sirven solo por `/api/fotos-lugar/<uuid>`, con id no adivinable.
  - Esa ruta responde 403 (`no-store`) a un Referer de otro sitio. Sin Referer (rastreadores de og:image, correo, app) o desde nuestro dominio responde 200.
  - No hay ningún endpoint que liste todas las fotos.
  - No se incrusta una marca IPTC: el pipeline rechaza a propósito todo metadato y añadirla exigiría reencodificar en el servidor.
  - Recomendado en Cloudflare (lo activa Isaac): Hotlink Protection, Bot Fight Mode o Super Bot Fight Mode y una regla WAF de límite por IP en `/api/fotos-lugar/*`. Además, la caché pública de 5 min del CDN puede servir una copia ya guardada sin volver a mirar el Referer, y Hotlink Protection cubre ese caso.
