# Mediciones sobre planos (fila 66) — local

Estado: implementación local en la rama `local/pro-suite-no-push`. No se desplegó, no se hizo commit ni push. Equivalente funcional de la función de mediciones sobre planos de Houzz Pro (recorrido observado en el segundo recorrido del 2026-11-11), reescrito con textos, nombres y diseño propios de ContrataCR.

## Qué hace

Dentro del expediente del proyecto (espacio Pro independiente, `proSpace`), grupo **Planificación › Mediciones** (EN: *Planning › Measurements*):

1. **Planos del proyecto.** Lista con título, fecha de carga (día de Costa Rica), tipo, tamaño, páginas y número de mediciones; «Subir plano», «Abrir», «Renombrar», «Archivar» y «Restaurar» (los archivados quedan en el historial).
2. **Visor por página.** Imagen del plano con capa SVG; zoom 100–400 % y «Ajustar al ancho»; desplazamiento dentro del visor (arrastre con mouse o desplazamiento táctil), sin desplazamiento horizontal de la página.
3. **Escala por página.** Herramienta «Escala»: se dibuja una línea de referencia y se escribe su longitud real en metros (predeterminado) o pies. Se puede volver a dibujar o quitar; al cambiarla, todas las mediciones de la página se recalculan.
4. **Herramientas** «Área» (polígono), «Longitud» (polilínea) y «Conteo» (puntos), como botones con `aria-pressed`; «Deshacer último punto», «Terminar» y «Cancelar» mientras se dibuja.
5. **Alternativa sin puntero.** «Agregar un valor escrito»: área, longitud o conteo con una cantidad tecleada (no necesita escala).
6. **Panel de mediciones** agrupado por categoría (las de **Empresa › Categorías**, tipo producto/servicio; «Sin categoría» al final) con subtotales por unidad. Cada medición: color (8 opciones con nombre accesible), nombre, resultado, multiplicador opcional (**altura de pared**: longitud × altura → m²; **factor**: p. ej. 2 caras), desperdicio %, artículo opcional de Mis artículos, total y unidad; «Ocultar en el plano» (`aria-pressed`), «Editar», «Archivar» (con confirmación; queda en el historial) y «Restaurar».
7. **Enviar a cotización.** Las mediciones marcadas se convierten en partidas de una **cotización en borrador nueva** del proyecto o de un borrador existente del proyecto que nunca se compartió. Cantidad = total, unidad (m², m, ft², ft, unid./ea), descripción «Categoría · Nombre» y, si hay artículo vinculado, su precio y `catalogProductId`. Reenviar actualiza la misma partida (identificador determinístico por cotización y medición) en vez de duplicarla y conserva precio, descuento e impuesto editados en la cotización. Luego «Abrir cotización» abre el editor de cotizaciones privadas existente.
8. **Historial de cambios** inmutable (últimos 100).

La **vista del cliente no expone** nada: no hay lectura para clientes y la imagen se sirve solo al dueño.

## Decisiones

