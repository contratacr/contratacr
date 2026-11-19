# Auditoría local: respuesta perdida y recarga en cambios y constancias

## Alcance y evidencia

Checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019`. Sólo cuentas desechables y Supabase `127.0.0.1:54321`; sin producción, push, mensajes externos ni emisión fiscal. Implementación sin modificar durante esta reproducción.

Prueba: `tests/e2e/pro-work-write-reload.spec.ts`, WebKit móvil. Log: `/tmp/pro-work-write-reload-before.log`. Tres casos rojos esperados por el defecto; cada uno confirma HTTP 200 del servidor antes de sustituir la respuesta por 503, recarga y vuelve a usar la acción visible. Los adjuntos `after-reload-observation` y `replay-outcome` de cada trace registran identidad, respuesta y filas de negocio. Fixtures eliminadas al terminar.

| Acción | Después de recargar | Nuevo intento | Resultado observado |
| --- | --- | --- | --- |
| Proponer extra/cambio | Sin botón de comprobación; se perdió el intento en memoria | Otro `id` y `actionId`; HTTP 409 | Una propuesta pendiente; un acuerdo original. La unicidad del servidor evita otra propuesta. |
| Registrar aprobación recibida | Sin botón de comprobación; nota/intento no recuperados | Otro `actionId` y revisión; HTTP 409 | Un cambio aceptado y dos acuerdos totales: original 100000 céntimos y nuevo 102000. No se duplica el acuerdo financiero. |
| Compartir constancia | Sin botón de reintento; vuelve a permitir compartir | Otro `actionId` y revisión; HTTP 200 | Dos versiones inmutables, 1 y 2, con contenido idéntico para una publicación cuya respuesta se perdió. Duplicado real de versión. |

Los pagos originales y el contacto privado permanecieron idénticos. No se midió directamente el número de filas de recibos en esta primera reproducción; no debe presentarse como cobertura de esa tabla. Las respuestas 200 y las filas/versiones sí se consultaron. Los textos de ejemplo de los fixtures no son traducciones de producto.

Captura de publicación duplicada:
`/tmp/pro-work-write-reload-before/pro-work-write-reload-Work-89ef6--acknowledgement-and-reload-webkit-mobile/after-reload-publish.png`.

## Siguiente corrección propuesta: constancias

Priorizar publicación de constancias porque reproduce una duplicación. Conservar el backend de versiones: dos publicaciones deliberadas pueden ser legítimas; no eliminar versiones ni deduplicar contenido globalmente.

Usar los recibos existentes (`pro_work_delivery_actions`) y un intento durable previo al primer POST. Conservar el cuerpo serializado exacto, `actionId`, revisión, actor y contexto del trabajo/cita. La recuperación debe estar limitada a la cuenta y validar su esquema; abrir la pantalla no debe enviar automáticamente. Ante pérdida de respuesta, 401/403 o rechazo posterior ambiguo, mantener identidad y bloquear edición/publicación nueva. Si falla el almacenamiento antes del transporte, no enviar.

Separar fase incierta de respuesta confirmada. Una respuesta incierta se resuelve mediante la misma acción idempotente. Después de un ACK válido, conservarlo y verificar el estado mediante GET; si falla esa lectura, recargar y reintentar sólo GET. Aceptar la versión canónica posterior sin sobrescribirla y limpiar el intento únicamente tras adoptar el resultado verificado. Los detalles de verificación de versión deben contrastarse con el DTO real: el ACK actual entrega `workId` y `revision`, no un número de versión explícito.

Antes de integrar UI: pruebas puras del journal, persistencia y aislamiento; luego regresión local ES/EN de publicación con respuesta perdida + recarga, 401/403, ACK + GET fallido, conservación de notas privadas/versiones/pagos, fallo de almacenamiento sin POST y permisos. Añadir consultas directas de recibos para demostrar una acción de publicación y una versión. La repetición intencional posterior, con otra acción explícita, debe seguir disponible.

Los intentos en memoria de cambios comerciales también requieren recuperación, pero la reproducción no demuestra duplicación financiera. No mezclar ese trabajo con una corrección de constancias sin revisar por separado sus contratos.

## Corrección y validación posterior: guardar y publicar constancias

La recuperación durable de `save` y `publish` quedó integrada con el helper `src/lib/pro/delivery-write-recovery.ts`. Mantiene cuerpo/acción/revisión/baseline antes del POST, separa ACK confirmado de lectura pendiente, y verifica la versión publicada exacta (incluida paginación). El guard opcional `X-Pro-Expected-Actor` comprueba la sesión autenticada antes del RPC. No se agregó deduplicación global por contenido ni se modificaron versiones existentes. Fotografías y confirmación de recibido del cliente quedan fuera de esta afirmación.

Prueba nueva: `tests/e2e/pro-delivery-write-recovery.spec.ts`, ES/EN WebKit. EN pasó en `/tmp/pro-delivery-write-recovery.log`; ES inicial agotó el tiempo antes de aparecer el botón porque las consultas iniciales seguían pendientes. Se conserva esa evidencia sin atribuirle una causa única. Con precondición autenticada sobre el informe real vacío (200, provider, revisión 0), ES pasó en `/tmp/pro-delivery-write-recovery-es-final.log` (36.4 s), sin ampliar límites ni filtrar errores. TypeScript global: `/tmp/pro-delivery-recovery-final-types.log`, exit 0; lint/diff-check focales sin errores.

Cobertura observada por idioma: respuesta perdida al guardar/publicar, 401/403 y recarga con el mismo cuerpo; una publicación original sin duplicación; otra acción explícita puede publicar idéntico contenido como versión 2. Se crearon mediante la API 21 versiones propias para verificar la versión 1 fuera de la primera página de 20 y la lectura `after=2`. El borrador posterior y notas privadas permanecieron intactos. ACK seguido de GET 503 y recarga sólo repite lecturas. Fallo de almacenamiento produjo cero POST. Sesión B con actor esperado A obtuvo 403 y ningún recibo propio. Se consultaron directamente 25 recibos y 21 versiones; todas las cuentas/datos desechables se limpiaron. Datos de negocio previos y `runtimeErrors=[]` se conservaron.

Los dos defectos de identidad de cambios comerciales de la reproducción inicial no se presentan como resueltos aquí. El archivo de reproducción inicial contiene selectores anteriores de constancia y no sustituye la nueva regresión de recuperación.
