-- Isolated, retryable account deletion.
-- Every destructive statement is scoped to the authenticated/requested user id.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  last_error text
);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests (status, updated_at);

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant all on public.account_deletion_requests to service_role;

-- Cloudinary assets created after this migration have an explicit owner. This
-- prevents test mirrors from guessing ownership from production URLs and keeps
-- deletion strictly scoped to assets uploaded by the account in this project.
create table if not exists public.user_media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('cloudinary')),
  public_id text not null,
  resource_type text not null default 'image',
  secure_url text,
  created_at timestamptz not null default now(),
  unique (provider, public_id)
);

create index if not exists user_media_assets_user_idx
  on public.user_media_assets (user_id, created_at);

alter table public.user_media_assets enable row level security;
revoke all on public.user_media_assets from public, anon, authenticated;
grant all on public.user_media_assets to service_role;

create or replace function public.request_my_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid := auth.uid();
  request_id uuid;
  target_email text;
begin
  if target_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select email into target_email from auth.users where id = target_user_id;
  if target_email in ('e2e.client@contratacr.test', 'e2e.pro@contratacr.test') then
    raise exception 'Regression accounts cannot be deleted' using errcode = 'P0001';
  end if;

  insert into public.account_deletion_requests (user_id, status, requested_at, updated_at, last_error)
  values (target_user_id, 'pending', now(), now(), null)
  on conflict (user_id) do update
    set status = case
          when public.account_deletion_requests.status = 'completed' then 'completed'
          else 'pending'
        end,
        updated_at = now(),
        last_error = null
  returning id into request_id;

  update public.profiles
  set is_disabled = true,
      disabled_reason = 'account_deletion_pending',
      disabled_at = now(),
      updated_at = now()
  where id = target_user_id;

  return request_id;
end;
$$;

revoke all on function public.request_my_account_deletion() from public, anon;
grant execute on function public.request_my_account_deletion() to authenticated;

-- The processor uses the Storage API to remove these objects. Exact UUID path
-- segments cover current chat/CV paths whose uploads used the service role and
-- therefore have no owner_id. No prefix belonging to another user is returned.
create or replace function public.account_deletion_storage_objects(p_request_id uuid)
returns table (bucket_id text, object_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select r.user_id into target_user_id
  from public.account_deletion_requests r
  where r.id = p_request_id and r.status <> 'completed';

  if target_user_id is null then return; end if;

  return query
  select o.bucket_id::text, o.name::text
  from storage.objects o
  where o.owner_id = target_user_id::text
     or o.name ~ ('(^|/)' || target_user_id::text || '(/|$)');
end;
$$;

revoke all on function public.account_deletion_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_storage_objects(uuid) to service_role;

create or replace function public.finalize_account_deletion(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select r.user_id into target_user_id
  from public.account_deletion_requests r
  where r.id = p_request_id
  for update;

  if target_user_id is null then
    raise exception 'Deletion request not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.account_deletion_requests r
    where r.id = p_request_id and r.status = 'completed'
  ) then
    return true;
  end if;

  update public.account_deletion_requests
  set status = 'processing', attempts = attempts + 1,
      processing_started_at = now(), updated_at = now(), last_error = null
  where id = p_request_id;

  if exists (
    select 1 from storage.objects o
    where o.owner_id = target_user_id::text
       or o.name ~ ('(^|/)' || target_user_id::text || '(/|$)')
  ) then
    raise exception 'Owned storage objects remain' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.user_media_assets m where m.user_id = target_user_id) then
    raise exception 'Owned media assets remain' using errcode = 'P0001';
  end if;

  -- Retained operational records are anonymized only where they belong to this
  -- account. Rows belonging to other users are not touched.
  update public.support_ticket_messages
  set sender_id = null, sender_name = 'Cuenta eliminada', body = '[Contenido eliminado por solicitud del usuario]'
  where sender_id = target_user_id;

  update public.support_tickets
  set user_id = null, name = 'Cuenta eliminada', email = 'eliminada@anonimo.invalid',
      message = '[Contenido eliminado por solicitud del usuario]'
  where user_id = target_user_id;

  update public.user_action_audit
  set actor_user_id = null, entity_owner_user_id = null,
      before_data = null, after_data = null,
      metadata = metadata || jsonb_build_object('account_deleted', true)
  where actor_user_id = target_user_id or entity_owner_user_id = target_user_id;

  -- Audit triggers skip only the cascades in this transaction. This avoids
  -- creating fresh references to the profile while it is being removed.
  perform set_config('app.account_deletion_user_id', target_user_id::text, true);

  delete from public.profiles where id = target_user_id;
  delete from auth.users where id = target_user_id;

  update public.account_deletion_requests
  set status = 'completed', completed_at = now(), updated_at = now(), last_error = null
  where id = p_request_id;

  return true;
end;
$$;

revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finalize_account_deletion(uuid) to service_role;

-- Same audit body as migration 100, with one deletion-transaction guard.
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
  if nullif(current_setting('app.account_deletion_user_id', true), '') is not null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    after_json := to_jsonb(new); row_id := after_json->>'id';
  elsif tg_op = 'UPDATE' then
    before_json := to_jsonb(old); after_json := to_jsonb(new);
    row_id := coalesce(after_json->>'id', before_json->>'id');
  else
    before_json := to_jsonb(old); row_id := before_json->>'id';
  end if;

  candidate_owner := coalesce(
    after_json->>'client_id', after_json->>'profile_id', after_json->>'user_id', after_json->>'owner_id',
    before_json->>'client_id', before_json->>'profile_id', before_json->>'user_id', before_json->>'owner_id'
  );

  if candidate_owner ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    owner_id := candidate_owner::uuid;
  else owner_id := actor;
  end if;

  if actor is not null and not exists (select 1 from public.profiles where id = actor) then actor := null; end if;
  if owner_id is not null and not exists (select 1 from public.profiles where id = owner_id) then owner_id := null; end if;

  insert into public.user_action_audit (
    actor_user_id, action, entity_table, entity_id, entity_owner_user_id,
    app_environment, supabase_project_ref, source, before_data, after_data
  ) values (
    actor, tg_table_name || '.' || lower(tg_op), tg_table_name, row_id, owner_id,
    'database', current_setting('app.supabase_project_ref', true), 'db_trigger', before_json, after_json
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