- **Almacenamiento**: se reutilizan los archivos privados del trabajo (`pro_work_files`, bucket `pro-work-files`, ruta `/api/pro/work-files`, que normaliza JPG/PNG/WebP a JPEG ≤1600 px y quita EXIF). No hay bucket nuevo. El plano también aparece en *Avances › Archivos del trabajo*, sin compartirse. Un archivo solo puede ser un plano (único por dueño) y debe ser del mismo trabajo (FK compuesta).
- **PDF (2026-11-12)**: ver «Planos en PDF» al final. Texto anterior: «PDF pendiente: `pdfjs-dist` no está en `package.json`…».
- **Tamaño de página**: el servidor lo lee con `sharp` de la imagen almacenada (verificando tamaño y SHA-256); el navegador no lo envía (`widthPx`/`heightPx` enviados por el cliente → 400).
- **Geometría**: coordenadas normalizadas 0–1 con hasta 6 decimales en la API; en la base, enteros en millonésimas (`0..1000000`) más ancho/alto en píxeles. Sin `float` en la base.
- **Cálculo en el servidor** (`numeric`): longitud = suma de segmentos en píxeles × longitud real / píxeles de la línea de referencia; área = fórmula del polígono (*shoelace*) en px² × (longitud real / px)²; conteo = puntos × 1000. Multiplicador y desperdicio con redondeo de `numeric`. Resultados en **milésimas enteras** de la unidad. La vista previa del navegador usa la misma fórmula, pero lo guardado y cotizado es lo del servidor.
- **Cotización**: se reutiliza el escritor `pro_private_estimate_mutate` (misma validación, totales, recibos e historial de cotizaciones). El contexto de una cotización nueva sale de `pro_private_estimate_context(...,'work',workId)`; el emisor vacío usa el nombre comercial o el nombre del perfil.
- **Patrón SQL del brief**: tablas con RLS y `revoke` a `public/anon/authenticated`; funciones `security invoker` solo para `service_role`; elegibilidad `pro_private_work_tools_enabled`; revisión optimista (40001 → 409); recibos idempotentes por `actionId` (misma identidad con otro contenido → 400); historial y recibos inmutables (trigger 23514); fechas en `America/Costa_Rica`. Límites: 50 planos y 1000 mediciones por trabajo (54000 → 429), 400 puntos por medición.
- **API** (`/api/pro/takeoffs`, solo `development`): `GET ?workId=` (detalle), `GET ?image=<planId>` (JPEG reautorizado, `no-store`, `sandbox`); `POST` con `X-Pro-Expected-Actor`, mismo origen, cuerpo ≤16 KiB (413), límite de frecuencia y helper `route-common.ts`. La subida de la imagen va por `/api/pro/work-files`.

## Archivos

- SQL: `docs/pro/sql/takeoffs-local.sql` (registrado en `scripts/pro/local-sql-manifest.mjs` con aristas a private-work-tools-access, work-files, catalog-organizations, private-estimates, private-estimate-publications y project-planning).
- Esquemas y cálculo de vista previa: `src/lib/pro/takeoffs.ts`.
- API: `src/app/api/pro/takeoffs/route.ts`.
- Interfaz: `src/components/pro/work-takeoffs.tsx`; inserciones mínimas en `src/components/pro/job-workspace.tsx` (vista `takeoffs` en Planificación) y `src/components/pro/business-panel.tsx` (estado sumado a `baseNestedBlocked`).
- Prueba: `tests/e2e/pro-takeoffs.spec.ts` (ES y EN).

## Evidencia

Fase 1 (sin tocar `src/` por la regresión en curso):

