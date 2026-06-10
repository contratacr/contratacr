-- 040_support_threads.sql
-- Turn support_tickets into a full threaded, admin-managed support system:
--   • richer status lifecycle (open | in_progress | resolved | closed)
--   • a message thread (support_messages) for the back-and-forth
--   • audit of who handled it + when the last reply landed
-- All read/written via the service-role only (RLS on, no policies), exactly like
-- the existing moderation/suggestion queues.

-- ── Ticket columns ──────────────────────────────────────────────────────────
alter table public.support_tickets
  add column if not exists topic           text,
  add column if not exists handled_by      uuid references auth.users(id) on delete set null,
  add column if not exists handled_by_name text,
  add column if not exists handled_at      timestamptz,
  add column if not exists last_reply_at   timestamptz,
  add column if not exists last_reply_role text;   -- 'user' | 'admin'

-- Widen the status lifecycle (was 'open' | 'closed').
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'resolved', 'closed'));

-- ── Message thread ──────────────────────────────────────────────────────────
-- NOTE: a legacy `support_messages` table (migration 012) already exists with an
-- unrelated schema, so this thread table uses a distinct name to avoid colliding.
create table if not exists public.support_ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'admin')),
  sender_id   uuid references auth.users(id) on delete set null,
  sender_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx
  on public.support_ticket_messages (ticket_id, created_at asc);

alter table public.support_ticket_messages enable row level security;

-- ── Backfill: seed a first thread message from each existing ticket ──────────
insert into public.support_ticket_messages (ticket_id, sender_role, sender_id, sender_name, body, created_at)
select t.id, 'user', t.user_id, t.name, t.message, t.created_at
from public.support_tickets t
where not exists (select 1 from public.support_ticket_messages m where m.ticket_id = t.id);

update public.support_tickets
  set last_reply_at = coalesce(last_reply_at, created_at),
      last_reply_role = coalesce(last_reply_role, 'user');
