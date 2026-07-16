-- Keep one clear conversation per profile, booking or project/professional pair.
-- Existing contextual conversations remain untouched.

create unique index if not exists direct_conversations_profile_pair_uidx
  on public.direct_conversations (client_id, professional_id)
  where booking_id is null and project_id is null and proposal_id is null;

create index if not exists direct_conversations_proposal_idx
  on public.direct_conversations (proposal_id)
  where proposal_id is not null;

alter table public.direct_messages
  add constraint direct_messages_body_length
  check (char_length(btrim(body)) between 1 and 2000) not valid;

notify pgrst, 'reload schema';
