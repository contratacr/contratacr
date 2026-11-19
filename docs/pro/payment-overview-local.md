# Pagos recibidos — revisión local

Base: `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`, rama `local/pro-suite-no-push`. Sólo checkout Pro, sin push ni emisión.

Vista de consulta de abonos de trabajos y pagos independientes ya registrados. Evita duplicar los abonos con metadatos de factura. Búsqueda por cliente/trabajo/referencia, filtros por disponibilidad/anulación y período de recepción, resúmenes del resultado completo y paginación de 20. Detalle con aplicaciones históricas y enlaces al trabajo o pagos del borrador; conserva el padre de navegación. Una fecha de registro histórica no se presenta como fecha efectiva del pago.

No crea tablas ni modifica saldos, pagos, comprobantes ni datos del cliente. RPC exclusivamente de servicio, propietario tomado de sesión; lecturas privadas sin caché. Referencia de alcance: matriz GTI local, función de consulta de pagos. No equivale a comprobante fiscal ni confirma cobros bancarios.

## Selección de pruebas previa a ejecución

Cambio limitado a consulta, pero añade RPC sobre datos privados: verificador SQL aislado cubre autorización, grants, dueño, filtros, resúmenes, anulaciones, aplicaciones, cursores y conservación exacta. E2E nuevo en Chromium móvil/escritorio y WebKit móvil verifica API privada, navegación real, filtros y aislamiento. Se reutiliza evidencia compatible de `invoice-payments-local.md` para escrituras, reversión de aplicaciones, impuestos y cálculos existentes, que esta entrega no modifica. Consumidores relevantes: navegación a pagos del borrador y trabajo, incluidos en nuevo E2E. Verificación estática TypeScript, lint focal, UTF-8 y diff. Simulador iOS con abono local existente sin mutar datos.

## Resultados — 27 octubre 2026

- SQL aislado PASS (`/tmp/pro-payment-overview-db.log`): paginación con fechas empatadas, aplicaciones paginadas, histórico sin metadatos, pagos independientes y compartidos, reasignación y anulación viva, resúmenes por filtro antes del cursor, consultas literales/acentos, roles reales anon/authenticated denegados y reinstalación sin mutaciones. Revisión independiente SQL/API sin pendientes P1/P2 concretos.
- Nueva extensión aplicada sólo a loopback, sin ejecutar el preparador completo ni reset/seed.
- E2E: Chromium móvil 1/1 (`/tmp/pro-payment-overview-mobile2.log`), WebKit móvil + Chromium escritorio 2/2 (`/tmp/pro-payment-overview-other.log`). Incluyen recuperación de GET fallidos, navegación al trabajo/borrador con retorno exacto y filtros conservados, privacidad/aislamiento y snapshot exacto de 28 tablas. Primera ejecución móvil detectó discrepancia de contrato del test: una lista filtrada por cliente ajeno debe dar lista vacía y todos los totales cero; el detalle ajeno sí 404. Se corrigió la expectativa a ese objeto completo; no se redujeron controles de privacidad.
- TypeScript y lint focal PASS (`/tmp/pro-payment-overview-tsc-final2.log`, `/tmp/pro-payment-overview-lint-final.log`), presupuesto bilingüe, UTF-8 y diff-check PASS.
- Simulador iPhone 17 Pro/iOS 26.5: entrada desde menú Facturación, búsqueda «Pintura», selector nativo totalmente aplicados → vacío y Todos → pago existente, detalle histórico y navegación al trabajo → regreso exacto al pago. Primer recorrido durante HMR volvió al cliente; tras apertura limpia se verificó el padre exacto, coincidente con E2E. No se modificó navegación compartida por este efecto transitorio de desarrollo. Captura: `/tmp/contratacr-pro-pagos-recibidos-20261027.png`.
- Helpers de conservación de workspace, paneles, normalización, borradores/líneas/materiales/emisor PASS. Metadatos de pagos de la cuenta demo conservados exactamente; suspensión local permanece desactivada conforme autorización previa. No se creó pago alguno en la prueba nativa.

## Límites y siguiente paso

Consulta interna CRC de registros existentes. No emisión, conciliación bancaria/caja ni documentos emitidos. Corrección auditada de fecha/medio/referencia implementada posteriormente en `payment-metadata-local.md`; las instantáneas originales siguen inmutables. La equivalencia completa con GTI sigue abierta en la matriz; esta entrega cubre la consulta unificada de pagos. Entrada principal en Facturación; el API admite contexto de cliente pero esta entrega no añade otro botón a la ficha del cliente.

## Extensión: período de recepción y archivo CSV (27 octubre 2026)

El reporte ahora filtra en el RPC de base de datos por fecha efectiva inclusiva «Desde/Hasta» y devuelve los totales del conjunto completo, manteniendo la página de 20. Los períodos inválidos se bloquean en la interfaz y se rechazan en API/SQL. Los pagos sin fecha efectiva quedan fuera de cualquier período seleccionado; anulaciones conservan su total separado. Las fechas y filtros permanecen en la ruta al abrir un pago y volver.

