# Horarios compactos en Buscar

7 de noviembre de 2026. Solo Pro, `local/pro-suite-no-push`, base `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se preserva el trabajo previo, sin push ni producción.

Se contrastaron las dos imágenes proporcionadas por el usuario con `90518e7d:src/components/professionals/professional-schedule.tsx`, especialmente el bloque de tres columnas de fechas y tres horas con contador de las restantes. La vista nueva había utilizado botones de 44 px, fechas con día de semana, horas con a. m./p. m. y omitía el contador.

PublicReservations recupera las columnas compactas: Hoy/Mañana o día y mes, horas HH:mm de Costa Rica, tres botones pequeños por día, +N con borde discontinuo y flechas discretas. El botón principal de búsqueda muestra Ver disponibilidad sin icono, como en la referencia. Se mantienen las acciones actuales: seleccionar una hora abre los detalles con esa hora; +N abre el calendario del día correspondiente. Los clics de estos controles no se propagan a la tarjeta. No se cambian cabeceras, marca, filtros de búsqueda ni diseño general de las tarjetas.

La función de calendario existente añade count a cada día, contando sus horarios disponibles antes de limitar la respuesta a tres muestras. Solo se aplicó esa función de lectura en la base local con guardia de hostname 127.0.0.1 y puerto 54322; no se modifican filas, permisos o tablas. El bootstrap existente ya utiliza el archivo actualizado. No se inventa un contador ni se descargan todos los horarios al navegador. El cliente acepta respuestas anteriores sin count y no presenta un contador desconocido.

Validación: cuatro casos nuevos aprobados, ES/EN en WebKit móvil y Chromium móvil (`/tmp/pro-compact-search-final.log`), sobre la página real de Buscar con un profesional desechable público local. Comprueban tres columnas, nueve horas visibles, +6 exacto, formato HH:mm, altura compacta, navegación entre días, +N al día correcto, elección de hora y conservación de disponibilidad/ausencia de solicitudes y notificaciones nuevas. También se reutilizan cuatro casos compatibles aprobados de inicio de sesión y recuperación de solicitud ES/EN (`/tmp/pro-compact-search-live.log`). No se afirma prueba manual nueva en el simulador nativo.

Una primera ejecución no encontró el servidor local; se levantó el gateway existente y se repitió. La primera aserción de la nueva prueba confundía una lista de textos con una lista de elementos; se precisó la selección a los tres botones, manteniendo la comprobación exacta de las horas. No se cambió el producto ni se debilitaron condiciones para resolver esa aserción.

Capturas finales revisadas: `research/2026-11-07/compact-search-calendar/search-es.png` y `search-en.png`. Lint focal y diff sin errores.

Tipos con salida cero. La auditoría histórica externa no pudo ejecutarse porque ya no existe su baseline temporal `/tmp/pro-reschedule-original-before.json`; no se regeneró ni se presenta como aprobada. La preservación comprobada en esta revisión corresponde a las aserciones de los casos funcionales y a aplicar únicamente CREATE OR REPLACE de una función de lectura, sin DML sobre datos existentes.
