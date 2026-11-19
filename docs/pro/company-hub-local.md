# Empresa / Company: centro de la empresa en Pro — 2026-11-11

Solo checkout Pro, rama `local/pro-suite-no-push`. Sin commit, push, correos, notificaciones, cobros ni proveedores externos. SQL aplicado solo en la base de loopback. Se replicó la estructura funcional de la sección «Company» observada (`houzz-live-structure-2026-11-10.md`); no se copiaron textos, marca, íconos ni diseño de Houzz.

## Qué se hizo

Nueva sección global **«Empresa» / «Company»** (`tab=pro_company`, vista en `empresa=<vista>`), solo en el espacio Pro independiente (`/dashboard/pro`). Entradas: menú lateral (grupo Empresa › «Centro de empresa» / «Company hub»), Inicio (mismo grupo) y el selector «Sección de Pro» en móvil. En `/dashboard/profesional` no aparece (las pruebas de menú de ese panel no cambian).

Sub-navegación agrupada (`src/components/pro/company-hub.tsx`): en escritorio/tableta, tres grupos de botones (`nav` con `aria-current`); en móvil, un `select` con `optgroup`. Cada cambio de vista pasa por `navigatePro`, así que respeta los guardas de borradores existentes.

| Grupo | Vista | Qué muestra | Origen |
|---|---|---|---|
| Colaboradores | Contactos | Lista de clientes: nombre, nombre comercial, grupo, teléfono, correo; Activos/Archivados, búsqueda, acciones, «Nuevo cliente», importar/exportar | `CatalogWorkspace kind="clients"` reutilizado. Inserción mínima: la tarjeta muestra también nombre comercial y grupo cuando existen. |
| | Proveedores | Directorio de proveedores y subcontratistas con totales | **Nuevo** (ver abajo) |
| Biblioteca | Archivos de la empresa | Biblioteca de empresa con carpetas y búsqueda | `CompanyFiles` reutilizado (acciones en su propio hueco del encabezado) |
| | Plantillas | Plantillas de tareas (gestor existente), plantillas de plan de trabajo (lista; se gestionan desde el plan del proyecto porque dependen de sus fechas), servicios frecuentes y descuentos guardados (gestores existentes) | `TaskTemplates`, API de `schedule-templates`, `ServicePackageManager`, `DiscountPresetManager` |
| | Categorías | Categorías de productos/servicios (las que se eligen en cada artículo que luego va a cotizaciones/borradores) y grupos de clientes, con conteo de uso | `CatalogOrganizations` reutilizado |
| | Mis artículos | Productos y servicios | `CatalogWorkspace kind="products"` |
| | Catálogos | Importar productos o clientes desde CSV (abre el importador existente sobre la lista que llena) | `CatalogImport`; catálogos de marcas: **E** |
| Marketing | Perfil público | Enlace al perfil público, «Editar perfil», enlace a Métricas | existente |
| | Formulario de contacto | Explica el formulario de solicitud del perfil y enlaza Solicitudes y Citas y trabajos | existente |
| | Sitio web, Correo masivo, Resultados de marketing | Estado «Aún no disponible» con la razón (proveedor, consentimiento, medición). No se simula ningún envío. Resultados enlaza a Métricas. | **E** |

### Proveedores (nuevo)

No se creó un segundo catálogo: Gastos ya tenía `pro_expense_suppliers` normalizado, y Órdenes de compra lo referencia por clave foránea. El directorio lo extiende.

