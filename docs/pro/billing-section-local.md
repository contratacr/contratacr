# Facturación — sección local Pro

2026-10-26. Rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Trabajo anterior preservado; sin ramas, commits, push, emisiones, mensajes ni acciones en producción.

## Selección de pruebas (antes de ejecución)

Entradas nuevas: listado SQL de solo lectura y su índice/RPC restringida, API de borradores, sección Facturación y registro en navegación Pro. Se reutiliza el editor existente, exportándolo con origen opcional para abrir directamente un ID guardado. No se alteran tablas de borradores ni sus mutaciones.

Cobertura seleccionada: verificador SQL de borradores ampliado para búsqueda contextual/literal/acentos, paginación estable y aislamiento/permisos; E2E Facturación nuevo y E2E borradores existente en WebKit móvil y Chromium móvil/escritorio. Navegación Pro como consumidor de nuevo tab y regresión de marca por precaución al registrar la sección en el panel. ESLint, TypeScript de fuentes, UTF-8 y diff. Se reutiliza la evidencia anterior de almacenamiento de catálogo/paneles/operaciones: sus entradas no cambian. No se repite la suite completa.

Comparaciones privadas de datos originales y borradores previos, además de revisión manual del simulador iOS contra el servidor loopback. Los fixtures automatizados usan cuentas descartables locales.

## Implementación

`?tab=pro_billing` abre Facturación desde el panel, tanto en móvil como en escritorio, para miembros Pro. Un único buscador encuentra por nombre del cliente guardado, receptor editado, concepto del borrador, nombre del trabajo o título de la cotización. Ignora mayúsculas y tildes y trata `%` como carácter literal. No hay filtros adicionales que mantener.

Tarjetas con cliente, receptor si difiere, trabajo/cotización relacionados, total y fecha de actualización en Costa Rica. Orden estable por creación descendente e ID; se cargan 20 registros y «Ver más borradores». Estados de carga, lista vacía, búsqueda sin coincidencias y reintento ante error. Las consultas son del propietario autenticado y no descargan JSON del workspace, materiales ni líneas de todos los borradores.

Al tocar la tarjeta se abre el editor existente. Guarda concepto, receptor, contacto y notas con los mismos controles de revisión/permisos. La flecha vuelve a la búsqueda anterior, mantiene las páginas ya cargadas y actualiza la tarjeta editada sin recargar la lista entera. Los importes/detalle siguen siendo instantáneas del origen, actualizables mediante la acción explícita existente; no se habilita ningún camino de emisión.

El índice y RPC `pro_invoice_draft_page` están en `docs/pro/sql/invoice-list-local.sql`, aplicado solo al stack loopback por el preparador local. Es aditivo e idempotente, sin backfill ni modificación de borradores existentes. Permiso de ejecución solo para service role; la API fija el propietario de la sesión y valida el cursor, enlazado al término de búsqueda. El listado usa nombres actuales de cliente/origen y el concepto/receptor guardados; cancelar o archivar el origen no elimina el borrador. La revisión fiscal permanece pendiente.

## Correcciones encontradas durante las pruebas

- Se diferenció la acción del estado vacío («Ver todos los borradores») de la X «Limpiar búsqueda», evitando dos acciones con idéntico nombre accesible.
- Se eliminó una segunda copia local del texto buscado: tras Atrás podía competir con la URL y restaurar un término anterior. El input usa ahora directamente el parámetro del navegador y solo la consulta se retrasa 300 ms. Respuestas anteriores se descartan y no se muestran resultados de otra búsqueda durante la espera.
- Abrir/cerrar un editor ya no reinicia la paginación. Un callback después de guardar actualiza la tarjeta y respeta el criterio de búsqueda.
- Se corrigieron errores de sintaxis y de firma del helper de limpieza del test nuevo. Las dos cuentas descartables dejadas por esa primera ejecución se retiraron solo de loopback, excluyendo explícitamente los usuarios originales.

## Evidencia local

