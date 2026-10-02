-- RESPONDER CITANDO UN MENSAJE, COMO WHATSAPP.
--
-- Un mensaje puede apuntar al mensaje al que responde. Si el original se borra
-- (cuenta eliminada, limpieza), la respuesta se queda y la cita pasa a vacía:
-- nunca se pierde una respuesta por lo que le pase al original. Que el citado
-- sea de la MISMA conversación lo asegura la API, que es el único camino de
-- escritura (send_direct_message_atomic exige service_role).

alter table public.direct_messages
  add column if not exists reply_to_id uuid references public.direct_messages(id) on delete set null;

create index if not exists idx_direct_messages_reply_to
  on public.direct_messages (reply_to_id)
  where reply_to_id is not null;

notify pgrst, 'reload schema';
