# Contratos (fila 40 del registro de paridad) — local

Estado: **fase 1 terminada (SQL, manifiesto, spec y borradores); fase 2 pendiente** (copiar borradores a `src/`, reaplicar SQL, correr la spec y la regresión). Nada de esto se ha probado todavía en el navegador. La fila 40 sigue en **F** hasta tener evidencia de la fase 2.

Equivalente funcional del constructor de contratos de Houzz Pro (bloqueado en el plan de prueba; referencia: la ayuda pública), escrito de nuevo: sin marca, textos, cláusulas, íconos ni diseño de Houzz. Nombre visible: «Contratos» / «Contracts».

**La firma con valor legal (fila 41) queda fuera: estado E.** Lo que se registra es una **constancia de aceptación autenticada**: cuenta con sesión iniciada, nombre escrito, fecha y hora de Costa Rica, versión y huella SHA-256 del texto exacto. Las tres superficies (editor, diálogo de compartir y vista del cliente) y la copia imprimible dicen visiblemente que **no es una firma digital certificada (Ley 8454) ni asesoría legal**.

## Qué hace

- **Empresa › Plantillas** (`company-hub.tsx`, sección nueva «Plantillas de contrato»), con dos pestañas:
  - **Plantillas:** título, descripción opcional, anticipo predeterminado (%) y cláusulas ordenadas; crear (opcionalmente con cláusulas de la biblioteca), abrir, editar, archivar y restaurar. Para la vista previa de la tarjeta, `GET /api/pro/contracts?view=templates` devuelve la forma `{items:[{name,recordCount}],nextCursor}` que ya usan las otras listas del hub.
  - **Biblioteca de cláusulas:** título + cuerpo de texto plano, crear, editar, archivar, restaurar. Botón «Agregar cláusulas de ejemplo»: cinco cláusulas **genéricas de redacción propia** (partes, objeto, precio y anticipo, cambios, terminación) en el idioma de la interfaz, con el aviso «no constituyen asesoría legal».
- **Por proyecto** (`JobWorkspace › Planificación › Contratos`, primera vista del grupo como en el producto de referencia), solo en el espacio Pro independiente (`proSpace`):
  - Lista de contratos con código, estado, cantidad de cláusulas, última modificación y aceptación.
  - **Crear** desde una plantilla (copia sus cláusulas con ids nuevos: plantilla y contrato evolucionan por separado) o **en blanco**; título (si se deja vacío se usa el de la plantilla), idioma del contrato (ES/EN), cotización vinculada y anticipo (%).
  - **Vincular cotización:** solo cotizaciones **de este proyecto** (`pro_project_estimate_rows`, relación `project`) en estado **aceptada** (se usa el contenido congelado de la publicación aceptada) o **borrador** (nunca compartida, o la última publicación fue retirada o reemplazada). Enviadas, rechazadas o con cambios pedidos: 400.
  - **Editar cláusulas** (solo en borrador): agregar en blanco o desde la biblioteca, editar, subir/bajar, quitar (con confirmación). Selector «Insertar campo combinable» que inserta `{{campo}}` en el cursor. Los tokens desconocidos se marcan en el navegador y la base los rechaza (400).
  - **Vista previa con datos** y lista **Campos sin dato** con dónde completarlos (ficha del cliente, datos del emisor, dirección de la cita, cotización, anticipo). Los tokens sin dato quedan resaltados.
  - **Compartir con el cliente** (diálogo con el aviso legal): exige al menos una cláusula, cero campos sin dato y un cliente vinculado con cuenta. Crea la **versión N inmutable** con el texto ya resuelto y su SHA-256. No se envía nada.
  - **Volver a borrador** (desde compartido o rechazado) para editar y volver a compartir como versión N+1; **anular** con motivo (desde cualquier estado; se conserva número, versiones, respuesta e historial).
  - Versiones compartidas (fecha, huella abreviada, impresión de cada versión) e historial (incluye las respuestas del cliente).
  - **Imprimir o PDF** del navegador (`/api/pro/contract-print`, mismo patrón que `purchase-order-print`: HTML con CSP y nonce, logotipo aprobado, `@media print`). En borrador imprime la vista previa con la marca «BORRADOR».
- **Vista del cliente** (Mis proyectos): sección opt-in nueva **Contratos** (`show_contracts`, apagada por defecto). El cliente vinculado ve la última versión compartida de cada contrato que no esté en borrador: texto completo, empresa, proyecto, cotización y anticipo, versión y huella, imprimir. Puede **aceptar** (casilla «Leí el contrato completo» + nombre escrito, ≥ 2 caracteres) o **rechazar** con motivo. Ve la constancia de su respuesta y si el contrato fue anulado.

## Campos combinables

