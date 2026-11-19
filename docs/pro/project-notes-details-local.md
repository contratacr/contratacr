# Notas y llamadas del proyecto · Detalles del proyecto (local)

Estado: **fase 1 terminada** (SQL aplicado en loopback, manifiesto en PASS, prueba SQL con `rollback`, spec redactada sin correr, borradores de `src/` fuera del repositorio). La interfaz no está conectada todavía: no hay evidencia visual y el registro de paridad no se marca V.

Referencia funcional: segundo recorrido en Chrome (2026-11-11), sección «Notas del proyecto» y «Detalles del proyecto» de `houzz-live-structure-2026-11-10.md`. Se replican funciones y recorridos; textos, nombres y diseño son propios de ContrataCR.

## Auditoría previa

| Tema | Hallazgo | Consecuencia |
|---|---|---|
| `pro_work` | `service`, `client`, `clientId`, `stage`, `start`/`end`, `cancelled`; sin etiquetas, color, tipo, código, dirección ni fecha de creación | Los detalles viven en una tabla nueva 1:1 (`pro_project_details`); `pro_work` no se toca |
| Ubicación de la cita | `pro_appointment_requests.location_kind` (`agree`/`provider`/`customer`/`online`) y `location_text` (≤ 500) | Se ofrece como **sugerencia** de dirección principal (si `customer`), si no la dirección del cliente (`pro_clients.address`). Nunca se guarda sola |
| Hub de Proyectos | `pro_projects_page` (v1): estado derivado `pro_project_status`, búsqueda por servicio y cliente, cursor por `position`, conteos de toda la cuenta; `projects-workspace.tsx` con tabla (5 columnas) y tarjetas | Se crea `pro_projects_page_v2` (misma firma + `p_type`, `p_tag`); v1 queda intacta |
| Comentarios/notas existentes | `pro_clients.notes` (nota del cliente), `pro_team_comments` y `pro_team_task_comments` (visibles para el equipo) | La bitácora nueva es **solo del dueño**; no reemplaza ni lee esas tablas |
| Impuestos | Códigos ordinarios de IVA de `invoice-tax.ts` (`01` 0 %, `02` 1 %, `03` 2 %, `04` 4 %, `08` 13 %, `09` 0,5 %, `10` exenta, `11` 0 % sin crédito). Las cotizaciones privadas usan `taxBps` por línea y la línea nueva nace con impuesto vacío; las facturas nacen con `taxTreatment: 'pending'` | El IVA predeterminado del proyecto se guarda (`default_vat_code`), se expone y, desde QA fase 2 (2026-11-12), se aplica solo a líneas nuevas de borradores del proyecto (ver «Límites») |
| Actividades con tarifa | `pro_time_activities` por cuenta (tarifa, costo, facturable) | Ya existen a nivel de cuenta; tarifas por proyecto quedan fuera de este módulo |
| Crear proyecto | `project-create.tsx` usa el escritor de agenda (`pro_patch_core`) | No se modifica: los detalles se completan después, desde el expediente |

## Decisiones

