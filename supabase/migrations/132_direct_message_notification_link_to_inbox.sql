-- Route direct-message notifications to the standalone inbox.

create or replace function public.notify_direct_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_conversation public.direct_conversations%rowtype;
  v_receiver_id uuid;
begin
  select * into v_conversation
  from public.direct_conversations
  where id = new.conversation_id;

  if not found then
    return new;
  end if;

  v_receiver_id := case
    when new.sender_id = v_conversation.client_id then v_conversation.professional_profile_id
    else v_conversation.client_id
  end;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_receiver_id,
    'direct_message',
    'Nuevo mensaje',
    case when char_length(new.body) > 96 then left(new.body, 96) || '...' else new.body end,
    jsonb_build_object(
      'link', '/es/mensajes?conversation=' || new.conversation_id,
      'conversation_id', new.conversation_id,
      'booking_id', v_conversation.booking_id,
      'project_id', v_conversation.project_id
    )
  );

  return new;
end;
$$;
