-- Migration 192: cotizaciones para cualquier cliente, con enlace público.
--
-- La 191 obligaba a que la cotización fuera sobre una cita o un proyecto de un
-- cliente registrado. En producción hay 0 citas y 1 proyecto, así que nadie
-- podía cotizar. Ahora el profesional cotiza desde su sección "Cotizaciones" a
-- quien sea (nombre y WhatsApp), y el cliente la ve y la acepta desde un
-- enlace público: contratacr.com/cotizacion/<código>.
-- Idempotente: se puede volver a correr.

alter table public.quotes alter column client_id drop not null;

alter table public.quotes add column if not exists client_name text;
alter table public.quotes add column if not exists client_phone text;
alter table public.quotes add column if not exists public_code text;

comment on column public.quotes.client_name is 'Nombre del cliente cuando la cotización no va sobre una cita o un proyecto.';
comment on column public.quotes.client_phone is 'WhatsApp del cliente, para mandarle el enlace.';
comment on column public.quotes.public_code is 'Código del enlace público (contratacr.com/cotizacion/<código>). Único e inadivinable.';

-- Las cotizaciones viejas también reciben su código, para que tengan enlace.
update public.quotes
   set public_code = lower(substr(replace(replace(encode(gen_random_bytes(9), 'base64'), '/', 'x'), '+', 'y'), 1, 12))
 where public_code is null;

create unique index if not exists idx_quotes_public_code on public.quotes (public_code);

-- Toda cotización nueva trae código: la API lo genera, y esto lo garantiza.
alter table public.quotes alter column public_code set not null;
