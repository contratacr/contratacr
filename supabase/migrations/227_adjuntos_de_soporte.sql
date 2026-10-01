-- Adjuntos en el chat de soporte: fotos o PDF, privados, hasta 3 por mensaje.
-- Van en un bucket propio; se leen solo con enlaces firmados que arma la API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'];

alter table public.support_ticket_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.support_ticket_messages
  drop constraint if exists support_ticket_messages_attachments_array;
alter table public.support_ticket_messages
  add constraint support_ticket_messages_attachments_array
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 3);
