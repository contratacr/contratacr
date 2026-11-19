# GTI → ContrataCR Pro: inventario y ejecución

> Estado actualizado al 27 octubre 2026: consultar [registro de equivalencia GTI → Pro](gti-parity-ledger-local.md). Este documento conserva evidencia histórica; sus pendientes o autorizaciones de despliegue antiguas no sustituyen el estado actual ni la restricción vigente de trabajar solo en Pro, sin push.

Revisión: 23 de octubre de 2026. Fuente principal: sesión que Isaac tenía abierta en Safari, navegación de lectura. No se emitieron documentos, guardaron clientes/productos, modificaron credenciales ni exportaron clientes de SG Solutions. Este documento no incluye sus datos privados.

## Alcance confirmado y límites

Se enumeraron todos los accesos del menú visible y las guías, y se inspeccionaron los formularios de factura, clientes y productos, la búsqueda de documentos emitidos y la administración de pagos y gastos. No se ejecutó cada operación fiscal ni se comprobó cada permiso del plan. Una opción visible no demuestra que una API permita integrarla ni que esté incluida en este contrato.

## Inventario completo del menú observado

| # | Módulo | Función visible | Destino en ContrataCR / dependencia |
|---|---|---|---|
| 1 | Facturación | Factura electrónica | Facturación; integración fiscal por emisor |
| 2 | Facturación | Tiquete electrónico | Facturación; integración fiscal |
| 3 | Facturación | Factura electrónica de compra | Facturación; integración fiscal y revisión tributaria |
| 4 | Facturación | Factura electrónica de exportación | Facturación; integración fiscal y campos específicos |
| 5 | Facturación | Proforma electrónica, comprobante provisional | Cotizaciones; no convertir su PDF en comprobante fiscal |
| 6 | Facturación | Factura rápida | Acción sobre cliente/productos guardados, después del motor fiscal |
| 7 | Facturación | Punto de venta | Recorrido simplificado; posterior a emisión y pagos estables |
| 8 | Documentos | Emitidos | Listado con estados reales, PDF/XML y correcciones |
| 9 | Documentos | Preliminares | Borradores recuperables, sin envío a Hacienda |
| 10 | Documentos | Proformas | Cotizaciones y versiones |
| 11 | Documentos | Descarga de documentos | Descargas por propietario/período; archivos reales del proveedor |
| 12 | Documentos | Migrar documentos | Importar sin reemitir, conservar origen y verificar XML |
| 13 | Aceptación | Aceptación de documentos | Bandeja de recibidos y decisión fiscal explícita |
| 14 | Aceptación | Administrar gastos | Gastos y saldos por pagar; fiscalidad separada del registro interno |
| 15 | Aceptación | Migrar aceptaciones | Historial verificable de mensajes de receptor |
| 16 | Pagos | Administrar pagos | Cuentas por cobrar, abonos y saldo; sin confundir registro con cobro real |
| 17 | Pagos | Comprobantes de pago | Recibos internos diferenciados del recibo electrónico fiscal |
| 18 | Clientes | Mantenimiento | Clientes existente, ficha ampliada en esta ronda |
| 19 | Clientes | Cargar clientes | Importación CSV propia, previa revisión; no se afirma compatibilidad directa con plantilla GTI |
| 20 | Clientes | Grupos | Grupo guardado y buscable en esta ronda; no hay mantenimiento independiente de grupos |
| 21 | Clientes | Reporte de clientes | Exportación de vista CSV ampliada |
| 22 | Productos | Mantenimiento | Inventario existente, ficha ampliada |
| 23 | Productos | Descuentos | Pendiente; requiere modelo por línea sin alterar cotizaciones aceptadas |
| 24 | Productos | Cargar productos | Importación CSV propia, previa revisión |
| 25 | Productos | Reporte de productos | CSV ampliado y movimientos de inventario existentes |
| 26 | Productos | Categorías | Categoría guardada y buscable; mantenimiento independiente pendiente |
| 27 | Productos | Combos | Pendiente; composición y consumo atómico del inventario |
| 28 | Configuración | Información de la cuenta | Datos fiscales privados por profesional/emisor |
| 29 | Configuración | Configurar documento | Numeración, sucursal/terminal, diseño del emisor y condiciones |
| 30 | Configuración | Actividad económica | Consulta y validación oficial; no asumir por categoría ContrataCR |
| 31 | Configuración | Mi información de usuario | Cuenta y seguridad existentes |
| 32 | Configuración | Mantenimiento de usuario | Equipo/delegación por negocio, pendiente |
| 33 | Configuración | Perfiles | Permisos por negocio, no reutilizar rol admin global |

