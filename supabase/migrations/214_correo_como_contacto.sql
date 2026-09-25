-- El correo deja de contarse como «enlace externo».
--
-- `external_link_click` cubría dos cosas distintas: escribirle por correo al
-- profesional y abrir su Instagram o su Facebook. El panel contaba las dos
-- como contacto, así que la tasa de contacto estaba inflada por clics a redes.
-- Se agrega `email_click` y el correo pasa a usarlo; `external_link_click`
-- queda solo para redes y sitio web, y las filas viejas se conservan tal cual
-- (son el registro histórico).

alter table public.interaction_events
  drop constraint if exists interaction_events_event_type_check;

notify pgrst, 'reload schema';
