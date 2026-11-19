# Datos del cliente para facturas — solo Pro local

Base y HEAD: `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`, rama `local/pro-suite-no-push`. Se conserva todo el trabajo local anterior. Sin push, emisión ni mensajes reales.

## Consulta de identificación — 28 octubre 2026

La consulta ya existía en la aplicación general y cotizaciones (`/api/cedula/[id]`). Se incorpora a los datos fiscales del cliente y al receptor del borrador mediante `FiscalIdentityLookup` en `InvoiceReceiverFields`. Botón explícito, resultado de nombre/tipo y botón «Usar nombre y tipo»; ninguna consulta se dispara por escribir, abrir un cliente o elegirlo en un borrador. El usuario guarda después usando el formulario existente.

Aplicar conserva identificación escrita, correo, teléfono, domicilio y actividad. El receptor de un borrador permanece independiente de la ficha fiscal. Cambiar identificación/tipo invalida y cancela la consulta; una respuesta tardía no puede aplicarse a otro número. Límite de espera 12 segundos, manejo separado de no encontrado/servicio caído/límite de consultas, entrada manual disponible y documentos extranjeros manuales. Nombre y tipo no acreditan identidad, representación legal, edad ni situación tributaria. No se añadieron consultas de actividades ni CABYS.

Se reutiliza el endpoint y su proveedor actual sin cambiar autenticación, caché, privilegios, RLS ni esquema. Revisión independiente de componente, consumidores y pruebas sin hallazgos P1/P2 concretos. Se fortaleció la prueba de respuesta tardía esperando que termine la respuesta antes de verificar que no reaparezca el botón de aplicación.

Validación local: `pro-client-fiscal.spec.ts` amplía los recorridos existentes con consulta explícita, vista previa sin guardar, aplicación, conservación de correo, no encontrado/503/429, formato incompleto, extranjero, cambio de identificación mientras espera, uso desde borrador y snapshots originales. Las respuestas externas están simuladas en el navegador; no se envían identificaciones ficticias o reales a Hacienda. Se seleccionaron también facturación, factura directa, pagos y el verificador de Hacienda existente como consumidores/compatibilidad, sin una suite global por cada retoque.

Revisión visual en Chromium móvil y WebKit móvil: resultado legible y sin desborde, aviso acortado y acción explícita. Simulador nativo visible, pero CUA devuelve `noWindowsAvailable` al primer toque: no se declara validación nativa de este incremento. Captura WebKit revisada: `/tmp/pro-identity-fiscal-reviewed/pro-client-fiscal-Pro-clie-9030b-immutable-invoice-snapshots-webkit-mobile/identity-lookup-preview.png`.

Resultados finales: `/tmp/pro-identity-payments-final` ejecutó 105 casos de las cinco specs en tres perfiles; 102 aprobaron y 3 de facturación fallaron porque su simulación de error seguía interceptando `invoice-drafts` cuando la lista ya usa `invoice-management`. Se corrigió únicamente la ruta interceptada, manteniendo las aserciones de error y reintento. Repetición focal de facturación y datos fiscales con la comprobación reforzada de respuesta tardía: `/tmp/pro-identity-fiscal-reviewed`, **6/6 PASS** en WebKit móvil, Chromium escritorio y móvil. Las otras tres specs conservaron su evidencia compatible aprobada. TypeScript, lint focal, UTF-8, presupuesto bilingüe y diff-check PASS. Seis helpers de conservación de datos originales (workspace, normalización, paneles, borradores/líneas/materiales, emisor y metadatos de pagos) PASS. Sin cambios de esquema/API, push ni emisión real.

## Alcance y decisiones previas a pruebas

