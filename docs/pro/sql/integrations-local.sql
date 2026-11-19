-- LOCAL PRO ONLY. Round 6A (2026-11-13): integration framework for third-party providers.
-- * One connection per owner and provider (hacienda = Hacienda ATV e-invoicing, tilopay = card/SINPE
--   processor). mode mock | sandbox | production; NON-SECRET config only. Secrets live in server
--   environment variables, never here: pro_integration_config_safe() rejects secret-like keys or values
--   (defence in depth; the API also whitelists keys per provider).
-- * Production is never selected automatically: set_mode 'production' needs the caller's explicit typed
--   confirmation AND p_production_allowed (the server passes PRO_INTEGRATIONS_ALLOW_PRODUCTION=1).
--   Without the flag it is refused (42501, hint pro_integration_production_refused).
-- * Immutable history of every connection change, idempotent actionId receipts, CAS by revision.
-- * Outbound request log (redacted summaries only), webhook inbox with idempotency by (provider, event id),
--   rejected deliveries (bad signature) kept apart so a forged id can never block the real event, and a
--   deterministic retry/backoff (30 s × 2^(attempt−1), at most 1 h).
-- Tables: RLS on, service_role only; functions security invoker, executable by service_role only.
begin;

create or replace function public.pro_integration_config_safe(p_value jsonb) returns boolean
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare k text;v jsonb;
begin
 if p_value is null then return true;end if;
 if jsonb_typeof(p_value)='object' then
  for k,v in select * from jsonb_each(p_value) loop
   if k ~* '(secret|passw|pass$|token|authori|api.?key|^key$|_key$|pin$|^pin|p12|pfx|private|cvc|cvv|card.?number|^pan$|cookie|credential)' and v<>to_jsonb('[redactado]'::text) then return false;end if;
   if not public.pro_integration_config_safe(v) then return false;end if;
  end loop;
 elsif jsonb_typeof(p_value)='array' then
  for v in select * from jsonb_array_elements(p_value) loop if not public.pro_integration_config_safe(v) then return false;end if;end loop;
 elsif jsonb_typeof(p_value)='string' then
  -- PEM blocks, long base64 blobs or full card numbers never belong in stored config/logs.
  if p_value#>>'{}' ~ '-----BEGIN' or p_value#>>'{}' ~ '([A-Za-z0-9+/=]{200}){2,}' or p_value#>>'{}' ~ '(^|[^0-9])[0-9]{13,19}([^0-9]|$)' and p_value#>>'{}' !~ '^[0-9]{20,}$' then return false;end if;
 end if;
 return true;
end $$;

create table if not exists public.pro_integration_connections(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in('hacienda','tilopay')),
 mode text not null default 'mock' check(mode in('mock','sandbox','production')),
 enabled boolean not null default true,
 config jsonb not null default '{}' check(jsonb_typeof(config)='object' and octet_length(config::text)<=4096 and public.pro_integration_config_safe(config)),
 revision integer not null default 0 check(revision between 0 and 1000000),
 last_test_at timestamptz,last_test_ok boolean,last_test_mode text check(last_test_mode is null or last_test_mode in('mock','sandbox','production')),
 last_test_message text check(last_test_message is null or length(last_test_message)<=300),
 production_confirmed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,provider),
 check(mode<>'production' or production_confirmed_at is not null)
);
create table if not exists public.pro_integration_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,provider text not null,action text not null check(action in('set_mode','save_config','enable','disable','test')),
 from_mode text,to_mode text,detail jsonb not null default '{}' check(public.pro_integration_config_safe(detail)),
 created_at timestamptz not null default now(),primary key(owner_id,id)
);
create index if not exists pro_integration_history_recent on public.pro_integration_history(owner_id,provider,created_at desc);
create table if not exists public.pro_integration_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,action_id)
);
-- Outbound request log: what was called, redacted, never a credential, a card number or a full XML.
create table if not exists public.pro_integration_requests(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,provider text not null check(provider in('hacienda','tilopay')),
 mode text not null check(mode in('mock','sandbox','production')),
 operation text not null check(length(operation) between 1 and 60),
 target text not null check(length(target) between 1 and 200 and target !~ '\?'),
 summary jsonb not null default '{}' check(octet_length(summary::text)<=4096 and public.pro_integration_config_safe(summary)),
 status_code integer check(status_code is null or status_code between 0 and 999),
 outcome text not null check(outcome in('ok','error','timeout','refused')),
 duration_ms integer not null default 0 check(duration_ms between 0 and 600000),
 attempt integer not null default 1 check(attempt between 1 and 100),
 correlation text check(correlation is null or length(correlation)<=80),
 created_at timestamptz not null default now(),primary key(owner_id,id)
);
create index if not exists pro_integration_requests_recent on public.pro_integration_requests(owner_id,created_at desc);
-- Webhook inbox: one row per (provider, event id); payload already redacted by the server.
create table if not exists public.pro_integration_webhooks(
 id uuid not null primary key,provider text not null check(provider in('hacienda','tilopay')),
 mode text not null check(mode in('mock','sandbox','production')),
 event_id text not null check(length(event_id) between 1 and 120),
 event_type text not null check(length(event_type) between 1 and 60),
 owner_id uuid references public.profiles(id) on delete cascade,
 payload jsonb not null check(octet_length(payload::text)<=16384 and public.pro_integration_config_safe(payload)),
 status text not null default 'received' check(status in('received','processed','ignored','failed')),
 attempts integer not null default 0 check(attempts between 0 and 100),
 next_attempt_at timestamptz,last_error text check(last_error is null or length(last_error)<=300),
 received_at timestamptz not null default now(),processed_at timestamptz,
 unique(provider,event_id)
);
create index if not exists pro_integration_webhooks_owner on public.pro_integration_webhooks(owner_id,received_at desc);
create index if not exists pro_integration_webhooks_retry on public.pro_integration_webhooks(next_attempt_at) where status='failed';
create table if not exists public.pro_integration_webhook_rejections(
 id uuid not null primary key default gen_random_uuid(),provider text not null,reason text not null check(length(reason) between 1 and 120),
 received_at timestamptz not null default now()
);

