# Comparador de precios de supermercados y farmacias (P3) + herramientas del asistente (A1/A2) — LOCAL

Estado (2026-11-17): SQL aplicado a la base local (orden del manifiesto), página `/precios` y `/en/precios` (solo desarrollo, como `/lugar`), herramientas del asistente conectadas a `/api/ai-assistant` (solo desarrollo). Nada publicado; **ningún dato real importado**.

## Fuente oficial (MEIC): qué hay y qué no

Investigación del 2026-11-17 (scratchpad `research-verticales/meic-precios.md`): el MEIC publica los precios de la canasta básica **solo en la app/web MiMejorCompraCR**; **no se encontró archivo descargable** (CSV/XLSX/API documentada) ni licencia o términos de reutilización; datosabiertos.go.cr no respondió (HTTP 522); no hay estudio MEIC reciente de precios de medicamentos de venta libre. Por eso el importador se construyó contra **un formato CSV normalizado documentado** y se probó **solo con datos sintéticos**. No se consultó la API interna de la app ni se hizo scraping. **Nunca se inventan precios**: cada precio registrado viene del archivo de entrada con su URL, fecha de publicación y sha256.

## Archivos

| Archivo | Qué es |
|---|---|
| `docs/pro/sql/price-compare-local.sql` | Catálogo (`price_catalog`), procedencia de importaciones (`price_import_batches`, `price_import_rows`, solo inserción), RPC `price_catalog_upsert`, `price_official_import_record`, `price_import_summary`, lectores `public_price_search` y `public_price_compare`. Manifiesto: después de `directory-import-extras-local.sql`; depende de `directory-core` y `price-observations`. |
| `scripts/directory/import-meic-prices.mjs` | Importador **sin red ni base**: meta JSON + CSV + catálogo curado + correspondencia de comercios → cargas para las RPC. |
| `scripts/directory/fixtures/meic-sample/` | Archivo **sintético** (URL `example.invalid`, GTIN de circulación restringida 200…, comercios inventados). |
| `src/lib/directory/price-compare.ts`, `price-compare-server.ts` | Tipos, lectura de la URL, textos ES/EN de fuente/fecha/vigencia; lectores del servidor. |
| `src/components/directory/price-compare-page.tsx`, `src/app/[locale]/precios/page.tsx` | Página pública. |
| `src/lib/directory/assistant-tools.ts`, `assistant-tools-server.ts` | Herramientas del asistente (definición JSON schema, planificador determinista, ejecutor con backend inyectado) y backend del servidor. |
| `scripts/pro/verify-price-compare-db.mjs` | Prueba PGlite. `scripts/directory/meic-import.test.mjs`, `assistant-tools.test.mjs`: pruebas node (backend simulado, sin modelo). |
| `tests/e2e/pro-dir-prices-compare.spec.ts`, `pro-dir-assistant.spec.ts`, `pro-dir-prices-fixture.ts` | E2E con datos sintéticos que se limpian al final. |

## Formato documentado del CSV (normalizado)

UTF-8, coma o punto y coma, encabezado obligatorio: `codigo_producto, gtin, producto, presentacion, comercio, canton, provincia, precio`. Precio: `1250`, `1250.50`, `1 250,50`, `1.250`, `₡1.250,50`. El meta JSON lleva `source:'meic'`, `sourceUrl` (https), `publicationDate` (AAAA-MM-DD, nunca futura), `surveyRef`, `file`, `licenseNote?`, `validTo?`. Uso:

```
node scripts/directory/import-meic-prices.mjs --meta <meta.json> --catalog <catalogo.json> --places <comercios.json> --out <dir>
```

El catálogo (GTIN con dígito verificador, unidad coherente con la presentación, medicamentos solo con `rxRequired:false`) y la correspondencia comercio → ficha `/lugar` los cura el dueño. Filas: `recorded` (observación `official_meic` enlazada), `unmatched_place`, `unknown_item`, `rx_refused`, `duplicate`, `invalid`. **Una fila de medicamento con receta o de producto desconocido nunca guarda precio** (restricción en la tabla). Mismo archivo = misma acción (idempotente); otro intento con el mismo sha256 → `price_import_duplicate` (409).

## Reglas del comparador

- Una oferta por comercio visible (farmacias solo con permiso verificado): el mejor precio vigente (oficial → negocio → usuarios confirmados → usuario); si no hay vigente, el último conocido marcado **desactualizado/vencido**.
- Precio por unidad normalizado: gramos → kg, ml → litro; unidad y dosis igual.
- Orden: vigentes primero; luego menor precio por unidad (o precio, o nombre del comercio); empates por nombre y slug. **Nunca** pago, reclamo, verificación ni otra señal comercial.
- Cada precio muestra fuente, referencia, fecha del dato, vigencia («Se considera vigente hasta…»), confianza y, si viene de un archivo oficial, la fecha de publicación y el enlace a la fuente.
- Resumen por provincia solo con precios vigentes en colones (mínimo, mediana, máximo por unidad).
- Medicamentos con receta: nunca en el catálogo, nunca en búsqueda/comparación, nunca con precio en la procedencia (Decreto 36868-S).