| Token | Valor | Origen |
|---|---|---|
| `{{cliente.nombre}}` | Nombre del cliente | `pro_clients.name` del trabajo; si falta, `pro_work.client` |
| `{{cliente.identificacion}}` | Cédula o identificación | `pro_clients.identification` |
| `{{proyecto.nombre}}` | Nombre del proyecto | `pro_work.service` |
| `{{proyecto.direccion}}` | Dirección | Lugar de la cita confirmada más reciente; si falta, `pro_clients.address` |
| `{{empresa.nombre}}` | Empresa | Datos del emisor (`pro_invoice_issuer_settings`), si no `professionals.business_name`, si no el nombre del perfil |
| `{{empresa.identificacion}}` | Identificación de la empresa | Datos del emisor |
| `{{cotizacion.codigo}}` | Referencia de la cotización | Primeros 8 caracteres del id en mayúscula (la misma referencia que ya imprimen las cotizaciones) |
| `{{cotizacion.total}}` | Total | Aceptada: total de la publicación aceptada; borrador: total actual. `₡1.130.000,50` / `US$…` |
| `{{contrato.codigo}}` | CTR-0001 | Numeración del contrato |
| `{{fecha.hoy}}` | Fecha | Hoy en America/Costa_Rica; al compartir queda la fecha del día en que se compartió. «11 de noviembre de 2026» / «November 11, 2026» según el idioma del contrato |
| `{{anticipo.porcentaje}}` | `30 %` / `30%` | Anticipo del contrato |
| `{{anticipo.monto}}` | Monto | `round(total × % / 100)` con la moneda de la cotización |

Se aceptan espacios dentro de las llaves (`{{ cotizacion.total }}`). Llaves simples son texto normal.

## Decisiones

- **Numeración CTR-0001 por cuenta y sin huecos:** fila contador en la misma transacción que el contrato; un fallo revierte ambos. Los contratos no se borran (solo se anulan). Solo desaparecen si se elimina el trabajo (cascada), y el número no se reutiliza.
- **Estados:** `draft → shared → accepted | declined`; `shared | declined → draft` (volver a borrador); cualquiera `→ voided`. Las cláusulas y los datos solo se editan en borrador.
- **Instantánea inmutable al compartir:** `pro_contract_versions.content` guarda código, título y cláusulas ya resueltos, empresa, cliente, proyecto, cotización (código, título, estado, moneda, total), anticipo y fecha. `content_hash = sha256(content::text)` (texto canónico de `jsonb` de PostgreSQL). Cambios posteriores en la cotización o el cliente no tocan la versión (probado).
- **Destinatario:** el cliente vinculado del trabajo en el momento de compartir (misma regla que el editor de Vista del cliente: solicitud confirmada o completada, cuenta no deshabilitada). Solo ese destinatario ve y responde la versión; tiene que responder **la versión y la huella actuales** (si no, 409 y la vista se recarga).
- **Edición por acción y no por documento completo:** cada cambio de cláusula es una acción con la revisión del contrato o la plantilla (CAS 40001 → 409). Así un contrato largo (hasta 80 cláusulas de 4000 caracteres, 120 000 en total) nunca supera el límite de 16 KiB por cuerpo.
- **Patrón SQL del brief:** RLS activada y `revoke` a `public/anon/authenticated` en las 8 tablas; las 40 funciones son `security invoker` y solo `service_role` las ejecuta; elegibilidad `pro_private_work_tools_enabled(p_actor)` para el dueño; recibos idempotentes por `actionId` (mismo id con otro cuerpo → 400); historial, versiones, respuestas y recibos inmutables por disparador; orden de bloqueos: acción → cuenta → contador → fila.
- **API** (`/api/pro/contracts`, `/api/pro/contract-print`): solo `development`, `X-Pro-Expected-Actor`, POST same-origin, cuerpo ≤ 16 KiB (413), límite de 120 escrituras/min por cuenta, helpers de `route-common`. P0002 (objeto ajeno o inexistente) → 404.
- La columna `show_contracts` se agrega en la fase 1 en `contracts-local.sql` (`add column if not exists`, default false); la fase 2 la conecta en `client-dashboard-local.sql` (JSON de ajustes y mutación, opcional para clientes viejos) igual que hizo Tableros de ideas.
- No se agregaron dependencias npm. No se envía correo, notificación ni documento a nadie (la spec lo comprueba con `notifications` y `notification_push_outbox`).

## Archivos

Fase 1 (en el repositorio):

- `docs/pro/sql/contracts-local.sql` (solo objetos nuevos): columna `pro_client_dashboards.show_contracts`; tablas `pro_contract_library_clauses`, `pro_contract_templates`, `pro_contract_counters`, `pro_contracts`, `pro_contract_versions`, `pro_contract_responses`, `pro_contract_history`, `pro_contract_actions`; lecturas `pro_contract_library_read`, `pro_contract_template_read`, `pro_contracts_read`, `pro_contract_read`, `pro_contracts_client_read`; escrituras `pro_contracts_mutate`, `pro_contracts_client_mutate`; ayudantes `pro_contract_*`.
- `scripts/pro/local-sql-manifest.mjs`: paso `contracts-local.sql` al final y 9 aristas (private-work-tools-access, client-operations-draft, appointment-requests, client-dashboard, invoice-issuer, private-estimates, private-estimate-publications, private-estimate-work, project-planning).
- `tests/e2e/pro-contracts.spec.ts` (sin correr; tipos locales).
- Este documento.