Adicionales visibles: inicio, guías paso a paso y acceso a **QDECLARO CONTABLE**. Este último se observó como acceso, no se auditó como módulo incluido ni se implementó una declaración de impuestos.

## Operaciones secundarias confirmadas

### Formulario de factura

- Emisor/razón social/nombre comercial, actividad económica.
- Moneda, tipo de cambio, condición de venta y vencimiento; campos opcionales.
- Receptor: tipo y número de identificación, búsqueda, nombre, correo, actividad, teléfono y dirección territorial; guardar cliente/limpiar campos.
- Líneas: código de producto y códigos adicionales, CABYS, código de medicamentos, unidad de medida/comercial, cantidad, precio, descripción, descuento, otros impuestos, IVA, total, combo, tipo de transacción y VIN/serie.
- Agregar/limpiar/editar/borrar líneas; pestaña otros cargos.
- Totales de venta, impuestos, descuentos, IVA devuelto, venta neta, cargos; medio de pago y desglose.
- Notas, adjunto, eliminar adjunto y datos adicionales por entidad.
- Guardar y emitir son acciones distintas.

### Documentos emitidos

- Filtros por nombre/identificación de receptor, fechas, tipo de documento y estado del documento/Hacienda.
- Tipos observados en selector: factura, nota de débito, nota de crédito, tiquete, compra, exportación y recibo electrónico de pago.
- Búsqueda avanzada: consecutivo, referencia, factura interna, medio de pago, condición de venta, moneda, total, actividad, sucursal, terminal y usuario.
- Mostrar en pantalla o descargar reporte; opción de PDF punto de venta.
- Guías de corrección: anular, NC/ND, anular documento de otro proveedor, aumentar/disminuir monto. Se leyeron los títulos de las guías, no se ejecutaron esos procesos.

### Clientes

- Identificación, nombre y apellidos separados opcionales, nombre comercial, correos, actividad económica, teléfono y ubicación detallada.
- Código interno, destinatario/área, copia de cortesía y proveedor de facturación.
- Lista: buscar por valor/tipo, nuevo, facturar, editar, eliminar y paginación. Existe eliminación masiva; **en ContrataCR se preserva historial y se archiva**, no se replica borrado irreversible por comodidad.
- Carga: archivo, cargar/vista previa, guardar y descargar plantilla.

### Productos

- CABYS con búsqueda, código y códigos adicionales, categoría, medicamento/registro sanitario.
- Unidad de medida/comercial, cantidad, precio, tarifa IVA y descripción.
- Opcionales observados: partida arancelaria y otros impuestos.
- Lista paginada, buscar por valor/tipo, agregar, editar y eliminar; guías de descuentos predeterminados.
- La cantidad predeterminada de una línea de GTI no se interpreta automáticamente como existencias reales. La importación Pro solicita stock explícitamente.

### Pagos y gastos

- Pagos: receptor, documento, tipo, moneda y período; búsqueda de documentos.
- Gastos: consecutivo de aceptación/documento, identificación/nombre del emisor, tipo, estado de pago y período de aceptación.
- Guías adicionales: reporte de pagos, aceptados y facturas de compra; consultar y rectificar estado de aceptados.

### Ayuda/configuración

En Información de la Cuenta también se observaron opciones de conversión de tiquete a factura, régimen agropecuario, cargo automático del plan, visto bueno de facturas aceptadas, reporte mensual y notificaciones de rechazos de recibidos/emitidos. Son opciones visibles; no se activaron ni se comprobó si todas requieren contratación adicional.

En el inicio se observaron resumen mensual de ingresos/compras, documentos emitidos/recibidos, mejores cinco clientes, saldo/vencimiento del plan, saldo de aceptaciones y cambio de cuenta. No se importaron las cifras ni los datos identificativos a este repositorio.


