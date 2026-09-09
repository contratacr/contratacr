-- Migration 197: borrar una cotización sin perder su número.
--
-- Una cotización suelta que se hizo por error se puede eliminar, pero el
-- consecutivo NO se reutiliza: el número queda ocupado, como en cualquier
-- talonario. Por eso el borrado es lógico (deleted_at) y no un DELETE.
-- Idempotente: se puede volver a correr.

alter table public.quotes add column if not exists deleted_at timestamptz;

comment on column public.quotes.deleted_at is 'Borrada por el profesional. Deja de listarse y su enlace deja de abrir; el número sigue ocupado.';

create index if not exists idx_quotes_vivas on public.quotes (professional_id, created_at desc) where deleted_at is null;
