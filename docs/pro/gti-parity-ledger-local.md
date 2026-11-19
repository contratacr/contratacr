# GTI → Pro: registro de equivalencia funcional

Actualización: 28 octubre 2026. Solo `/Users/contratacr/Desktop/contratacr/contratacr-pro`, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. No hay push, despliegue, emisión, envío, cobro ni modificaciones de registros GTI. Este registro actualiza el estado de implementación; los informes anteriores conservan evidencia histórica, no el estado actual ni autorización de publicación.

## Prioridad actual — 31 octubre 2026

El usuario aprobó una licencia Pro centrada en tareas habituales y capacidades avanzadas según necesidad, con **Ventas y cobros** como entrada común. Esta matriz conserva el inventario de GTI y sus brechas; no obliga a incluir todos los módulos para el lanzamiento inicial. Se aplica el [plan vigente](autonomous-pro-plan.md) y la [comparación de proveedores para Costa Rica](costa-rica-billing-comparison-local.md). La emisión fiscal sigue requiriendo su validación completa para el caso aplicable.

## Alcance y evidencia

Objetivo autorizado: cubrir las capacidades de GTI dentro del diseño y operación integrada de ContrataCR Pro. La equivalencia se comprueba por recorridos y resultados, no por reproducir botones. No se declara terminada mientras falten módulos, dependencias fiscales o validación.

