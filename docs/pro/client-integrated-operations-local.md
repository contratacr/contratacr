# Ficha integrada de cliente — desarrollo local Pro

26 de octubre de 2026, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se preservan los cambios locales anteriores. Sin push, commits, despliegues ni modificaciones de main/mobile.

## Comportamiento implementado

La ficha conserva sus accesos a crear cotización y agendar cita, y su historial paginado de citas/cotizaciones. Añade **Trabajos y saldos** con resumen en colones, trabajos relacionados y acceso **Gestionar trabajo**.

Dentro de un trabajo se puede:

- Abrir su cotización asociada y volver con la flecha al mismo trabajo y cliente.
- Definir/cambiar su importe acordado explícitamente, conservando cada importe anterior en el historial.
- Registrar materiales realmente utilizados: descontar inventario e insertar movimiento y asiento en una transacción.
- Anotar abonos ya recibidos y ver el pendiente por trabajo y por cliente.
- Anular un abono o devolver toda la cantidad de un registro de material, con motivo y asientos enlazados. No se borra el registro original.

No se infiere deuda de una cotización, aunque esté aceptada; varias citas pueden estar asociadas al mismo presupuesto. Los acuerdos son explícitos por trabajo. El costo del material no se añade otra vez al importe acordado. Cancelar una cita tampoco borra abonos ni devuelve inventario automáticamente. Estos son registros internos en CRC: no emiten facturas, no cobran dinero ni envían mensajes/notificaciones.

## Almacenamiento y protección

`pro_client_entries` es una tabla nueva y relacional. La instalación es aditiva y repetible, sin backfill ni conversión de datos anteriores. Las cuentas se calculan desde los asientos; nada se añade al JSON del workspace. Las cotizaciones, clientes, citas e identidades anteriores mantienen sus IDs y contenido.

- Claves compuestas por propietario para cliente, trabajo, producto y reversión; RLS de lectura propia, sin escritura directa de usuarios. RPC solo `service_role` detrás del acceso Pro y comprobación de origen existentes.
- Operaciones serializadas bajo el mismo bloqueo/revisión de Pro; errores revierten toda la transacción.
- ID de operación y huella del contenido: reintentar el mismo registro no repite efectos; el mismo ID con otro contenido se rechaza.
- Pagos en céntimos enteros; cero/exceso rechazados, importe acordado no puede quedar por debajo de lo abonado. Cantidades con hasta tres decimales.
- Producto/nombre/costo se conservan como referencia y snapshot. Devoluciones funcionan también si después se archiva el producto.
- Trabajos con registros no pueden reasignarse a otro cliente/cotización por API parcial ni por el escritor de compatibilidad.
- Borrar una cuenta de prueba puede eliminar sus asientos por cascada propia sin impedir el borrado ni afectar otras cuentas. Las relaciones individuales siguen protegidas.
- Lecturas paginadas de veinte trabajos, ordenadas por fecha y desempate estable; veinte asientos por trabajo. Resumen de todos los trabajos del cliente, sin descargar su documento completo.
- Rutas `cliente`, `cuenta`, `registro` y `asiento` usan la navegación de Pro existente para conservar la flecha y el retorno. Abrir una cotización desde el trabajo o historial añade `volverCliente`, validado al dashboard local del mismo origen y a `tab=pro_clients` con cliente. Se usa como respaldo si se pierde el estado personalizado de historial tras una recarga de WebView. No concede acceso a otros propietarios.

## Selección de pruebas

El cambio toca datos, relaciones, permisos de tablas nuevas, inventario y UI de cliente. Se amplía más allá del formulario nuevo: contratos SQL de catálogo/paneles, pruebas nuevas SQL/RLS y recorrido integrado con historial, formularios, paneles paginados e inventario en WebKit móvil y Chromium móvil/escritorio. No se toca autenticación, marca, layout raíz, aplicación nativa, CI ni emisión fiscal. Se reutiliza evidencia anterior de las superficies ajenas a esas dependencias.

- `verify-client-operations-db.mjs`: preservación exacta tras instalación/reinstalación, ausencia de deuda automática, céntimos, reintentos con revisión vieja, contenido alterado, sobrepago/stock insuficiente, rollback, cancelación, reversión única, bloqueo de reasignación, paginación de trabajos/asientos, RLS/RPC y eliminación aislada de cuenta.
- `verify-catalog-db.mjs` y `verify-panel-db.mjs`: contratos previos de normalización, importación, CAS, reservas y RLS.
- `pro-client-operations.spec.ts`: recorrido real autenticado; cotización y regreso, importe, material, abono, recarga, anulación, devolución, saldo en ficha y preservación de entidades. Dos consumos concurrentes reales: uno confirma y otro devuelve 409. Reintento del abono produce un solo asiento; contenido cambiado rechaza. Propietario ajeno y POST sin origen rechazados; no se consulta workspace.
- `pro-client-history.spec.ts`, `pro-stock-history.spec.ts`, `pro-scoped-panels.spec.ts`, `pro-forms-ux.spec.ts`: regresiones relacionadas, tres perfiles.