create or replace function public.pro_integration_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Integration history, receipts and request log are immutable' using errcode='23514';end $$;
do $$declare n text;begin foreach n in array array['pro_integration_history','pro_integration_actions','pro_integration_requests','pro_integration_webhook_rejections'] loop
 execute format('drop trigger if exists pro_integration_immutable on public.%I',n);
 execute format('create trigger pro_integration_immutable before update on public.%I for each row execute function public.pro_integration_immutable()',n);
end loop;end $$;
-- A webhook row only moves forward; processed/ignored are final; identity and payload never change.
create or replace function public.pro_integration_webhook_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.id<>old.id or new.provider<>old.provider or new.event_id<>old.event_id or new.event_type<>old.event_type or new.payload<>old.payload or new.mode<>old.mode or new.received_at<>old.received_at
  or old.owner_id is not null and new.owner_id is distinct from old.owner_id then raise exception 'Webhook identity is immutable' using errcode='23514';end if;
 if old.status in('processed','ignored') then raise exception 'Webhook already final' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_integration_webhook_guard on public.pro_integration_webhooks;
create trigger pro_integration_webhook_guard before update on public.pro_integration_webhooks for each row execute function public.pro_integration_webhook_guard();

-- Deterministic backoff shared by webhook and submission retries (TS mirror: integrations/retry.ts).
create or replace function public.pro_integration_retry_delay(p_attempt integer) returns interval
language sql immutable security invoker set search_path=public,pg_temp as $$
 select make_interval(secs=>least(30*power(2,greatest(coalesce(p_attempt,1),1)-1),3600)) $$;

