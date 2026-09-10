-- Migration 198: oportunidades que un profesional descartó ("No me interesa").
--
-- Antes vivían en el localStorage del teléfono: en otro dispositivo volvían a
-- aparecer todas. Aquí quedan por profesional. Solo escribe la API con la
-- llave de servicio, así que no lleva políticas.
-- Idempotente: se puede volver a correr.

create table if not exists public.dismissed_opportunities (
  professional_id uuid not null references public.professionals(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (professional_id, project_id)
);

comment on table public.dismissed_opportunities is 'Solicitudes abiertas que el profesional marcó "No me interesa". No se le vuelven a mostrar.';

alter table public.dismissed_opportunities enable row level security;
-- Sin políticas: nadie lee ni escribe con la llave pública. La API usa la de servicio.
