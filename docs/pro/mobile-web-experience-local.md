# Experiencia Pro en móvil: alcance web/PWA (fila 73)

Construido (web adaptable):
- Espacio Pro responsive (320 a 1366 px) con selector de sección en móvil, sin desborde horizontal (spec `pro-web-app.spec.ts`).
- PWA instalable del espacio Pro: manifiesto `/api/pro/app-manifest` (ES/EN, nombre "ContrataCR Pro", `start_url` `/dashboard/pro`, accesos rápidos a Proyectos, Tareas, Agenda y Clientes), botón "Instalar" donde el navegador lo permite y pista de "Agregar a inicio" en iPhone (`pro-app-support.tsx`).
- Service worker `public/pro-sw.js`: solo guarda una página estática sin conexión; no almacena respuestas de API ni datos de cuentas. Aviso "Sin conexión" en el espacio Pro; los cambios no se encolan sin red.
- Todo detrás de PRO_ENABLED (el manifiesto responde 404 con Pro apagado).

EXCLUIDO de esta fila (tiendas y nativo): binarios iOS/Android del espacio Pro, notificaciones push nativas, cámara/escáner/biometría y demás capacidades del dispositivo, publicación en App Store/Google Play y sincronización offline con escritura. Se mantiene en la aplicación nativa existente solo lo que ya había (shell de Capacitor).
