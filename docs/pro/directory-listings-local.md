# Directorio multivertical — anuncios de vehículos (V1) e inmuebles (datos de R1) — LOCAL

Estado (2026-11-16, incluye el cierre de brechas para la UI): SQL y esquemas zod listos y verificados en PGlite (memoria). **Sin aplicar** a la base local compartida, **sin manifiesto** y **sin rutas ni UI**. El SQL está en espera en el scratchpad de la sesión (`dir-staging-sql/directory-listings-local.sql`) mientras corre la regresión; el cableado pendiente está en `dir-wiring-V1.md` (scratchpad). Plan general: `docs/pro/directory-plan-local.md`.

## Archivos

| Archivo | Qué es |
|---|---|
| `docs/pro/sql/directory-listings-local.sql` (hoy en staging) | Anuncios, extensiones por vertical, tipo de cambio, límites, vendedores, recibos, historial, lectores públicos y RPC. |
| `src/lib/directory/listing-schemas.ts` | Esquemas zod (crear/editar/estado/renovar, moderación, tipo de cambio), tabla de transiciones `canTransition` y mapa de errores. |
| `scripts/pro/verify-directory-listings-db.mjs` | Prueba PGlite. Lee el SQL de `DIR_SQL_DIR` (por defecto `docs/pro/sql`). |

Dependencias: `directory-core-local.sql` (dir_places, dir_immutable, dir_derived_uuid, dir_reports), `directory-claims-local.sql` (dir_place_managers, dir_try_uuid) y `vehicles-catalog-local.sql` (ref_vehicle_makes/models). Opcional en ejecución: `team-roles-local.sql` (`pro_role_of`, `pro_company_members`) para asignar agentes (R2); sin ese módulo, asignar responde 55000 `dir_listing_team_unavailable` y quitar el agente sigue funcionando.

## Modelo

- **`dir_listings`**: `public_code` (6 caracteres sin 0/1/i/l/o, derivado del id; URL `/vehiculos/v/<slug>-<código>`), `vertical` (`vehiculos` | `inmuebles`), `seller_kind` (`business` | `private`), `seller_profile_id`, `place_id` opcional (solo negocios; agencia `vehicle_dealer` o inmobiliaria `real_estate`, no retirada), `status`, `moderation_status` (clear/review/approved/rejected), `title`, `description`, `price_minor` + `currency` (CRC|USD, unidades menores), `price_crc_norm` + `fx_rate_date` + `fx_usd_crc`, `country_code`, `admin_area_1..3`, `locality`, `lat/lng` exactos (privados), `published_at`, `expires_at`, `revision` (CAS → 40001).
- **`dir_listing_vehicle`**: marca y modelo (FK al catálogo; el modelo debe ser de la marca; `vehicle_type` sale del modelo), versión, año (≤ año actual + 1), nuevo/usado, km, transmisión, combustible, tracción, cc, puertas, asientos, color, recibe vehículo, financiamiento del vendedor, marchamo/RTV/impuestos **declarados** (no verificados). **Privados**: `plate_private`, `vin_private`.
- **`dir_listing_property`**: operación venta/alquiler (no cambia), tipo, habitaciones, baños (medios), parqueos, m² construidos y de lote, pisos, año, amueblado, mascotas, condominio, cuota de mantenimiento, plazo mínimo (solo alquiler), amenidades (lista cerrada). **Privados**: `cadastral_plan_private` (plano catastrado), `folio_real_private`.
- **`dir_fx_rates`** (`rate_date`, `usd_crc`, `source` bccr|manual): `dir_fx_rate_set` (personal o importación BCCR) y `dir_listing_fx_refresh` (re-normaliza precios USD vivos sin tocar revisión). `price_crc_norm` = `price_minor × usd_crc` (centavos × ₡/US$ = céntimos). Publicar o renovar en USD sin tipo de cambio registrado → `dir_listing_fx_missing`.
- **`dir_listing_limits`** (configurable): `private_active_per_vertical` = 2 (activos = borrador/publicado/reservado), `business_unverified_published` = 5 (publicado/reservado). **`dir_listing_sellers.business_verified`** lo marca solo el personal (acción `seller`); verificado = sin tope. Exceso → 54000 con pista `dir_listing_limit_private` / `dir_listing_limit_business_unverified`.

## Estados

| Desde | Dueño puede pasar a |
|---|---|
| draft | published, archived |
| published | reserved, draft, archived, sold (vehículo o venta), rented (alquiler) |
| reserved | published, archived, sold / rented |
| expired | archived (volver a publicar = acción `renew`) |
| sold | archived |
| rented | archived, published (alquiler de nuevo) |
| archived | draft |
| suspended | archived |