- **G23:** inspección histórica del 23 octubre, documentada en [inventario](gti-inventory-and-rollout.md). Incluye 33 accesos y formularios secundarios; no demuestra contratación de todos ellos.
- **G27:** sesión Safari autorizada del 27 octubre. Menú completo visible. La primera navegación mostró sesión expirada; el usuario inició sesión y se comprobó navegación real a Inicio, Configurar Documento (ambas pestañas), Descuentos (lista y formulario nuevo vacío, cerrado sin guardar), Combos (lista y formulario nuevo vacío, sin guardar), Comprobantes de Pago, Migrar Documentos, Aceptación de Documentos y Administración de Gastos; también Perfiles y su árbol de permisos (solo expandir, salir con Regresar). No se ejecutaron acciones fiscales, cargas ni guardados. No se copian datos personales o importes de la cuenta.
- **P27:** revisión del código y SQL local actual, contrastada por dos agentes independientes de producto/confiabilidad. Revisión de código no equivale a nueva prueba funcional.
- **WEB:** [servicio oficial GTI](https://www.facturaelectronica.cr/NuestroServicio), revisado el 27 octubre: emisión, recepción, reportes, archivo, catálogos, guardado preliminar, recurrencia y personalización. El [índice SOAP publicado](https://www.facturaelectronica.cr/ServicioCargaFactura/) existe; el WSDL devolvió error 500 en esta consulta. No se invocó ninguna operación ni se comprobó la licencia de integración.

Estados: **parcial** significa que existe una parte útil, sin equivalencia completa; **pendiente** significa que no se encontró implementación funcional Pro; **externo** identifica una dependencia que las pruebas locales no resuelven. Ninguna fila fiscal está certificada.

## Cobertura de los 33 accesos observados

| # | Acceso GTI | Estado Pro al 28 octubre | Criterio de cierre pendiente |
|---|---|---|---|
| 1 | Factura electrónica | Parcial: borradores directos o desde trabajo/cotización; emisor/receptor, líneas, IVA/exoneración y algunos impuestos/cargos | Tipos, moneda, referencias, reglas completas, validación de esquema, emisión/consulta/archivos en sandbox; dependencia externa |
| 2 | Tiquete electrónico | Pendiente | Receptor opcional según regla aplicable, cálculo/documento específico y posterior conversión referenciada validada |
| 3 | Factura de compra | Pendiente | Roles emisor/proveedor, campos y validaciones específicas; no reutilizar factura de venta cambiando etiqueta |
| 4 | Factura de exportación | Pendiente | Receptor extranjero, condiciones/campos específicos, moneda y esquema; sandbox |
| 5 | Proforma | Parcial: cotizaciones con versiones e integración de cliente/trabajo | Verificar campos, estados, impresión y conversión reutilizable; siempre identificada como provisional |
| 6 | Factura rápida | Parcial: creación directa con cliente/productos/servicios y valores predeterminados locales | Defaults y recorrido local aprobados; completar campos fiscales pendientes |
| 7 | Punto de venta | Pendiente | Venta rápida, pagos/desglose, formato y operaciones fiscales; preservar inventario de forma atómica |
| 8 | Documentos emitidos | Pendiente: listado actual contiene borradores | Archivo por estados reales, notas NC/ND y referencias, búsqueda avanzada, PDF/XML/respuesta privada |
| 9 | Documentos preliminares | Parcial: búsqueda/páginas, crear/editar, duplicado, archivo/restauración e impresión provisional implementados localmente | Validado localmente; historial completo, archivos y estados fiscales siguen pendientes |
| 10 | Documentos proforma | Parcial: cotizaciones | Comparar listado, filtros, versiones y reutilización de proformas sin duplicar cotización aceptada |
| 11 | Descargar documentos | Pendiente | Descarga privada individual/lote por período, archivos reales, trazabilidad y límites |
| 12 | Migrar documentos | Pendiente | Importación histórica idempotente con vista previa y errores; conservar origen/clave/archivos, nunca reemitir |
| 13 | Aceptación documentos | Pendiente | Bandeja recibidos, estados separados, aceptar/parcial/rechazar con acción explícita y prueba sandbox |
| 14 | Administrar gastos | Parcial: proveedores, gastos internos CRC, vencimiento, pagos parciales/reversos implementados localmente | Validado localmente; documentos fiscales, impuestos y adjuntos privados siguen pendientes |
| 15 | Migrar aceptaciones | Pendiente | Importar mensajes de receptor con vínculo/identidad, deduplicación y evidencia de origen |
| 16 | Administrar pagos | Parcial: aplicaciones a borradores, fecha recibida/medio/referencia, abonos parciales compartidos con trabajo y reutilizables, quitar aplicación sin borrar dinero y reversos vivos; consulta unificada paginada con búsqueda, filtros por estado/período/sin fecha efectiva, sumas y CSV; corrección auditada de fecha/medio/referencia | Pendiente conciliación/caja, documentos emitidos y monedas. Evidencia local: `invoice-payments-local.md`, `payment-overview-local.md` y `payment-metadata-local.md`; no emisión ni cobro real |
| 17 | Comprobantes pago | Parcial: recibos internos de abonos existentes, copia inmutable, búsqueda/paginación, reversos vigentes e impresión privada | Falta recibo electrónico fiscal y aplicaciones a documentos emitidos; aplicaciones internas a borradores en `invoice-payments-local.md`. No confundir la copia interna con emisión fiscal. Evidencia: `payment-receipts-local.md` |
| 18 | Clientes mantenimiento | Parcial: catálogo normalizado, ficha e historial integrado, datos fiscales; consulta explícita de nombre/tipo de identificación en ficha fiscal y receptor del borrador (28 octubre) | Múltiples correos, referencias adicionales y territorio oficial codificado; completar comparación campo a campo. La consulta no verifica titularidad ni situación tributaria |
| 19 | Cargar clientes | Parcial: CSV propio con vista previa/validación | Mapeo explícito de plantilla GTI, duplicados e idempotencia sin sobrescribir datos silenciosamente |
| 20 | Grupos | Parcial: mantenimiento/adopción, aliases y archivo de grupos reutilizables implementados localmente | Validado localmente; asignaciones históricas preservadas |
| 21 | Reporte clientes | Parcial: CSV propio | Campos/filtros comparados, alcance completo paginado y exportación privada consistente |
| 22 | Productos mantenimiento | Parcial: catálogo/stock/movimientos, unidad/CABYS manuales | Servicio sin stock validado localmente; pendientes códigos extra, medicamentos/registro, unidad comercial, arancel; catálogos versionados |
| 23 | Descuentos | Parcial: un descuento comercial por línea y catálogo reutilizable monto/porcentaje implementado localmente | Validado localmente; códigos fiscales y descuentos múltiples ordenados siguen pendientes |
| 24 | Cargar productos | Parcial: CSV propio | Mapeo de plantilla y servicios, códigos/impuestos, stock explícito separado de cantidad predeterminada |
| 25 | Reporte productos | Parcial: CSV y movimientos | Alcance/filtros/costos y servicios comparados, exportación consistente sin descargas globales para pantalla |
| 26 | Categorías | Parcial: mantenimiento/adopción, aliases y archivo de categorías implementados localmente | Validado localmente; referencias históricas preservadas |
| 27 | Combos | Pendiente | Composición de hasta 20 productos observada en GTI; snapshot, precio/descuento, desglose fiscal y movimientos atómicos |
| 28 | Información cuenta | Parcial: configuración fiscal privada de un emisor por dueño | Negocio/emisores, configuración comercial y credenciales segregadas; no replicar controles del plan GTI como funciones comerciales propias |
| 29 | Configurar documento | Parcial: preparación y defaults de condición/plazo/medio/fecha CR/notas implementados localmente | Validado localmente; moneda/decimales, sucursal/terminal/series siguen pendientes |
| 30 | Actividad económica | Parcial: código ingresado | Consulta/versionado oficial y múltiples actividades según emisor/receptor; no derivarlas de categoría ContrataCR |
| 31 | Mi información usuario | Parcial: cuenta general existente | Comparar preferencias y acciones; verificar privacidad y autenticación sin cambiar credenciales en esta auditoría |
| 32 | Mantenimiento usuario | Pendiente en negocio Pro | Invitación/membresía/archivo de colaboradores, auditoría y acceso por negocio; nada de rol admin global |
| 33 | Perfiles | Pendiente en negocio Pro | Matriz de permisos por recurso/acción, RLS y revocación probadas con usuarios distintos |

## Funciones transversales que no pueden perderse entre las filas

1. **Fiscalidad completa:** notas de crédito/débito con documento de referencia, estados comercial/fiscal/pago independientes, contingencia e idempotencia. Los borradores actuales tienen restricciones `status='draft'` y `currency='CRC'`; no son un motor de emisión. Evidencia: `docs/pro/sql/invoice-drafts-local.sql`, `src/lib/pro/invoice-drafts.ts`.
2. **Líneas:** productos/servicios, CABYS, unidades, múltiples códigos/descuentos, medicamentos/VIN/otros datos cuando correspondan. IVA/exoneraciones y especiales 02/03/04/05/06/12 más cargos tienen incrementos locales documentados; faltan casos como fábrica/combos, IVA/factores específicos y otros supuestos. Tarifas especiales manuales no prueban elegibilidad ni tarifa vigente.
3. **Pagos:** `pro_client_entries` conserva acuerdos/abonos/materiales y reversos por trabajo. La extensión `invoice-payments-local.sql` permite aplicaciones internas parciales/reutilizables a borradores, fecha recibida/medio/referencia e historial de quitar aplicaciones; no equivale a caja, conciliación, aplicaciones a emitidos o recibos fiscales. Un borrador no genera una segunda cuenta por cobrar ni descuenta inventario.
4. **Reportes/resumen:** ingresos emitidos, cobrado, estimado y gastos son magnitudes distintas; períodos/monedas y fechas efectivas deben quedar claros. La ficha de cliente conecta todo sin descargar arrays globales.
5. **Archivo/adjuntos:** XML/PDF/respuestas privados, autorización por dueño/negocio, enlaces temporales, tamaño/tipo y análisis seguro de XML/ZIP. No reutilizar adjuntos públicos o credenciales legibles por el cliente.
6. **Recurrencia:** anunciada en WEB; no se comprobó su configuración en esta cuenta. Implementadas localmente plantillas pausables y copias explícitas por fecha con ocurrencia única; validación integrada en curso. Excepciones/calendario completo y cualquier automatización siguen pendientes; sin emisión/envío automáticos.
7. **Notificaciones y correo:** anunciados/visibles, pero ningún envío está autorizado en este trabajo. Su implementación requiere bandeja de eventos, preferencias, reintentos e idempotencia con pruebas simuladas.
8. **QDECLARO CONTABLE:** acceso observado, alcance/contratación y formularios no auditados. No se considera cubierto por poner un enlace ni se promete declaración tributaria implementada.
9. **Configuración específica del proveedor:** saldo/plan, cargo del plan, certificado y cambio de cuenta requieren distinguir suscripción ContrataCR, identidad fiscal de cada profesional y contrato GTI. No asumir que una cuenta sirve para emitir por todos.

## Nuevos detalles comprobados en G27

- Configurar Documento: pestañas Diseño e Información por defecto. Plantilla/formato, colores, imagen de actividad y configuración por medio de facturación; valores por defecto de moneda, medio de pago, decimales, impuesto de renta, condición de venta, registro fiscal de bebidas Ley 8707 y notas. No se activaron ni guardaron opciones.
- Descuentos: lista con editar/eliminar; formulario con tipo, naturaleza y elección porcentaje/monto. Se abrió vacío y se cerró sin guardar. Las tarifas/opciones internas del selector no se enumeraron.
- Nuevo combo: CABYS, código/códigos extra, categoría opcional, unidad/comercial, cantidad/precio, descuento, descripción y agregar/eliminar componentes (máximo 20). No se agregó ni guardó nada.
- Comprobantes de Pago: nombre/cédula receptor, consecutivo, comprobante, transacción, moneda, período y opción PDF punto de venta. No había filas para el período mostrado; acciones de filas no comprobadas.
- Migrar Documentos: carga ZIP de comprobantes de otro proveedor entregados a Hacienda; resumen de estado/carga/consecutivo/clave/mensaje/referencia. No se cargaron archivos; requisitos internos, límites y casos de error no comprobados.
- Aceptación: filtros por emisor, documento, usuario, tipo, bandeja, estado Hacienda, aceptación, moneda y fechas; pantalla/reporte, aceptar/parcial/rechazar y cargar. Se leyó un aviso sobre tratamiento automático por plazo; es texto del producto, **no una regla jurídica verificada ni autorización para automatizar decisiones en Pro**. No se pulsó ninguna decisión ni carga.

- Administración de Gastos: filtros por consecutivo de aceptación/documento, identificación/nombre del emisor, tipo/estado de documento y período de aceptación. No se registraron ni pagaron gastos; acciones de resultados no comprobadas en esta ronda.
- Perfiles: se observaron perfiles administrativos/contables/facturación y árbol de permisos por empresa, seguridad, clientes, productos y facturación. Acciones separadas: guardar/imprimir/emitir por tipo, NC/ND/anular/reporte, facturar/eliminar preliminares/proformas, aceptar/parcial/rechazar/cargar/consultar, cancelar facturas/reversar pagos de gastos/visto bueno. Se expandieron ramas y se salió con Regresar; no se tocaron casillas ni Guardar. Pro necesita permisos por acción, no un único indicador de acceso al módulo.

## Orden de ejecución y pruebas

| Bloque | Entregable | Condición para cerrar |
|---|---|---|
| A | Catálogo común de productos/servicios y valores predeterminados | Datos actuales conservados; servicio sin stock; reutilización en factura/cotización; pruebas de consumidores y simulador |
| B | Documento completo de borrador: tipos, monedas, referencias, descuentos/cargos/impuestos restantes | Modelo decimal por moneda, snapshots/versiones; SQL aislado, RLS/CAS y cálculos; revisión fiscal de reglas antes del sandbox |
| C | Gestión documental: duplicado/archivo/restauración, impresión provisional, importación histórica y reportes | No duplicar deuda/emisión, no sobrescribir originales, archivos privados y paginación consistente |
| D | Pagos por documento y gastos/proveedores | Ledger/aplicaciones/reversos atómicos, sin mezclar deuda de trabajo y factura; fechas/moneda y recibos claros |
| E | Combos, equipo/perfiles y recurrencia | Stock atómico, aislamiento multiusuario/RLS, auditoría y generación idempotente de borradores |
| F | Adaptador fiscal y recepción | Contrato API/multiemisor, sandbox y autorización por emisor, secretos del servidor, XML/XSD, cola/reintentos/consulta, aceptación/rechazo, NC/ND y archivos probados |

No son bloques de una sola modificación ni estimaciones de duración. Cada incremento requiere criterio de aceptación, propietario de archivos y revisión independiente. SQL/permisos/dinero exigen cobertura más amplia; reutilizar evidencia previa donde las dependencias no cambien. Cambios locales no equivalen a publicación ni aptitud de cobro del producto.

### Dependencias externas concretas

La equivalencia funcional no obliga a usar GTI como proveedor: el núcleo de Pro conserva sus propios datos y diseño. Si se elige GTI para procesar comprobantes, su interfaz y el índice SOAP no conceden licencia ni sandbox. Falta confirmar API fiscal multiemisor, contrato/costos/límites, documentación vigente y pruebas por emisor. Una alternativa de integración también necesita autorización fiscal individual, credenciales por entorno y validación en sandbox; no se ha seleccionado ni habilitado aquí. No se extraen cookies/contraseñas del navegador ni se envía la consulta comercial preparada sin autorización. La revisión jurídica/tributaria debe usar fuentes primarias vigentes; los textos de GTI no sustituyen esa revisión.

### Preservación y validación de esta revisión

La inspección se amplió al primer incremento de catálogo de servicios, detallado con selección de pruebas y evidencia en [productos y servicios](catalog-services-local.md). Extensión SQL aditiva aplicada únicamente al Supabase de loopback, sin reclasificar registros antiguos. La evidencia previa de [selectivo y bebidas](invoice-selective-beverages-local.md) sigue limitada a ese incremento; no demuestra paridad del resto. No hay emisión fiscal ni cambios en GTI.

Los seis incrementos nuevos y su aceptación se siguen en [ejecución local](gti-recommendations-execution-local.md). Implementado no significa validado ni paridad completa.
