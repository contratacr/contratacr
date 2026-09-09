-- Migration 196: registro de errores del cliente (app y web).
--
-- Cuando a alguien le sale "Algo salió mal" no hay forma de saber qué pasó: el
-- error vive en la consola del teléfono. Esta tabla lo guarda para poder
-- arreglarlo. Solo escribe la API con la llave de servicio; nadie la lee desde
-- el cliente.
-- Idempotente: se puede volver a correr.

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  pathname text,
  message text,
  stack text,
  origen text,
  user_agent text,
  native boolean not null default false,
  app_environment text,
  created_at timestamptz not null default now()
);

comment on table public.client_errors is 'Errores que revientan la pantalla en el navegador o en la app. Solo para diagnóstico.';
comment on column public.client_errors.origen is 'De dónde vino: boundary (pantalla caída), window (error suelto) o rejection (promesa).';

create index if not exists idx_client_errors_created on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
-- Sin políticas: nadie lee ni escribe con la llave pública. La API usa la de servicio.
