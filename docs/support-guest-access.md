# Continuar casos de acceso sin cuenta

El formulario público sigue permitiendo abrir cualquier caso sin iniciar sesión.
Al responder desde el panel de administración:

- Los casos de invitados con motivo `subject1` (cuenta, inicio de sesión o datos)
  reciben un enlace privado para continuar dentro de ContrataCR sin una cuenta.
- Los demás invitados reciben un enlace de entrada/registro con el destino del
  caso conservado en `redirect`. La cuenta debe verificar el mismo correo.
- Los casos asociados a cuentas conservan su enlace directo al panel.

## Alcance y protección

El enlace privado permite leer y enviar respuestas de texto únicamente en ese
caso. También permite ver los adjuntos que ya estén guardados en su hilo. No
crea una sesión de cuenta ni permite gestionar otros casos o datos de perfil.
El compositor de invitados no sube archivos; la subida inicial del formulario
público conserva su funcionamiento existente.

La capacidad está firmada con HMAC, vinculada al identificador del caso y al
correo del solicitante, y vence a los 14 días. Cada respuesta del equipo emite
un enlace con un nuevo vencimiento. Se invalida si cambia el correo, el motivo
deja de ser `subject1` o el caso queda asociado a una cuenta.

El secreto es `SUPPORT_GUEST_SECRET`, si está configurado, o la clave de servicio
existente de Supabase, con separación del dominio de firma. Sin una clave no se
emiten enlaces privados. No se requieren migraciones ni secretos públicos nuevos.

La firma viaja en el fragmento del enlace, se retira de la barra de dirección al
abrirlo y se canjea por una cookie HttpOnly, SameSite Strict y limitada al endpoint
del caso. Las peticiones no se almacenan en caché. Las respuestas requieren el
mismo origen, tienen límite de frecuencia y dejan una entrada de auditoría.

Las respuestas al correo de notificación no se incorporan al caso; el correo
indica que se debe continuar desde el enlace. Un enlace vencido ofrece entrar
con el mismo correo o abrir un nuevo caso si el acceso aún no es posible.

## Validación

`tests/e2e/support-guest-access.spec.ts` comprueba la firma y caducidad, los
destinos del correo, lectura/respuesta/recarga sin cuenta, aislamiento entre
casos y correos, rechazo de otros motivos y de casos asociados, protección de
origen, recuperación de un fallo transitorio y entrada al caso con correo
verificado. Las pruebas usan registros desechables en una base de regresión
aislada; no envían notificaciones a clientes reales.
