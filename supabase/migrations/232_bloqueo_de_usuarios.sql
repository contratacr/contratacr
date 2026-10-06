-- BLOQUEAR A UN USUARIO (6-oct-2026, revisión de Apple, regla 1.2).
--
-- Quien bloquea a alguien deja de ver su perfil y sus publicaciones (empleos,
-- promociones, proyectos) al instante, y la conversación entre los dos queda
-- bloqueada. El bloqueo también le avisa al equipo (sale en Reportes del
-- admin) para revisarlo dentro de las 24 horas. Hasta hoy solo se podía
-- bloquear dentro del chat de la app.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;
-- Cada quien ve y maneja SOLO sus propios bloqueos. La persona bloqueada no
-- se entera: no puede leer la fila.
drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own" on public.user_blocks for select to authenticated using (auth.uid() = blocker_id);
drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own" on public.user_blocks for insert to authenticated with check (auth.uid() = blocker_id);
drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own" on public.user_blocks for delete to authenticated using (auth.uid() = blocker_id);

-- El reporte que deja un bloqueo apunta a un perfil (puede no ser profesional).
alter table public.reports add column if not exists blocked_profile_id uuid references public.profiles(id) on delete set null;
alter table public.reports add column if not exists kind text not null default 'report' check (kind in ('report', 'block'));

notify pgrst, 'reload schema';