- **Acceso**: dos botones en el encabezado del expediente (`JobWorkspace`, barra `data-job-workspace-header` sobre el panel activo), solo en el espacio Pro independiente (`proSpace`). Son vistas `notes` y `details` fuera de los grupos Planificación/Gestión/Finanzas, por eso el número de botones del menú del expediente **no cambia**; la spec existente agrega aserciones para los dos botones del encabezado.
- **Notas y llamadas** (`pro_project_notes`): tipo `note` (texto 1–4000) o `call` (fecha y hora de Costa Rica obligatoria, duración 0–1440 min, dirección entrante/saliente, contacto opcional ≤ 160, resumen opcional ≤ 4000). La nota sin fecha toma el minuto actual. No se aceptan fechas futuras (1 min de tolerancia). Editar crea versión inmutable; fijar (máx. 10 por proyecto), archivar (desfija) y restaurar. Lectura con filtros Todas/Notas/Llamadas, Vigentes/Archivados, búsqueda en texto y contacto, páginas de 20 con cursor opaco `(occurred_at desc, id desc)`. Las fijadas salen aparte solo en la primera página vigente y nunca se repiten en el listado. Límite 5000 por proyecto (429).
- **Detalles** (`pro_project_details`): color de una **paleta cerrada de 10** con nombre (azul, turquesa, verde, oliva, ámbar, naranja, rojo, magenta, morado, gris; el color siempre va junto a su nombre); tipo desde un catálogo por cuenta; código opcional único por cuenta sin distinguir mayúsculas (`^[A-Za-z0-9][A-Za-z0-9._/-]{0,23}$`); presupuesto previsto en céntimos CRC; hasta 10 etiquetas; dirección principal y direcciones predeterminadas de facturación y envío (`null` = «igual que la principal»; si se envía igual a la principal se guarda como `null`); IVA predeterminado.
- **Catálogo de tipos**: siete tipos de fábrica (`remodel`, `new_construction`, `addition`, `maintenance`, `repair`, `design`, `commercial`) son **virtuales** (identificadores deterministas, nombre `null` que la interfaz traduce) hasta que la cuenta edita el catálogo o elige uno; entonces se materializan con los mismos identificadores. Se pueden renombrar, archivar/restaurar y agregar propios (máx. 50). Un tipo archivado sigue en el proyecto que ya lo tenía, pero no se puede elegir de nuevo.
- **Etiquetas**: se escriben por nombre en el formulario; se reutilizan sin distinguir mayúsculas y se crean las que falten (máx. 200 por cuenta). Renombrar o eliminar desde «Administrar etiquetas»; eliminar quita la etiqueta de cada proyecto y le suma una revisión e historial (`tag_removed`).
- **Revisiones**: detalles con revisión por proyecto (0 = sin fila); catálogo con revisión de cuenta (`pro_project_catalogs`). Crear etiquetas al guardar detalles sube la revisión del catálogo.
- **Hub v2**: `GET /api/pro/projects?v=2&…` (solo desarrollo) llama a `pro_projects_page_v2`; toda consulta sin `v` sigue en v1 exactamente igual (la spec `pro-projects.spec.ts` no cambia). La búsqueda también encuentra el código. Columnas nuevas: color (punto + nombre para lectores de pantalla), código bajo el nombre, «Tipo y etiquetas». Filtros nuevos por tipo y etiqueta. Si v2 respondiera 404 el hub vuelve a v1 sin columnas nuevas.
- **Seguridad** (patrón de `client-dashboard-local.sql`): RLS activa y `revoke` a `public/anon/authenticated` en las 11 tablas; RPC `security invoker` ejecutables solo por `service_role`; elegibilidad `pro_private_work_tools_enabled(p_actor)`; trabajo de otra cuenta → 42501 (403) en escritura y `null` (404) en lectura; CAS 40001 → 409; recibos idempotentes por `actionId` (mismo id con otro contenido → 400); historial y recibos inmutables (trigger 23514). Orden de bloqueos: acción → trabajo → catálogo → filas; las acciones de catálogo no toman el bloqueo de trabajo y el guardado de detalles toma el de catálogo antes de bloquear su fila.
- **API** (borradores): `/api/pro/project-notes` y `/api/pro/project-details` con `route-common` (solo `development`, `X-Pro-Expected-Actor`, mismo origen en POST, cuerpo ≤ 16 KiB → 413, límite 60/min, `no-store`). Código repetido → 409 con `field:'code'` (error de campo, no conflicto).

## Archivos

Fase 1 (en el repositorio):

- `docs/pro/sql/project-notes-details-local.sql` (nuevo; solo objetos nuevos).
- `scripts/pro/local-sql-manifest.mjs` (paso al final + 6 aristas: `private-work-tools-access`, `panel-storage-draft`, `projects-local`, `client-dashboard-local`, `appointment-requests-local`, `client-operations-draft`).
- `tests/e2e/pro-project-notes-details.spec.ts` (nueva, **sin correr**; tipos locales).
- Este documento.

Borradores (fuera del repositorio, en `…/scratchpad/notes-details-draft/`):

- `src/lib/pro/project-notes.ts`, `src/lib/pro/project-details.ts`, `src/lib/pro/project-hub-v2.ts`
- `src/app/api/pro/project-notes/route.ts`, `src/app/api/pro/project-details/route.ts`
- `src/components/pro/project-notes.tsx`, `src/components/pro/project-details.tsx`
- `apply-phase2.mjs` (todo o nada, `--dry-run`, `--out`, `--base`): copia los 7 archivos y edita `job-workspace.tsx`, `business-panel.tsx`, `api/pro/projects/route.ts`, `projects-workspace.tsx` y `tests/e2e/pro-job-workspace.spec.ts`.
- `sql/test.sql` y `sql/test.out` (prueba SQL).

