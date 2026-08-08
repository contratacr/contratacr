-- Unified saved items for clients: offers and jobs.
-- Existing saved_professionals stays as-is for professional profile bookmarks.

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('offer','job')),
  item_id uuid not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

create index if not exists saved_items_user_type_created_idx
  on public.saved_items (user_id, item_type, created_at desc);

alter table public.saved_items enable row level security;

create policy "Users view their saved items"
  on public.saved_items for select
  using (user_id = auth.uid());

create policy "Users save items"
  on public.saved_items for insert
  with check (user_id = auth.uid());

create policy "Users update their saved items"
  on public.saved_items for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users remove their saved items"
  on public.saved_items for delete
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
