-- Durable, retry-safe push delivery for rows created in public.notifications.
-- Direct table access is service-role only. Authenticated clients register and
-- deactivate their own device tokens through the narrow RPCs below.

alter table public.user_push_tokens
  add column if not exists transport text;

update public.user_push_tokens
set transport = 'fcm'
where transport is null or btrim(transport) = '';

-- Older Capacitor builds could upload the native APNs token even though the
-- backend only sends through Firebase Admin. Disable only the unmistakable
-- 64-character hexadecimal APNs shape; do not touch possible iOS FCM tokens.
update public.user_push_tokens
set is_active = false,
    updated_at = now()
where platform = 'ios'
  and is_active = true
  and token ~ '^[0-9A-Fa-f]{64}$';

alter table public.user_push_tokens
  alter column transport set default 'fcm',
  alter column transport set not null;

alter table public.user_push_tokens
  drop constraint if exists user_push_tokens_transport_check;

alter table public.user_push_tokens
  add constraint user_push_tokens_transport_check
  check (transport in ('fcm'));

-- A provider token identifies one installation. If historical rows assigned
-- the same active token more than once, retain only the freshest assignment.
with ranked_active_tokens as (
  select id,
         row_number() over (
           partition by transport, token
           order by last_seen_at desc nulls last, updated_at desc nulls last,
                    created_at desc nulls last, id desc
         ) as token_rank
  from public.user_push_tokens
  where is_active = true
)
update public.user_push_tokens as token
set is_active = false,
    updated_at = now()
from ranked_active_tokens as ranked
where token.id = ranked.id
  and ranked.token_rank > 1;

create unique index if not exists user_push_tokens_active_transport_token_uidx
  on public.user_push_tokens (transport, token)
  where is_active = true;

create index if not exists user_push_tokens_active_transport_user_idx
  on public.user_push_tokens (user_id, transport)
  where is_active = true;

-- Remove the permissive policies from migration 140. The service role bypasses
-- RLS; clients use the security-definer RPCs and never receive token rows.
drop policy if exists "Users can read their own push tokens" on public.user_push_tokens;
drop policy if exists "Users can manage their own push tokens" on public.user_push_tokens;
alter table public.user_push_tokens enable row level security;

revoke all on table public.user_push_tokens from anon, authenticated;
grant select, insert, update, delete on table public.user_push_tokens to service_role;

create or replace function public.register_user_push_token(
  p_token text,
  p_platform text default 'android',
  p_device_id text default null,
  p_app_version text default null,
  p_transport text default 'fcm'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_token_id uuid;
  v_token text := btrim(coalesce(p_token, ''));
  v_platform text := lower(btrim(coalesce(p_platform, '')));
  v_transport text := lower(btrim(coalesce(p_transport, '')));
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if length(v_token) < 10 or length(v_token) > 4096 then
    raise exception 'invalid_push_token' using errcode = '22023';
  end if;
  if v_platform not in ('android', 'ios', 'web') then
    raise exception 'invalid_push_platform' using errcode = '22023';
  end if;
  if v_transport <> 'fcm' then
    raise exception 'invalid_push_transport' using errcode = '22023';
  end if;
  if p_device_id is not null and length(p_device_id) > 255 then
    raise exception 'invalid_device_id' using errcode = '22023';
  end if;
  if p_app_version is not null and length(p_app_version) > 64 then
    raise exception 'invalid_app_version' using errcode = '22023';
  end if;

  -- Registration volume is low. One transaction-scoped lock makes ownership
  -- transfer plus the per-user cap atomic without cross-user lock cycles.
  perform pg_advisory_xact_lock(hashtextextended('contratacr:push-token-registration', 0));

  update public.user_push_tokens
  set is_active = false,
      updated_at = now()
  where transport = v_transport
    and token = v_token
    and is_active = true
    and (user_id <> v_user_id or platform <> v_platform);

  insert into public.user_push_tokens (
    user_id, token, platform, transport, device_id, app_version, is_active,
    last_seen_at, updated_at
  ) values (
    v_user_id,
    v_token,
    v_platform,
    v_transport,
    nullif(btrim(p_device_id), ''),
    nullif(btrim(p_app_version), ''),
    true,
    now(),
    now()
  )
  on conflict (user_id, platform, token) do update
  set transport = excluded.transport,
      device_id = excluded.device_id,
      app_version = excluded.app_version,
      is_active = true,
      last_seen_at = now(),
      updated_at = now()
  returning id into v_token_id;

  -- Bound fan-out and stale-token retention per account. The just-registered
  -- token always wins, followed by the most recently observed installations.
  with ranked_user_tokens as (
    select id,
           row_number() over (
             order by (id = v_token_id) desc, last_seen_at desc nulls last,
                      updated_at desc nulls last, created_at desc nulls last, id desc
           ) as token_rank
    from public.user_push_tokens
    where user_id = v_user_id
      and is_active = true
  )
  update public.user_push_tokens as token
  set is_active = false,
      updated_at = now()
  from ranked_user_tokens as ranked
  where token.id = ranked.id
    and ranked.token_rank > 10;

  return v_token_id;
end;
$$;

create or replace function public.deactivate_user_push_token(
  p_token text,
  p_transport text default 'fcm'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_transport, ''))) <> 'fcm' then
    raise exception 'invalid_push_transport' using errcode = '22023';
  end if;

  update public.user_push_tokens
  set is_active = false,
      updated_at = now()
  where user_id = v_user_id
    and transport = 'fcm'
    and token = btrim(coalesce(p_token, ''))
    and is_active = true;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.register_user_push_token(text, text, text, text, text) from public, anon;
