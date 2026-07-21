-- Push notification tokens by user/device for mobile app messaging.

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  device_id text,
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, platform, token)
);

create index if not exists user_push_tokens_user_idx
  on public.user_push_tokens (user_id);

create index if not exists user_push_tokens_active_user_idx
  on public.user_push_tokens (user_id)
  where is_active = true;

create index if not exists user_push_tokens_token_idx
  on public.user_push_tokens (token);

alter table public.user_push_tokens enable row level security;

drop policy if exists "Users can read their own push tokens" on public.user_push_tokens;
create policy "Users can read their own push tokens"
  on public.user_push_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage their own push tokens" on public.user_push_tokens;
create policy "Users can manage their own push tokens"
  on public.user_push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_user_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.last_seen_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_push_tokens_updated_at on public.user_push_tokens;
create trigger trg_user_push_tokens_updated_at
  before insert or update on public.user_push_tokens
  for each row
  execute function public.touch_user_push_tokens_updated_at();

notify pgrst, 'reload schema';
