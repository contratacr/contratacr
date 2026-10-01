-- Editar y anular mensajes del chat, como WhatsApp.
--
-- · edited_at:  el autor corrigió el texto (solo en los primeros 15 minutos;
--               la regla de tiempo vive en la API, que es quien escribe).
-- · deleted_at: el autor lo eliminó PARA TODOS (también 15 minutos). El texto y
--               los adjuntos se borran de verdad; queda la fila para pintar
--               «Se eliminó este mensaje» en su lugar y no descolocar el hilo.
-- · hidden_for: quién lo eliminó SOLO PARA SÍ. Sin límite de tiempo; la otra
--               persona lo sigue viendo.
--
-- La regla «texto o adjunto» impedía guardar un mensaje vaciado: ahora un
-- mensaje eliminado para todos puede quedar sin ninguno de los dos.

alter table public.direct_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists hidden_for uuid[] not null default '{}';

alter table public.direct_messages
  drop constraint if exists direct_messages_body_or_attachment;

alter table public.direct_messages
  add constraint direct_messages_body_or_attachment
  check (
    deleted_at is not null
    or char_length(btrim(body)) between 1 and 2000
    or jsonb_array_length(attachment_urls) > 0
  );

notify pgrst, 'reload schema';
