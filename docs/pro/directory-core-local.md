# Directorio multivertical — núcleo de lugares (F1) e importación semilla (F2) — LOCAL

Estado (2026-11-16): SQL y bibliotecas listos y verificados en PGlite (memoria). **Sin aplicar** a la base local compartida y **sin rutas conectadas**: el cableado pendiente está en `dir-wiring-F1F2.md` (scratchpad de la sesión). Plan general: `docs/pro/directory-plan-local.md`.

## Archivos

| Archivo | Qué es |
|---|---|
| `docs/pro/sql/directory-core-local.sql` | Núcleo F1: verticales, lugares, horarios, fotos, fuentes, procedencia, recibos, historial, reportes y RPC. |
| `docs/pro/sql/directory-import-local.sql` | F2: lotes y filas de importación, deduplicación, confirmación y bloqueo por retiro. Depende del núcleo. |
| `scripts/directory/stage-import.mjs` | Convierte un archivo **local** (GeoJSON tipo OSM o JSON de Overpass) en cargas para `dir_import_stage`. Sin red ni base de datos. |
| `scripts/directory/fixtures/osm-sample.geojson` | Datos sintéticos inventados para la prueba (no copiados de OSM). |
| `src/lib/directory/types.ts`, `schemas.ts` | Tipos públicos y esquemas zod (mutaciones, reportes, atributos por vertical). |
| `src/components/directory/place-page.tsx`, `place-report-form.tsx` | Ficha pública `/lugar/[slug]` y formulario de reporte/retiro (ES/EN, «usted»). Aún no importados. |
| `scripts/pro/verify-directory-core-db.mjs`, `verify-directory-import-db.mjs` | Pruebas PGlite. |

## Modelo (F1)

- **`dir_verticals`**: restaurant, fuel, pharmacy, grocery, vehicle_dealer, real_estate; nombre y ruta ES/EN, claves de atributos permitidas y `requires_license` (farmacias = `false` desde la decisión del 2026-11-17: se muestran todas, con insignia «Permiso de funcionamiento verificado» o nota neutral «Permiso sin verificar por ContrataCR»).
- **`dir_places`**: `country_code`, `currency`, `admin_area_1..3` (CR: provincia, cantón, distrito), `locality`, `address_line`, `lat/lng` con `location_precision` (exact/street/locality/area/unknown), teléfono y sitio del negocio, `attributes` jsonb acotado (16 KB, solo claves de la vertical), `status` (draft/published/hidden/closed_permanently/removed), `verification_level` (unverified/imported/claimed/verified/license_verified), `rating_avg/rating_count` (los escribirá F5), `revision` (CAS) y `search_tsv` generado (nombre, localidad, cantón y dirección normalizados). **No hay columna de pago, destacado ni nivel comercial**: el orden nunca depende del pago (lo vigila `verify-directory-ranking-neutrality.mjs`).
- **`dir_place_hours`** (varios tramos por día; se permite cruzar medianoche), **`dir_place_media`** (solo https, con fuente).
- **Procedencia**: `dir_data_sources` (contratacr, owner, osm con ODbL 1.0 y atribución) y `dir_field_provenance` (solo inserción): cada cambio registra campo, fuente, referencia (p. ej. `node/123`) y fecha observada. La ficha pública muestra la atribución de las fuentes públicas que respaldan el valor **vigente** de cada campo.
- **`dir_place_mutate(actor, input)`**: acciones create/update/status/hours/verify. `revision` distinta → **40001**; mismo `actionId` y misma entrada → misma respuesta; mismo `actionId` con otra entrada → 22023; lugar inexistente → P0002. Valida vertical activa, coordenadas dentro de CR, precisión, teléfono solo si la fuente lo permite, atributos de la vertical, la vertical no cambia, `imported` solo desde fuentes de importación y `verify` solo desde la fuente `contratacr` (personal). `removed` es terminal: solo puede pasar a `hidden`.
- **`dir_place_history`** (antes/después) y **`dir_place_actions`** (recibos): inmutables; UPDATE/DELETE/TRUNCATE bloqueados por disparadores y sin permiso DELETE.
- **`dir_place_public(slug)`**: solo `published` o `closed_permanently`; verticales con `requires_license=true` solo con `license_verified` (hoy ninguna; farmacias visibles desde 2026-11-17; se cambia por vertical con `requires_license`). No devuelve ids internos, revisión ni actores.
- **Reportes**: `dir_report_create(actor|null, slug, input)` (wrong_info, closed, duplicate, removal_request, abuse, other), idempotente por `reportId`, topes en base de datos: 20 por lugar al día y 5 por correo al día (**54000** → 429). `dir_report_resolve` (personal): aceptar un `removal_request` pasa el lugar a `removed` con CAS.