- Guías: acceso a terminal, actividad económica, contraseña, sucursales, logo, recuperación de contraseña, certificado/renovación, migración de otro proveedor, edición y reporte de usuarios.
- Casos fiscales enumerados en guías: alquiler comercial, EXONET, ley especial, zona franca, diplomáticos, descuento/cargos/impuestos, factura grupal, datos para grandes receptores, recrear documento, salud, tarifas cero/exenta/1% y tiquetes a no contribuyentes/extranjeros. No se afirma que esas tarifas sean correctas para un profesional concreto.

## Qué se implementó en esta ronda

- Identificación opcional con validación local de formato y almacenamiento sin separadores, nombre comercial, grupo y dirección en Clientes.
- Categoría, unidad y CABYS de 13 dígitos en Inventario. CABYS es una referencia ingresada, no consulta/certificación oficial.
- Campos secundarios plegados para mantener formularios simples; datos incluidos en detalle, búsqueda y exportación privada.
- Plantillas e importación CSV de clientes/productos con vista previa de 20, máximo 500 filas/2 MB, comillas y saltos de línea, errores por fila, rechazo de códigos/identificaciones duplicados y fórmulas. No sobrescribe existentes ni guarda parcialmente.
- Confirmación de importación usa la misma API de workspace, pertenencia Pro, revisión optimista y validación de transición existentes.
- No se copiaron registros del GTI de SG Solutions. Los datos de prueba son ficticios.

## Diseño acordado para los módulos restantes

Mantener la arquitectura de Mi panel. No crear otro panel paralelo ni un rol Pro que sustituya profesional: Pro es una capacidad del profesional; admin conserva MFA y acceso. Secciones propuestas: Agenda, Clientes, Cotizaciones, Inventario y, al habilitar fiscalidad, Facturación y Gastos. Pagos/saldos se consultan desde cada cliente/documento y un resumen; no saturar el menú con los 33 accesos de GTI.

De GTI se toman jerarquía emisor → receptor → líneas → totales, listas de documentos, fichas y acciones de guardar/emitir separadas. De ContrataCR se conservan logo aprobado, navy `#162543`, cian `#009FD9`, botones y modales compartidos, tarjetas blancas redondeadas y patrones de carga. Escritorio: columnas y tablas donde aportan; móvil: tarjetas y formulario sin desplazamiento horizontal. Campos especializados plegados. Sin copiar logotipo, imágenes ni recursos de GTI.

## Dependencias que impiden declarar fiscalidad completa

1. Confirmación contractual de **API de facturación electrónica** para la cuenta y uso de múltiples emisores. GTI Conectividad/cobros es otro servicio; no equivale a este permiso.
2. Documentación actual de integración, credenciales de sandbox, límites, webhooks/consulta y costos. No extraer cookies de Safari ni reutilizar contraseña de la interfaz como API.
3. Alta y autorización de cada emisor, llaves y credenciales cifradas por entorno, rotación y auditoría. El emisor de SG Solutions no puede emitir por todos los profesionales de ContrataCR.
4. XML/XSD vigente, CABYS, actividades, impuestos/exoneraciones, redondeos, moneda/tipo de cambio, consecutivos y referencias de notas validados con contador y sandbox.
5. Cola durable, idempotencia por emisor/documento, consulta/reintentos, conciliación, contingencia y almacenamiento privado XML/PDF/respuesta.
6. Un envío recibido por Hacienda no es aceptación final: HTTP 201 queda pendiente de validación.
7. Emisión, anulación y decisiones fiscales explícitas del usuario; una importación nunca vuelve a emitir un comprobante histórico.

## Despliegue a todos los ambientes

Isaac amplió el alcance a todos los ambientes en esta solicitud. La rama `local/pro-suite-no-push` sigue sin poder subirse como rama remota: la publicación requiere integrar cambios revisados en main/test y la base de mobile. No implica subir binarios a las tiendas.

**Estado inicial verificado:** origin/main y origin/test coinciden en `ed4a62e7` tras fetch; Pro está 11 commits por delante y conserva protecciones `NODE_ENV=development`. Las tablas Pro son borradores SQL aplicados únicamente a Supabase local. No existe adaptador fiscal GTI activo.

Antes de habilitar Pro remoto: convertir borradores a migraciones numeradas vigentes, probarlas en TEST, revisar límites/paginación del workspace JSON (los bloques de 20 actuales son de renderizado), aislar caché/secretos y pruebas por ambiente, y sustituir las restricciones de desarrollo por activación explícita y permisos de Pro. No se puede anunciar «publicado y funcional en todos los ambientes» mientras esto siga pendiente. La falta de API solo bloquea lo fiscal; no justifica fingir finalización de otros módulos.

