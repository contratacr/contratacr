# Búsqueda: lotes, indicadores y canal de contacto

## Comportamiento

- Una sola constante para la página inicial y la API: 20 profesionales por lote.
- El siguiente lote se solicita a 600 px del final del contenedor real del listado. El final del documento exterior no dispara cargas dentro del panel.
- No se solicita otro lote mientras el anterior todavía se está mostrando por grupos de cinco tarjetas por frame.
- El observador permanece invisible mientras está inactivo. Los dos skeletons solo aparecen después de 500 ms de una petición pendiente; no existe espera mínima artificial y las tarjetas existentes permanecen visibles.
- Una respuesta vacía o sin nuevos resultados termina la carga. Se conserva el reintento silencioso ante un fallo transitorio y se cancelan los reintentos y frames al salir.
- Los enlaces `page=2` continúan desde el desplazamiento correcto, sin repetir el lote inicial.
- El canal de las primeras tarjetas se resuelve en servidor para la sesión actual y llega al navegador junto con los resultados. Sin sesión no se consulta disponibilidad privada. La caché está separada por visitante y prioriza la decisión más reciente.
- Se comparte la misma decisión entre servidor y API: app activa en los últimos 30 días o conversación bloqueada dirige al chat. Un bloqueo nunca convierte el botón en un acceso a WhatsApp. Si falla la consulta inicial, se conserva la resolución del navegador.
- Empleos, promociones y proyectos no tenían skeletons permanentes de paginación: no se añaden esperas artificiales ni un paginador nuevo a esos tableros.

## Criterio

[Baymard](https://baymard.com/research-articles/number-of-items-loaded-by-default) recomienda evaluar lotes de 15–30 elementos en móvil y ajustar según el contenido y la relevancia. Veinte es la elección de ContrataCR, no una regla universal. El umbral de 500 ms del indicador es una decisión de implementación; no limita la velocidad de las respuestas.

## Validación

Se amplía `search-progressive-loading.spec.ts` para escritorio Chromium, móvil Chromium y WebKit: carga inicial, desplazamiento lejos del final, respuestas rápidas/lentas, disponibilidad inicial WhatsApp/chat, bloqueo, enlaces de segunda página y agotamiento con total desactualizado. `native-list-end.spec.ts` espera el final real del paginado, no la ausencia momentánea de un indicador.

Se conserva la regresión de canal estable, contacto anónimo, sugerencias y Enter. El inventario estático se regenera con los nuevos casos.

Medición local de un build de producción con datos TEST, emulación móvil Chromium, CPU ×4, 1.6 Mbps y 150 ms de latencia: 20 tarjetas, cero contactos pendientes para invitado, 171 KB transferidos de documento (1.02 MB descomprimido), tarea larga máxima de 137 ms. Una sola muestra sintética; no representa una medición de producción ni una comparación antes/después. Se mantiene el montaje progresivo para los lotes siguientes.

No incluye migraciones de base de datos ni publicación en tiendas.

Resultado: 52 casos aprobados en la ronda final de carga/contacto y 25 de sugerencias/Enter en la ronda complementaria; 13 omisiones por diseño según el tamaño de pantalla. Dos casos requirieron repetición individual por un timeout durante la limpieza de fixtures (la limpieza se comprobó en TEST); ambos pasaron. Se corrigieron las colisiones de URL entre fixtures paralelos y se rechaza explícitamente la publicidad antes de probar el contacto anónimo. Build de producción, TypeScript, lint de archivos afectados, inventario, contrato del logo y controles locales de seguridad aprobados.
