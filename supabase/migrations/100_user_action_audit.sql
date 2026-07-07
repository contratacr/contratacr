-- Migration 100: user action audit trail and creation source snapshots.
-- This keeps evidence of who changed user-owned data and from which runtime.

create table if not exists public.user_action_audit (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null,
  entity_table text not null,
  entity_id text,
  entity_owner_user_id uuid references public.profiles(id) on delete set null,
  request_method text,
  request_path text,
  request_host text,
  request_ip text,
  user_agent text,
  referer text,
  app_environment text not null default 'unknown',
  supabase_project_ref text,
  source text not null default 'api',
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.user_action_audit enable row level security;

create index if not exists user_action_audit_actor_idx
  on public.user_action_audit(actor_user_id, created_at desc);

create index if not exists user_action_audit_entity_idx
  on public.user_action_audit(entity_table, entity_id, created_at desc);

create index if not exists user_action_audit_owner_idx
  on public.user_action_audit(entity_owner_user_id, created_at desc);

create index if not exists user_action_audit_action_idx
  on public.user_action_audit(action, created_at desc);

alter table public.profiles
  add column if not exists created_source_host text,
  add column if not exists created_app_environment text,
  add column if not exists created_supabase_project_ref text;

alter table public.professionals
  add column if not exists created_source_host text,
  add column if not exists created_app_environment text,
  add column if not exists created_supabase_project_ref text;

alter table public.projects
  add column if not exists client_name_snapshot text,
  add column if not exists client_email_snapshot text,
  add column if not exists client_phone_snapshot text,
  add column if not exists created_source_host text,
  add column if not exists created_app_environment text,
  add column if not exists created_supabase_project_ref text;

alter table public.bookings
  add column if not exists created_source_host text,
  add column if not exists created_app_environment text,
  add column if not exists created_supabase_project_ref text;

alter table public.proposals
  add column if not exists professional_user_id_snapshot uuid references public.profiles(id) on delete set null,
  add column if not exists professional_name_snapshot text,
  add column if not exists professional_email_snapshot text,
  add column if not exists created_source_host text,
  add column if not exists created_app_environment text,
  add column if not exists created_supabase_project_ref text;

alter table public.reviews
  add column if not exists client_name_snapshot text,
  add column if not exists client_email_snapshot text,
  add column if not exists created_source_host text,
  add column if not exists created_app_environment text,
  add column if not exists created_supabase_project_ref text;

alter table public.support_tickets
  add column if not exists created_source_host text,
  add column if not exists created_app_environment text,
  add column if not exists created_supabase_project_ref text;

alter table public.reports
  add column if not exists created_source_host text,
  add column if not exists created_app_environment text,
  add column if not exists created_supabase_project_ref text;

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
    before_json,
    after_json
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'professionals',
    'projects',
    'bookings',
    'proposals',
    'reviews',
    'support_tickets',
    'support_ticket_messages',
    'reports',
    'category_suggestions',
    'availability_weekly',
    'availability_exceptions',
    'availability_slots',
    'blocked_dates'
  ]
  loop
    if to_regclass('public.' || quote_ident(table_name)) is null then
      continue;
    end if;
    execute format('drop trigger if exists audit_%I_row_change on public.%I', table_name, table_name);
    execute format(
      'create trigger audit_%I_row_change after insert or update or delete on public.%I for each row execute function public.audit_user_row_change()',
      table_name,
      table_name
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
