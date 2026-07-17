-- Allow in-app notifications for direct client-professional messages.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'review_request',
    'booking_received',
    'booking_confirmed',
    'booking_completed',
    'booking_completed_by_client',
    'booking_cancelled',
    'booking_cancelled_by_client',
    'booking_rescheduled',
    'booking_update',
    'proposal_received',
    'proposal_withdrawn',
    'proposal_accepted',
    'project_proposal_declined',
    'proposal_updated',
    'new_project',
    'project_proposal_accepted',
    'project_work_done',
    'project_completed',
    'project_cancelled',
    'project_deleted',
    'support_reply',
    'verification',
    'verification_approved',
    'verification_rejected',
    'verification_appeal_received',
    'verification_reverted',
    'verification_pending',
    'suggestion_approved',
    'suggestion_rejected',
    'direct_message'
  ));

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
      'link', '/es/dashboard/profesional?tab=chat&conversation=' || new.conversation_id,
      'conversation_id', new.conversation_id,
      'booking_id', v_conversation.booking_id,
      'project_id', v_conversation.project_id
    )
  );

  return new;
end;
$$;

drop trigger if exists direct_message_recipient_notification on public.direct_messages;
create trigger direct_message_recipient_notification
  after insert on public.direct_messages
  for each row execute function public.notify_direct_message_recipient();