- **SQL** `docs/pro/sql/company-vendors-local.sql` (manifiesto: depende de `private-work-tools-access`, `expenses` y `purchase-orders`):
  - `pro_company_vendor_profiles` 1:1 con el proveedor: tipo `supplier`/`subcontractor`, oficio o categoría (≤80), persona de contacto (≤160), notas (≤2000), `revision`.
  - `pro_company_vendor_history` (antes/después, inmutable) y `pro_company_vendor_actions` (recibos por `actionId`, inmutables). RLS activa sin políticas, todo revocado a `public/anon/authenticated`, RPC `security invoker` ejecutables solo por `service_role`, elegibilidad `pro_private_work_tools_enabled`.
  - `pro_company_vendors_mutate`: `create` / `update` / `archive` / `restore` con claves exactas, recibo idempotente (misma carga → mismo resultado; mismo `actionId` con otra carga → 400), CAS por revisión (40001 → 409), id repetido → 409, cambio vacío → 400, límite 2000 por cuenta. Toma el mismo bloqueo y sube la misma revisión de cuenta que Gastos (`pro_expense_state`), así un formulario abierto de Gastos recibe 409 en vez de pisar el cambio.
  - Disparador sobre `pro_expense_suppliers`: si Gastos edita nombre, contacto o archivo de un proveedor, la revisión del directorio también sube (un formulario viejo del directorio recibe 409). No cambia ninguna columna ni contrato de Gastos.
  - `pro_company_vendors_read`: `list` (activos/archivados, tipo, búsqueda en nombre/oficio/contacto/correo/teléfono/identificación, 20 por página por nombre con cursor), `detail` (con 20 entradas de historial), `action` (recibo).
  - Totales por proveedor, solo lectura y en céntimos CRC: órdenes de compra no canceladas (líneas con impuesto) y lo pagado en ellas (pagos − reversos); gastos registrados y lo pagado (pagos − reversos).
- **API** `src/app/api/pro/company-vendors/route.ts` con `route-common`: solo `development`, `X-Pro-Expected-Actor`, mismo origen en POST, cuerpo ≤16 KiB (413), límite de frecuencia 60/min, consulta sin claves repetidas, zod estricto (`src/lib/pro/company-vendors.ts`). Respuestas 400/401/403/404/409/413/429/503.
- **Interfaz** `src/components/pro/company-vendors.tsx`: filtros Activos/Archivados con conteo, Tipo y búsqueda; tabla en pantallas anchas y tarjetas en el resto; editor en modal (pantalla completa en móvil) con validación, confirmación al descartar, guardado incierto que reintenta el mismo `actionId`, conflicto 409 con «Recargar proveedor» sin perder lo escrito, historial plegable; archivar con confirmación y restaurar; estados de carga, vacío (sin datos / sin resultados / sin archivados) y error con reintento.

### CSV con «;» (pedido de QA)

`parseCatalogCsv` (usado por la importación de catálogo y por la de solicitudes en `lead-inboxes.ts`) detecta el separador en la fila de encabezado con `detectCsvDelimiter`: cuenta comas y puntos y comas fuera de comillas solo en el primer registro; si hay más «;» usa «;», si no, coma (comportamiento anterior intacto). Con archivos «;» la importación de artículos acepta además una coma decimal (`1250,50`); los separadores de miles siguen rechazados. La ayuda del importador lo explica.

## Decisiones

- Se reutilizaron los módulos existentes dentro del centro en vez de duplicarlos; las rutas antiguas (Clientes, Gastos › Proveedores, Productos y servicios, Archivos) siguen funcionando igual.
- «Categorías» usa las categorías de productos/servicios y grupos de clientes que ya existían. Una biblioteca global de códigos de costo para el presupuesto sigue pendiente (los códigos viven en cada proyecto); la vista lo dice.
- Los ids de proveedor son por cuenta (como en Gastos): otra cuenta puede usar el mismo UUID para su propio registro, sin ver ni tocar el ajeno.
- Las plantillas de plan de trabajo se listan pero se gestionan desde el plan de un proyecto, porque su captura y aplicación dependen de las fechas de ese proyecto.

## Evidencia

