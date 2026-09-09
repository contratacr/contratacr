-- Migration 193: la cédula del cliente en la cotización.
--
-- El profesional la digita para que el nombre venga del padrón (como en el
-- registro) y queda en la cotización como dato del documento. NO verifica la
-- identidad de nadie ni se muestra en la página pública.
-- Idempotente: se puede volver a correr.

alter table public.quotes add column if not exists client_cedula text;

comment on column public.quotes.client_cedula is 'Cédula que el profesional digitó del cliente, solo como dato de la cotización.';