Personal: cualquiera → suspended; suspended → draft | archived. Sistema: published/reserved → expired. La misma tabla está en SQL (`dir_listing_transition_ok`) y TS (`canTransition`); la prueba compara los 576 pares.

Publicar exige descripción ≥ 20 caracteres, provincia y cantón, datos del vertical, moderación clear/approved y tipo de cambio si es USD. Un anuncio publicado debe seguir completo al editarse. Vendido, alquilado y suspendido no se editan (`dir_listing_locked`).

**Vencimiento (sin cron)**: al publicar desde un estado no público, `expires_at = ahora + 60 días`. Los lectores ocultan por fecha de inmediato; `dir_listing_expire_due(actor, límite)` marca `expired` con historial cuando alguien la llame (ruta de personal o al abrir el panel). `renew` extiende 60 días desde ahora y **no cambia `published_at`** (renovar no sube el anuncio).

## Cierre de brechas para la UI (2026-11-16)

- **Lectores públicos**: `published` **y `reserved`** (columna `status`; la página muestra «Reservado», apaga los CTA y usa `noindex`). Además `photo_count`, `cover_path_800`, `cover_path_320`. `dir_listing_public(código)` agrega `photos[]` (rutas 1600/800/320, tamaño, alt) y `financing` (o null). Siguen ocultos borrador, vendido, alquilado, archivado, suspendido, vencido y lo que esté en revisión.
- **`place_id`**: crear o cambiar el negocio vinculado exige ser gestor activo de esa ficha (`dir_place_managers`) → 42501 `dir_listing_place_not_managed`.
- **Lector Pro `dir_listing_owner_list(actor, vertical, filtro, cursor, límite)`**: forma de `inventoryPageSchema`. Filtro `active` (borrador/publicado/reservado) o `closed` (vendido/alquilado/archivado/suspendido/vencido); lo publicado con `expires_at` pasado sale como `expired`. Paginación por cursor `(<updated_at µs>_<id>)`, orden `updated_at desc, id desc`, límite 1–100 (50). Incluye los anuncios propios y los de las fichas que el actor administra; **los campos privados (placa, VIN, plano, folio, coordenadas exactas) solo para el vendedor de cada anuncio** (`mine`/`canEdit`); los cogestores los ven de solo lectura. Devuelve `places` (con rol), `agents` (inmuebles), `catalog` (vehículos), `financing` (vehículos), `limits` (con `minPhotosToPublish`, `maxPhotos`), `counts`, `nextCursor`.
- **Agente (R2)**: `dir_listings.agent_profile_id` (solo inmuebles con ficha). `dir_listing_assign_agent(actor, {action:'assign_agent', actionId, listingId, revision, agentId|null})`: solo dueño o gestor activo de la ficha (otros: P0002); el agente debe tener rol admin/gerente/miembro en el equipo Pro del **dueño de la ficha** (`pro_role_of`; el dueño cuenta como admin; «Solo lectura», inactivos o ajenos → `dir_listing_agent_not_member`). CAS, recibo, historial `assign_agent`. Desvincular la ficha borra el agente. El agente no es público.
- **Financiamiento declarado (V7) por ficha de agencia** (`dir_listing_financing`): tasa anual 0–60 %, plazo 1–120 meses, prima mínima 0–90 % (dos decimales), `dir_listing_financing_set` (dueño/gestor de una ficha `vehicle_dealer`, CAS por `revision`, `financing:null` lo retira). **Por qué por ficha y no por anuncio**: el plan de financiamiento es del negocio (propio o convenio bancario) y aplica a todo el lote; una sola declaración con una sola fecha se mantiene al día, en vez de decenas de copias que envejecen; cada anuncio ya decide si lo ofrece con `seller_financing`; los particulares quedan fuera (sin ficha), que es lo prudente mientras el abogado revisa la calculadora. Público solo si el anuncio lo activó, la ficha está publicada y la declaración tiene menos de `financing_max_age_days` (180); siempre con `declaredBySeller: true` y la leyenda «Declarada por el vendedor; ContrataCR no la comprueba».
- **Fotos (V3)** `dir_listing_media`: hasta 30 activas, `sort` compacto, `sha256`, ancho/alto (200–1600, lado mayor ≥ 640), rutas `dir-listings/<id de la foto>/<1600|800|320>.<webp|jpg|avif>` (nunca el id del anuncio), `exif_stripped` obligatorio en true, `uploaded_by`; nunca se borran (estado `removed`). `dir_listing_media_mutate` (add/remove/reorder, solo el vendedor, idempotente por `actionId`, **no** cambia la revisión para permitir subidas en paralelo). Publicar, renovar o editar algo público exige `min_photos_publish` (4) → `dir_listing_photos_missing`; un anuncio público no puede bajar de 4.
- **Antifraude** (`dir_listing_flags`, inmutable, una vez por anuncio+tipo+clave; pasa la moderación a `review` y lo oculta): foto con el mismo `sha256` que la de **otro vendedor** (se marca el anuncio nuevo, no el original); precio < `price_outlier_pct` (50 %) de la mediana de otros vendedores para el mismo modelo y año con ≥ `price_outlier_min_samples` (5) muestras (publicar, renovar o bajar el precio estando público); `reports_to_review` (3) personas identificadas distintas con reportes `abuse` abiertos en 7 días. Tras aprobar el personal, la misma señal no vuelve a marcar. Cola: `dir_listing_review_queue(límite)`.
- **Reportes** reutilizan `dir_reports` (columna `listing_id`, `place_id` nulo, exactamente un destino): `dir_listing_report_create(actor|null, código, {reportId, kind: wrong_info|duplicate|abuse|other, message, email?})`, solo anuncios públicos, topes 20/día por anuncio y 5/día por correo (compartido con fichas) → 54000 `dir_listing_report_cap`. Se resuelven con el `dir_report_resolve` del núcleo.
- Parámetros nuevos en `dir_listing_limits`: `min_photos_publish` 4, `price_outlier_min_samples` 5, `price_outlier_pct` 50, `financing_max_age_days` 180, `reports_to_review` 3.