revoke all on function public.deactivate_user_push_token(text, text) from public, anon;
grant execute on function public.register_user_push_token(text, text, text, text, text) to authenticated;
grant execute on function public.deactivate_user_push_token(text, text) to authenticated;
grant execute on function public.register_user_push_token(text, text, text, text, text) to service_role;
grant execute on function public.deactivate_user_push_token(text, text) to service_role;

create table if not exists public.notification_push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'failed', 'suppressed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_push_outbox_lock_pair_check check (
    (locked_at is null and locked_by is null)
    or (locked_at is not null and locked_by is not null)
  )
);

create unique index if not exists notification_push_outbox_notification_uidx
  on public.notification_push_outbox (notification_id);

create index if not exists notification_push_outbox_claim_idx
  on public.notification_push_outbox (available_at, created_at)
  where status in ('pending', 'processing');

create index if not exists notification_push_outbox_user_idx
  on public.notification_push_outbox (user_id, created_at desc);

create table if not exists public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_push_outbox(id) on delete cascade,
  token_id uuid not null references public.user_push_tokens(id) on delete cascade,
  attempt integer not null check (attempt > 0),
  status text not null check (status in ('delivered', 'failed', 'invalid')),
  provider_message_id text,
  error_code text,
  error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outbox_id, token_id)
);

create index if not exists notification_push_deliveries_outbox_status_idx
  on public.notification_push_deliveries (outbox_id, status);

alter table public.notification_push_outbox enable row level security;
alter table public.notification_push_deliveries enable row level security;
revoke all on table public.notification_push_outbox from anon, authenticated;
revoke all on table public.notification_push_deliveries from anon, authenticated;
grant select, insert, update, delete on table public.notification_push_outbox to service_role;
grant select, insert, update, delete on table public.notification_push_deliveries to service_role;

