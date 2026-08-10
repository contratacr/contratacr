-- Following is a visible social relationship. Saved professionals remain private.
create table if not exists public.professional_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, professional_id)
);

create index if not exists professional_follows_follower_created_idx
  on public.professional_follows (follower_id, created_at desc);
create index if not exists professional_follows_professional_created_idx
  on public.professional_follows (professional_id, created_at desc);

alter table public.professional_follows enable row level security;

drop policy if exists "Follows are publicly viewable" on public.professional_follows;
create policy "Follows are publicly viewable"
  on public.professional_follows for select using (true);

drop policy if exists "Accounts can follow professionals" on public.professional_follows;
create policy "Accounts can follow professionals"
  on public.professional_follows for insert
  with check (
    auth.uid() = follower_id
    and not exists (
      select 1 from public.professionals
      where professionals.id = professional_id
        and professionals.profile_id = auth.uid()
    )
  );

drop policy if exists "Accounts can unfollow professionals" on public.professional_follows;
create policy "Accounts can unfollow professionals"
  on public.professional_follows for delete
  using (auth.uid() = follower_id);
