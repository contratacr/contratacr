# GTI y el sistema integrado de ContrataCR Pro

> Estado actualizado al 27 octubre 2026: consultar [registro de equivalencia GTI → Pro](gti-parity-ledger-local.md). Este documento conserva evidencia histórica; sus pendientes o autorizaciones de despliegue antiguas no sustituyen el estado actual ni la restricción vigente de trabajar solo en Pro, sin push.

Análisis actualizado el 26 de octubre de 2026. Checkout exclusivo Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva todo el trabajo local existente. Este documento propone trabajo; no declara implementadas sus funciones ni reactiva autorizaciones históricas para despliegues. Sin push, emisión, cobros, mensajes a GTI, acceso a secretos ni cambios de datos.

La matriz de avance de Facturación posterior a este análisis está en [billing-gti-gap-review-local.md](billing-gti-gap-review-local.md); registra los borradores, la sección de búsqueda y la preparación de emisor/condiciones ahora implementados. Las brechas descritas aquí son la base histórica, no una certificación del estado actual.

## Resultado del análisis

La meta es que un profesional pueda llevar su negocio desde ContrataCR, con el cliente como vínculo entre presupuesto, trabajo, materiales, documento fiscal, pagos e historial. GTI es una referencia funcional y un posible proveedor fiscal; la experiencia y los datos operativos deben pertenecer a Pro, sin obligar a usar dos interfaces ni digitar dos veces.

Hay dos decisiones distintas: disponer en Pro de las capacidades comerciales observadas en GTI y escoger quién procesa los comprobantes fiscales. No son la misma integración. Conviene mantener el núcleo independiente y conectar GTI mediante un adaptador si las condiciones técnicas y comerciales lo permiten.

## Evidencia y alcance

