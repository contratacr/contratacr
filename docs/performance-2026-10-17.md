# Rendimiento y logs — 17 de octubre de 2026

## Alcance

Solo despliegue web compartido. No se compilaron ni enviaron nuevas versiones nativas a las tiendas. Se mantienen umbrales, diseño, fotos, enlaces, navegación y controles de identidad.

## Medición antes del cambio

Producción, Chromium en teléfono 390×844 a DPR 3, CPU ×4, 1.6 Mbps/150 ms, visita fría. `scripts/perf-budgets.mjs` sin relajar límites. Captura de las 07:10–07:16 Costa Rica aproximadamente, con los resultados completos privados en `/tmp/contratacr-perf-before-20261017.log`.

| Ruta | JavaScript KB | Total KB | FCP ms |
| --- | ---: | ---: | ---: |
| Inicio | 670 | 5088 | 1660 |
| Profesionales | 687 | 1483 | 1828 |
| Categorías | 572 | 888 | 1244 |
| Login | 764 | 1183 | 1160 |
| Empleos | 572 | 1392 | 1236 |
| Perfil público muestreado | 628 | 1780 | 2180 |

Una segunda visita fría a inicio dio 670 KB JS, 5105 KB totales y FCP 1656 ms. Las rutas/datos de perfiles pueden variar con las publicaciones de usuarios. No comparar la compilación de desarrollo local con estos números de producción.

## Cambios

- La portada descargaba 32 fotos de servicios: 4 visibles y 28 de pestañas ocultas. Se conservan montados los paneles y se preparan fotos al anticipar una pestaña con puntero, foco o toque, conservándolas después de la primera visita. Ya no se habilitan todas al aparecer la sección.
- Fotos del catálogo con más anchos responsivos (320–1100 px) y calidad 70 en el CDN, conservando las fuentes y los encuadres.
- Rotación de portada: preparar solo la foto siguiente, no todas a los 1.5 segundos. No iniciar el fundido hasta que la siguiente haya cargado y decodificado. Se conserva el intervalo y el respeto a movimiento reducido.
- Capturas ocultas de la guía sin URL hasta que la guía esté cerca; la captura activa conserva carga diferida y los videos mantienen su política existente.
- Arte del bloque Descargar app: preparar a 500 px del viewport, manteniendo el tamaño reservado. Los enlaces a tiendas permanecen disponibles y el bloque nativo sigue oculto.
- Corrección complementaria: la cabecera CSP de Next en el callback Android permite el logo del propio origen, como ya hacía la respuesta del callback. La nueva prueba abre la ruta real para cubrir las cabeceras de despliegue, además del HTML aislado.

## Pruebas

- 9 comprobaciones nuevas de fotos ocultas, revisitar pestañas, reserva de altura, carga del arte y foto siguiente lenta, correctas en Chromium escritorio/móvil y WebKit móvil. Se usan fotos sintéticas en las pruebas de red, evitando depender de latencia/errores de Unsplash.
- Contratos de catálogo R2 (7), consultas del perfil público (5), acceso social nativo (24), marca y TypeScript correctos.
- La pasada local ampliada tuvo 102 aprobadas/17 omisiones y cuatro incidencias: una consulta inmediata a una imagen todavía no montada y una prueba de fotos que chocaba con el bloqueo de Unsplash del harness, corregidas y verificadas por separado; dos accesos del caso de notificaciones fallaron por contraseña de fixture en el entorno alojado, sin llegar a la sección bajo prueba. No se cuentan como defectos arreglados de navegación ni como casos aprobados. Ese caso no cambia en esta entrega; su comprobación requiere los fixtures canónicos de la ronda exhaustiva aislada. No se añadieron saltos para ocultar el problema del entorno alojado.
- Una invocación inicial reutilizó otro checkout en localhost:3000 y se descartó; la ejecución válida usa el checkout main en puerto 3107 con credenciales de test, sin acceso de localhost a producción. No se debilitaron las protecciones del destino de Supabase.

- Compilación OpenNext/Cloudflare terminada correctamente. Se agregaron `landing-media-budget` y `android-auth-return-presentation` al smoke de cada push para evitar que futuras optimizaciones adelanten cargas ocultas o rompan el callback.

- Repetición con la compilación de producción y datos de test: 18/18 correctas en Chromium escritorio/móvil y WebKit móvil (incluye los tres contratos de fotos, tamaños del arte en móvil/tableta/escritorio, marca con fuentes bloqueadas y callback real). Esta es la certificación focal del lote, independiente de la pasada de desarrollo con fixtures no válidos para acceso.

## Logs

Véase `supabase-log-usage-2026-10-16.md`. El panel muestra 86.705 MB el día 16 frente a 101.263 MB el 15 (−14.38 %), sin evidencia suficiente para atribuir el porcentaje al despliegue. El día 17 está incompleto; no se declara resuelto el presupuesto mensual.

## Después del despliegue

Pendiente medir el despliegue real con el mismo perfil y registrar los resultados. La reducción de fotografías no certifica por sí sola los presupuestos de JavaScript, FCP o transferencia de todas las rutas.