## Fuentes públicas primarias

- GTI: [documentación del plugin oficial de integración WooCommerce](https://cdn.gticr.com/gticr/Documentos/Documentacion_Plugin.pdf). Confirma una integración específica; no demuestra una API general ni licencia multiemisor en esta cuenta.
- GTI: [leyes, reglamentos y estructuras](https://www.facturaelectronica.cr/LeyesyReglamentos).
- GTI: [Conectividad](https://www.gticr.com/Conectividad), servicio de cobros y conciliación, distinto de confirmar API fiscal.
- Hacienda: [API oficial de recepción](https://www.hacienda.go.cr/docs/ComprobantesElectronicosAPI.html), recepción asíncrona, firma y estados.
- Hacienda: [servicios de consulta](https://api.hacienda.go.cr/docs/).

## Resultado de revisar el acceso API de la cuenta abierta

Se revisaron Información de la Cuenta (información general y servicios adicionales) e Inicio. La pantalla muestra un plan prepago de documentos; no se encontró un indicador de integración API habilitada. No se abrió la pestaña de certificado ni se extrajeron credenciales. La ausencia de un indicador **no demuestra que la API esté excluida**.

La web oficial anuncia integración ERP, pero la tabla pública de planes no establece de forma suficiente el derecho de integrar una plataforma multiemisor. El manual de WooCommerce exige datos de cuenta proporcionados por GTI y algunas funciones requieren habilitación de soporte. Para tener certeza hace falta respuesta contractual/técnica de GTI: API fiscal, uso multiemisor, alta individual de profesionales, sandbox, endpoints/esquemas actuales, autenticación, límites, costos y condiciones de distribución. No se contrató ni se envió una consulta a terceros sin autorización para ese mensaje.

Consulta preparada, todavía no enviada:

> Queremos integrar ContrataCR, plataforma de servicios profesionales de Costa Rica, con la facturación electrónica de GTI. Cada profesional emitiría con su propia identificación y autorización, desde nuestra interfaz. ¿Qué producto/API y contrato permiten este modelo multiemisor? ¿El acceso puede usar planes prepago existentes o requiere otra contratación? Solicitamos documentación técnica vigente, sandbox, autenticación, estados/webhooks, límites y costos por emisor/documento. No necesitamos compartir credenciales ni emitir documentos reales durante esta consulta.

## Validación de esta ronda

- Suite Pro local completa, con campos nuevos y recarga real de Supabase: **57/57 aprobadas**, WebKit móvil, Chromium escritorio y Chromium móvil, sin omisiones. Última ronda completa: 7,0 minutos; log `/tmp/pro-gti-final.log`, artefactos `/tmp/pro-gti-final`.
- Después se corrigieron siete elecciones de idioma heredadas del editor de cotizaciones, moviendo sus textos a `messages/es.json` y `messages/en.json`. Regresión posterior de integración real, panel y cotizaciones: **9/9 aprobadas**, 6,4 minutos; log `/tmp/pro-gti-translation.log`.
- Importación: casos de CSV entrecomillado/multilínea, BOM/CRLF, identificación inválida/duplicada, código repetido, cantidades negativas, CABYS incorrecto, fórmulas, archivo mal formado y límites. El componente bloquea guardado parcial y confirma el lote. La persistencia real de los campos ampliados se comprobó en la API local; el recorrido de selección de archivo se verificó en el arnés del componente.
- TypeScript sin emisión, ESLint de Pro/editor/pruebas modificadas, presupuesto bilingüe, codificación UTF-8, archivos privados y `git diff --check`: aprobados.
- Inspección visual en simulador iPhone 17 Pro/iOS 26.5 con la sesión local admin/profesional. Evidencia: `/tmp/contratacr-pro-gti-cliente-iphone-final.png`.
- No equivale a la suite histórica completa de ContrataCR, validación de un proveedor fiscal ni prueba de un binario Android firmado.
- La revisión, implementación y pruebas continúan **locales**. No se pusheó, migró una base remota ni publicó en tiendas. TEST/producción/mobile siguen pendientes de preparación y despliegue de Pro.
- Isaac indicó **no enviar todavía** la consulta preparada a GTI; no se envió.