## Importación (F2)

1. `node scripts/directory/stage-import.mjs <archivo-local> osm [--no-phone] [--out <dir>]` → cargas de hasta 5000 filas (una por lote). Solo copia nombre, vertical (por etiquetas amenity/shop/office/healthcare), dirección, coordenadas (polígonos → centroide con precisión `street`) y el teléfono del negocio. Nunca copia correos, horarios, operador ni etiquetas crudas. Rechaza URLs: solo archivos locales.
2. `dir_import_stage(actor, carga)` guarda el lote en `dir_import_batches`/`dir_import_rows` (la colección OSM queda separada, con su fuente) y clasifica cada fila: `staged`, `rejected` (invalid_name, unknown_vertical, invalid_location, outside_country, removed_by_request, manual) o `duplicate` (already_imported, same_ref_in_batch, near_same_name = mismo nombre normalizado a menos de 75 m según `dir_haversine_km`, contra lugares existentes o filas anteriores del lote). El mismo archivo y parte no se puede preparar dos veces (23505).
3. `dir_import_reject` (revisión manual) y `dir_import_commit(actor,{batchId,publish})`: vuelve a revisar duplicados y crea los lugares mediante `dir_place_mutate` (verificación `imported`, procedencia por campo con la referencia OSM, historial y recibos). Un lote ya decidido → 40001.
4. **Retiro**: un `removal_request` aceptado deja el lugar en `removed`; cualquier importación posterior rechaza la misma referencia o el mismo nombre a menos de 75 m del lugar retirado (`removed_by_request`), así la semilla nunca lo recrea.

## Semilla real en la base local (2026-11-16)

- **OSM (Overpass, 4 consultas + 1 de límites, agente genérico «ContrataCR-local-import»)**: `amenity=fuel`, `amenity=pharmacy`, `shop=supermarket`, `amenity=restaurant|fast_food|cafe` en CR. Volcados crudos en el scratchpad de la sesión (`osm-raw/`), nunca en el repositorio. 10 567 elementos únicos → `stage-import.mjs … osm --admin-areas boundaries.json` → 9 803 filas (764 omitidas: sin nombre, nombre genérico o sin categoría) → 2 lotes → 9 733 lugares `published`/`imported`/`unclaimed` (70 duplicados `near_same_name`). Restaurantes 7 435, supermercados 1 235, farmacias 645 (no públicas: falta `license_verified`), gasolineras 418.
- `--admin-areas`: provincia (admin_level 4) y cantón (admin_level 6) por punto en polígono sobre las relaciones administrativas de OSM; el valor derivado reemplaza etiquetas libres («San Jose», «Provincia de Guanacaste»). Misma fuente OSM y misma referencia en la procedencia.
- La importación base (F2) no copia horarios, sitio web, correo ni etiquetas crudas. Horario y sitio web se agregaron después con el módulo aparte «F2 extras» (sección siguiente); correo y etiquetas crudas siguen sin copiarse.
- **ARESEP**: `import-aresep-fuel.mjs` con la resolución real **RE-0059-IE-2026** (6 nov 2026; Alcance 148 a La Gaceta 212 del 9 nov 2026; rige 10 nov 2026): súper 805, regular 807, diésel 807 ₡/l. Fuente: https://www.recope.go.cr/wp-content/uploads/2026/11/Alcance-N-148-a-La-Gaceta-N-212-RE-059-IE-2026-por-impuesto-unico.pdf (el archivo de entrada guarda la URL y el sha256 en `_note`). Sin datos oficiales vigentes, el recuadro nacional no se muestra.
- Las pruebas `pro-dir-*` ocultan (`hidden`) sus lugares sintéticos en `afterEach` y retiran su juego de precios sintético restaurando el oficial previo (`syntheticFuelSet` en `tests/e2e/pro-dir-fixture.ts`).

## Horario y sitio web desde OSM (F2 extras, 2026-11-16)

Aprobado por el dueño. Módulo aditivo `docs/pro/sql/directory-import-extras-local.sql` (registrado al final de `local-sql-manifest.mjs`, después de núcleo, importación y reclamos); `dir_import_rows` no cambia.

