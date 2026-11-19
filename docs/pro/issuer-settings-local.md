# Emisor reutilizable — Pro local

27 octubre 2026. Rama local/pro-suite-no-push, HEAD06b70019de69bb4e1ee46ead3eda22eedf05f7d0. Se conserva trabajo previo, sin ramas/worktrees, push, emisión, cobros, mensajes, producción ni cambios main/mobile.

## Criterios y selección de pruebas antes de implementar

Facturación permite guardar nombre, identificación/tipo, actividad, contacto y dirección del emisor por cuenta. Los borradores nuevos copian esa configuración; cambiarla no modifica borradores existentes, receptores, acuerdos, saldos ni inventario. Un reintento de creación conserva la copia original. En borradores desde origen se permite ajustar la copia antes de guardar. No se almacenan credenciales fiscales ni se certifica autorización del emisor.

Nueva tabla/RLS/RPC y envoltura de creación: verificador SQL aislado ampliado de configuración, CAS, permisos, reinstalación, copia/reintentos e inmutabilidad de históricos; E2E nuevo de configuración y consumidores de facturación directa/desde origen/preparación/detalle/lista, agrupados por tres perfiles. ESLint y TypeScript de fuentes, UTF-8/diff y comparación privada de datos originales. Reutilizar cálculo monetario, catálogos, marca y navegación sin cambios compatibles; sin suite global ni repetir paquetes/ensayos físicos. Recorrido nativo en iPhone local con fixture temporal y limpieza acotada.

## Modelo y comportamiento

Tabla relacional `pro_invoice_issuer_settings` por cuenta: nombre, tipo/identificación, correo, teléfono, dirección libre y actividad de referencia, revisión y fecha. Nombre requerido; permite completar otros campos después. El formato no equivale a registro/validación fiscal. RLS lectura propia; escrituras solo por RPC de servidor, mismo acceso Pro/desarrollo y verificación de origen de las APIs existentes. Guardado CAS con revisión0 cuando no existe, bloqueo transaccional por cuenta y error409 si la revisión cambió. No modifica perfil público ni contiene llaves fiscales.

La nueva envoltura de creación copia configuración y borrador en una transacción. Un directo conserva su clave/huella original de creación; aplicar la preparación no altera esa huella. En un borrador desde cotización/trabajo la pantalla recibe los valores iniciales y permite ajustar la copia antes de guardar; si un cliente antiguo omite preparación, el servidor aplica la configuración. Reintentos de creación, ediciones y refresh nunca recopian el emisor global sobre un documento existente. No hay backfill de borradores anteriores. Si una pantalla ya abierta contiene una copia ajustada, se respeta esa copia explícita al guardar.

Facturación añade «Configurar emisor», ruta `emisor=1`, formulario completo con mensajes de carga/error, recarga, guardado y protección al salir con cambios. Reutiliza los mismos siete campos que «Datos del emisor» en el editor del documento, sin duplicar sus validaciones. Los campos desactivan autocorrección; el texto explica qué cambia y qué permanece en la copia del documento. No hay emisión ni contacto con GTI/Hacienda.

## Revisión y evidencia inicial

Revisión independiente de solo lectura `invoice_usability_review`: sin defecto concreto en código de configuración, CAS, copia futura, reintentos ni aislamiento. Se verifican centralmente rutas con/sin preparación explícita y directo.

Verificador SQL ampliado PASS (`/tmp/pro-issuer-db.log`): CAS inicial/obsoleto y rollback de configuración inválida; lectura/denegación de funciones y escritura por roles; copia a nuevos directos y trabajos, preparación explícita ajustada, configuraciónA→B sin cambiar históricos, retry después del cambio, refresh sin recopiar, ausencia de movimientos, reinstalación y cascada del propietario. También ejecuta todas las comprobaciones anteriores de factura directa/detalle/preparación/saldos/materiales/paginación. Instalación loopback PASS (`/tmp/pro-issuer-prepare.log`).

Primer E2E no llegó a «Preparar factura» en Cotizaciones porque la cuenta nueva no tenía fila de profesional. Se completó esa fixture del caso, sin modificar producto ni quitar aserciones. Repetición focal Chromium móvil PASS,18,6s (`/tmp/pro-issuer-focal-corrected.log`): guardar/recargar, datos inválidos, CAS, aislamiento, cancelar Atrás, copiasA/B, históricos y receptor intactos, vista previa/ajuste por documento, creación con preparación omitida y conservación operativa.

ESLint focal y TypeScript de fuentes PASS (`/tmp/pro-issuer-lint-final.log`, `/tmp/pro-issuer-types-final.log`). Snapshots privados de documentos/revisiones/entradas operativas, borradores completos y configuración de propietarios originales: PASS. La tabla nueva estaba vacía para los propietarios originales; no se sembraron datos allí para sustituir la prueba visual.

## Cierre de validación 2026-10-27

- Regresión conjunta: 18/18 casos aprobados (Chromium escritorio, Chromium móvil y WebKit móvil), 5 minutos. Log local: `/tmp/pro-issuer-regression.log`. Incluye configuración, factura directa, edición de líneas, preparación, origen cotización/trabajo y listado.
- Simulador iPhone 17 Pro/iOS 26.5: apertura de Configurar emisor, validación del nombre obligatorio, escritura y guardado de un nombre ficticio, mensaje de éxito, regreso mediante flecha y reapertura con el nombre persistido. La copia a nuevos borradores y la inmutabilidad de los anteriores se verificaron en SQL y E2E; no se repitió la creación manual de otro borrador en esta sesión.
- Captura local del guardado: `/tmp/contratacr-pro-emisor-guardado-20261027.png`.
- Se retiró exclusivamente la nueva configuración ficticia creada en la prueba. Las cinco verificaciones de preservación confirmaron igualdad exacta de los datos anteriores y ausencia de configuración residual.
- SQL, lint, TypeScript de fuentes, UTF-8 y `git diff --check` aprobados. Revisión independiente sin defectos concretos identificados.
- Rama conservada: `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Sin push ni emisión fiscal. SQL preparado y aplicado únicamente al entorno local.
