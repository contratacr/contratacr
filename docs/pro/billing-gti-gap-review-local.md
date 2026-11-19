# Facturación Pro frente a GTI — brechas y primera ampliación

2026-10-26, solo checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se preserva todo el trabajo local previo. Sin push, commit, cambios main/mobile, emisiones, cobros, notificaciones ni fixtures alojados.

Avance posterior: [detalle editable de borradores](invoice-detail-editing-local.md) añade productos/servicios, descuentos comerciales, IVA configurable y CABYS de referencia. Las validaciones fiscales, impuestos especiales y emisión siguen pendientes; la tabla siguiente conserva el punto de partida de esta ampliación.

## Comparación de capacidades

Se contrastaron `gti-inventory-and-rollout.md` (menú observado en sesión autorizada el 23 de octubre), `gti-integrated-system-analysis.md`, implementación actual y [servicio oficial GTI](https://www.facturaelectronica.cr/NuestroServicio), consultado hoy. La página pública confirma borradores previos a emisión, catálogo, consultas/reportes, documentos, recepción, recurrencia, personalización, adjuntos y notas; no prueba que todas las funciones estén en cada contrato. No se volvió a entrar a GTI ni se invocaron servicios fiscales.

| Capacidad de referencia | Pro antes de esta entrega | Brecha / entrega actual |
|---|---|---|
| Preparación y recuperación | Borradores guardados, editor receptor/concepto/notas, lista paginada y búsqueda por cliente/cotización/trabajo | Se añaden datos del emisor y condiciones de venta por borrador, con revisión de datos pendientes |
| Emisor/configuración | Perfil profesional, sin preparación fiscal del emisor | Identidad/contacto/actividad de referencia por documento; aún faltan configuración reutilizable, domicilios estructurados, sucursal/terminal y autorización fiscal |
| Contado/crédito, plazo y medio de pago | Solo importes y abonos/saldo de referencia del trabajo | Fecha prevista, condición, días de crédito, vencimiento previsto, medio previsto y referencia comercial; no registran pagos ni deudas |
| Detalle fiscal y catálogo | Líneas comerciales copiadas, materiales y total conservados | Falta editar líneas fiscales con trazabilidad, cantidades, CABYS validado, descuentos, tarifas/exoneraciones y cálculo decimal versionado. No se reprecian originales |
| Tipos de comprobante y moneda | Borrador de factura CRC | Faltan tiquete, compra, exportación, NC/ND y REP con campos/referencias reales; otras monedas y tipo de cambio verificable |
| Factura directa/rápida y POS | Preparación desde cotización/trabajo | Falta creación directa con cliente y líneas, sin forzar trabajo previo; POS depende de reglas de caja, inventario y emisión |
| Emisión/estados/archivo fiscal | No implementado | Adaptador, alta de emisor, sandbox, cola/idempotencia, consultas/respuestas Hacienda, XML/PDF/acuse privados y correcciones. No se inventan estados aceptado/emitido |
| Pagos/cuentas y facturación parcial | Libro interno por trabajo, reversos y saldos; referencias en borrador | Faltan aplicaciones a documentos/anticipos, conciliación, asignación parcial por línea y prevención de doble facturación. Cobrar suscripción Pro es independiente |
| Recepción/gastos y proveedores | Sin bandeja fiscal | Faltan importación/archivo, aceptación/rechazo autorizado, gasto y cuentas por pagar separados del estado fiscal |
| Consultas/reportes/exportación | Buscador sencillo y páginas de borradores | Faltan fecha/estado/tipo cuando existan documentos, reportes por moneda/estado y exportaciones auditadas; no sumar borradores como ingresos reales |
| Adjuntos, presentación, recurrencia | Sin implementación fiscal | Archivos privados, representación con marca compartida y plantillas/programación con pausa/idempotencia, sin activar envíos automáticos |
| Históricos/equipo/auditoría | Propiedad individual y catálogos importables | Falta importación documental sin reemitir y permisos/auditoría de negocio; no fusionar usuarios ni fuentes por nombre |

No se declara paridad con GTI. Cada brecha seguirá abierta hasta implementar su recorrido y validarlo. El siguiente bloque de preparación es detalle fiscal editable y cálculo controlado; la emisión permanece bloqueada por contrato/especificación/sandbox y autorización del emisor. Este documento no autoriza una emisión posterior.

## Bloque implementado en esta entrega

Formulario con dos grupos plegados, «Condiciones de venta» y «Datos del emisor», dentro del editor común. Se permite guardar incompleto: los pendientes se muestran en una revisión que nunca afirma aptitud para emitir. Los campos se guardan solo en el documento; no cambian perfil, cliente, otra factura, trabajo, material, inventario ni saldo.

Fecha del documento es prevista, sin asignar fecha fiscal real. Crédito exige fecha válida y plazo entero de 1–3650 días (límite interno de preparación), con vencimiento calculado por días calendario y sin depender de la zona horaria del simulador. Cambiar a contado limpia el plazo; elegir un medio de pago no cobra ni confirma que hubo pago. Actividad/identificación son referencias manuales, sin verificación contra registros oficiales. Moneda y totales anteriores se conservan.

Tabla relacional opcional `pro_invoice_preparation`, con FK compuesta de dueño/borrador, RLS de lectura propia y RPC de servidor. Los borradores anteriores continúan sin fila adicional hasta guardado explícito. Lectura combinada en una instantánea de BD; guardado del borrador y preparación en una transacción y bajo la misma revisión/lock. Clientes de API anteriores que omiten preparación la conservan. Actualizar desde origen no pisa preparación; repetir creación no sobrescribe el borrador existente. No se almacenan llaves, credenciales ni un permiso de emisión.

## Selección de pruebas previa

Por tabla/RLS/RPC nuevos y cambio de la API de borradores: ampliar el verificador SQL de borradores con conservación/reinstalación, rollback, CAS, duplicados, actualización desde origen, lectura/propietario y permisos. Añadir E2E de preparación y ejecutar consumidores de borradores/Facturación en WebKit móvil y Chromium móvil/escritorio. No hay cambios de cabecera, marca, navegación compartida, motor de totales ni almacenamiento operativo: se reutilizan sus evidencias compatibles, sin repetir suite global. ESLint focal, TypeScript de fuentes, UTF-8 y diff. Comparación privada de datos originales y revisión manual iOS loopback. Resultados y límites al final.

## Resultados

- SQL ampliado: PASS. Log `/tmp/pro-preparation-db.log`; incluye instalación/reinstalación sin cambiar borradores previos, preparación por dueño, rollback de edición/fecha/plazo inválidos, revisión obsoleta, compatibilidad de clientes sin campos nuevos, refresh sin sobrescritura, create repetido sin reemplazar emisor, RLS/RPC denegadas y cascada aislada. Se mantienen todas las pruebas anteriores de dinero/materiales/paginación/origen.
- Consumidores en WebKit móvil y Chromium escritorio: **6 passed (3.6m)**, Facturación, borradores y preparación (`/tmp/pro-preparation-regression.log`). Chromium móvil: **2 passed (44.6s)** de Facturación y preparación (`/tmp/pro-preparation-final-mobile.log`), más el recorrido de borradores **1 passed (1.4m)** (`/tmp/pro-preparation-existing.log`). Nueve recorridos entre tres perfiles; no suite global.
- El nuevo recorrido comprueba fechas reales/año bisiesto, vencimiento, crédito→contado→crédito, validación y corrección sin recargar, emisor, guardado/recarga, revisión de pendientes, rechazo de fecha inválida, stale revision, dueño ajeno, emit rechazado, compatibilidad del editor anterior, repetición sin sobrescribir y ausencia de cambios operativos. También limita el ancho del campo de fecha a su tarjeta.
- ESLint focal, TypeScript de fuentes (`/tmp/pro-path-source-tsconfig.json`, excluye tipos generados de Next), UTF-8 y diff: PASS. Logs `/tmp/pro-preparation-lint-final.log`, `/tmp/pro-preparation-types-final.log`, `/tmp/pro-preparation-encoding.log`. No se afirma TypeScript global ni se corrigen errores ajenos preexistentes.
- Comparaciones privadas de documentos/revisiones/entradas originales y de borradores/líneas/materiales/preparación: PASS. Verificadores `/tmp/pro-invoice-preserve.cjs`, `/tmp/pro-preparation-preserve.cjs`, `/tmp/pro-normalized-preserve.cjs`, `/tmp/pro-panels-preserve.cjs`. Los datos de prueba automatizados se crean y retiran solo en cuentas descartables loopback.

## Comprobación manual iOS

iPhone 17 Pro iOS 26.5, app temporal y servidor Pro loopback. Se abrieron los grupos, se seleccionó Crédito, se usó el calendario nativo para 26 de octubre de 2026, se escribió plazo de 30 días y se comprobó vencimiento de 25 de noviembre de 2026; se eligió Transferencia como medio previsto. No se cobró ni guardó un pago.

Se corrigió un desbordamiento del input date de WKWebView con ancho máximo/apariencia del campo, conservando flechas nativas de los selectores. También se observó autocorrección indeseada de un nombre ficticio: se desactivó autocorrector, capitalización automática y spellcheck en emisor/receptor. Se repitió la entrada y «Emisor ficticio de prueba» permaneció exacto. Durante HMR hubo recarga del WebView; se reinició la app temporal y se repitieron los controles con código estable.

Las entradas manuales se descartaron mediante la advertencia «Salir sin guardar» para dejar intacto el borrador anterior. Guardado/persistencia se validaron con cuentas descartables en los tres perfiles. Queda abierto el borrador original con los nuevos grupos y sus nueve pendientes, total/abonos/saldo/materiales intactos.

Capturas locales: `/tmp/contratacr-pro-condiciones-factura-20261026.png` (prueba temporal de crédito, sin guardar), `/tmp/contratacr-pro-emisor-factura-20261026.png` (nombre ficticio sin autocorrección, sin guardar), `/tmp/contratacr-pro-preparacion-factura-20261026.png` (estado final original conservado).

La entrega cubre preparación interna adicional, no un comprobante válido ni paridad completa con GTI. Las brechas de detalle fiscal, documentos y proveedor permanecen explícitas. Sin push ni emisión real.

## Contraste en sesión GTI autorizada — 26 octubre 2026

Usuario abrió Safari e indicó consultar esa sesión. Se revisó el formulario vacío «Factura Electrónica» y sus paneles, sin escribir datos, guardar clientes/documentos, agregar líneas, confirmar tratamientos ni emitir. No se copian identidades, saldos de plan ni enlaces de sesión al repositorio. Las observaciones describen la interfaz consultada, no prueban reglas internas de cálculo o aceptación fiscal.

| Evidencia observada | Cobertura Pro / siguiente criterio |
|---|---|
| Receptor con identificación tipada, actividad opcional y domicilio provincia/cantón/distrito, barrio y señas | Pro reutiliza contacto e identificación y dirección libre. Falta modelar domicilio y tipo de identificación, con copias históricas por documento. |
| Factura directa, tiquete, compra, exportación, proforma, factura rápida y punto de venta en menú | Pro prepara borradores desde cotización/trabajo; creación directa es siguiente incremento independiente. No inventar tipos fiscales sin campos/reglas. |
| Descuentos con hasta cinco entradas por línea, tipo/naturaleza y porcentaje o monto | Pro tiene un descuento comercial por línea. Falta colección ordenada y semántica de aplicación comprobada; no asumir suma o descuento compuesto solo por el formulario. |
| IVA con tipo y tarifa de catálogo, base/monto y pestaña de exoneración | Pro tiene tratamiento y tarifa manual. Falta catálogo versionado, exoneración con tipo/documento/fecha/institución/puntos/monto y reglas verificadas. |
| Otros impuestos separados de IVA y otros cargos en pestaña independiente | Pendientes. Separar afectación de base/total y preservar detalle histórico; confirmar cálculo con fuente primaria y ejemplos antes de implementar. |
| CABYS, unidad elegible, código comercial adicional, medicamentos, tipo de transacción y VIN/serie | Pro CABYS manual/formato, unidad libre y un SKU. Opciones especializadas deben aparecer según producto/caso, sin cargar el formulario básico. |
| Totales con venta, impuestos, descuentos, IVA devuelto, venta neta y otros cargos; medio de pago | Pro calcula detalle comercial básico; no equiparar ese total con desglose fiscal completo. |

Diseño objetivo ContrataCR: cliente reutilizable, líneas simples y campos avanzados contextuales; funciones equivalentes verificadas por recorrido. La apariencia y la navegación propias se conservan. La consulta no autoriza una futura emisión ni demuestra paridad completa.

## Incremento siguiente: borrador directo — 27 octubre 2026

Se añadió la entrada directa desde Facturación con cliente guardado y productos/servicios, sin trabajo/cotización operativos. Se reutilizan detalle editable, copias de receptor y cálculo comercial, sin emisión ni cargos a inventario. Implementación/evidencia y limitaciones en `direct-invoice-local.md`. La brecha de POS, moneda, tipos fiscales, exoneraciones y proveedor no queda cubierta por este incremento.

## Incremento: IVA ordinario y exoneraciones — 27 octubre 2026

Se añadió catálogo de IVA y exoneración documental opcional por línea, con cálculo de bruto/exonerado/neto, snapshots históricos y recuperación del formulario. Véase `invoice-tax-exoneration-local.md` para fuentes actuales, límites y evidencia. Impuestos específicos/especiales, surtidos, IVA de fábrica, otras naturalezas de descuento y validación de autorizaciones siguen pendientes. La entrega prepara borradores y no declara paridad fiscal completa con GTI.

## Incremento: impuestos específicos y otros cargos — 27 octubre 2026

Se añadió preparación de combustibles03, tabaco06 y cemento12 cobrados en la venta, más otros cargos independientes con base explícita, datos de terceros y desglose. Fórmulas, conservación y evidencia en `invoice-extras-local.md`. Selectivo, bebidas, regímenes de fábrica/asumidos, surtidos y casos especiales siguen pendientes; no se declara paridad completa ni emisión fiscal.


## Incremento: selectivo y bebidas — 27 octubre2026

Se añade selectivo02 con base explícita/referencia, alcohol04 con volumen y grado alcohólico y bebidas05 con volumen de referencia. Se amplía correctamente la baseIVA, conservando los snapshots anteriores y los otros cargos. Fuentes, precisión, pruebas y límites en `invoice-selective-beverages-local.md`. No se infieren tarifas específicas actuales ni se cubren fábrica/asumidos, surtidos, jabón, otros regímenes o emisión fiscal.
