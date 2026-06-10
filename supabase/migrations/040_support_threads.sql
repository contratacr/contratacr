-- 040_support_threads.sql
-- Turn support_tickets into a full threaded, admin-managed support system.
--
-- IMPORTANT: `support_tickets` may already exist in one of two shapes:
--   • migration 027 — verification tickets: (professional_id, type, subject,
--     detail, status open|resolved, created_at, resolved_at)  ← created FIRST,
--     so the richer migration 039 (user_id/name/email/message) was a NO-OP.
--   • migration 039 — (user_id, name, email, subject, message, status, reviewed_at).
-- This migration is defensive: it ADDS every column the app needs if missing,
-- so it works regardless of which shape the live table has.
-- All read/written via the service-role only (RLS on), like the other queues.

-- ── Ensure the ticket columns the app uses all exist ────────────────────────
alter table public.support_tickets
  add column if not exists user_id         uuid references auth.users(id) on delete set null,
  add column if not exists name            text,
  add column if not exists email           text,
  add column if not exists subject         text,
  add column if not exists message         text,
  add column if not exists reviewed_at     timestamptz,
  add column if not exists topic           text,
  add column if not exists handled_by      uuid references auth.users(id) on delete set null,
  add column if not exists handled_by_name text,
  add column if not exists handled_at      timestamptz,
  add column if not exists last_reply_at   timestamptz,
  add column if not exists last_reply_role text;   -- 'user' | 'admin'

-- If this DB has the 027 verification shape, fold its `detail` into `message`
-- and give every ticket a subject so the UI always has something to show.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_tickets' and column_name = 'detail'
  ) then
    update public.support_tickets set message = coalesce(message, detail) where message is null;
  end if;
  update public.support_tickets set subject = coalesce(subject, 'Soporte') where subject is null;
end $$;

-- Widen the status lifecycle (027 allowed only open|resolved; 039 open|closed).
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

-- ── Backfill: seed a first thread message from each existing ticket ─────────
insert into public.support_ticket_messages (ticket_id, sender_role, sender_id, sender_name, body, created_at)
select t.id, 'user', t.user_id, t.name, coalesce(t.message, ''), t.created_at
from public.support_tickets t
where coalesce(t.message, '') <> ''
  and not exists (select 1 from public.support_ticket_messages m where m.ticket_id = t.id);

update public.support_tickets
  set last_reply_at = coalesce(last_reply_at, created_at),
      last_reply_role = coalesce(last_reply_role, 'user');

-- Reload the PostgREST schema cache so the supabase-js client sees the new
-- columns/table immediately (otherwise inserts fail with PGRST204 "column not
-- found in schema cache" even though the column exists).
notify pgrst, 'reload schema';