create or replace function public.pro_integration_connection_json(p_row public.pro_integration_connections,p_provider text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('provider',p_provider,'mode',coalesce(p_row.mode,'mock'),'enabled',coalesce(p_row.enabled,true),'config',coalesce(p_row.config,'{}'::jsonb),
  'revision',coalesce(p_row.revision,0),'lastTestAt',p_row.last_test_at,'lastTestOk',p_row.last_test_ok,'lastTestMode',p_row.last_test_mode,'lastTestMessage',p_row.last_test_message,
  'productionConfirmedAt',p_row.production_confirmed_at,'updatedAt',p_row.updated_at) $$;

create or replace function public.pro_integration_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare out jsonb:='[]';p text;r public.pro_integration_connections;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 foreach p in array array['hacienda','tilopay'] loop
  select * into r from public.pro_integration_connections where owner_id=p_actor and provider=p;
  if not found then r:=null;end if;
  out:=out||jsonb_build_array(public.pro_integration_connection_json(r,p));
 end loop;
 return jsonb_build_object('connections',out,
  'history',coalesce((select jsonb_agg(jsonb_build_object('provider',h.provider,'action',h.action,'fromMode',h.from_mode,'toMode',h.to_mode,'detail',h.detail,'at',h.created_at) order by h.created_at desc) from (select * from public.pro_integration_history where owner_id=p_actor order by created_at desc limit 20) h),'[]'),
  'requests',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'provider',q.provider,'mode',q.mode,'operation',q.operation,'target',q.target,'summary',q.summary,'statusCode',q.status_code,'outcome',q.outcome,'durationMs',q.duration_ms,'attempt',q.attempt,'correlation',q.correlation,'at',q.created_at) order by q.created_at desc) from (select * from public.pro_integration_requests where owner_id=p_actor order by created_at desc limit 20) q),'[]'),
  'webhooks',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'provider',w.provider,'mode',w.mode,'eventId',w.event_id,'eventType',w.event_type,'status',w.status,'attempts',w.attempts,'nextAttemptAt',w.next_attempt_at,'lastError',w.last_error,'receivedAt',w.received_at,'processedAt',w.processed_at) order by w.received_at desc) from (select * from public.pro_integration_webhooks where owner_id=p_actor order by received_at desc limit 20) w),'[]'));
end $$;

-- Mode of a provider for a server operation: the stored choice (mock by default). The server still checks env keys.
create or replace function public.pro_integration_mode(p_actor uuid,p_provider text) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select case when enabled then mode else 'disabled' end from public.pro_integration_connections where owner_id=p_actor and provider=p_provider),'mock') $$;

create or replace function public.pro_integration_mutate(p_actor uuid,p_input jsonb,p_production_allowed boolean default false) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';prov text:=p_input->>'provider';aid uuid;receipt public.pro_integration_actions;r public.pro_integration_connections;
 next_mode text;rev integer;result jsonb;old_mode text;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or prov not in('hacienda','tilopay') or act not in('set_mode','save_config','enable','disable','test') then raise exception 'Invalid integration action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Invalid action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-integration:'||p_actor::text,0));
 select * into receipt from public.pro_integration_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 insert into public.pro_integration_connections(owner_id,provider,revision) values(p_actor,prov,0) on conflict do nothing;
 select * into r from public.pro_integration_connections where owner_id=p_actor and provider=prov for update;
 old_mode:=r.mode;
 if act<>'test' then
  if jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid revision' using errcode='22023';end if;
  rev:=(p_input->>'revision')::integer;
  -- A never-saved connection reads as revision 0 (defaults), exactly the revision of its first row.
  if rev is distinct from r.revision then raise exception 'Integration changed' using errcode='40001';end if;
 end if;
 if act='set_mode' then
  next_mode:=p_input->>'mode';
  if next_mode not in('mock','sandbox','production') then raise exception 'Invalid mode' using errcode='22023';end if;
  if next_mode='production' then
   if not coalesce(p_production_allowed,false) then raise exception 'Production integrations are not allowed on this server' using errcode='42501',hint='pro_integration_production_refused';end if;
   if p_input->>'confirm' is distinct from 'ACTIVAR PRODUCCION' then raise exception 'Production needs explicit confirmation' using errcode='22023',hint='pro_integration_production_confirm';end if;
  end if;
  update public.pro_integration_connections set mode=next_mode,production_confirmed_at=case when next_mode='production' then now() else null end,revision=revision+1,updated_at=now()
   where owner_id=p_actor and provider=prov returning * into r;
 elsif act='save_config' then
  if jsonb_typeof(p_input->'config')<>'object' or not public.pro_integration_config_safe(p_input->'config') then raise exception 'Config must be non-secret' using errcode='22023',hint='pro_integration_secret_config';end if;
  update public.pro_integration_connections set config=p_input->'config',revision=revision+1,updated_at=now() where owner_id=p_actor and provider=prov returning * into r;
 elsif act in('enable','disable') then
  update public.pro_integration_connections set enabled=(act='enable'),revision=revision+1,updated_at=now() where owner_id=p_actor and provider=prov returning * into r;
 else
  -- test: the server ran «Probar conexión» against the adapter of the resolved mode and reports it.
  if jsonb_typeof(p_input->'ok')<>'boolean' or p_input->>'testMode' not in('mock','sandbox','production') or length(coalesce(p_input->>'message',''))>300 then raise exception 'Invalid test result' using errcode='22023';end if;
  update public.pro_integration_connections set last_test_at=now(),last_test_ok=(p_input->>'ok')::boolean,last_test_mode=p_input->>'testMode',last_test_message=nullif(p_input->>'message','')
   where owner_id=p_actor and provider=prov returning * into r;
 end if;
 insert into public.pro_integration_history(owner_id,id,provider,action,from_mode,to_mode,detail) values(p_actor,aid,prov,act,old_mode,r.mode,
  case when act='save_config' then jsonb_build_object('keys',(select coalesce(jsonb_agg(k order by k),'[]') from jsonb_object_keys(p_input->'config') k)) when act='test' then jsonb_build_object('ok',p_input->'ok','mode',p_input->>'testMode') else '{}'::jsonb end);
 result:=public.pro_integration_connection_json(r,prov);
 insert into public.pro_integration_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Outbound log (server writes it after each adapter call; the summary is redacted in TS and checked here).
