# Recorrido del cliente: solicitud y respuesta de cotización

3 noviembre 2026. Solo Pro local, rama `local/pro-suite-no-push`, HEAD base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva todo cambio previo. Sin nuevas secciones, SQL, migraciones, push ni producción.

La solicitud mantiene servicio, horario y lugar; duración queda como ajuste opcional desplegable con estimación visible. La duración sigue determinando disponibilidad y conserva sus límites y validación. El cliente puede pedir otro horario sin reservar automáticamente. Las acciones existentes de aceptar horario/cancelar aparecen antes de herramientas secundarias.

La cotización vinculada se abre como Revisar cotización para el cliente; el profesional conserva Complementos. Total y aceptación permanecen visibles en el pie del modal móvil. La confirmación indica el importe exacto y explica que no cobra ni reserva horario. El resultado muestra respuesta guardada y coordinación pendiente. No modifica permisos, identidad, importes, API, almacenamiento ni el motor de aprobación existente.

Selección: solicitudes y complementos en Chromium escritorio/móvil y WebKit móvil; consumidor del recorrido profesional en Chromium móvil; tipos, lint focal, bilingüe, UTF-8 y diff. Se reutiliza la evidencia de seguridad/RLS/idempotencia de las mismas rutas y esquema, sin entradas nuevas. Las pruebas integradas mantienen los rechazos ajenos, reintento exacto y snapshots existentes. Se amplía cancelar confirmación y revisar total. No se repiten marca/header ni paquetes nativos porque no cambian. Simulador manual con actores sintéticos y servicios loopback, sin mensajes reales.

## Resultados y límites

Siete casos distintos aprobados: solicitudes y aceptación con complementos en WebKit móvil, Chromium escritorio y Chromium móvil (6); consumidor del recorrido profesional (1). Logs `/tmp/pro-client-journey.log` (6/6), `/tmp/pro-client-journey-consumer.log` (1/1). Tras subir Tus cotizaciones dentro de Citas se repitieron solo los dos consumidores móviles: `/tmp/pro-client-journey-top.log` (2/2). La prueba ampliada de solicitud comprueba el enlace Ver mis citas con el ID real guardado. No se cuentan repeticiones como cobertura nueva. Matriz deduplicada: `research/2026-11-03/client-service-journey-coverage.json`.

Las pruebas mantienen las aserciones de acceso ajeno, precio/IVA, extras sin seleccionar, reintento idempotente, versión inmutable, borrador dependiente y preservación de historial, workspace y notificaciones. Se añadió volver atrás en la confirmación de aceptación, comprobando precio concreto, estado anterior y selección conservada. No se debilitaron contratos del backend. Las pruebas fiscales dependientes usan únicamente borradores sintéticos; no emiten nada.

Simulador iPhone 17 Pro/iOS 26.5, Safari contra localhost: inicio de sesión con cliente sintético, formulario de solicitud con duración plegada, selección manual de 120 minutos, horario a convenir y solicitud guardada. La DB confirma un único registro solicitado, sin trabajo nuevo. En Citas se abre Revisar cotización, complemento opcional de CRC2.500 sobre servicio de CRC12.500, confirmación de CRC15.000, Volver sin aceptar, posterior aceptación única y recarga con estado Aceptada/CRC15.000. No hubo cobros, reserva automática ni nuevas notificaciones. Capturas en `research/2026-11-03/`: `client-request-simple-ios-simulator.png`, `client-request-sent-ios-simulator.png`, `client-quotes-visible-ios-simulator.png`, `client-quote-review-ios-simulator.png`, `client-quote-confirm-ios-simulator.png`, `client-quote-accepted-ios-simulator.png`, `client-quote-persisted-ios-simulator.png`.

El teclado inglés del simulador autocorrigió el nombre de servicio sintético; la comprobación usa el valor realmente visible y guardado. Safari ofreció un enlace de historial de una solicitud desechable anterior; se abrió la URL exacta de la lista para continuar, sin tocar ni restaurar esa solicitud. La navegación del botón Ver mis citas se comprobó en E2E con el ID vigente.

La revisión visual hizo subir el bloque existente Tus cotizaciones, previamente debajo de toda la lista de citas. La respuesta guardada reemplaza las instrucciones de selección por texto de consulta; los controles quedan deshabilitados y se conserva historial. No se añaden secciones ni filtros.

Alcance de aceptación: se mejora el recorrido autenticado existente de cotizaciones con complementos configurados, vinculadas a un cliente concreto. No habilita aceptación anónima en enlaces públicos ni cambia la disponibilidad de cotizaciones ordinarias sin opciones. No se asocian identidades por nombre/correo y no se inventa una reserva al aceptar. Solicitud y cotización de la demostración manual son fixtures independientes de la misma pareja; no se presentan como nueva vinculación automática entre ambas.

Preservación: se comparan las 78 tablas y 626 filas originales exactas, excluyendo exclusivamente los actores/IDs sintéticos registrados y verificados; se mantienen los documentos y trabajo de la demostración anterior. Auditorías anonimizadas anteriores conservadas. El demo nuevo se mantiene para inspección del usuario. Evidencia `/tmp/pro-client-journey-preservation-final.log`, `/tmp/pro-client-journey-prior-demo.log`, `/tmp/pro-client-journey-manual-cancel.log` y `/tmp/pro-client-journey-manual-accepted.log`.

TypeScript global, ESLint focal, presupuesto bilingüe, UTF-8 y diff-check aprobados. No se declara suite exhaustiva ni validación de tiendas o producción. Solo Pro, sin push ni nuevas ramas/worktrees.