- SQL de borradores ampliado: PASS, incluida reinstalación, búsqueda de cotización/trabajo/receptor, normalización de tildes, caracteres literales, 25 resultados con fecha igual paginados 20+5 sin duplicados, aislamiento de propietario y denegación RPC al usuario autenticado. También se ejecutan las aserciones previas de conservación, instantáneas, revisión, materiales y ausencia de efectos financieros. Log `/tmp/pro-billing-db-final.log`.
- E2E final de Facturación: **3 passed (1.5m)**, WebKit móvil y Chromium escritorio/móvil, con 23 borradores descartables. Incluye páginas cargadas conservadas al abrir/cerrar, búsqueda por cliente/receptor/trabajo/cotización, `%` literal, cursores inválidos y de otra búsqueda, edición persistente tras recarga, Atrás, recuperación de error, entrada desde el panel, ausencia de descarga completa y conservación de datos/otros borradores. Log `/tmp/pro-billing-final.log`.
- Regresión ampliada inicial: 12 aprobadas y 3 fallidas de 15 (7.3m). Pasaron borradores y navegación en los tres perfiles, más marca en Chromium móvil. El fallo de Facturación en Chromium escritorio detectó la competencia de búsqueda/URL corregida y cubierta en la ejecución final. Los otros dos fallos fueron de la prueba de marca en páginas públicas: WebKit agotó 60s al llegar a `/promociones`; Chromium escritorio no reconoció contenido durante la comprobación de `/registro`. Estas páginas/componentes no tienen cambios locales en este trabajo. Se conserva el resultado inicial y se registrará por separado la comprobación focal posterior, sin relajar tiempos ni aserciones. Log `/tmp/pro-billing-regression.log`.
- ESLint focal y TypeScript del proyecto de fuentes: PASS, logs `/tmp/pro-billing-lint-final.log`, `/tmp/pro-billing-types-final.log`. No es certificación TypeScript global con tipos generados de Next. El lint de la página completa del panel mantiene los mismos tres errores de efectos/estado presentes en HEAD; se verificó mediante lint de su contenido original (`/tmp/pro-billing-dashboard-baseline-lint.log`), sin modificar código ajeno para ocultarlos.
- Contrato estático de marca: PASS (`/tmp/pro-billing-brand.log`). UTF-8 y `git diff --check`: PASS.
- `/tmp/pro-billing-preserve.cjs`: PASS, borradores previos, líneas y materiales idénticos, incluyendo revisiones/fechas. `/tmp/pro-invoice-preserve.cjs`: documentos, revisiones y entradas operativas originales idénticos. Verificadores de instantáneas originales de normalización/paneles: PASS. Los baselines privados no se incluyen en el repositorio.

## Simulador

iPhone 17 Pro, iOS 26.5, app temporal conectada a `127.0.0.1:3185` y Supabase loopback. Se revisó la lista con el borrador existente de María, búsqueda «maria» sin tilde y «pintura», apertura del editor, edición temporal del concepto, advertencia de salida sin guardar y retorno a la búsqueda con el original intacto. Guardar/recargar se verifica automáticamente con datos descartables en los tres perfiles, sin sobrescribir el borrador manual previo.

Queda abierta Facturación con la búsqueda por Pintura. Captura `/tmp/contratacr-pro-facturacion-20261026.png`. La cuenta ficticia conserva su exclusión previa de búsquedas públicas (el panel muestra «Tu perfil está suspendido»); no se alteró ese estado para la demostración. No se modificó el checkout mobile ni se publicaron paquetes.

Resultado de la comprobación focal de marca posterior, sin cambiar código de marca, aserciones ni timeout: **2 passed (1.3m)**, WebKit móvil (59.2s) y Chromium escritorio (19.2s). Log `/tmp/pro-billing-brand-repeat.log`. Chromium móvil ya había pasado en la regresión inicial. Se retienen los fallos iniciales y sus artefactos: esta repetición no convierte la primera ejecución en verde y el margen del timeout WebKit sigue siendo estrecho en el servidor de desarrollo local.

Al cierre: 12 recorridos de Pro cubiertos entre Facturación final (3), borradores (3) y navegación (6), más contrato estático de marca y las tres comprobaciones de marca por navegador indicadas arriba. No se afirma una suite global ni validación tributaria. Rama/HEAD originales, sin push ni emisión real.