create or replace function public.pro_integration_log(p_actor uuid,p_entry jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rid uuid:=gen_random_uuid();
begin
 if not public.pro_integration_config_safe(p_entry->'summary') then raise exception 'Log summary must be redacted' using errcode='22023',hint='pro_integration_secret_config';end if;
 insert into public.pro_integration_requests(owner_id,id,provider,mode,operation,target,summary,status_code,outcome,duration_ms,attempt,correlation)
 values(p_actor,rid,p_entry->>'provider',p_entry->>'mode',p_entry->>'operation',p_entry->>'target',coalesce(p_entry->'summary','{}'),(p_entry->>'statusCode')::integer,p_entry->>'outcome',
  coalesce((p_entry->>'durationMs')::integer,0),coalesce((p_entry->>'attempt')::integer,1),left(p_entry->>'correlation',80));
 return rid;
exception when check_violation or invalid_text_representation or not_null_violation or foreign_key_violation then raise exception 'Invalid log entry' using errcode='22023';
end $$;

-- Webhook inbox: idempotent by (provider, event id). Returns the row and whether it was a duplicate.
create or replace function public.pro_integration_webhook_receive(p_provider text,p_mode text,p_event_id text,p_event_type text,p_owner uuid,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare w public.pro_integration_webhooks;dup boolean:=false;
begin
 if not public.pro_integration_config_safe(p_payload) then raise exception 'Webhook payload must be redacted' using errcode='22023',hint='pro_integration_secret_config';end if;
 insert into public.pro_integration_webhooks(id,provider,mode,event_id,event_type,owner_id,payload) values(gen_random_uuid(),p_provider,p_mode,p_event_id,p_event_type,p_owner,p_payload)
 on conflict(provider,event_id) do nothing returning * into w;
 if w.id is null then
  dup:=true;select * into w from public.pro_integration_webhooks where provider=p_provider and event_id=p_event_id;
  if w.event_type<>p_event_type or w.payload<>p_payload then raise exception 'Webhook event id reused with a different payload' using errcode='22023',hint='pro_integration_webhook_conflict';end if;
 end if;
 return jsonb_build_object('id',w.id,'duplicate',dup,'status',w.status,'attempts',w.attempts);
end $$;
create or replace function public.pro_integration_webhook_reject(p_provider text,p_reason text) returns void
language sql security invoker set search_path=public,pg_temp as $$
 insert into public.pro_integration_webhook_rejections(provider,reason) values(left(coalesce(p_provider,'?'),40),left(coalesce(p_reason,'invalid'),120)) $$;
-- A processing failure keeps the event for a retry with backoff; it never loses or duplicates it.
create or replace function public.pro_integration_webhook_fail(p_id uuid,p_error text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare w public.pro_integration_webhooks;
begin
 update public.pro_integration_webhooks set status='failed',attempts=attempts+1,next_attempt_at=now()+public.pro_integration_retry_delay(attempts+1),last_error=left(coalesce(p_error,'error'),300)
 where id=p_id and status in('received','failed') returning * into w;
 return jsonb_build_object('id',w.id,'status',w.status,'attempts',w.attempts,'nextAttemptAt',w.next_attempt_at);
end $$;

do $$declare n text;begin foreach n in array array['pro_integration_connections','pro_integration_history','pro_integration_actions','pro_integration_requests','pro_integration_webhooks','pro_integration_webhook_rejections'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_integration\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_integration_immutable(%' and f::text not like 'pro_integration_webhook_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
