-- LA INVITACIÓN A RESEÑAR EN GOOGLE, UNA SOLA VEZ POR CUENTA, GARANTIZADO.
--
-- El código ya revisa antes de crearla, pero desde el 4-oct-2026 se dispara en
-- el momento de cada interacción: dos acciones casi simultáneas (dos mensajes
-- seguidos) podían pasar la revisión a la vez y dejar dos avisos iguales. El
-- índice único lo impide en la base. Medido antes de crearlo: 415 cuentas con
-- la invitación y ninguna repetida, así que se crea sin tocar datos.

create unique index if not exists notifications_resena_google_una_por_cuenta
  on public.notifications (user_id)
  where type = 'resena_google';
