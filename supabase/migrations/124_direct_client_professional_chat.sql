-- 110_direct_client_professional_chat.sql
-- Direct in-app conversations between clients and professionals.
-- WhatsApp remains available as an external fallback, but this stores the
-- official ContrataCR conversation history.

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  professional_profile_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  subject text,
  status text not null default 'open' check (status in ('open', 'archived', 'blocked')),
  last_message text,
  last_message_at timestamptz,
  last_sender_id uuid references auth.users(id) on delete set null,
  client_unread_count integer not null default 0,
  professional_unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_conversations_distinct_people check (client_id <> professional_profile_id)
);

create index if not exists direct_conversations_client_idx
  on public.direct_conversations (client_id, last_message_at desc nulls last, created_at desc);

create index if not exists direct_conversations_professional_profile_idx
  on public.direct_conversations (professional_profile_id, last_message_at desc nulls last, created_at desc);

create index if not exists direct_conversations_professional_idx
  on public.direct_conversations (professional_id);

create unique index if not exists direct_conversations_booking_uidx
  on public.direct_conversations (booking_id)
  where booking_id is not null;

create unique index if not exists direct_conversations_project_professional_uidx
  on public.direct_conversations (project_id, professional_id)
  where project_id is not null;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  attachment_urls text[] not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_conversation_idx
  on public.direct_messages (conversation_id, created_at asc);

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "Participants can read direct conversations" on public.direct_conversations;
create policy "Participants can read direct conversations"
  on public.direct_conversations for select
  using (auth.uid() = client_id or auth.uid() = professional_profile_id);

drop policy if exists "Participants can update direct conversations" on public.direct_conversations;
create policy "Participants can update direct conversations"
  on public.direct_conversations for update
  using (auth.uid() = client_id or auth.uid() = professional_profile_id)
  with check (auth.uid() = client_id or auth.uid() = professional_profile_id);

drop policy if exists "Participants can read direct messages" on public.direct_messages;
create policy "Participants can read direct messages"
  on public.direct_messages for select
  using (
    exists (
      select 1 from public.direct_conversations c
      where c.id = conversation_id
        and (auth.uid() = c.client_id or auth.uid() = c.professional_profile_id)
    )
  );

drop policy if exists "Participants can insert direct messages" on public.direct_messages;
create policy "Participants can insert direct messages"
  on public.direct_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.direct_conversations c
      where c.id = conversation_id
        and c.status = 'open'
        and (auth.uid() = c.client_id or auth.uid() = c.professional_profile_id)
    )
  );

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_conversations'
    ) then
      alter publication supabase_realtime add table public.direct_conversations;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
    ) then
      alter publication supabase_realtime add table public.direct_messages;
    end if;
  end if;
end $$;

alter table public.direct_conversations replica identity full;
alter table public.direct_messages replica identity full;

notify pgrst, 'reload schema';
