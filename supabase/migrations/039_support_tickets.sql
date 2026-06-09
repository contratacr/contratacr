-- 039_support_tickets.sql
-- "Contactar soporte" form → admin ticket queue, consistent with the other
-- admin moderation/suggestion queues (read/written via the service-role only).

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  name        text,
  email       text not null,
  subject     text not null,
  message     text not null,
  status      text not null default 'open',   -- 'open' | 'closed'
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status, created_at desc);

-- RLS on with NO policies: locked to anon/authenticated. The contact API and the
-- admin panel use the service-role client (which bypasses RLS), exactly like the
-- category/insurer suggestion queues.
alter table public.support_tickets enable row level security;
