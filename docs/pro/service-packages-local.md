# Plantillas y paquetes de servicios — Pro local

28 de octubre de 2026. Checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Todo el trabajo anterior conservado. Sin push, producción ni emisión fiscal.

## Uso

En Cotizaciones → **Plantillas y paquetes**, o Facturación → **Opciones de facturación** → **Plantillas y paquetes**, se guardan los servicios habituales del profesional. Una plantilla puede tener una línea o un paquete de varias. Nombre, descripciones, cantidades y precios son los campos principales; unidades, tipo, SKU, CABYS y nota de alcance quedan plegados. Se puede copiar del catálogo o escribir manualmente. No hay precios sugeridos de otros profesionales.

En una cotización nueva o en el detalle de un borrador de factura, **Usar plantilla o paquete** permite buscar, revisar las líneas y agregarlas mediante una acción explícita. La consulta se inicia al abrir el selector. Un fallo de red se puede reintentar; antes de aplicar se vuelve a comprobar la plantilla para detectar cambios o archivo. Las líneas existentes se conservan y las nuevas se agregan completas, nunca parcialmente al alcanzar un límite.

Las copias son independientes. Editar o archivar una plantilla no cambia cotizaciones, facturas, materiales ni pagos anteriores. Editar una línea del documento no cambia la plantilla. Guardar, seleccionar o aplicar paquetes no descuenta existencias, genera deuda ni emite documentos.

## Compatibilidad y límites

- Hasta 20 líneas por plantilla, descripciones de hasta 140 caracteres, cantidades positivas de hasta 9999 con dos decimales y precios en colones enteros antes de impuestos. Es el formato común de los editores actuales, para que una plantilla guardada pueda usarse en ambos destinos.
- Si un precio del catálogo tiene decimales, se muestra intacto para corregirlo explícitamente antes de guardar la plantilla; no se redondea ni se trunca a escondidas. La ficha del catálogo conserva sus datos originales.
- La cotización conserva su modo de IVA. Con IVA incluido, la vista previa muestra el precio base convertido al 13% y redondeado a colones enteros, igual que el catálogo de cotizaciones existente. Con más IVA o exento, copia el precio base. No se cambió el motor general de cotizaciones ni sus reglas de redondeo.
- La factura copia los datos comerciales y deja el impuesto por definir para revisarlo en el documento. No se copian exoneraciones de clientes, descuentos ni impuestos especiales a una plantilla comercial genérica. El detalle de factura mantiene su capacidad de editar decimales e impuestos después.
- Las referencias a inventario no se comparten entre la plantilla y el documento: el tipo, nombre, unidad, SKU y CABYS se copian como datos comerciales. Los materiales consumidos siguen su registro propio.
- La nota de alcance se muestra en la vista previa; no sobrescribe automáticamente las notas del documento ni su título o cliente.
- Cotizaciones admite hasta 20 líneas y facturas hasta 100. Si no cabe el paquete completo, se conserva el contenido del formulario y se solicita quitar líneas antes de volver a agregar.

## Persistencia y seguridad

`/api/pro/service-packages` usa `proApiAccess`, propietario de la sesión, verificación de origen en escrituras y respuestas privadas sin caché. Lectura de 20 plantillas por página con búsqueda y vista activa/archivada, consulta individual para comprobar vigencia y revisión para evitar mezclar páginas cambiadas.

SQL aditivo `sql/service-packages-local.sql`: tablas normalizadas de cabecera, líneas, revisión y solicitudes idempotentes. La revisión pertenece exclusivamente al catálogo de plantillas. Los reintentos exactos conservan ID de solicitud, ID de plantilla, revisión y cuerpo; se resuelven antes del control de concurrencia. Si el guardado no se pudo confirmar, se bloquean cambios y salida hasta reintentar la misma solicitud. Un conflicto confirmado conserva el formulario y exige actualizar antes de guardar.

RLS limita la lectura autenticada al propietario. Escrituras y funciones RPC están reservadas a `service_role` detrás del API validado. No hay reescritura del JSON del workspace ni conversión de documentos existentes. La instalación local incluye la nueva extensión después de sus dependencias; no se ejecutó el preparador completo sobre datos existentes.

## Selección de pruebas

Se modifican catálogo nuevo de plantillas, integración en editores Pro y carga del editor compartido de cotizaciones. Requiere prueba aislada de esquema/SQL, límites, permisos, idempotencia, CAS, páginas y reinstalación; E2E de ambos destinos y regresión de factura directa, detalle, recuperación del borrador de cotización y selectores. El recorrido de profesional sin Pro verifica que el editor compartido conserva su comportamiento.

El motor monetario/fiscal existente no cambió. Se reutiliza su evidencia compatible y se ejercitan las conversiones nuevas del paquete; no corresponde repetir todas las pruebas de impuestos, emisiones, tiendas o CI. Pruebas sobre loopback con cuentas desechables y comparación exacta de originales. La instalación del simulador apunta actualmente a la aplicación pública; las capturas de esta entrega contra el servidor local se identifican como navegador móvil.

## Evidencia

Prueba aislada `scripts/pro/verify-service-packages-db.mjs` aprobada: esquema común, copia independiente, neutralidad fiscal, límites y errores sin excepciones de validación, CAS, reintentos, páginas 20/20/5, búsqueda literal/localizada, aislamiento/RLS/permisos, conservación y reinstalación.

E2E final: **18/18 aprobados**, 3 del nuevo flujo y 15 de cinco consumidores existentes, en WebKit móvil y Chromium escritorio/móvil. Evidencia en `/tmp/pro-service-packages-final.log` y `/tmp/pro-service-package-consumers.log`. El test nuevo verificó búsqueda/páginas 20/2, propietario/origen/CAS, respuesta perdida después de guardar con reintento exacto sin duplicar, selector cerrado sin consultas, paquete completo frente al límite de líneas, formulario de cotización recuperado sin ningún POST de cotizaciones, copia editable a factura y archivo/restauración. Los consumidores comprobaron factura directa, detalle, recuperación del borrador de cotización, selectores y profesional sin Pro. Todas las cuentas desechables se limpiaron.

Capturas revisadas en `/tmp/pro-service-packages-final`, incluidas `package-quote-preview.png`, `package-invoice-preview.png`, `service-package-form.png` y `service-packages-english.png` de los tres perfiles. En la cotización ficticia la vista previa mostró precios 1130/226 con IVA incluido; en factura, los precios base 1000/200. Las copias originales se conservaron al editar la plantilla y al ajustar la cantidad del documento.

TypeScript, ESLint focal, UTF-8, presupuesto bilingüe y `git diff --check` aprobados. Los cuatro textos nuevos del editor compartido se incorporaron a `messages/es.json` y `messages/en.json`, sin aumentar presupuestos. La revisión independiente no encontró P1/P2. Los seis verificadores privados de conservación confirmaron igualdad exacta de documentos/revisiones, tablas normalizadas, borradores/líneas/materiales/detalles, configuración fiscal y pagos originales. Se conservan los registros previos de dos cuentas (11 trabajos, 10 cotizaciones heredadas, 50 disponibilidades, 46 clientes, 45 productos y 10 movimientos). No se hizo push ni se emitió ninguna factura real.
