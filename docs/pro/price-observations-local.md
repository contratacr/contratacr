# Comparador de precios — observaciones de precio (P1) — LOCAL

Estado (2026-11-16): SQL, esquemas zod e importador ARESEP listos y verificados en PGlite (memoria). **Sin aplicar** a la base local compartida y **sin rutas conectadas**. El SQL está en espera en el scratchpad (`dir-staging-sql/price-observations-local.sql`) hasta que termine la regresión de cierre; se mueve a `docs/pro/sql/` junto con el núcleo (depende de `directory-core-local.sql`). Plan general: `docs/pro/directory-plan-local.md`.

## Combustibles: precio nacional regulado

En Costa Rica los precios de gasolina regular, súper, diésel y GLP los fija **ARESEP** por resolución (RE-####-IE-AAAA) y son **iguales en todo el país**. Por eso se guardan **una sola vez, sin lugar** (`place_id = null`, «precio regulado nacional») y ninguna gasolinera ni usuario puede reportar un precio de combustible (`price_fuel_national`). **La comparación de gasolineras es por servicios y distancia** (tienda, aire, lavado, 24 h, cercanía), no por precio. La ficha de una gasolinera muestra el precio nacional vigente con su resolución y vigencia.

## Archivos

| Archivo | Qué es |
|---|---|
| `price-observations-local.sql` (staging → `docs/pro/sql/`) | Tablas, reglas de vigencia, disparadores, RPC y lector público. |
| `src/lib/directory/price-schemas.ts` | zod: artículo, observación, conjunto oficial, moderación, archivo ARESEP; validación GTIN; tipos del lector. |
| `scripts/directory/import-aresep-fuel.mjs` | Importador **sin red**: archivo JSON local → cargas para `price_item_upsert` y `price_official_set_record`. |
| `scripts/directory/fixtures/aresep-fuel-sample.json` | Datos inventados (resolución RE-0000-IE-2099, precios 111.11/222.22…). No son precios reales. |
| `scripts/pro/verify-price-observations-db.mjs` | Prueba PGlite (`DIR_SQL_DIR` elige la carpeta del SQL; por defecto `docs/pro/sql`). |

## Modelo

- **`price_items`**: `slug`, `kind` (fuel, lpg, medicine, grocery, generic), `gtin` (GTIN-8/12/13/14 con dígito verificador), `official_code` (p. ej. `aresep:diesel`), nombre, presentación, `unit_base` (l, ml, kg, g, unit, dose) y `unit_qty` (precio unitario = precio / unit_qty), `rx_required` (solo medicamentos; un medicamento sin indicación queda **con receta** por seguridad).
- **`price_observations`** (**solo inserción, nunca se borran**): artículo, lugar (`null` = precio regulado nacional, solo ARESEP), moneda, precio, `source_kind` (business, official_aresep, official_meic, user_report), `source_id` → `dir_data_sources` (se agregan `aresep`, `meic`, `community`), `source_ref` (número de resolución, obligatorio para ARESEP), `observed_at`, `valid_from`/`valid_to`, `stale_after` (**calculado por disparador**), evidencia (`evidence_media_id` + `evidence_sha256`), `reporter_id`, `moderation_status` y `confidence`. Solo cambian las columnas de moderación y con transiciones fijas: pending → published|rejected; published → rejected|superseded; confianza community → community_verified. Sin permiso DELETE; DELETE/TRUNCATE bloqueados por disparador. Recibos `price_actions` y eventos `price_moderation_events` inmutables.
- **`price_staleness_rules`** (editables por personal; no se recalculan filas ya guardadas):

| Fuente | Vigencia |
|---|---|
| ARESEP | hasta `valid_to`; sin `valid_to`, 60 días desde `valid_from` o hasta que otra resolución la reemplace |
| Comercio | 30 días (o `valid_to` si es antes) |
| MEIC | hasta el próximo estudio (`valid_to`), máximo 120 días |
| Usuario | 7 días supermercado/otros, 14 días farmacia (solo venta libre); tolerancia de coincidencia 2 % |

## RPC (solo service_role; security invoker; `search_path` fijo; `actionId` idempotente)

- `price_item_upsert(actor, input)` — crea o actualiza por `slug`; el tipo no cambia.
- `price_observation_record(actor, input)` — una observación. Comercio y oficiales se publican al instante; **reportes de usuario quedan `pending`** (reportador = actor), deben ser recientes (`price_stale`), solo en lugares públicos, tope 30 por día por usuario (**54000** → 429). Un precio oficial/de comercio más nuevo y ya vigente marca como `superseded` al anterior del mismo artículo, lugar y fuente.
- `price_official_set_record(actor, input)` — una resolución completa (1 a 50 artículos) en una transacción; `actionId` por artículo derivado del del conjunto.
- `price_observation_moderate(actor, {decision: publish|reject})` — publicar solo reportes pendientes; rechazar pendientes o publicados (retiro). Ya decidido → **40001**.
- `price_moderation_queue(actor, limit)` — pendientes no vencidos (con `reporterId`, solo para personal).
- **Autopromoción**: cuando hay **≥2 reportadores distintos** con precios del mismo artículo, lugar y moneda dentro de la tolerancia, no vencidos ni rechazados, todos pasan a `published` + `community_verified`. El mismo usuario dos veces no cuenta como independiente.

## Lector público `public_price_current(place_slug | null, item_slug | null)`

- `place_slug = null` → precios regulados nacionales. Una gasolinera muestra además los nacionales de combustible y GLP.
- Por artículo elige el precio **vigente** por prioridad: oficial → comercio → comunidad verificada → comunidad; dentro del nivel, el de `valid_from` más reciente. Un precio vencido o fuera de vigencia **nunca** se muestra como vigente: si no hay vigente, se devuelve como `lastKnown` con `stale: true` y `staleReason` (`expired`/`stale`).
- Devuelve fuente, atribución, resolución (solo oficiales), fecha observada, vigencia y si hay evidencia (Ley 7472: fuente y fecha visibles). Nunca ids internos, ids de reportadores ni de evidencia. Lugares en borrador, retirados o farmacias sin `license_verified` → `null`.

## Regla dura: medicamentos con receta (Decreto 36868-S)

Los precios de artículos con `rx_required = true` **nunca son públicos**: la RPC los rechaza (`price_rx_not_public`), un disparador impide insertarlos aunque se escriba directo en la tabla, ninguna fila puede pasar a `published` mientras el artículo sea con receta, y el lector filtra esos artículos (si un artículo pasa a «con receta», sus precios anteriores desaparecen al instante). Los de venta libre (Decreto 39983-S) solo se muestran en farmacias con permiso verificado.

## Importador ARESEP

```
node scripts/directory/import-aresep-fuel.mjs scripts/directory/fixtures/aresep-fuel-sample.json [--out <dir>]
```
Valida el archivo (resolución, fechas, productos regular/super/diesel/lpg, precio con 2 decimales), rechaza URLs y produce los artículos y el conjunto con `actionId` derivado del hash del archivo (volver a importar el mismo archivo es idempotente). La transcripción desde el PDF de La Gaceta es manual.

## Verificación

```
DIR_SQL_DIR=<scratchpad>/dir-staging-sql node scripts/pro/verify-price-observations-db.mjs   # mientras el SQL esté en staging
node scripts/pro/verify-price-observations-db.mjs                                           # después de moverlo a docs/pro/sql
```

## Pendiente / abogado

- Licencia de reutilización de datos ARESEP y MEIC (por confirmar; la atribución ya es visible).
- Decreto 36868-S: confirmar con abogado si se pueden mostrar precios de venta libre y con qué aviso.
- Ley 7472: texto del aviso junto al precio («precio informado por…, fecha…»).
- Independencia de reportes: hoy solo `reporter_id` distinto; con F3 excluir a responsables del lugar y añadir señales antifraude.
- Tabla de medios de evidencia: `evidence_media_id` aún sin clave foránea (se conectará con la subida de fotos).
