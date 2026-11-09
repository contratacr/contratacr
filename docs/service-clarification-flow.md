# Aclaraciones de solicitudes de servicios

En Servicios → Sugerencias, **Solicitar aclaración** permite escribir una pregunta y abrir un caso de soporte vinculado. La solicitud conserva `pending`: no se rechaza ni se publica por pedir información.

Cada solicitante registrado tiene un hilo privado propio. La migración 265 vincula el caso a `service_suggestion_requests`; la función privada verifica al administrador y crea el caso, el mensaje y su notificación en una sola transacción. Una clave por envío evita repetir mensajes/notificaciones al reintentar. Preguntas posteriores reutilizan el mismo caso, incluso si estaba cerrado. Sin una cuenta vinculada, se informa el impedimento en lugar de atribuir la solicitud a otra persona.

El admin ve **Esperando respuesta** cuando habló el equipo de último y **Por revisar** cuando responde el solicitante, junto a la última respuesta y un enlace a esa conversación. Se usa el compositor, la autenticación y las restricciones de propiedad de Soporte existentes. Aprobar o resolver con un servicio existente mantiene el flujo de invitación al editor; solo guardar publica el servicio en el perfil.

Los avisos llegan dentro de la app y por su outbox de push existente. `notifyUserOfReply` omite correo para `topic=service_suggestion`, incluidas respuestas y cierres genéricos, sin cambiar los correos de otros casos. No se crean campañas ni se abren casos históricos automáticamente.

## Evidencia antes del push

Base `15ddc60308b0a087696bfc53a04d659252057acb`. Se aplicó 265 en Supabase local aislado. Se excluyeron credenciales de producción/correo/push de los procesos de prueba. globals.css tenía un cambio ajeno previo: se preserva y no se incluye en este cambio.

- 87/87 comprobaciones de aclaraciones, flujo de servicios, contratos de paginación administrativa y supresión de correo, en Chromium escritorio/móvil y WebKit móvil (los contratos puros se repiten por proyecto).
- MFA real del admin, pregunta editable, reintento idempotente, dos solicitantes y dos casos privados, bloqueo de lectura/escritura ajena y RPC anónima, respuesta desde la cuenta, estado Por revisar, reutilización del hilo y aprobación posterior sin publicar el perfil.
- Build y TypeScript correctos; ESLint focal, UTF-8, presupuesto i18n, inventario y diff verificados.

Esta evidencia es focal, no una certificación de la suite exhaustiva. Los despliegues y la migración remota se verifican por separado. No se envió ninguna pregunta a solicitantes reales durante la validación.
