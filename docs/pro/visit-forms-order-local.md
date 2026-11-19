# Formularios de preparación de visitas — 7 de noviembre de 2026

Solo Pro, `local/pro-suite-no-push`, HEAD `06b70019`. Se preservó el trabajo local existente. Sin push, commits, migraciones ni producción.

## Cambios

En configuración de visitas y respuestas del cliente se ordenan las acciones: Cancelar antes de Guardar/Reintentar. Se conservan callbacks, bloqueos durante guardado incierto, revisiones e historial. No se cambian campos ni datos almacenados.

## Revisión manual en Simulator

Safari normal, iPhone 17 Pro iOS 26.5, servidor `http://127.0.0.1:3185`, cuenta local «Prueba manual Proyectos».

- Inglés: abrir Preparar visitas, agregar pregunta, escribir, inspeccionar campos y acciones, cancelar y comprobar regreso a los valores originales (0 minutos entre visitas, 15 minutos de anticipación, sin preguntas).
- Cambiar a español desde el menú de la aplicación.
- Español: repetir agregar/escribir/inspeccionar/cancelar; botones largos se ajustan en dos filas sin recortes. No se guardan las preguntas manuales.
- Los gestos de desplazamiento remoto no movieron la vista; Page Down (`Next`) permitió revisar el final. La pestaña privada mostró inicialmente solo el encabezado; el recorrido se completó en una pestaña normal, sin reducir protecciones.
- Las respuestas del cliente y el guardado con historial se prueban automáticamente con cuentas desechables; no se certifica ese recorrido como manual.

## Validación

Prueba focal `pro-visit-preparation.spec.ts`: configuración, respuestas requeridas, historial, bloqueo tras confirmar, márgenes de agenda, permisos y conservación del cliente/notificaciones. Añade orden de acciones en ES/EN y cancelación en inglés. La fixture profesional ahora tiene rol y metadatos coherentes.

Primera ejecución aprobada: `/tmp/pro-visit-form-order.log`. Ver resultado final bilingüe en `/tmp/pro-visit-form-order-final.log`. ESLint focal y TypeScript aprobados antes de ampliar las aserciones finales en inglés. Sin cambios en headers/marca.

Resultado final ampliado ES/EN: aprobado (1/1, 26.7 s), `/tmp/pro-visit-form-order-verified.log`. El intento anterior conservó inglés durante el retorno del profesional; la prueba restaura NEXT_LOCALE inmediatamente antes de navegar a español. La traza confirma redirección a `/en/`, no un botón ausente. Aserciones originales de permisos, historial y datos conservadas. `git diff --check` aprobado.