- `npx tsc --noEmit -p tsconfig.json | grep 'error TS'` → 0. ESLint de los 12 archivos tocados → 0 errores, 0 advertencias.
- `node $S/apply-one.mjs docs/pro/sql/company-vendors-local.sql docs/pro/sql/company-vendors-local.sql` → `ok` (reaplicable). `node scripts/pro/verify-local-preparation-manifest.mjs` → `PASS: 108 SQL modules, 109 ordered steps, 149 dependencies…`.
- `tests/e2e/pro-company.spec.ts`: 3/3 en chromium-desktop y 3/3 en webkit-mobile (prueba pura del separador + recorrido ES + recorrido EN). Cubre 401, 403 (otra cuenta en el encabezado, sin origen, origen ajeno, cuenta sin Pro en la RPC), 400 (consultas y cuerpos inválidos, cursor ajeno, cambio vacío, `actionId` reutilizado con otra carga), 404 (detalle/archivo/edición ajenos o inexistentes), 409 (revisión vieja, id repetido, edición hecha desde Gastos), 413, repetición idempotente, historial e inmutabilidad, archivo/restauración y filtros, totales de órdenes (cancelada excluida, impuesto) y gastos, paginación 20+3 por nombre, aislamiento con segunda cuenta, importación de solicitudes con «;» por API, e interfaz: vacío, error con reintento, crear con validaciones, editar, descartar, recargar y ver persistido, historial, archivar/restaurar, categorías nuevas visibles tras recargar, importación de artículos con archivo «;» y coma decimal, contactos con nombre comercial y grupo, plantillas, estados bloqueados, formulario de contacto y entrada desde Inicio; sin desbordamiento horizontal ni errores de página.
- Capturas revisadas (escritorio 1366 px y WebKit móvil, ES/EN) en `/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/company-shots/`. Correcciones tras revisarlas: botones de acciones en una sola línea en la tabla (antes duplicaban la altura de cada fila), sin subtítulo duplicado en Contactos/Mis artículos, tarjetas móviles sin bloques de «—» cuando el proveedor no tiene documentos, enlaces con la misma forma que los botones, importador que vuelve a la lista importada al cerrarse.
- Regresión chromium-desktop (18 specs: company, catalog-import, catalog-organizations, catalog-item-types, catalog-expected-actor, purchase-orders, expenses, expenses-english, expense-write-recovery, task-templates, task-templates-api, schedule-templates, schedule-templates-api, job-workspace, projects, leads-inboxes, tools-profile-menu, independent-space) → **34 passed, 2 failed, 2 skipped (11,3 min)**. Fallos: `pro-expense-write-recovery` [es] (página en blanco a mitad del recorrido; repetido en aislamiento con estos cambios: 4/4 aprobados con `--repeat-each=2`) y `pro-catalog-item-types` (falla también con el disparador eliminado temporalmente y sin el cambio de subtítulo, con errores distintos en cada corrida: botón deshabilitado, tiempo de `apiRequestContext.get`, elemento no encontrado; no lo causa este módulo, queda para el líder). Las pruebas `pro-expenses` y `pro-expenses-english`, que fallaban en el informe de órdenes de compra, pasan ahora.
- Regresión webkit-mobile (12 specs: company, catalog-import, catalog-organizations, purchase-orders, expenses, expenses-english, task-templates, schedule-templates, job-workspace, projects, leads-inboxes, independent-space) → **27 passed (10,2 min)**. `PRO_INDEPENDENT=1 pro-job-workspace` → 2 passed en chromium-desktop y 2 passed en webkit-mobile.

## Límites y pendientes

- Sin campos personalizados, etiquetas ni varios contactos por proveedor; sin importar proveedores por CSV; sin portal ni invitación al subcontratista desde el directorio.
- Totales sin desglose por proyecto ni antigüedad de saldos.
- Sin biblioteca global de códigos de costo; categorías de productos y grupos de clientes solamente.
- Sitio web, correo masivo, resultados de marketing y catálogos de marcas: **E** (requieren proveedor, consentimiento o acuerdos).