La descarga CSV recoge todas las páginas de la búsqueda vigente hasta 500 filas. Si la lectura cambia o excede el límite, no entrega archivo parcial; pide actualizar o acotar filtros. El archivo incluye fecha, cliente, trabajo, importes recibido/aplicado/disponible, estado, medio y referencia; protege textos que podrían interpretarse como fórmulas. Sigue limitado a CRC y pagos ya registrados.

SQL aislado: `node scripts/pro/verify-payment-overview-db.mjs` PASS (rangos inclusivos, sin fecha, vacío, fecha imposible/orden inválido, reinstalación y conservación). Compatibilidad de correcciones: `node scripts/pro/verify-payment-metadata-db.mjs` PASS. E2E focal `/tmp/pro-payment-period-final` **3/3 PASS** en WebKit móvil, Chromium escritorio y móvil; verifica fechas API/UI, validación del período, exportación completa CSV, fallos/reintentos, privacidad y snapshot exacto. Tras reducir el ancho nativo de los campos para que no invadan su tarjeta, WebKit móvil se repitió: `/tmp/pro-payment-period-webkit-final2` **1/1 PASS**, incluida la verificación de CSV tras releer todas las páginas para detectar cambios concurrentes. Se omitió el `globalSetup` compartido porque las cuentas generales de regresión no existen en este checkout; el spec creó y retiró sus propias cuentas desechables loopback. Primera corrida falló al invocar dicho setup; no modificó registros y no se corrió `seed:test:full`.

La vista final del iPhone 17 Pro muestra «Desde», «Hasta», resumen y descarga CSV; la inspección detectó y corrigió el desborde del selector. CUA dejó de aceptar toques (`noWindowsAvailable`) antes de elegir las fechas en el simulador, por lo que la interacción quedó verificada en WebKit, no manualmente en esa ventana nativa.

## Extensión: localizar pagos sin fecha efectiva (28 octubre 2026)

Se agregó el filtro «Sin fecha efectiva» para encontrar abonos activos cuyo `received_on` es nulo y abrir su detalle para completar la corrección auditada de fecha. El filtro limpia y oculta el período para evitar una lista engañosamente vacía; el CSV resultante se nombra `pagos-sin-fecha.csv`. La fecha de registro sigue sin sustituir la fecha en que se recibió el dinero.

Verificadores SQL aislados PASS para pagos y metadatos. TypeScript, ESLint, presupuesto bilingüe, revisión de UTF-8 y `git diff --check` PASS. El E2E focalizado no completó: las tres variantes respondieron HTTP 500 en `client-operations` al sembrar datos efímeros. El registro del servidor muestra fallo de resolución de dependencias del checkout (`@supabase/supabase-js`, `@swc/helpers`, `scheduler`) tras probar una raíz Turbopack externa; retiré ese ajuste temporal. La pantalla del simulador no quedó validada en esta corrida; el servidor de desarrollo continúa fallando por el entorno de dependencias. No se usó producción ni se modificaron pagos existentes.

No se cambian transacciones, saldos, historial, recibos, suscripciones ni borradores. Pendiente sigue conciliación de caja/banco, monedas y documentos emitidos; este reporte no certifica ingresos fiscales ni depósitos bancarios.

## Continuación local: servidor Webpack y límite de página

Se identificó que Turbopack no sigue por defecto el symlink `node_modules` de Pro hacia el checkout hermano. Para esta revisión local, el servidor se arranca con Webpack sin cambiar la configuración del proyecto; el endpoint de Pro respondió y redirigió a inicio de sesión. El menú de Pagos recibidos del simulador seguía mostrando cuatro estados después de reabrir la sección, por lo que el filtro nuevo aún no tiene validación visual confirmada.

El primer E2E con Webpack llegó a la API y reveló una aserción incorrecta del spec: el resumen de pagos sin fecha puede contar 24, mientras que la página devuelve como máximo 20 filas. Se ajustó la comprobación para validar `min(total, 20)` y conservar la verificación de que las filas estén sin fecha y no anuladas. La repetición terminó cuando el servidor local dejó de escuchar (`ECONNREFUSED`); no hay resultado E2E PASS de esta continuación. El RPC instalado conserva el límite de 20 filas. No se usó producción ni se alteraron pagos existentes.

### Cierre automatizado posterior — 28 octubre

Con el servidor local Webpack activo, el E2E de pagos sin fecha aprobó en WebKit móvil, Chromium escritorio y móvil (`/tmp/pro-identity-payments-final`). Se fortaleció la comprobación: el total se compara contra los pagos esperados del conjunto completo; los IDs de ambas páginas se contrastan por separado, se comprueba el cursor final nulo y se pulsa «Ver más pagos» antes de exigir todas las filas en la interfaz. No había evidencia de una página con 24 filas: el fallo previo comparaba erróneamente el total 24 contra la longitud 20 de una página. La descarga CSV, recuperación, navegación e aislamiento también aprobaron. La comprobación manual nativa sigue pendiente; no se atribuyen resultados WebKit al simulador.
