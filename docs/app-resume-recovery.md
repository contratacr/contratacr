# Recuperación al volver a ContrataCR

Cambio del 22 de octubre de 2026. Compartido por web, PWA y la web remota de Capacitor; no requiere agregar un plugin nativo nuevo ni publicar en las tiendas.

## Comportamiento

- Un coordinador recibe visibilitychange, pagehide/pageshow, freeze/resume, foco y reconexión. En Capacitor también escucha appStateChange, pause y resume, incluso si el documento todavía informa que está oculto.
- Agrupa los avisos de un mismo regreso. La interfaz, la sesión conocida y los datos visibles permanecen disponibles mientras cada consumidor se reconcilia.
- Elimina la recarga completa automática que antes ocurría después de diez minutos en la app o tras fallar la comprobación de /api/health. Esa ruta comprobaba disponibilidad HTTP, no la salud de la interfaz o de la sesión.
- Los errores de getSession durante la reconciliación no se convierten en un usuario anónimo. El cierre explícito sigue aplicándose; no se omite el doble factor ni se conceden permisos desde el estado conservado.
- Después de al menos un minuto o una reconexión real, adelanta la comprobación del socket Realtime existente; el SDK administra sus reconexiones. Los mensajes y listas vuelven a consultar sin vaciar su contenido ni el editor.
- Recalcula el viewport/teclado y recupera candados de scroll huérfanos usando el mecanismo existente. No elimina el candado de un diálogo abierto.
- Solo solicita refresh suave de la ruta cuando está en primer plano, hay conexión y no hay formularios, campos de edición o diálogos. Nunca borra almacenamiento, cierra sesión, envía borradores ni recarga el documento para recuperarse.
- Limpia timers y cada listener nativo al desmontarse, incluidas las suscripciones que terminan de registrarse después del desmontaje.

## Validación y límites

`recuperacion-al-desbloquear.spec.ts` ejercita el coordinador real con fronteras simuladas de transporte/Capacitor: avisos repetidos, 5 segundos y 11 minutos de edad de suspensión, texto/archivo/almacenamiento intactos, falta y regreso de red, candados, limpieza y errores de sesión frente a cierre explícito.

`reanudar-la-app.spec.ts` comprueba además la búsqueda, el panel autenticado y un borrador real con cuenta desechable exclusivamente en Supabase TEST. Los intervalos largos de estas regresiones se reproducen adelantando el reloj de pared, no como un bloqueo físico del teléfono. El mensaje de prueba no se envía.

Las pruebas del simulador iOS son evidencia adicional, no equivalen a bloquear un dispositivo físico. Un proceso de WebKit que el sistema mantenga completamente suspendido no puede ejecutar este código JavaScript; esta mejora no demuestra que todos los congelamientos del sistema estén resueltos. No se implementa una recarga destructiva para esconder esa limitación.
