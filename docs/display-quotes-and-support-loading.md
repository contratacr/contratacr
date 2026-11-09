# Comillas visibles y carga de soporte

Base 26de290a. Los textos de la aplicación usan comillas dobles ASCII. Se auditaron literales de TypeScript/JSX y traducciones, excluyendo comentarios y expresiones regulares técnicas; las variables de interpolación conservan su sintaxis. `scripts/verify-display-quotes.mjs` y AGENTS.md conservan la regla para cambios futuros.

Las notificaciones, avisos push, conversaciones de soporte y respuestas del asistente normalizan también el texto almacenado o generado anteriormente. No se reescribe el historial de personas. La migración 266 actualiza únicamente el generador SQL de futuras notificaciones de aclaración, conservando permisos e idempotencia.

La apertura de un caso desde una notificación muestra un esqueleto de chat desde el inicio: cabecera, burbujas alternadas y compositor inferior. Cuando ya se conoce el caso, se mantienen su cabecera y compositor y solo esperan los mensajes. Se retiran los mensajes del caso anterior al cambiar y se ignoran respuestas tardías después de cerrar/cambiar de hilo. Volver limpia `ticket` de la URL y permite abrir el caso nuevamente.

Validación en Supabase local aislado:

- 84 comprobaciones de soporte, aclaraciones, notificaciones, privacidad y marca en Chromium escritorio/móvil y WebKit móvil.
- 24 comprobaciones finales sobre el árbol de entrega: carga con red detenida desde una notificación, mensajes históricos, asistente nativo y payload FCM (metadatos privados y límites conservados).
- 3 recorridos de la API real del asistente para consultas ambiguas en español/inglés.
- Build, TypeScript, auditoría de comillas, UTF-8, i18n, inventario y ESLint focal. En los componentes grandes con diagnósticos previos se comparó con la base, sin introducir diagnósticos nuevos.

Los conjuntos tienen casos repetidos; no se presentan como una suite exhaustiva ni como 111 pruebas únicas. Se conserva sin incluir el cambio previo de globals.css de otra tarea. La migración y los despliegues remotos se verifican por separado. No se enviaron preguntas ni correos a personas reales.
