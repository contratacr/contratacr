-- Notify professionals when another account follows their public profile.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'review_request',
    'review_received',
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
    'direct_message',
    'professional_follow'
  ));

create or replace function public.notify_professional_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_professional_slug text;
  v_follower_name text;
begin
  select p.profile_id, p.slug
    into v_owner_id, v_professional_slug
  from public.professionals p
  where p.id = new.professional_id;

  if v_owner_id is null or v_owner_id = new.follower_id then
    return new;
  end if;

  select nullif(trim(coalesce(pr.full_name, '')), '')
    into v_follower_name
  from public.profiles pr
  where pr.id = new.follower_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_owner_id,
    'professional_follow',
    'Nuevo seguidor',
    coalesce(v_follower_name, 'Alguien') || ' empezó a seguir tu perfil profesional.',
    jsonb_build_object(
      'professional_id', new.professional_id,
      'professional_slug', v_professional_slug,
      'follower_id', new.follower_id,
      'follower_name', v_follower_name,
      'link', '/es/dashboard/profesional?tab=network&network=followers'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_professional_follow_notification on public.professional_follows;
create trigger trg_professional_follow_notification
  after insert on public.professional_follows
  for each row
  execute function public.notify_professional_on_follow();

notify pgrst, 'reload schema';
