-- Archive direct conversations independently for each participant.

alter table public.direct_conversations
  add column if not exists client_archived_at timestamptz,
  add column if not exists professional_archived_at timestamptz;

create index if not exists direct_conversations_client_archive_idx
  on public.direct_conversations (client_id, client_archived_at, last_message_at desc nulls last);

create index if not exists direct_conversations_professional_archive_idx
  on public.direct_conversations (professional_profile_id, professional_archived_at, last_message_at desc nulls last);

notify pgrst, 'reload schema';
