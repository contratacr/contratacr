-- Allow each participant to remove an archived direct conversation from their own inbox.
-- This does not delete the other participant's copy or the underlying message history.

alter table public.direct_conversations
  add column if not exists client_deleted_at timestamptz,
  add column if not exists professional_deleted_at timestamptz;

create index if not exists direct_conversations_client_deleted_idx
  on public.direct_conversations (client_id, client_deleted_at, last_message_at desc nulls last);

create index if not exists direct_conversations_professional_deleted_idx
  on public.direct_conversations (professional_profile_id, professional_deleted_at, last_message_at desc nulls last);
