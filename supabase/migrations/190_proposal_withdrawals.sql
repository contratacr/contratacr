-- Migration 190: dejar rastro de los retiros de un proyecto aceptado.
--
-- Cuando un profesional se retira de un proyecto que ya había aceptado, la
-- propuesta pasaba a `declined` — el MISMO valor que cuando es el cliente quien
-- rechaza. En los datos, alguien que abandonó tres trabajos era indistinguible
-- de alguien que perdió tres veces, y el único rastro era una notificación que
-- se lee y se borra.
--
-- Estas dos columnas separan las dos cosas y guardan lo que el profesional dijo.
-- Idempotente: se puede volver a correr.

alter table public.proposals
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdraw_reason text;

comment on column public.proposals.withdrawn_at is
  'Cuándo el PROFESIONAL se retiró de un proyecto que ya había aceptado. Nulo si la propuesta se rechazó por decisión del cliente.';
comment on column public.proposals.withdraw_reason is
  'Lo que el profesional escribió al retirarse. Se le muestra al cliente en la notificación.';

-- Buscar los retiros de un profesional no debe recorrer la tabla entera.
create index if not exists idx_proposals_withdrawn
  on public.proposals (professional_id, withdrawn_at desc)
  where withdrawn_at is not null;

notify pgrst, 'reload schema';
