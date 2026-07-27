-- Migration 146: operational retention cleanup.
-- Keeps account-owned app data intact while trimming short-lived operational data.

create or replace function public.cleanup_operational_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_ai integer := 0;
  deleted_slots integer := 0;
  deleted_notifications integer := 0;
  deleted_audit integer := 0;
  deleted_interactions integer := 0;
  deleted_followups integer := 0;
begin
  if to_regclass('public.ai_chat_sessions') is not null then
    delete from public.ai_chat_sessions
    where updated_at < now() - interval '7 days';
    get diagnostics deleted_ai = row_count;
  end if;

  if to_regclass('public.availability_slots') is not null then
    delete from public.availability_slots
    where slot_date < current_date - 7
       or slot_date > current_date + 120;
    get diagnostics deleted_slots = row_count;
  end if;

  if to_regclass('public.notifications') is not null then
    delete from public.notifications
    where (read = true and created_at < now() - interval '90 days')
       or created_at < now() - interval '365 days';
    get diagnostics deleted_notifications = row_count;
  end if;

  if to_regclass('public.user_action_audit') is not null then
    delete from public.user_action_audit
    where created_at < now() - interval '180 days';
    get diagnostics deleted_audit = row_count;
  end if;

  if to_regclass('public.interaction_events') is not null then
    delete from public.interaction_events
    where created_at < now() - interval '180 days';
    get diagnostics deleted_interactions = row_count;
  end if;

  if to_regclass('public.whatsapp_contact_followups') is not null then
    delete from public.whatsapp_contact_followups
    where status in ('dismissed', 'reviewed')
      and updated_at < now() - interval '180 days';
    get diagnostics deleted_followups = row_count;
  end if;

  return jsonb_build_object(
    'ai_chat_sessions', deleted_ai,
    'availability_slots', deleted_slots,
    'notifications', deleted_notifications,
    'user_action_audit', deleted_audit,
    'interaction_events', deleted_interactions,
    'whatsapp_contact_followups', deleted_followups
  );
end;
$$;

revoke all on function public.cleanup_operational_retention() from public, anon, authenticated;
grant execute on function public.cleanup_operational_retention() to service_role;

select public.cleanup_operational_retention();

notify pgrst, 'reload schema';