## Evidencia de la fase 1

- `node …/apply-one.mjs docs/pro/sql/project-notes-details-local.sql docs/pro/sql/project-notes-details-local.sql` → `ok` dos veces (idempotente).
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 114 SQL modules, 115 ordered steps, 188 dependencies, guard/repeat contracts and negative cases; offline only.`
- `psql -f …/notes-details-draft/sql/test.sql` (transacción con `rollback`) → `NOTICE: ALL PASS`; `anon`/`authenticated` sin `execute` ni `select`, `service_role` con `execute`, RLS activa, 0 funciones `security definer`; después, 0 filas en `pro_project_notes` y `pro_project_details`. Cubre: creación, repetición idempotente, mismo `actionId` con otro cuerpo, validaciones (longitud, campos de llamada, fecha futura e inválida), hora de Costa Rica (`2026-11-10T09:30` → `15:30Z`), aislamiento, edición con CAS, sin cambios, fijar/archivar/restaurar, historial inmutable, búsqueda, 47 registros en páginas de ≤ 20 por cursor, tipos virtuales y materializados, código repetido sin mayúsculas, reutilización de etiquetas, paleta y código de IVA inválidos, 11 etiquetas, duplicadas, tipo desconocido, catálogo con CAS, archivar tipo, renombrar/eliminar etiqueta con nueva revisión e historial, hub v2 (fila, búsqueda por código, filtros por tipo y etiqueta, conteos iguales a v1, estado inválido).
- Encadenado: `apply-phase2.mjs --base=<créditos+mediciones+tableros+contratos+licitaciones> --out=…/chain/final` escribe 12 archivos; también funciona sobre el repositorio solo (`--dry-run`) y, en orden inverso, el script de licitaciones sigue aplicando sobre el resultado. `tsc` con `tsconfig.check.json` propio: 0 errores; ESLint sin errores ni advertencias en los 12 archivos resultantes y en la spec.

## Límites y pendientes

- **IVA predeterminado (QA fase 2, resuelto en borrador)**: `src/lib/pro/project-default-vat.ts` lee `defaultVatCode` del proyecto y lo aplica solo a lo NUEVO: líneas vacías de una cotización privada nueva con origen en el trabajo, líneas «Por definir» de un detalle de factura de trabajo aún no guardado y líneas nuevas de órdenes de compra. Nunca cambia impuestos ya escritos ni documentos guardados; sin detalles o ante error todo queda como antes.
- **(Histórico) IVA predeterminado no aplicado a borradores**: no hay un gancho neutro. La línea nueva de cotización privada nace con impuesto vacío dentro del editor (sin contexto de proyecto) y la línea de factura nace `pending` desde el SQL de preparación. Aplicarlo requiere pasar `workId` al editor de cotizaciones y a la preparación de facturas; queda para una fase posterior con su propia regresión.
- Actividades con tarifa por proyecto: fuera de alcance (existen por cuenta en `pro_time_activities`).
- La creación de proyecto no pide detalles; se completan en el expediente.
- Las notas no se comparten con el equipo ni con el cliente, no hay adjuntos, recordatorios ni marcación telefónica.
- Fase 2: aplicar `apply-phase2.mjs` (orden: créditos → mediciones → tableros → contratos → licitaciones → este), `tsc` y ESLint en el repositorio, correr la spec nueva y las de regresión (`pro-job-workspace`, `pro-projects`, `pro-client-dashboard`, `pro-work-*` del expediente) en `chromium-desktop` y `webkit-mobile`, revisar capturas y actualizar el registro de paridad.

## Fase 2 (2026-11-11)

- Aplicada con `apply-phase2.mjs` (sin ajustes de anclas): barra «Notas y llamadas / Detalles del proyecto» en el expediente, centro de Proyectos con `v=2`.
- SQL: `pro_project_details → pro_project_types` pasa a `deferrable initially deferred`; borrar la cuenta fallaba con 23503 (dos caminos de cascada). Reaplicado dos veces; prueba SQL `ALL PASS`. Las cuentas desechables que quedaron por ese fallo se borraron después en loopback.