Las pruebas usan exclusivamente `http://127.0.0.1:54321` y la app local `http://127.0.0.1:3185`, con cuentas desechables. `E2E_FIXTURES_READY=0` omite únicamente el global setup de las fixtures compartidas ausentes; los casos crean sus propios propietarios y ejercitan la autenticación real. La primera ejecución no llegó a los casos por ese setup. Durante desarrollo se corrigió una lectura de respuesta y se añadió cascada por propietario al detectar que la limpieza de una cuenta con asientos quedaba bloqueada. No se debilitaron aserciones.

## Evidencia

- SQL nuevo y regresiones de catálogo/paneles: **3 verificadores aprobados**. Logs `/tmp/pro-client-ops-db.log`, `/tmp/pro-client-ops-catalog-db.log`, `/tmp/pro-client-ops-panel-db.log`.
- Cinco specs relacionadas en tres perfiles: **15/15 aprobadas**, 6,1 minutos. Log `/tmp/pro-client-integration-final.log`, artefactos `/tmp/pro-client-integration-final/`.
- Después de ajustar el orden cronológico de trabajos y el plural de la ayuda, se repitió únicamente el recorrido nuevo: **3/3 aprobadas**, 47,3 segundos. Log `/tmp/pro-client-ops-final.log`, artefactos `/tmp/pro-client-ops-final/`. Las otras cuatro specs mantienen entradas compatibles y se reutilizan.
- ESLint de todos los archivos de ejecución nuevos, BusinessPanel y test/verificador nuevos: sin errores ni advertencias (`/tmp/pro-client-ops-lint.log`).
- TypeScript estricto de fuentes: aprobado con `/tmp/pro-path-source-tsconfig.json`, que excluye los tipos generados de `.next`. Esto no certifica el `tsc` global, cuyo fallo anterior en el export de empleos está documentado en la revisión de formularios. Log `/tmp/pro-client-ops-tsc.log` vacío.
- UTF-8 y `git diff --check`: aprobados.
- Preservación exacta de documentos/revisiones originales antes y después: **2 cuentas, 11 trabajos, 10 cotizaciones, 50 disponibilidades, 46 clientes, 45 productos y 10 movimientos**. El subconjunto original anterior a las demos también permanece exacto (11 clientes y 10 productos). Ningún array vuelve al core JSON.
- Revisión nativa en iPhone 17 Pro/iOS 26.5, con el binario temporal existente apuntado al checkout Pro local. Cuenta ficticia nueva e independiente; se guardó importe de ₡50.000, abono de ₡20.000 y consumo de una unidad. Confirmación de base local: saldo **₡30.000**, costo de material **₡2.500**, stock de **8 → 7**; el material no aumentó el saldo. Captura `/tmp/contratacr-pro-ficha-trabajo-integrado-20261026.png`.
- La revisión nativa encontró que cerrar la cotización podía caer en su listado tras perder el padre del historial. Se corrigió guardando el origen explícito y se comprobó en el simulador **cotización → mismo trabajo → ficha**, conservando saldo y material. Capturas `/tmp/contratacr-pro-regreso-cotizacion-trabajo-20261026.png` y `/tmp/contratacr-pro-ficha-cliente-integrada-20261026.png`.
- Se amplió la prueba integrada: quitar `ccrProNavigation`, recargar cotización y cerrar debe volver al trabajo original. Nueva regresión de historial + operaciones + cotizaciones en los tres perfiles: **8 aprobadas y un timeout de WebKit esperando el filtro mientras se mostraba la carga inicial**. Log `/tmp/pro-client-return-final.log`. La causa exacta del retraso no se certifica; se repitió únicamente ese caso, sin cambiar aserciones, y **aprobó en 31,5 segundos** (`/tmp/pro-client-return-webkit-quote.log`). No se presenta la primera ejecución como 9/9 verde.
- Se añadió también comprobación explícita de cerrar una cotización desde el historial y regresar a la ficha; su ejecución focal final aprobó **3/3 en 39,2 segundos**, sin cambios de aserciones anteriores (`/tmp/pro-client-history-return.log`).
- Revisión de agente sobre SQL, permisos, saldo e idempotencia, y luego sobre el retorno validado: sin hallazgos bloqueantes. Se atendió la observación de no afirmar que una operación falló si se perdió la respuesta: el formulario conserva su ID y comunica resultado no confirmado.
- Se limpian las cuentas desechables de los tests, incluidas dos que dejó el fallo inicial de limpieza. Se conserva la cuenta de demostración del simulador para revisión; sus credenciales solo están en un archivo privado temporal, fuera del repositorio.

La interacción nativa y la cobertura automatizada son evidencias distintas: devoluciones, anulaciones, carreras, permisos y casos de recarga están probados en los tres perfiles de navegador. No se declara que cada caso automatizado se repitió manualmente en el simulador.

## Límites de esta entrega

No es un motor fiscal ni una integración GTI. No introduce anticipos sin trabajo, asignación de un pago a múltiples documentos, facturación parcial, monedas adicionales ni devolución parcial de un registro. El acuerdo puede ser cero explícito; sin acuerdo no se permite abonar. La vista de materiales registra consumo real, no una reserva de inventario o un presupuesto de materiales.

El resumen se calcula sobre los trabajos del cliente: las respuestas están acotadas, pero hace falta medir rendimiento antes de certificar miles de trabajos por cliente. El ID de reintento de formulario se conserva mientras este permanece abierto; tras una desconexión se informa que el resultado no se pudo confirmar y se pide reintentar esa misma acción.