## Filtros de precio en el directorio (decisión del dueño 2026-11-17)

«Farmacias quiero mostrar todo y en todo donde aplique filtrar precios, solo gasolineras no porque todo es igual.»

- **Farmacias**: `dir_verticals.requires_license=false` para `pharmacy` (el mecanismo por vertical se mantiene). Todas las farmacias publicadas aparecen en listado, ficha, facetas, comparador y asistente; la tarjeta y la ficha dicen «Permiso de funcionamiento verificado» o, en tono neutral, «Permiso sin verificar por ContrataCR». La cola de permisos del admin sigue igual. Precios con receta: nunca (Decreto 36868-S).
- **Restaurantes** (`/restaurantes`): `priceMin`/`priceMax` (₡ enteros) y orden `price_asc`/`price_desc` sobre el **precio típico** = mediana del precio final (IVA + servicio, como lo muestra el menú público) de los platos publicados y no «no disponibles» del menú de un lugar reclamado. Mediana y no mínimo/promedio para que un acompañamiento barato o un plato especial no decidan.
- **Farmacias y supermercados** (`/farmacias`, `/supermercados`): `product` (texto o slug del catálogo; se resuelve a UN producto: slug exacto o el primer resultado de `public_price_search`, nunca con receta) + rango ₡ + orden por precio vigente de ese producto en cada comercio (mejor nivel: oficial > comercio > comunidad verificada > comunidad; los desactualizados nunca filtran ni ordenan). Sin producto el rango y el orden por precio se ocultan (con una pista) y la URL los rechaza (`reason: product`, SQL 22023).
- Sin filtro de rango, los lugares sin precio **no** se excluyen: el orden por precio los deja al final (`price_missing`). Cada precio en tarjeta muestra fuente y fecha.
- **Gasolineras, agencias y «lugares»**: sin filtro ni orden por precio (gasolineras: precio nacional regulado por ARESEP, banner nacional sin cambios).
- `/precios`: `precioMin`/`precioMax` (₡ enteros, inclusivos) sobre el precio mostrado de cada comercio; ofertas, total y resumen por provincia siguen el rango (`public_price_compare(..., p_price_min, p_price_max)`, 22023 `price_compare_range`).
- SQL: `directory-search-local.sql` (validación, filtros, facetas `price`/`withPrice`, orden y cursor) + `directory-price-search-local.sql` (lectores de precio, último en el manifiesto). Verificación PGlite: `scripts/pro/verify-directory-price-search-db.mjs`. E2E: `tests/e2e/pro-dir-price-filters.spec.ts`.

## Asistente

`/api/ai-assistant` (solo app nativa, con consentimiento de IA) responde preguntas de directorio **antes** del flujo de profesionales y **después** de las respuestas de seguridad: lugares por sección/provincia/abierto ahora (`dir_search`), detalle de lugar (`dir_place_public`), comparación de precios (`public_price_search/compare`). Llama funciones del servidor, no la API HTTP. Respeta el orden neutral del SQL, rechaza cualquier pregunta de precio de medicamentos con receta **antes** de consultar, y cita fuente y fecha en cada respuesta. No se llama a ningún modelo para estas respuestas (`aiProvider: "local"`); el modelo del asistente (Workers AI) no se cambió. `DIRECTORY_TOOLS` deja definidas las herramientas en JSON schema para un modelo con llamadas a herramientas en el futuro (no conectado).

## Pendiente — decisión del dueño o abogado

1. **Licencia MEIC**: no hay términos de reutilización publicados. Pedir al MEIC el conjunto de datos y permiso por escrito antes de importar datos reales; no usar la API interna de MiMejorCompraCR sin autorización expresa.
2. **Precios de medicamentos de venta libre en farmacias** (Decreto 36868-S / 39983-S): confirmar con abogado que mostrar precios OTC por farmacia es permitido y el texto del aviso.
3. **Ley 7472**: texto del aviso «precio informativo, confirme con el comercio».
4. **GTIN/GS1**: confirmar que usar códigos de barras como identificador público no requiere licencia GS1.
5. **Asistente y salud**: el asistente no da consejo médico; revisar el texto de rechazo de medicamentos con receta.
6. Antes de abrir al público: límite de frecuencia del asistente en base de datos (el de memoria no sirve en Workers).