## Funciones

- `dir_listing_mutate(vendedor, entrada)`: create/update/status/renew. Recibos idempotentes por `actionId` (misma entrada → misma respuesta; otra entrada → 22023). Anuncio de otro vendedor → P0002. Claves desconocidas → 22023.
- `dir_listing_moderate(personal, entrada)`: suspend, reinstate, moderation, seller.
- `dir_listing_expire_due`, `dir_fx_rate_set`, `dir_listing_fx_refresh`.
- Lectores: vistas `public_vehicle_listings` y `public_property_listings` (`security_invoker`) y `dir_listing_public(código)`. Solo `published` o `reserved` (con `status`), sin vencer y con moderación clear/approved. No devuelven ids, vendedor, revisión, coordenadas exactas ni campos `*_private`. Coordenadas **difuminadas** 305–495 m en dirección fija por anuncio (`approx_lat/lng`, `location_radius_m = 500`): repetir lecturas no permite promediar. `place_slug` solo si la ficha del lugar es pública. Sin orden: quien consulte ordena por claves neutras (fecha, precio, distancia); no existe columna pagada ni destacada.

## Seguridad

RLS en todas las tablas; solo `service_role` (select/insert/update; sin DELETE). TRUNCATE bloqueado en todas. `dir_listing_actions` y `dir_listing_history` inmutables (UPDATE/DELETE/TRUNCATE → 23514). Funciones `security invoker` con `search_path` fijo; `anon`/`authenticated` no ejecutan nada.

Nuevas: `dir_listing_owner_list`, `dir_listing_owner_item`, `dir_listing_assign_agent`, `dir_listing_media_mutate`, `dir_listing_financing_set`, `dir_listing_report_create`, `dir_listing_review_queue`, `dir_listing_public_photos`, `dir_listing_public_financing`, `dir_listing_photo_count`, `dir_listing_flag`, `dir_listing_price_check`. Contratos TS: `listing-inventory.ts` (`inventoryQuerySchema`, `listingMediaMutationSchema`, `listingFinancingSchema`, textos de error), `listing-schemas.ts` (`listingReportSchema`, pistas nuevas en `LISTING_ERROR_HINTS`), `listing-public.ts` (`mapPublicPhotos`, `mapDeclaredFinancing`).

## Verificación

```
DIR_SQL_DIR=<scratchpad>/dir-staging-sql node scripts/pro/verify-directory-listings-db.mjs   # hoy
node scripts/pro/verify-directory-listings-db.mjs                                           # tras mover el SQL a docs/pro/sql
```

## Pendiente / abogado

- Placa y VIN: privados hasta criterio legal (plan: «placa privada, visibilidad hidden hasta abogado»).
- Plano y folio: privados; definir si se muestran verificados (Registro Nacional) en R2.
- Marchamo/RTV/impuestos: son declaraciones del vendedor; la UI debe decirlo así.
- Precio en dólares vs. colones (Ley 7472) y aviso del tipo de cambio usado (`fx_rate_date`).
- Particulares en alquileres: avisos antiestafa (R3).
- Calculadora y financiamiento declarado (V7): revisar con el abogado el texto y la vigencia de 180 días.
- La ruta de subida de fotos (re-codificar, quitar EXIF/GPS, calcular sha256, generar 1600/800/320) aún no existe; la base exige `exif_stripped=true`.
- Reinstaurar (suspended → draft) por el personal no revisa el tope de particulares (decisión del personal).
