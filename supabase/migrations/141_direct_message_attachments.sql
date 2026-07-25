-- Allow direct-chat messages to carry private image/PDF attachments.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'direct-message-attachments',
  'direct-message-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

alter table public.direct_messages
  drop constraint if exists direct_messages_body_length;

alter table public.direct_messages
  alter column attachment_urls drop default;

alter table public.direct_messages
  alter column attachment_urls type jsonb
  using to_jsonb(attachment_urls);

alter table public.direct_messages
  alter column attachment_urls set default '[]'::jsonb;

alter table public.direct_messages
  add constraint direct_messages_body_or_attachment
  check (
    char_length(btrim(body)) between 1 and 2000
    or jsonb_array_length(attachment_urls) > 0
  );

create or replace function public.send_direct_message_atomic(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text,
  p_attachment_urls jsonb default '[]'::jsonb
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  attachment_urls jsonb,
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
  v_body text := btrim(coalesce(p_body, ''));
  v_attachments jsonb := coalesce(p_attachment_urls, '[]'::jsonb);
  v_last_message text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Direct messages must be sent through the application API' using errcode = '42501';
  end if;

  if jsonb_typeof(v_attachments) <> 'array' then
    raise exception 'Attachments must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(v_attachments) > 3 then
    raise exception 'Too many attachments' using errcode = '22023';
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
  if char_length(v_body) > 2000 or (char_length(v_body) = 0 and jsonb_array_length(v_attachments) = 0) then
    raise exception 'Message length is invalid' using errcode = '22023';
  end if;

  insert into public.direct_messages (conversation_id, sender_id, body, attachment_urls)
  values (p_conversation_id, p_sender_id, v_body, v_attachments)
  returning * into v_message;

  v_last_message := case
    when char_length(v_message.body) > 0 then v_message.body
    else 'Archivo adjunto'
  end;

  if p_sender_id = v_conversation.client_id then
    update public.direct_conversations
    set last_message = v_last_message,
        last_message_at = v_now,
        last_sender_id = p_sender_id,
        professional_archived_at = null,
        client_deleted_at = null,
        professional_deleted_at = null,
        professional_unread_count = professional_unread_count + 1,
        updated_at = v_now
    where direct_conversations.id = p_conversation_id;
  else
    update public.direct_conversations
    set last_message = v_last_message,
        last_message_at = v_now,
        last_sender_id = p_sender_id,
        client_archived_at = null,
        client_deleted_at = null,
        professional_deleted_at = null,
        client_unread_count = client_unread_count + 1,
        updated_at = v_now
    where direct_conversations.id = p_conversation_id;
  end if;

  return query
  select v_message.id, v_message.conversation_id, v_message.sender_id, v_message.body, v_message.attachment_urls, v_message.created_at;
end;
$$;

revoke all on function public.send_direct_message_atomic(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.send_direct_message_atomic(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.send_direct_message_atomic(uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