| Archivo | Qué es |
|---|---|
| `scripts/directory/osm-opening-hours.mjs` (+ `.test.mjs`) | Analizador **conservador** de `opening_hours`: `24/7`; `Mo-Fr 07:00-21:00`; listas y rangos que dan la vuelta (`Sa,Su`, `Su-Th`); sin días = todos; varios tramos (`12:00-15:00,18:00-23:00`); cruce de medianoche (`Th-Sa 11:00-02:00`); `24:00`/`00:00` como cierre = medianoche; `;` (la regla posterior reemplaza esos días) y `,` tras una hora (regla adicional); `off`/`closed`; `PH` se ignora (no modelamos feriados). Rechaza todo lo demás: `||`, fechas/meses, `SH`, sunrise, am/pm, días en español, separadores faltantes, tramos que se traslapan, más de 4 tramos por día y cruces de medianoche que cierran después de las 06:00 (p. ej. `10:00-8:00`). |
| `scripts/directory/osm-website.mjs` (+ `.test.mjs`) | Solo `http(s)`, dominio real (sin IP, localhost, puerto ni usuario:clave), `www.…` sin esquema → `https://`, primer valor si hay `;`, sin fragmento ni `/` final; rechaza texto libre («no»), dos URL pegadas y búsquedas de Facebook. `http` no se convierte a `https`. |
| `scripts/directory/stage-osm-extras.mjs` | Mismo volcado **local**; por referencia OSM envía solo `hoursRaw`+`hours` (tramos) y `websiteRaw`+`website`. Sin red ni base de datos. |
| `scripts/pro/verify-directory-import-extras-db.mjs` | Prueba PGlite. |

- `dir_import_extras_stage(actor,{actionId,batchId,sourceId,fileName,fileSha256,part,rows})` (solo fuentes `kind='osm'`) guarda `dir_import_extra_batches`/`dir_import_extra_rows` y valida otra vez: tramos con `dir_import_hours_ok` (≤ 4 por día, ≤ 28, `HH:MM`, cierre `24:00` permitido) y URL con el mismo `check` de `dir_places`. Lo que no pasa queda `unparseable`/`rejected` y nunca se promueve.
- `dir_import_extras_commit(actor,{actionId,batchId})` promueve cada campo **por separado** al lugar creado desde la misma referencia OSM solo si: existe y no está `removed` (`removed`/`no_place`), `claim_status='unclaimed'` y sin responsables activos (`claimed`), y el valor vigente del campo lo puso esta misma fuente o está vacío sin procedencia (`owner_data` en otro caso: **lo que edite el dueño o el personal siempre gana**). Igual → `unchanged`. Se aplica con `dir_place_mutate` (`hours` / `update website`) con fuente `osm` + referencia + fecha observada: procedencia, historial y recibos completos. Idempotente por `actionId`; lote ya decidido → 40001.
- `dir_place_hours_source(slug)` devuelve el tipo de fuente del horario vigente; la ficha muestra «Horario según OpenStreetMap; confírmelo con el negocio antes de ir.» / «Hours from OpenStreetMap; please confirm them with the business before going.» cuando es `osm`. `00:00–24:00` se muestra «24 horas». El sitio web se enlaza con `rel="nofollow ugc noopener noreferrer"`.
- Nota: un sitio web importado de OSM cuenta como dato independiente para el método de reclamo `email_domain` (igual que el teléfono importado).
- Aplicado a la base local (2026-11-16, lote `73145669-…`): 927 valores `opening_hours` → 854 interpretables, 73 omitidos; 833 horarios aplicados (21 sin lugar: elementos omitidos o duplicados en F2). 396 sitios web → 389 válidos, 7 rechazados; 383 aplicados (6 sin lugar).

## Seguridad

RLS activo en todas las tablas `dir_*`; solo `service_role` tiene permisos (sin DELETE salvo `dir_place_hours`, que se reemplaza como conjunto y queda en el historial). Funciones `security invoker` con `search_path` fijo; `anon` y `authenticated` no pueden ejecutar ninguna. TRUNCATE bloqueado en todas las tablas del directorio.

## Verificación

```
node scripts/pro/verify-directory-core-db.mjs
node scripts/pro/verify-directory-import-db.mjs
node scripts/pro/verify-directory-import-extras-db.mjs
node --test scripts/directory/osm-opening-hours.test.mjs scripts/directory/osm-website.test.mjs
node scripts/pro/verify-directory-ranking-neutrality.mjs
```

## Pendiente / abogado

- ODbL: ¿la base derivada (lugares creados desde OSM) es share-alike? Por ahora la colección OSM queda separada en `dir_import_rows` y la atribución es visible en la ficha.
- Ley 8968 / PRODHAB: inscripción de la base, texto de privacidad del formulario de reporte (el correo se usa solo para atenderlo).
- Las fichas importadas sin verificar se publican con `noindex` (borrador de página) hasta que alguien las reclame o verifique (F3).
- El límite por IP en memoria de la ruta de reportes no sirve en Workers; los topes reales están en la base de datos.