1. [Inventario anterior](gti-inventory-and-rollout.md): 33 accesos del menú inspeccionados el 23 de octubre en una sesión autorizada, más campos y operaciones secundarias. Es evidencia histórica de interfaz, no de permiso API ni de operaciones fiscales ejecutadas.
2. En esta ronda se revisaron fuentes públicas oficiales de GTI y Hacienda, y código/documentación actuales de Pro. No se volvió a ingresar a una cuenta privada de GTI ni se verificaron extras contratados. Se conserva el límite: no afirmar exhaustividad sobre funciones ocultas o habilitadas por contrato.
3. GTI anuncia emisión, documentos guardados antes de emitir, recepción, reportes, recurrencia y personalización. [Servicio oficial](https://www.facturaelectronica.cr/NuestroServicio).
4. GTI publica un servicio SOAP con `InsertarDocumentos`, `ConsultaDocumento`, `ConsultaRespuestaHacienda`, `ConsultaRespuestaCorreo`, `InsertarFacturaPagada`, `PagarFactura` y `ProcesarDocCredenciales`. Se leyó su índice; no se invocaron operaciones. Prueba existencia de una interfaz publicada, no compatibilidad íntegra con el contrato/cuenta ni soporte multiemisor. [Servicio publicado](https://www.facturaelectronica.cr/ServicioCargaFactura/).
5. Su [manual oficial de WooCommerce](https://cdn.gticr.com/gticr/Documentos/Documentacion_Plugin.pdf) describe una integración concreta con datos de cuenta y funciones que requieren habilitación. No es la especificación completa de una plataforma como ContrataCR.
6. [GTI Conectividad](https://www.gticr.com/Conectividad) trata cobros y conciliación; no demuestra acceso a emisión fiscal. Los [planes públicos](https://www.facturaelectronica.cr/Planes) no resuelven por sí solos licenciamiento de una plataforma para múltiples emisores. No se fija un precio de Pro usando esa lista.
7. [GTI publica referencias 4.4](https://www.facturaelectronica.cr/LeyesyReglamentos). Para implementar se deben obtener anexos/XSD y actualizaciones oficiales aplicables a la fecha del piloto, registrar versión y probarlos. La [API oficial de Hacienda](https://www.hacienda.go.cr/docs/ComprobantesElectronicosAPI.html) describe XML firmado, autenticación y consulta asíncrona: recibir una solicitud no significa aceptar el comprobante. Este análisis no certifica cumplimiento tributario.

## Cobertura de funciones: qué tenemos y qué falta

Los números remiten a los 33 accesos del inventario anterior. Las propuestas de la última columna son decisiones de producto, no afirmaciones sobre capacidades ya construidas.

| Capacidades GTI / referencia | Estado actual en Pro | Destino integrado y criterio pendiente |
|---|---|---|
| Clientes: mantenimiento/carga/reporte (18,19,21) | Catálogo relacional privado, búsqueda y páginas, ficha, archivo e importación/exportación CSV propias | Ficha única con datos comerciales/fiscales, origen de importación y relaciones con toda la operación. Mapear archivos GTI antes de afirmar compatibilidad |
| Grupos (20) | Campo de texto guardado y buscable | Administración de grupos si aporta segmentación real; no otro menú para un dato simple |
| Productos/servicios, carga y reporte (22,24,25) | Código, precio/costo, categoría/unidad/CABYS de referencia, stock, movimientos y CSV | Distinguir servicio de artículo con stock; impuestos configurables, códigos adicionales y trazabilidad. CABYS actual valida formato, no clasificación oficial |
| Categorías (26) | Texto guardado y buscable | Catálogo de categorías cuando el volumen lo justifique |
| Descuentos y combos (23,27) | Sin modelo completo de descuentos ni composición de combos | Descuento por línea/documento y reglas explícitas; componentes/versiones y consumo atómico de stock |
| Proformas/preliminares (5,9,10) | Cotizaciones y borrador recuperable; vínculo con cliente y cita | Versiones comerciales, duplicación y conversión a borrador de factura sin cambiar la cotización aceptada |
| Factura/tiquete/compra/exportación (1–4) | Sin motor fiscal activo | Mismo editor con campos según tipo y emisor; revisión y emisión explícita; XML/PDF y respuesta reales |
| Factura rápida y POS (6,7) | Sin recorrido de venta fiscal | Cliente + líneas guardadas + pago; caja solo cuando emisión y pagos estén validados |
| Emitidos y descargas (8,11) | Cotizaciones descargables, no archivo fiscal completo | Documentos y estados reales, PDF/XML/respuestas privados, descarga por período |
| Migrar documentos/aceptaciones (12,15) | CSV de catálogos; sin migración documental fiscal | Históricos identificados por origen y clave, sin reemitir ni consumir stock/documentos otra vez |
| Recepción/aceptación y gastos (13,14) | Sin bandeja fiscal ni libro de gastos integrado | Proveedores, documentos recibidos, revisión y decisión explícita, gasto y cuentas por pagar separados del estado fiscal |
| Pagos y comprobantes (16,17) | No hay libro de abonos/saldos ni conciliación | Registro de abonos y aplicaciones, saldo por cliente/documento, recibo interno diferenciado del comprobante fiscal; conexión de cobro separada |
| Emisor y documento (28,29) | Perfil del profesional; sin configuración fiscal completa | Identidad fiscal autorizada, sucursal/terminal/consecutivos, moneda, condiciones y presentación privada por emisor |
| Actividades (30) | Categoría profesional de ContrataCR | Actividades económicas fiscales consultadas/validadas; no deducirlas de la categoría de servicios |
| Cuenta, equipo y perfiles (31–33) | Cuenta/autenticación existentes; no roles de negocio completos | Dueño, asistente y contador con permisos mínimos y auditoría. Admin global no sustituye al equipo del negocio |
| NC/ND, correcciones y tiquete→factura (operaciones secundarias) | No hay correcciones fiscales activas | Referencias verificables y proceso autorizado; no editar/borrar un emitido para simular corrección |
| Recurrencia y adjuntos (fuente pública/observación) | Sin facturación recurrente ni adjuntos fiscales completos | Plantillas/programación, previsualización, pausa y prevención de duplicados; adjuntos privados. No activar envíos automáticos en esta etapa |
| Inicio/reportes y Q-Declaro (accesos observados) | No hay resumen financiero integral | Resumen de ventas, cobros, pendientes, gastos y materiales con métricas diferenciadas; Q-Declaro/contabilidad requieren análisis y alcance propios |

Q-Declaro se observó como acceso a otro producto: no se presupone que toda su contabilidad o declaraciones esté incluida en GTI o lista para copiar. Campos especializados observados —exoneraciones, exportación, medicamentos, otros cargos/impuestos, VIN/series y receptores institucionales— entran en el catálogo de escenarios fiscales, pero se muestran solo cuando correspondan. Falta validar los escenarios y condiciones aplicables al negocio concreto.

## Hallazgos del código actual

- `src/lib/pro/business.ts` y los catálogos normalizados conservan cliente/producto/trabajo y sus vínculos. No se debe volver al JSON completo para agregar finanzas.
- `src/components/pro/client-history.tsx` ofrece historial paginado de citas/cotizaciones. No contiene facturas ni abonos: ampliar ese mismo historial cuando existan esas entidades.
- `src/app/api/pro/quote-link/route.ts` valida dueño y cliente activo; una cotización ya asociada a otro cliente devuelve conflicto. Es una protección que debe conservarse.
- `src/lib/pro/reservations.ts` vincula la reserva a una cuenta y genera un ID de cliente propio del profesional. Un cliente importado y una reserva podrían representar a la misma persona con IDs distintos; hace falta conciliación explícita, no fusionar por nombre/teléfono.
- `src/lib/pro/catalog-import.ts` usa plantilla propia, hasta 500 registros/2 MB, validación y rechazo de duplicados. No importa arbitrariamente una exportación GTI ni actualiza clientes existentes por coincidencia.
- `src/lib/quotes.ts` usa IVA general de 13% y redondeo a colones enteros; `quote-editor-modal.tsx` también transforma precios con 1,13. Es un modelo comercial limitado, no un motor fiscal de tarifas/exoneraciones/decimales. Crear un núcleo monetario fiscal versionado antes de convertir documentos; conservar importes originales y explicitar diferencias.
- Las líneas actuales de cotización contienen descripción/cantidad/precio, sin referencia persistente al producto. Seleccionar desde inventario copia datos, pero no da trazabilidad suficiente para consumir materiales o volver a facturar por SKU. Se necesitan vínculos de línea y snapshots.
- `src/lib/pro/billing/contracts.ts` declara tipos de proveedor fiscal y verificación de pago de suscripción; no hay adaptador GTI activo ni integración de cobro completa. El contrato fiscal mínimo actual no cubre archivos, notas, idempotencia y resultados detallados.
- Cobrar la suscripción Pro a un profesional y gestionar lo que ese profesional cobra a sus clientes son dominios distintos. No usar una transacción Tilopay de suscripción como pago de una factura del negocio.

## Una ficha de cliente para todo

Flujo propuesto:

Cliente → Cotización → Cita/trabajo → Materiales utilizados → Borrador de factura → Emisión confirmada → Abonos/saldo → Historial.

También se permite factura directa sin cita ni cotización, anticipo antes de factura y gasto de un proveedor. No forzar a todos a recorrer todos los pasos.

La ficha tendrá Información e Historial; cuando existan finanzas, Documentos y Saldo. Acciones contextuales: Cotizar, Agendar, Preparar factura y Registrar abono. Mostrar solo acciones habilitadas de verdad. Desde cualquier documento se vuelve a la misma ficha con filtros/ruta conservados.

### Asociar clientela sin duplicar ni exponer información

- Crear/importar un cliente una vez dentro del negocio. Mantener su ID estable en citas, cotizaciones, facturas, pagos y archivos.
- Separar el cliente privado del negocio de una cuenta de ContrataCR. Una persona puede ser cliente de varios profesionales sin que estos compartan sus notas, historial ni saldo.
- Proponer asociaciones mediante identificación normalizada (incluyendo tipo/país) u otros datos verificados; resolver ambigüedades con el usuario. Un nombre igual, teléfono familiar o correo compartido no basta para fusionar.
- La asociación a una cuenta debe verificar que corresponde a esa persona y qué puede ver. No implica importar su agenda privada ni la de otro profesional; tampoco enviar una invitación real sin autorización.
- Conservar una tabla de equivalencias por origen/ID externo para GTI y otros sistemas. Reimportar debe ser idempotente; no crear copias por cada archivo.
- La combinación de clientes requiere vista previa de vínculos, registro de quién decidió y recuperación. No borrar historial ni sustituir receptores de documentos emitidos.
- Documento emitido conserva snapshot del receptor y líneas: corregir después el teléfono/nombre del cliente no modifica facturas históricas.
- En una cotización se puede crear un cliente mínimo allí mismo, con acción explícita Guardar cliente; completar datos fiscales solo al preparar un documento que los requiera. Cambios de contacto en un borrador no deben sobrescribir silenciosamente la ficha.

## Experiencia simple sobre un sistema completo

Menú: Agenda, Clientes, Cotizaciones, Inventario, Facturación y Gastos. Resumen operativo en Mi panel. Cobros/saldos dentro de cliente/documento y resumen financiero; configuración y equipo fuera de la operación diaria. No crear una pantalla por cada opción de GTI.

Facturación agrupa emitidos, borradores y recibidos, con búsqueda y estado/período; el filtro avanzado abre solo cuando hace falta. Un editor adapta campos por documento. Crear cliente exige pocos datos; facturar pide solamente los datos pendientes de ese receptor/tipo. Campos especializados agrupados y plegados, con errores visibles antes de emitir.

Separar claramente Guardar borrador, Emitir, Registrar pago y Corregir documento. Preparar factura desde cotización reutiliza cliente y líneas, muestra faltantes y exige confirmación de emisión. Nunca convertir aceptación de presupuesto en factura emitida o pago confirmado.

## Modelo y reglas que permiten integrar todo

Entidades propuestas, relacionales y con dueño/negocio verificado: emisores/configuración, perfiles fiscales del cliente, borradores/documentos y líneas, vínculos de origen por línea, intentos y eventos del proveedor, archivos, pagos y aplicaciones, gastos/proveedores, consumos/reservas de materiales, equivalencias de importación y auditoría. Mantener IDs actuales. El acceso hoy se basa en dueño: introducir equipo/negocio compartido exigirá un diseño de permisos y migración propios, no cambiar silenciosamente el tenant actual.

Reglas de aceptación:

1. Un emisor no accede a documentos o credenciales de otro; cada profesional emite bajo su propia autorización. No usar el emisor de ContrataCR/SG Solutions para todos.
2. Estado fiscal (pendiente/aceptado/rechazado), comercial y de pago son independientes. El archivo de respuesta respalda el estado fiscal.
3. Emisión/reintento usa clave idempotente y consulta tras timeout antes de emitir otra vez. Cola durable y seguimiento del proveedor; acuse técnico no es aceptación final.
4. Abonos admiten aplicaciones a varias facturas, anticipos sin aplicar, reversos auditados y monedas separadas. Saldo nace de movimientos y aplicaciones, no de un campo editable sin trazabilidad.
5. Uso de materiales y reserva de existencias son eventos distintos. Una política explícita determina cuándo descontar. Facturar un trabajo que ya consumió materiales no vuelve a descontarlos; archivar o rechazar una cotización no mueve stock por sí solo.
6. Facturación parcial y notas requieren cantidades/importes ya aplicados por línea. Bloquear doble facturación y doble aplicación de pagos mediante transacciones y restricciones en base.
7. Importar históricos no emite, cobra ni descuenta existencias. Conservar clave, origen y archivos; no regenerar consecutivos del proveedor anterior.
8. Dinero y redondeos se calculan con representación decimal controlada y reglas por moneda/esquema. No reescribir cotizaciones aceptadas al actualizar reglas fiscales.
9. Secretos y archivos fiscales privados en servidor, por entorno/emisor, con acceso/auditoría y rotación. No guardarlos en frontend ni usar cookies de GTI como integración.

## Orden de construcción

| Etapa | Entrega concreta | Prueba de salida |
|---|---|---|
| 1. Cliente como centro | Crear/seleccionar desde cada operación, conciliación reserva/importación y origen por línea de producto | Un cliente importado luego reserva/cotiza sin duplicarse; cero cruces entre negocios; datos anteriores intactos |
| 2. Operación y dinero interno | Trabajo/materiales y registro explícito de abonos/anticipos, historial y saldos | Movimientos atómicos, reversos y reintentos sin duplicar stock ni abonos; cotización aceptada no figura como cobrada |
| 3. Borrador fiscal | Emisor, receptor, líneas, impuestos/descuentos/moneda, referencias y editor común | Casos y redondeos acordados con especialista; documentos de prueba claramente sin emitir; originales conservados |
| 4. GTI sandbox | Adaptador confirmado, alta de emisor, emisión/consulta/archivos y correcciones | Aceptación, rechazo, timeout/reintento, notas y aislamiento probados en sandbox, con evidencia del proveedor |
| 5. Gastos y recepción | Proveedor, documento recibido, decisión fiscal y cuentas por pagar | Importación/revisión sin duplicados; pago y decisión fiscal no se confunden |
| 6. Cobertura ampliada | Recurrencia, factura rápida/POS, combos, equipo y reportes | Pruebas específicas de inventario, permisos, programación y conciliación, sin repetir emisiones ni alterar históricos |

Las etapas se construyen por entregas utilizables, manteniendo Pro local. La confirmación de GTI puede investigarse en paralelo; no bloquea clientes, stock y dinero interno, pero sí impide presentar emisión fiscal como terminada. No se inventan plazos o tarifas de integración sin conocer contrato y especificación.

## Información externa pendiente, sin mensajes enviados

La consulta preparada en el inventario anterior sigue sin enviarse. Falta confirmar: API/producto contratado, modelo multiemisor/plataforma, alta individual de emisores, sandbox, documentación vigente, autenticación, cobertura de tipos/recepción/notas/archivos, límites, callbacks/consulta, costos, soporte y condiciones de distribución/exportación de datos. No se pide pegar llaves o contraseñas en el chat.

## Verificación de esta ronda

Solo análisis y documentación. Se revisaron contratos/tipos y puntos de vínculo reales y se revalidaron fuentes públicas; no se ejecutan E2E ni simulador por escribir este documento. Las pruebas previas se citan en sus documentos y no certifican fiscalidad. No se importaron datos de GTI, emitieron comprobantes, registraron pagos ni migraron bases. Revisar coherencia, enlaces locales y git diff --check. Pro continúa local y sin push.
