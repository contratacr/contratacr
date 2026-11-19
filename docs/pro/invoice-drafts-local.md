# Borradores de factura — validación local Pro

Fecha: 2026-10-26. Checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva el trabajo local anterior. Sin commit, push, despliegue, llamadas a GTI/Hacienda ni emisión, cobro o notificación real.

## Implementación

Desde el trabajo de la ficha del cliente, la cita en Agenda y la cotización propia se puede preparar y reabrir un borrador. Cotización y trabajo asociado reutilizan un único borrador; crear repetidamente o concurrentemente no sobrescribe sus datos editados. La navegación conserva el origen y permite volver con la flecha.

Se copia cliente/receptor, concepto, detalle comercial, total acordado, materiales consumidos activos y referencias de abonos/saldo. Un acuerdo individual del trabajo prevalece sobre el total de la cotización. Los materiales no se agregan otra vez al importe y los abonos se muestran como referencia del trabajo: no se asignan a una factura. Guardar no modifica inventario, acuerdos, deudas, pagos, cotizaciones ni el JSON/revisión del workspace.

El receptor, datos de contacto/fiscales, concepto y notas se editan únicamente en el borrador. Los detalles comerciales y materiales son instantáneas. Cambios posteriores del origen se avisan y requieren actualización explícita, conservando los campos editados. El borrador guardado sigue legible si su origen deja de estar disponible. Para una cotización sin cliente guardado se exige selección explícita, sin asociación por nombre ni reescritura del enlace original.

Un trabajo sin importe exige un total manual inicial, sin crear un acuerdo ni saldo operativo. Si varios trabajos comparten cotización, cada uno necesita su acuerdo individual o importe manual; no se copia el total íntegro a cada trabajo. Una cotización con varios trabajos bloquea la preparación ambigua. Si el origen pasa posteriormente a compartido y pierde una base individual, la actualización del borrador pide definir el acuerdo antes de sustituir importes.

## Almacenamiento y permisos

`docs/pro/sql/invoice-drafts-local.sql` instala tablas relacionales aditivas e idempotentes: `pro_invoice_drafts`, `pro_invoice_lines`, `pro_invoice_materials`. Solo el estado draft es válido. Lectura propia con RLS; escritura mediante RPC restringidas al service role y API autenticada Pro con comprobación de origen. Cotizaciones recibidas de otro profesional no permiten preparar una factura como emisor. Se comprueba propiedad, revisión del borrador y huella del origen; las consultas no descargan el workspace completo. Materiales paginados de 20 en 20 y líneas comerciales limitadas a 100.

Aplicado exclusivamente al Supabase loopback local mediante `scripts/pro/prepare-supabase-local.mjs`. No es una migración desplegada a servicios alojados.

## Selección de pruebas y evidencia

Por agregar tablas/RLS/RPC/API y acciones en ficha, agenda y cotizaciones, se amplió la cobertura a almacenamiento de catálogo, paneles y operaciones, además de formularios y recorridos UI dependientes. No se ejecutó la suite completa del repositorio.

- `node scripts/pro/verify-invoice-drafts-db.mjs`: PASS, instalación/reinstalación sin alterar datos previos, redondeo heredado exacto, instantáneas, concurrencia/revisiones, deduplicación, aislamiento de propietarios, permisos/RLS, materiales paginados, borrados aislados y protecciones de importes compartidos. Log `/tmp/pro-invoice-db-final.log`.
- Verificadores SQL de catálogo, paneles y operaciones de clientes: PASS. Logs `/tmp/pro-invoice-catalog.log`, `/tmp/pro-invoice-panels.log`, `/tmp/pro-invoice-operations.log`.
- Regresión UI: `pro-invoice-drafts`, `pro-client-operations`, `pro-forms-ux`, `pro-quote-ux`, perfiles WebKit móvil y Chromium escritorio/móvil. Resultado final registrado abajo.
- Los recorridos de factura verifican guardar/editar/recargar, acceso desde cotización/ficha/Agenda, instantáneas y actualización explícita, cliente sin asociación, trabajo sin importe, concurrencia, propietario ajeno, revisiones y rechazo de emitir. Se bloquea la descarga completa del workspace.
- La primera ejecución detectó un selector que incluía un menú oculto y un fallo real de orden de portales al recargar. Se corrigió el selector para el diálogo visible y se difirió el montaje del editor hasta existir su modal padre. Sin clics forzados ni debilitamiento de aserciones.
- Comparaciones privadas `/tmp/pro-invoice-preserve.cjs`, `/tmp/pro-normalized-preserve.cjs` y `/tmp/pro-panels-preserve.cjs`: PASS después de guardar en el simulador. Se conservan exactamente los tres documentos/revisiones previos y sus entradas operativas, además de las instantáneas originales de clientes/productos/agenda/cotizaciones/movimientos.

## Simulador iOS

Validación manual real en iPhone 17 Pro iOS 26.5, aplicación temporal y servidor local de Pro. Se guardó el borrador de «Pintura de habitación», cliente ficticio María, total ₡50.000, abonos de referencia ₡20.000, saldo ₡30.000, un material de costo ₡2.500. Se regresó al trabajo, se comprobó su resumen intacto y se reabrió el borrador desde la cotización asociada. Queda abierto en el simulador. Captura: `/tmp/contratacr-pro-borrador-factura-20261026.png`.

## Límites explícitos

Es preparación interna: no tiene validez fiscal. La revisión fiscal sigue pendiente. No incorpora emisión, proveedor tributario, CABYS/exoneraciones, validación tributaria, PDF de factura ni asignación de pagos a facturas. Moneda CRC. El detalle copiado es de lectura; el importe manual solo se define al crear y los cambios posteriores provienen del origen con actualización explícita. La sección Facturación ahora permite buscar y editar los borradores guardados; véase `billing-section-local.md`. También se reabren desde su origen. La selección de cliente para una cotización sin vínculo queda en el borrador.

La comprobación TypeScript usa el proyecto de fuentes `/tmp/pro-path-source-tsconfig.json`, excluyendo tipos generados de Next. No equivale a certificación global: permanece el error previo TS2344 de `JobsPageContent` en empleos, ajeno a este cambio.

## Resultado final

Regresión completa seleccionada: **12 passed (6.5m)**, cuatro recorridos en tres perfiles; log `/tmp/pro-invoice-regression.log`. ESLint focal, TypeScript de fuentes, comprobación UTF-8, sintaxis de scripts y `git diff --check`: PASS; logs `/tmp/pro-invoice-lint-final.log`, `/tmp/pro-invoice-tsc-final.log`, `/tmp/pro-invoice-encoding-final.log`. Rama y HEAD permanecen iguales. Todos los cambios quedan locales en Pro, junto al trabajo previo conservado.