Borradores de la fase 2 (scratchpad `contracts-draft/`):

- `src/lib/pro/contracts.ts` (esquemas zod estrictos, campos y etiquetas ES/EN), `src/lib/pro/contract-print.tsx`, `src/app/api/pro/contracts/route.ts`, `src/app/api/pro/contract-print/route.ts`, `src/components/pro/contract-clauses.tsx` (editor de cláusulas compartido), `work-contracts.tsx` (proyecto), `contract-templates.tsx` (Empresa › Plantillas), `appointment-contracts.tsx` (cliente).
- `apply-phase2.mjs`: todo o nada, `--dry-run`, `--out=<dir>`, `--base=<dir>`. Inserciones mínimas en `job-workspace.tsx`, `business-panel.tsx`, `appointment-requests-workspace.tsx`, `company-hub.tsx`, `client-dashboard.ts`, `client-dashboard.tsx`, `client-dashboard-local.sql` y `+1` relativo en `pro-job-workspace.spec.ts`.
- Orden recomendado con los otros módulos: **créditos y mediciones primero** (sus scripts usan anclajes exactos de línea completa), luego tableros de ideas y contratos en cualquier orden. Comprobado en cadena con `--base`/`--out`: créditos → mediciones → tableros → contratos y créditos → mediciones → contratos → tableros dan el mismo resultado (16 botones en el espacio independiente).

## Evidencia de la fase 1

- `node apply-one.mjs docs/pro/sql/contracts-local.sql docs/pro/sql/contracts-local.sql` → `ok` dos veces (idempotente).
- `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 112 SQL modules, 113 ordered steps, 175 dependencies…`.
- Prueba psql en transacción con `rollback` (`contracts-draft/sql/contracts-test.sql`, salida en `contracts-test.out`): replay idéntico, reuso de `actionId` (22023), campo desconocido, claves extra, CAS (40001), cotización de otro proyecto o enviada (22023), trabajo ajeno (42501), numeración CTR-0001/0002 por cuenta y otra cuenta con su propio CTR-0001, contador sin avanzar tras fallos, aislamiento (lectura nula, escritura P0002), cliente como dueño (42501), vista previa con campos sin dato, bloqueo de compartir, instantánea con hash = `sha256(content::text)`, congelada ante cambios de la cotización, edición bloqueada al compartir, sección del cliente apagada, cliente ajeno, hash erróneo (40001), nombre corto, aceptación con hora CR, replay, doble respuesta (40001), rechazo, volver a borrador, versión 2, respuesta a versión vieja (40001), anulación, inmutabilidad (23514), RLS, cero privilegios para `anon/authenticated`, formatos de dinero, porcentaje y fecha. Tras el `rollback` las tablas quedan vacías.
- `client-dashboard-local.sql` combinado (tableros + contratos, generado con `--out`) probado en transacción con `rollback`: llamador viejo sin `showContracts` → false; encender; omitirlo conserva el valor.
- `tsc` del scratchpad (`tsconfig.check.json` con overlay) → 0 errores; ESLint con la configuración del repositorio sobre el overlay → 0 errores y 0 advertencias. `tsc` del repositorio: 0 errores en `pro-contracts.spec.ts` (los únicos errores actuales son de `pro-credits-retainers.spec.ts` y `pro-takeoffs.spec.ts`, que importan módulos aún no copiados).

## Límites y pendientes

- No es firma electrónica certificada ni sello de tiempo de un tercero; no hay firma de la empresa ni de varios firmantes (fila 41, E).
- Un solo destinatario: el cliente vinculado del trabajo. Sin cliente con cuenta se puede preparar, no compartir.
- No hay adjuntos ni tablas dentro de las cláusulas (texto plano). No se genera PDF en el servidor: se usa imprimir/guardar como PDF del navegador.
- No se vincula a órdenes de cambio (las órdenes ya tienen su propia aceptación).
- Fase 2: ejecutar `apply-phase2.mjs`, reaplicar `client-dashboard-local.sql` y `contracts-local.sql` dos veces, `tsc`/ESLint del repositorio, `pro-contracts.spec.ts` en chromium-desktop y webkit-mobile, regresión (`pro-job-workspace`, `pro-client-dashboard`, `pro-company`, `pro-project-schedule`, `pro-mood-boards` si ya está aplicado), revisar capturas y actualizar la fila 40 del registro.
