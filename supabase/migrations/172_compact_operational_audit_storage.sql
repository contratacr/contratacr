-- Migration 172: compact noisy operational audit storage.
--
-- Scope explicitly approved:
-- - stop row-by-row audit for availability_slots;
-- - compact historical professionals audit payloads;
-- - remove noisy/old availability audit rows;
-- - empty padron_staging;
-- - keep public.padron intact.

drop trigger if exists audit_availability_slots_row_change on public.availability_slots;

create or replace function public.compact_audit_payload(
  p_table text,
  p_payload jsonb
)
returns jsonb
language sql
immutable
as $$
  select case
    when p_payload is null then null
    when p_table = 'professionals' then jsonb_strip_nulls(jsonb_build_object(
      'id', p_payload->'id',
      'user_id', p_payload->'user_id',
      'profile_id', p_payload->'profile_id',
      'business_name', p_payload->'business_name',
      'display_name', p_payload->'display_name',
      'name', p_payload->'name',
      'slug', p_payload->'slug',
      'is_verified', p_payload->'is_verified',
      'verification_status', p_payload->'verification_status',
      'status', p_payload->'status',
      'updated_at', p_payload->'updated_at'
    ))
    else p_payload
  end;
$$;

revoke all on function public.compact_audit_payload(text, jsonb) from public, anon, authenticated;
grant execute on function public.compact_audit_payload(text, jsonb) to service_role;

-- Same audit body as migration 165, plus:
-- 1) skip availability_slots entirely;
-- 2) compact high-payload professionals rows before storage.
create or replace function public.audit_user_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  row_id text;
  owner_id uuid;
  before_json jsonb;
  after_json jsonb;
  candidate_owner text;
begin
  if tg_table_name = 'availability_slots' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if nullif(current_setting('app.account_deletion_user_id', true), '') is not null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    after_json := to_jsonb(new);
    row_id := after_json->>'id';
  elsif tg_op = 'UPDATE' then
    before_json := to_jsonb(old);
    after_json := to_jsonb(new);
    row_id := coalesce(after_json->>'id', before_json->>'id');
  else
    before_json := to_jsonb(old);
    row_id := before_json->>'id';
  end if;

  candidate_owner := coalesce(
    after_json->>'client_id',
    after_json->>'profile_id',
    after_json->>'user_id',
    after_json->>'owner_id',
    before_json->>'client_id',
    before_json->>'profile_id',
    before_json->>'user_id',
    before_json->>'owner_id'
  );

  if candidate_owner ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    owner_id := candidate_owner::uuid;
  else
    owner_id := actor;
  end if;

  if actor is not null and not exists (select 1 from public.profiles where id = actor) then
    actor := null;
  end if;
  if owner_id is not null and not exists (select 1 from public.profiles where id = owner_id) then
    owner_id := null;
  end if;

  insert into public.user_action_audit (
    actor_user_id,
    action,
    entity_table,
    entity_id,
    entity_owner_user_id,
    app_environment,
    supabase_project_ref,
    source,
    before_data,
    after_data
  )
  values (
    actor,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    row_id,
    owner_id,
    'database',
    current_setting('app.supabase_project_ref', true),
    'db_trigger',
    public.compact_audit_payload(tg_table_name, before_json),
    public.compact_audit_payload(tg_table_name, after_json)
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop table if exists pg_temp.user_action_audit_retained;

create temp table user_action_audit_retained as
select
  id,
  created_at,
  actor_user_id,
  actor_role,
  action,
  entity_table,
  entity_id,
  entity_owner_user_id,
  request_method,
  request_path,
  request_host,
  request_ip,
  user_agent,
  referer,
  app_environment,
  supabase_project_ref,
  source,
  public.compact_audit_payload(entity_table, before_data) as before_data,
  public.compact_audit_payload(entity_table, after_data) as after_data,
  metadata || case
    when entity_table = 'professionals' then jsonb_build_object('payload_compacted', true)
    else '{}'::jsonb
  end as metadata
from public.user_action_audit
where entity_table <> 'availability_slots'
  and action not like 'availability_slots.%'
  and created_at >= now() - interval '90 days';

truncate table public.user_action_audit;

insert into public.user_action_audit (
  id,
  created_at,
  actor_user_id,
  actor_role,
  action,
  entity_table,
  entity_id,
  entity_owner_user_id,
  request_method,
  request_path,
  request_host,
  request_ip,
  user_agent,
  referer,
  app_environment,
  supabase_project_ref,
  source,
  before_data,
  after_data,
  metadata
)
select
  id,
  created_at,
  actor_user_id,
  actor_role,
  action,
  entity_table,
  entity_id,
  entity_owner_user_id,
  request_method,
  request_path,
  request_host,
  request_ip,
  user_agent,
  referer,
  app_environment,
  supabase_project_ref,
  source,
  before_data,
  after_data,
  metadata
from user_action_audit_retained;

-- Keep staging empty between refreshes. The monthly refresh workflow loads it
-- immediately before finalize_padron_swap(); leaving old staging rows around
-- only consumes database disk.
truncate table public.padron_staging;

drop table if exists pg_temp.user_action_audit_retained;

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
    where entity_table = 'availability_slots'
       or action like 'availability_slots.%'
       or created_at < now() - interval '90 days';
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
