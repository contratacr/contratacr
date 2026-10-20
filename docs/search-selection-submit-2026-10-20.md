# Envío al completar el segundo campo

- En el buscador de profesionales del navbar, la hoja móvil y el inicio, elegir una sugerencia o un servicio reciente envía la búsqueda si el otro campo ya tiene contenido. Si falta el otro campo, se conserva la hoja y se pasa el foco al campo pendiente.
- Reemplazar una selección cuando ambos campos tienen datos también busca inmediatamente.
- Los valores recién elegidos se entregan explícitamente al constructor de la URL; no se espera a que React actualice el estado. Seleccionar un lugar concreto sustituye las coordenadas previas.
- Buscar cerca de mí completa y envía la búsqueda cuando se obtiene la ubicación y ya existe un servicio; las direcciones de Google esperan su resolución antes de enviar.
- Enter conserva su comportamiento: busca con los valores actuales, incluso si falta un campo o están ambos vacíos. Un perfil reciente sigue abriendo directamente.
- Los tableros conservan sus filtros en vivo y cierran la hoja al completar los campos. Se corrige el foco del campo principal cuando se elige primero una ubicación en escritorio, y se guarda el reciente seleccionado sin reemplazarlo por el texto del render anterior.

La regresión cubre ambos órdenes, recientes con y sin ubicación, reemplazos, geolocalización, Enter, perfiles recientes, foco y estabilidad de marca en Chromium escritorio, Chromium móvil y WebKit móvil. Build de producción y contrato del logo aprobados. El lint comparado con HEAD no introduce diagnósticos nuevos; se conservan los 18 diagnósticos previos de los tres componentes.

No cambia el backend de resultados, el paginado, los avisos de privacidad ni las versiones de tienda.

Resultado: 58 comprobaciones dirigidas aprobadas entre los dos grupos de regresión y la repetición del caso de navegación adaptado al nuevo envío automático; 20 omisiones por tamaño de pantalla. La repetición verifica que la hoja permanezca durante una navegación pendiente y desaparezca al completar una búsqueda idéntica, sin otro Enter. Security smoke e inventario aprobados. No se publican versiones de tienda.

Seguimiento de regresión: se adaptan también `buscar-servicio-y-lugar.spec.ts` y los casos de cabecera/ubicación de `search-results.spec.ts`, que todavía enviaban Enter después de la segunda selección. Se aprueban otras 16 comprobaciones en los tres navegadores, con dos omisiones por diseño móvil. Este seguimiento solo cambia pruebas y documentación.
