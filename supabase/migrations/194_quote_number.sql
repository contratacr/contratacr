-- Migration 194: número de cotización por profesional.
--
-- Toda cotización de verdad lleva número: sirve para nombrarla ("Cotización
-- 0007"), para que el cliente la identifique en su teléfono y para que el
-- profesional la busque después. Corre de 1 en adelante DENTRO de cada
-- profesional, no en toda la base.
-- Idempotente: se puede volver a correr.

alter table public.quotes add column if not exists quote_number integer;

comment on column public.quotes.quote_number is 'Consecutivo por profesional (1, 2, 3…). Se usa en el nombre del PDF y en el documento.';

-- Las que ya existen reciben su número por orden de creación.
with numeradas as (
  select id, row_number() over (partition by professional_id order by created_at, id) as n
    from public.quotes
   where quote_number is null
)
update public.quotes q
   set quote_number = numeradas.n
  from numeradas
 where q.id = numeradas.id;

-- Dos cotizaciones del mismo profesional no pueden compartir número.
create unique index if not exists idx_quotes_number_per_pro on public.quotes (professional_id, quote_number);