create or replace function public.capture_notification_push_outbox()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.notification_push_outbox (
    notification_id, user_id, status, completed_at
  ) values (
    new.id,
    new.user_id,
    case
      when lower(coalesce(new.data ->> 'push_suppressed', 'false')) in ('true', '1', 'yes', 'on')
        then 'suppressed'
      else 'pending'
    end,
    case
      when lower(coalesce(new.data ->> 'push_suppressed', 'false')) in ('true', '1', 'yes', 'on')
        then now()
      else null
    end
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_capture_notification_push_outbox on public.notifications;
create trigger trg_capture_notification_push_outbox
  after insert on public.notifications
  for each row
  execute function public.capture_notification_push_outbox();

revoke all on function public.capture_notification_push_outbox() from public, anon, authenticated;
grant execute on function public.capture_notification_push_outbox() to service_role;

create or replace function public.claim_notification_push_outbox(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  data jsonb,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_worker_id, '')) = '' then
    raise exception 'worker_id_required' using errcode = '22023';
  end if;

  -- A process can die after claiming its final allowed attempt. Once that
  -- lease expires, make the terminal state explicit instead of leaving an
  -- unclaimable row stuck in `processing` forever.
  update public.notification_push_outbox as expired
  set status = 'failed',
      locked_at = null,
      locked_by = null,
      last_error = coalesce(expired.last_error, 'push_lease_expired_after_max_attempts'),
      completed_at = now(),
      updated_at = now()
  where expired.status = 'processing'
    and expired.attempts >= expired.max_attempts
    and expired.locked_at < now() - make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 15), 3600));

  return query
  with candidates as (
    select outbox.id
    from public.notification_push_outbox as outbox
    where outbox.attempts < outbox.max_attempts
      and (
        (outbox.status = 'pending' and outbox.available_at <= now())
        or (
          outbox.status = 'processing'
          and outbox.locked_at < now() - make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 15), 3600))
        )
      )
    order by outbox.available_at, outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ), claimed as (
    update public.notification_push_outbox as outbox
    set status = 'processing',
        attempts = outbox.attempts + 1,
        locked_at = now(),
        locked_by = p_worker_id,
        updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.notification_id, outbox.user_id,
              outbox.attempts, outbox.max_attempts
  )
  select claimed.id, claimed.notification_id, claimed.user_id,
         notification.title, notification.message,
         coalesce(notification.data, '{}'::jsonb),
         claimed.attempts, claimed.max_attempts
  from claimed
  join public.notifications as notification
    on notification.id = claimed.notification_id;
end;
$$;

create or replace function public.finish_notification_push_outbox(
  p_outbox_id uuid,
  p_worker_id text,
  p_outcome text,
  p_deliveries jsonb default '[]'::jsonb,
  p_error text default null,
  p_available_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_outbox public.notification_push_outbox%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_outcome not in ('delivered', 'retry', 'failed', 'suppressed') then
    raise exception 'invalid_push_outcome' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_deliveries, '[]'::jsonb)) <> 'array' then
    raise exception 'deliveries_must_be_an_array' using errcode = '22023';
  end if;

  select * into v_outbox
  from public.notification_push_outbox
  where id = p_outbox_id
    and status = 'processing'
    and locked_by = p_worker_id
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_deliveries, '[]'::jsonb)) as delivery(
      token_id uuid,
      status text,
      provider_message_id text,
      error_code text,
      error_detail text
    )
    left join public.user_push_tokens as token on token.id = delivery.token_id
    where delivery.token_id is null
      or delivery.status not in ('delivered', 'failed', 'invalid')
      or token.id is null
      or token.user_id <> v_outbox.user_id
  ) then
    raise exception 'invalid_push_delivery' using errcode = '22023';
  end if;

  insert into public.notification_push_deliveries (
    outbox_id, token_id, attempt, status, provider_message_id,
    error_code, error_detail, updated_at
  )
  select v_outbox.id, delivery.token_id, v_outbox.attempts,
         delivery.status, nullif(delivery.provider_message_id, ''),
         nullif(delivery.error_code, ''), nullif(delivery.error_detail, ''), now()
  from jsonb_to_recordset(coalesce(p_deliveries, '[]'::jsonb)) as delivery(
    token_id uuid,
    status text,
    provider_message_id text,
    error_code text,
    error_detail text
  )
  on conflict (outbox_id, token_id) do update
  set attempt = excluded.attempt,
      status = excluded.status,
      provider_message_id = excluded.provider_message_id,
      error_code = excluded.error_code,
      error_detail = excluded.error_detail,
      updated_at = now();

  update public.notification_push_outbox
  set status = case when p_outcome = 'retry' then 'pending' else p_outcome end,
      available_at = case
        when p_outcome = 'retry' then coalesce(p_available_at, now())
        else available_at
      end,
      locked_at = null,
      locked_by = null,
      last_error = nullif(left(coalesce(p_error, ''), 255), ''),
      completed_at = case when p_outcome = 'retry' then null else now() end,
      updated_at = now()
  where id = v_outbox.id;

  return true;
end;
$$;

revoke all on function public.claim_notification_push_outbox(text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_notification_push_outbox(uuid, text, text, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_notification_push_outbox(text, integer, integer) to service_role;
grant execute on function public.finish_notification_push_outbox(uuid, text, text, jsonb, text, timestamptz) to service_role;

notify pgrst, 'reload schema';