- `node .../apply-one.mjs docs/pro/sql/takeoffs-local.sql docs/pro/sql/takeoffs-local.sql` → `ok` dos veces (idempotente).
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 109 SQL modules, 110 ordered steps, 155 dependencies`.
- Prueba SQL en transacción revertida (usuario temporal, `rollback`): escala 500 px = 10 m; rectángulo 200×200 px = **16 m²** (16000); polilínea 400 px = 8 m × 2,4 m × 1,10 = **21,12 m²** (21120); conteo de 3 = 3000; factor ×2 → 32000; valor escrito 12,345 m + 5 % → 12962; envío a cotización con 3 partidas, reenvío con 4 (sin duplicar; precio 32 × ₡12 500,50 = ₡400 016,00); 40001 por revisión vieja, 22023 por punto fuera de rango, área de 2 puntos, altura en área, identidad reutilizada; 23505 id repetido; 42501 otro actor; historial inmutable (23514); sin escala → `needsScale` y envío rechazado.

Fase 2: ver el informe y la fila 66 del registro.

## Límites conocidos

- PDF: se elige una página por plano (ver «Planos en PDF»); un PDF de varias páginas se sube página por página.
- La resolución de trabajo es la de la imagen normalizada (máx. 1600 px por lado).
- No se editan los puntos de una medición guardada (se puede archivar y volver a dibujar); sí nombre, categoría, color, multiplicador, desperdicio y artículo.
- Sin grosor de trazo configurable, búsqueda de páginas ni miniaturas (una página por plano).
- Sin exportación del plano anotado.


## Planos en PDF (2026-11-12)

- **Lector**: pdf.js **6.4.299** (publicado en npm el 2026-10-03; la última, 6.5.438, tenía 11 días y no cumplía «más de 2 semanas»). Se descargó el tarball oficial con `npm pack pdfjs-dist@6.4.299` (integridad `sha512-AVl138zA…F4Vb1g==`, igual a la del registro) y se copiaron sin cambios `build/pdf.min.mjs`, `build/pdf.worker.min.mjs` y `LICENSE` a `public/vendor/pdfjs/` (`pdf-6.4.299.min.mjs`, `pdf.worker-6.4.299.min.mjs`). **No se ejecutó `npm install`**: `node_modules` de este checkout es un enlace simbólico al de `contratacr-main`, que usa `pdfjs-dist@6.5.438` para el lector de CV; instalar otra versión habría cambiado el `node_modules` de producción y roto la pareja librería/worker de main. `scripts/pro/verify-pdfjs-vendor.mjs` comprueba los SHA-256 de los tres archivos y que el cargador esté fijado a esa versión local (PASS).
- **Carga local, sin CDN**: `src/lib/pro/takeoff-pdf.ts` importa la librería desde `/vendor/pdfjs/` solo cuando se elige un PDF, comprueba `version === '6.4.299'` y fija `GlobalWorkerOptions.workerSrc` al worker local. La spec comprueba que se piden ambos archivos de `/vendor/pdfjs/` y ningún host externo.
- **Flujo**: al subir un PDF aparece «Elegir la página del PDF» (nombre y número de páginas, página anterior/siguiente o número, vista previa en `canvas`). «Usar esta página» renderiza la página con fondo blanco y su lado mayor a 1600 px, la convierte a JPEG (≤3 MB, baja la calidad si hace falta) y la sube por la **misma ruta de imágenes** (`/api/pro/work-files` → `plan_create`), con título «‹nombre› · p. N». Desde ahí todo es el flujo existente: escala, área, longitud, conteo y envío a cotización. **El PDF no se sube**; solo la página elegida.
- **Límites y mensajes ES/EN**: hasta 25 MB y 200 páginas; cabecera `%PDF-`; PDF ilegible, protegido con contraseña, sin páginas o página inexistente, error al cargar el lector o al preparar la página. Sin `eval` (`isEvalSupported:false`) ni XFA.
- **Sin SQL nuevo**: el esquema ya admitía el plano como imagen; no hizo falta tocar `takeoffs-local.sql`.
- **Pruebas**: `tests/e2e/pro-takeoffs-pdf.spec.ts` (ES/EN; PDF de 2 páginas generado en la prueba con offsets reales; píxeles de la vista previa por página, tamaño 1600×1130 / 1600×800, rechazo de no-PDF, >25 MB y PDF roto sin subir nada, plano 1600×800 guardado, calibración y medición de longitud ≈10 m, cancelar no sube nada) y `pro-takeoffs.spec.ts` (expectativa del PDF roto actualizada a propósito: antes exigía «todavía no se admiten»).

## Huecos restados de un área (Ronda 14, 2026-11-16)

- **Qué hace**: una medición de **área** puede marcarse como hueco («Restar como hueco de…»: ventana, puerta, columna) de otra área de la **misma página**. El área que la contiene muestra «Área bruta X − N huecos Y = neto Z»; su multiplicador y su desperdicio se aplican al **neto**, y «Enviar a cotización» cotiza el neto (el constructor de líneas no cambia: lee el resultado). Un hueco nunca se cotiza solo (casilla desactivada; la API responde 400) y no suma en el subtotal del grupo. Si el hueco supera el área, el neto queda en 0, nunca negativo. Archivar un hueco devuelve su superficie; «No es un hueco» lo desvincula.
- **SQL**: `docs/pro/sql/takeoff-deductions-local.sql` (columna `deduct_from` con FK compuesta `on delete set null (deduct_from)`, disparador de validación —solo áreas, misma obra/plano/página, un nivel, sin ciclos—, `pro_work_takeoff_base`, `pro_work_takeoff_result` redefinida —ahora `stable`, con `deductFrom`, `grossMilli`, `deductedMilli`, `openings`—, escritor `pro_work_takeoff_deduction_mutate` con CAS por revisión de la medición (40001), `actionId` idempotente con recibo inmutable, y `pro_work_takeoff_send_check`).
- **API/UI**: `POST /api/pro/takeoffs` acepta `deduction_set` / `deduction_clear` (`takeoffDeductionSchema`); panel de mediciones en `work-takeoffs.tsx`.
- **Pendiente**: dibujar el hueco recortando el polígono del área (hoy es otra medición enlazada) y detección automática.
