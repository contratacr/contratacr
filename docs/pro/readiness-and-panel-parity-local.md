# Preparación local y panel compatible — 5 noviembre 2026

Solo checkout Pro, rama `local/pro-suite-no-push`, HEAD `06b70019de69bb4e1ee46ead3eda22eedf05f7d0`. Se conserva el trabajo local anterior. No se autoriza publicación ni modificación de producción/main/mobile.

## Hallazgos y selección

La revisión previa validaba recorridos en desarrollo; no acreditaba una compilación optimizada. Se selecciona `next build --webpack` con variables de `.env.test` y comprobación previa de Supabase/DB exclusivamente loopback. Se detiene únicamente Next local durante la compilación y se restablece luego, sin reiniciar la base, preparar SQL ni sembrar datos.

La primera compilación detectó una exportación adicional `canonicalizeMessage` en la ruta API del asistente. Next solo admite los exports del contrato de rutas. No tiene consumidores externos: se deja como función privada, conservando exactamente su cuerpo y su uso en POST.

El usuario señaló diferencias con producción en el panel. Comparación en lectura con el checkout main: el menú móvil original no incluye home dentro de home. Se elimina esa fila redundante en Pro, conservando el título Mi panel, la ficha, sus acciones y los destinos originales más las herramientas añadidas. No se pretende igualar datos de una cuenta ficticia incompleta con una cuenta pública completa.

El resumen operativo aparecía durante las dos consultas iniciales y desaparecía cuando ambas quedaban vacías. Ahora permanece oculto hasta tener trabajos, solicitudes o un error; las consultas siguen ejecutándose y los errores/reintentos no se ocultan. El bloque de solicitudes tampoco muestra una tarjeta de carga vacía dentro de un resumen con trabajos.

Cobertura seleccionada: resumen ES/EN con respuestas iniciales retenidas para detectar el parpadeo, estados vacío/pendiente/trabajo/error/recuperación y conservación de documento/notificaciones; navegación simplificada en WebKit y Chromium móvil. Se actualiza la expectativa de la fila home sin retirar las comprobaciones de perfil, publicaciones, retornos, datos o facturación plegada. Se reutiliza el cierre anterior para los motores y SQL no modificados.

## Límites que siguen antes de publicar

- Las API Pro deliberadamente rechazan ejecución fuera de desarrollo. No se retiran esas guardas en esta corrección visual.
- El esquema sigue en SQL local. Falta preparar una migración versionada del alcance que se decida integrar y ensayar la actualización desde una base aislada representativa, con respaldo y conservación. No se ejecuta la preparación actual sobre producción.
- La consulta de identificación no concede acceso a contactos privados de cuentas ajenas. Su uso público requiere resolver condiciones del proveedor y tratamiento de datos; no es requisito para operar con entrada manual.
- Facturación se conserva como herramienta secundaria de borradores, no emisión fiscal ni paridad GTI.

Resultados finales se añaden después de ejecutar las comprobaciones.

## Comparación con el panel habitual

Referencia en solo lectura: main local `bb18d2875ed5709cf972debd8a2102cfdaab237f`; no se tomó una sesión pública como validación de Pro. El panel móvil de referencia no tiene una fila home. La corrección conserva el mismo encabezado Mi panel y la ficha con nombre, foto, progreso, Ver perfil y Compartir. Conserva Mis proyectos, Empleos, Promociones y las opciones de cuenta. Trabajos, Cotizaciones, Clientes y Herramientas son accesos añadidos por este alcance y no sustituyen los originales. Se confirmó visualmente en el simulador con la cuenta ficticia existente, sin guardar ni crear datos.

La primera ronda de navegación falló porque la expectativa inglesa todavía exigía la fila duplicada que se acababa de retirar; no fue una aprobación ni un fallo de guardado. Se actualizó también esa expectativa al contrato nuevo. La comprobación española verifica expresamente ausencia de la fila en móvil y presencia del acceso de escritorio. Permanecen las comprobaciones de ficha, publicaciones, títulos, idioma, retorno, ausencia de descargas completas y conservación de los registros.

## Resultados finales

- Compilación optimizada `next build --webpack`: aprobada, incluido el chequeo TypeScript generado por Next. No se inició servidor de producción ni se probó habilitar API Pro en ese modo. Se restableció el servidor de desarrollo loopback 3185 con push deshabilitado.
- Resumen: 4/4 ES/EN × WebKit/Chromium móvil, incluyendo carga inicial retenida, errores y recuperación. Navegación con expectativas finales: 2/2, ambos navegadores móviles. Se conserva la ronda inicial fallida como diagnóstico; no se presenta como verde.
- Lint de los cinco archivos intervenidos, i18n, UTF-8 y diff-check: aprobados. La compilación conserva avisos existentes de convención middleware/deprecación y dependencias; no se afirma ausencia de advertencias globales.
- Conservación: 78 tablas/626 filas originales idénticas y 51 filas demo registradas intactas; sin nuevos registros operativos sobrantes. Historial de la cotización de cambios y notificaciones anteriores intactos.
- Solo se cambió la visibilidad del resumen y su bloque de solicitudes, la fila móvil duplicada, las expectativas correspondientes y el export de la ruta del asistente. Los demás archivos locales anteriores se preservaron. Sin cambios en SQL, permisos, autenticación o motor financiero.

Evidencia final: `research/2026-11-05/panel-parity/`. El candidato está corregido y validado para estos casos locales. Para publicarlo siguen pendientes el ensayo de migración y la activación controlada en entorno aislado; esta ronda no los sustituye y no hace push.
