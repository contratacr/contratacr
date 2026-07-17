-- Keep direct-chat delivery, unread counters and participant archives consistent.

drop policy if exists "Participants can update direct conversations" on public.direct_conversations;
drop policy if exists "Participants can insert direct messages" on public.direct_messages;

create or replace function public.send_direct_message_atomic(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_conversation public.direct_conversations%rowtype;
  v_message public.direct_messages%rowtype;
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Direct messages must be sent through the application API' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.direct_conversations
  where direct_conversations.id = p_conversation_id
  for update;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if v_conversation.status <> 'open' then
    raise exception 'Conversation is not open' using errcode = '42501';
  end if;
  if p_sender_id <> v_conversation.client_id and p_sender_id <> v_conversation.professional_profile_id then
    raise exception 'Sender is not a participant' using errcode = '42501';
  end if;
  if char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'Message length is invalid' using errcode = '22023';
  end if;

  insert into public.direct_messages (conversation_id, sender_id, body)
  values (p_conversation_id, p_sender_id, btrim(p_body))
  returning * into v_message;

  if p_sender_id = v_conversation.client_id then
    update public.direct_conversations
    set last_message = v_message.body,
        last_message_at = v_now,
        last_sender_id = p_sender_id,
        professional_archived_at = null,
        professional_unread_count = professional_unread_count + 1,
        updated_at = v_now
    where direct_conversations.id = p_conversation_id;
  else
    update public.direct_conversations
    set last_message = v_message.body,
        last_message_at = v_now,
        last_sender_id = p_sender_id,
        client_archived_at = null,
        client_unread_count = client_unread_count + 1,
        updated_at = v_now
    where direct_conversations.id = p_conversation_id;
  end if;

  return query
  select v_message.id, v_message.conversation_id, v_message.sender_id, v_message.body, v_message.created_at;
end;
$$;

revoke all on function public.send_direct_message_atomic(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.send_direct_message_atomic(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
