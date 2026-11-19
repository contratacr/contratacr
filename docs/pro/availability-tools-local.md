# Disponibilidad en Citas y utilidades en Herramientas

6 de noviembre de 2026. Solo Pro, rama `local/pro-suite-no-push`, base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Trabajo anterior conservado; sin push ni cambios de producción.

Se revisó `90518e7d:src/components/dashboard/pro/availability-editor.tsx`: la disponibilidad histórica agrupaba publicación/pausa, plantilla semanal y excepciones. También tenía horarios por ubicación y excepciones personalizadas. Se recupera la organización dentro de Citas usando las APIs actuales; no se copia el editor antiguo conectado a tablas retiradas ni se afirma haber restaurado todas sus variantes.

En Citas, Disponibilidad pública agrupa el interruptor de recepción, Horario semanal y edición de disponibilidad del día. La configuración queda plegada inicialmente; el calendario y las citas existentes siguen visibles. Se conserva el formulario semanal con duración y fechas sin atención, el editor de intervalos diarios y los mismos guardados/revisiones. Pausar continúa conservando horas y citas.

La utilidad Preparar visitas y tiempos de agenda pasa de Citas a Herramientas. Mantiene preguntas, anticipación y separación entre visitas, validaciones, guardado idempotente y aviso antes de salir con cambios pendientes. Catálogo, gastos y pagos siguen dentro de Herramientas; los borradores fiscales permanecen en su grupo avanzado. Las acciones contextuales de una cita (confirmar, proponer o reprogramar) se mantienen junto a la cita.

No se modifican esquema, APIs, permisos, datos ni políticas de contacto. Se adaptan pruebas funcionales existentes al nuevo lugar de los controles; se mantienen aserciones de persistencia, permisos y preservación.

Validación: 5 casos distintos aprobados en WebKit móvil (`/tmp/pro-availability-tools.log`: cuatro aprobados; horario inglés aprobado al repetir en `/tmp/pro-availability-tools-retry.log`). El primer POST de preferencias inglés recibió 500 por `Manifest file is empty` del compilador local de Next; se repitió sin alterar validaciones ni aserciones. Incluye guardado/lectura y pausa semanal ES/EN, operaciones de agenda y formularios de preparación ES/EN desde Herramientas, con guardia de cambios sin guardar, respuestas obligatorias e historial congelado. Lint focal y diff sin errores. Se reutiliza la evidencia del recorrido Citas/cotización/cierre de la revisión anterior; APIs y permisos sin cambios.