Se reutilizan las observaciones autorizadas de GTI guardadas en `billing-gti-gap-review-local.md`: receptor con identificación tipada, actividad y domicilio separado. La página pública de GTI (https://www.facturaelectronica.cr/NuestroServicio, consulta 27 octubre 2026) confirma borradores recuperables; no establece el contrato de campos fiscales ni certifica esta implementación. No se declara paridad completa.

Nueva configuración relacional por dueño/cliente, independiente del contacto comercial y del JSON del workspace. Se inicia desde los datos ya existentes sin escribirlos ni inferir el tipo de documento. Se admiten razón social, identificación tipada, correo de facturas, teléfono, dirección/señas, actividad y provincia/cantón/distrito/barrio. El domicilio se captura como nombres manuales: los catálogos de búsqueda existentes son parciales y no constituyen códigos fiscales oficiales. Validación registral y catálogo oficial quedan pendientes.

Copias independientes por borrador. No se rellenan históricos automáticamente. Crear directo consulta configuración vigente en la misma transacción; crear desde origen conserva el receptor visible enviado explícitamente. Repetir una creación, actualizar el origen, modificar líneas o cambiar configuración no reemplaza el receptor guardado. La edición explícita del borrador conserva CAS y no cambia al cliente. Contacto comercial, CSV, inventario y saldos quedan intactos.

## Selección de pruebas

Nueva tabla/RLS/RPC y consumidores de clientes/borradores requieren ampliar contratos SQL (RLS, CAS, rollback, reintentos, compatibilidad, snapshots e invariancia) y recorridos de clientes/facturación en Chromium escritorio/móvil y WebKit móvil. Se reutiliza evidencia del motor monetario y demás secciones sin entradas modificadas; no se repite suite global. Se ejecutan lint y TypeScript de fuentes, UTF-8 y diff. Revisión independiente y simulador local con datos ficticios y retirada controlada de fixtures. No usar producción.

## Revisión y correcciones

La revisión independiente detectó dos problemas que se corrigieron: validar receptor antes del POST (revelar/enfocar actividad y permitir corregir sin recargar) y evitar que Escape cierre simultáneamente la ficha padre y el formulario fiscal. El modal padre deja de montarse mientras se editan datos fiscales; la ruta exacta se conserva. Los tests cubren cancelar y confirmar la salida con cambios.

La creación directa muestra un resumen fiscal obtenido por consulta individual. Descarta respuestas antiguas al cambiar cliente; carga fallida ofrece reintento y bloquea la creación sin receptor disponible. La copia definitiva se obtiene en la transacción de creación. Puede revisarse/editarse por borrador después de crear, sin modificar la configuración del cliente.

Compatibilidad: si no existe configuración fiscal guardada, la creación directa conserva el contrato previo de cinco campos del receptor, sin materializar una fila fiscal vacía. El primer ensayo reveló esta diferencia de respuesta y se corrigió la implementación, conservando las aserciones previas. El test de navegación nuevo usa la ruta capturada después de la redirección de idioma para exigir un regreso exacto. Se interrumpió la primera regresión mientras se integraban correcciones (10 aprobados, 3 fallidos, 1 interrumpido, 13 sin ejecutar); no se considera evidencia final. Uno de esos fallos fue una recarga durante HMR. Registros: `/tmp/pro-client-fiscal-regression.log`, `/tmp/pro-client-fiscal-final-focal.log`. Focal corregido de datos fiscales: PASS, `/tmp/pro-client-fiscal-recovery.log`.

SQL/PGlite ampliado: PASS, `/tmp/pro-client-fiscal-db-final.log`. Incluye CAS, RLS, permisos RPC, configuración por cliente, rollback atómico, copia directa y desde origen, reintentos, refresh, escritores antiguos que omiten campos y reinstalación/cascada. TypeScript de fuentes y lint focal aprobados (`/tmp/pro-client-fiscal-complete-types.log`, `/tmp/pro-client-fiscal-complete-lint.log`), sin afirmar revisión global del repositorio.

## Evidencia final

- Regresión de nueve consumidores en tres perfiles: **27/27 aprobados**, 8 minutos. Chromium escritorio, Chromium móvil y WebKit móvil; registro `/tmp/pro-client-fiscal-final-regression.log`. Incluye catálogos normalizados, historial de clientes, Facturación, creación directa, líneas, preparación, origen y emisor.
- Revisión independiente final: los dos problemas de recuperación/cierre quedaron resueltos; sin defectos nuevos concretos identificados. La validación es de borradores internos, no de aceptación fiscal.
- Simulador iPhone 17 Pro/iOS 26.5, app temporal apuntando a loopback: guardar razón social y correo ficticios desde la ficha, volver mediante flecha, reabrir y comprobar persistencia; elegir el cliente en factura directa y comprobar vista previa fiscal; añadir servicio por ₡100, recuperar descripción obligatoria sin perder el formulario, guardar, abrir receptor y comprobar razón social/correo copiados. Lectura de BD confirmó receptor, total10000 centavos, una línea y ausencia de deuda/abonos.
- Hubo interrupciones del control nativo (`noWindowsAvailable`) y recargas HMR durante implementación. Se repitió el recorrido con código estable y se completó guardado y revisión; no se cuentan los intentos interrumpidos como aprobados.
- Capturas: `/tmp/contratacr-pro-cliente-fiscal-guardado-20261027.png`, `/tmp/contratacr-pro-cliente-fiscal-reutilizado-20261027.png` y `/tmp/contratacr-pro-cliente-fiscal-factura-20261027.png`.
- Se retiraron únicamente la configuración ficticia nueva y su borrador nuevo, identificados por dueño/ID/título y baseline privada previa. Los verificadores de conservación confirmaron igualdad exacta del contacto, documentos, revisiones, entradas operativas, catálogo, borradores, líneas, materiales, preparación y emisor anteriores. Sin fixtures nuevos en la cuenta demostrativa.
- UTF-8 y diff aprobados. Mismos rama/HEAD, sin commits, push ni emisión real; ningún cambio a main/mobile.

Se amplió después el test fiscal con creación directa completa desde la UI, simulando fallo de consulta del cliente, reintento y vista previa. Solo ese test se repite en los tres perfiles; se reutilizan los otros consumidores aprobados con las mismas entradas de producto.

El recorrido ampliado de vista previa/fallo/reintento/creación UI pasó en los tres perfiles: **3/3 aprobados**, 1,2 minutos, `/tmp/pro-client-fiscal-preview-final.log`. Lint del test final aprobado. No fue necesaria otra suite completa. El simulador quedó en la ficha original con «Datos para facturas» disponible; los snapshots fiscales del borrador temporal también se eliminaron por cascada y se comprobó ausencia de residuos.
