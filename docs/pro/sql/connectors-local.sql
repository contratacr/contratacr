-- LOCAL PRO ONLY. Round 6B (2026-11-13): owner connectors (Houzz parity rows 10 and 72) and the OAuth vault
-- shared with QuickBooks (row 56).
-- * OAuth 2.0 authorization code + PKCE (S256) + single-use state: only the SHA-256 of the state is stored,
--   with the PKCE verifier ENCRYPTED; a state expires after 10 minutes and can be consumed once.
-- * Tokens are stored ONLY as AES-256-GCM envelopes produced by the server («v1.<key>.<iv>.<tag>.<data>»);
--   the CHECK rejects anything else, so a plaintext token can never be stored. Revoking wipes them.
-- * Email: every send needs the owner's explicit confirmation (confirmed=true from the UI dialog). In mock
--   mode the message is only kept in the outbox (status «simulated»): the CHECK forbids any other status.
-- * Calendar: two-way sync links (appointment = scheduled job of the agenda, task = open task with a date),
--   conflicts kept with both versions; events created in the calendar are imported as busy time.
--   pro_mock_calendar_events is the local stand-in of the remote calendar (mock mode only).
-- Tables: RLS on, service_role only; functions security invoker, executable by service_role only.
begin;

create or replace function public.pro_oauth_box_ok(p_box text) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select p_box is null or length(p_box)<=16500 and p_box ~ '^v1\.(mock|env)\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{8,}$' $$;

create table if not exists public.pro_oauth_states(
 id uuid primary key,owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in('google','microsoft','quickbooks')),
 mode text not null check(mode in('mock','sandbox','production')),
 state_hash text not null unique check(state_hash~'^[a-f0-9]{64}$'),
 verifier_box text not null check(public.pro_oauth_box_ok(verifier_box)),
 locale text not null check(locale in('es','en')),return_view text not null check(return_view in('conectores','contabilidad','integraciones')),
 created_at timestamptz not null default now(),expires_at timestamptz not null,used_at timestamptz
);
create index if not exists pro_oauth_states_owner on public.pro_oauth_states(owner_id,created_at desc);
create table if not exists public.pro_oauth_connections(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in('google','microsoft','quickbooks')),
 mode text not null check(mode in('mock','sandbox','production')),
 status text not null check(status in('connected','revoked')),
 account_email text check(account_email is null or length(account_email)<=254),
 scopes text[] not null default '{}' check(cardinality(scopes)<=20),
 access_box text check(public.pro_oauth_box_ok(access_box)),
 refresh_box text check(public.pro_oauth_box_ok(refresh_box)),
 access_expires_at timestamptz,
 realm_id text check(realm_id is null or realm_id~'^[0-9]{1,30}$'),
 connected_at timestamptz,revoked_at timestamptz,
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 primary key(owner_id,provider),
 check(status<>'connected' or access_box is not null and connected_at is not null),
 check(status<>'revoked' or access_box is null and refresh_box is null and revoked_at is not null)
);
create table if not exists public.pro_oauth_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null default gen_random_uuid(),
 provider text not null,mode text not null,action text not null check(action in('connect','refresh','revoke','denied','failed')),
 detail jsonb not null default '{}' check(octet_length(detail::text)<=2048 and public.pro_integration_config_safe(detail)),
 at timestamptz not null default clock_timestamp(),primary key(owner_id,id)
);
create table if not exists public.pro_connector_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,scope text not null check(length(scope) between 1 and 40),input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,action_id)
);

create table if not exists public.pro_email_outbox(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 provider text not null check(provider in('google','microsoft')),mode text not null check(mode in('mock','sandbox','production')),
 from_email text not null check(length(from_email)<=254),
 to_emails text[] not null check(cardinality(to_emails) between 1 and 10),
 subject text not null check(length(btrim(subject)) between 1 and 200),
 body text not null check(length(btrim(body)) between 1 and 20000),
 work_id text,
 attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=10 and public.pro_integration_config_safe(attachments)),
 status text not null check(status in('simulated','queued','sent','failed')),
 confirmed_at timestamptz not null,
 provider_message_id text check(provider_message_id is null or length(provider_message_id)<=200),
 error text check(error is null or length(error)<=300),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete set null(work_id),
 -- Mock never sends: its only possible status is «simulated», and «simulated» exists only in mock.
 check((mode='mock')=(status='simulated'))
);
create index if not exists pro_email_outbox_recent on public.pro_email_outbox(owner_id,created_at desc);

create table if not exists public.pro_calendar_links(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in('google','microsoft')),mode text not null check(mode in('mock','sandbox','production')),
 local_kind text not null check(local_kind in('appointment','task')),local_id text not null check(length(local_id) between 1 and 160),
 remote_id text not null check(length(remote_id) between 1 and 200),
 local_fingerprint text not null check(local_fingerprint~'^[a-f0-9]{32}$'),
 remote_etag text not null check(length(remote_etag) between 1 and 200),
 status text not null default 'synced' check(status in('synced','conflict','removed')),
 conflict jsonb check(conflict is null or jsonb_typeof(conflict)='object' and octet_length(conflict::text)<=4096),
 title text not null check(length(title) between 1 and 300),
 synced_at timestamptz not null default now(),revision integer not null default 1 check(revision>0),
 primary key(owner_id,provider,local_kind,local_id),
 check((status='conflict')=(conflict is not null))
);
create table if not exists public.pro_calendar_external(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in('google','microsoft')),remote_id text not null check(length(remote_id) between 1 and 200),
 title text not null check(length(title) between 1 and 300),starts_at timestamptz not null,ends_at timestamptz not null,all_day boolean not null default false,
 seen_at timestamptz not null default now(),primary key(owner_id,provider,remote_id),check(ends_at>=starts_at)
);
-- Local stand-in of the owner's remote calendar (mock mode only; never used by real adapters).
create table if not exists public.pro_mock_calendar_events(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in('google','microsoft')),id text not null check(length(id) between 1 and 200),
 title text not null check(length(title) between 1 and 300),starts_at timestamptz not null,ends_at timestamptz not null,all_day boolean not null default false,
 etag integer not null default 1 check(etag>0),origin text not null check(origin in('ccr','external')),deleted boolean not null default false,
 updated_at timestamptz not null default now(),primary key(owner_id,provider,id),check(ends_at>=starts_at)
);

create or replace function public.pro_connectors_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then raise exception 'Connector history and receipts are immutable' using errcode='23514';end if;
 if exists(select 1 from public.profiles where id=old.owner_id) then raise exception 'Connector history and receipts are immutable' using errcode='23514';end if;
 return old;
end $$;
do $$declare n text;begin foreach n in array array['pro_oauth_history','pro_connector_actions'] loop
 execute format('drop trigger if exists pro_connectors_immutable on public.%I',n);
 execute format('create trigger pro_connectors_immutable before update or delete on public.%I for each row execute function public.pro_connectors_immutable()',n);
end loop;end $$;
-- Outbox rows are records of what the owner confirmed: content never changes; only queued → sent|failed.
create or replace function public.pro_email_outbox_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then if exists(select 1 from public.profiles where id=old.owner_id) then raise exception 'Outbox is kept' using errcode='23514';end if;return old;end if;
 if new.id<>old.id or new.owner_id<>old.owner_id or new.provider<>old.provider or new.mode<>old.mode or new.to_emails<>old.to_emails or new.subject<>old.subject or new.body<>old.body
  or new.attachments<>old.attachments or new.confirmed_at<>old.confirmed_at or new.from_email<>old.from_email or new.created_at<>old.created_at then raise exception 'Outbox content is immutable' using errcode='23514';end if;
 if new.status<>old.status and not(old.status='queued' and new.status in('sent','failed')) then raise exception 'Invalid outbox transition' using errcode='23514';end if;
 if new.status=old.status and new is distinct from old and old.status<>'queued' then raise exception 'Outbox row is final' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_email_outbox_guard on public.pro_email_outbox;
create trigger pro_email_outbox_guard before update or delete on public.pro_email_outbox for each row execute function public.pro_email_outbox_guard();

create or replace function public.pro_connector_receipt(p_actor uuid,p_input jsonb,p_scope text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.pro_connector_actions;
begin
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Invalid action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-connector:'||p_actor::text,0));
 select * into receipt from public.pro_connector_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input or receipt.scope<>p_scope then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 return null;
end $$;

-- OAuth: begin stores the hashed state; consume returns it once (owner checked by the server against the session).
create or replace function public.pro_oauth_begin(p_actor uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare sid uuid:=gen_random_uuid();
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 delete from public.pro_oauth_states where owner_id=p_actor and (expires_at<now() or used_at is not null);
 if (select count(*) from public.pro_oauth_states where owner_id=p_actor)>=10 then raise exception 'Too many pending connections' using errcode='54000';end if;
 insert into public.pro_oauth_states(id,owner_id,provider,mode,state_hash,verifier_box,locale,return_view,expires_at)
 values(sid,p_actor,p_input->>'provider',p_input->>'mode',p_input->>'stateHash',p_input->>'verifierBox',coalesce(p_input->>'locale','es'),coalesce(p_input->>'view','conectores'),now()+interval '10 minutes');
 return sid;
exception when check_violation or not_null_violation or unique_violation then raise exception 'Invalid OAuth state' using errcode='22023';
end $$;
create or replace function public.pro_oauth_consume(p_state_hash text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.pro_oauth_states;
begin
 select * into s from public.pro_oauth_states where state_hash=p_state_hash for update;
 if not found or s.used_at is not null or s.expires_at<now() then raise exception 'OAuth state invalid, used or expired' using errcode='22023',hint='pro_oauth_state';end if;
 update public.pro_oauth_states set used_at=now() where id=s.id;
 return jsonb_build_object('ownerId',s.owner_id,'provider',s.provider,'mode',s.mode,'verifierBox',s.verifier_box,'locale',s.locale,'view',s.return_view);
end $$;
create or replace function public.pro_oauth_store(p_actor uuid,p_provider text,p_mode text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_oauth_connections;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if not public.pro_oauth_box_ok(p_payload->>'accessBox') or p_payload->>'accessBox' is null or not public.pro_oauth_box_ok(p_payload->>'refreshBox') then raise exception 'Tokens must be encrypted' using errcode='22023',hint='pro_oauth_plaintext';end if;
 insert into public.pro_oauth_connections(owner_id,provider,mode,status,account_email,scopes,access_box,refresh_box,access_expires_at,realm_id,connected_at,revoked_at)
 values(p_actor,p_provider,p_mode,'connected',left(p_payload->>'accountEmail',254),coalesce((select array_agg(x) from jsonb_array_elements_text(p_payload->'scopes') x),'{}'),
  p_payload->>'accessBox',p_payload->>'refreshBox',(p_payload->>'expiresAt')::timestamptz,p_payload->>'realmId',now(),null)
 on conflict(owner_id,provider) do update set mode=excluded.mode,status='connected',account_email=excluded.account_email,scopes=excluded.scopes,access_box=excluded.access_box,
  refresh_box=excluded.refresh_box,access_expires_at=excluded.access_expires_at,realm_id=excluded.realm_id,connected_at=now(),revoked_at=null,
  revision=pro_oauth_connections.revision+1,updated_at=now()
 returning * into c;
 insert into public.pro_oauth_history(owner_id,provider,mode,action,detail) values(p_actor,p_provider,p_mode,coalesce(nullif(p_payload->>'historyAction',''),'connect'),jsonb_build_object('account',c.account_email,'scopes',to_jsonb(c.scopes)));
 return jsonb_build_object('provider',c.provider,'status',c.status,'revision',c.revision);
end $$;
create or replace function public.pro_oauth_note(p_actor uuid,p_provider text,p_mode text,p_action text,p_detail jsonb) returns void
language sql security invoker set search_path=public,pg_temp as $$
 insert into public.pro_oauth_history(owner_id,provider,mode,action,detail) values(p_actor,p_provider,p_mode,p_action,coalesce(p_detail,'{}')) $$;
-- Server-only: the encrypted envelopes for one call (the API never returns them to the browser).
create or replace function public.pro_oauth_token(p_actor uuid,p_provider text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('mode',mode,'status',status,'accessBox',access_box,'refreshBox',refresh_box,'expiresAt',access_expires_at,'accountEmail',account_email,'realmId',realm_id,'revision',revision)
 from public.pro_oauth_connections where owner_id=p_actor and provider=p_provider and status='connected' $$;
drop function if exists public.pro_oauth_revoke(uuid,jsonb);
create or replace function public.pro_oauth_revoke(p_actor uuid,p_input jsonb,p_provider_revoked boolean default false) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior jsonb;c public.pro_oauth_connections;result jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 prior:=public.pro_connector_receipt(p_actor,p_input,'revoke');if prior is not null then return prior;end if;
 select * into c from public.pro_oauth_connections where owner_id=p_actor and provider=p_input->>'provider' for update;
 if not found or c.status<>'connected' then raise exception 'Not connected' using errcode='22023',hint='pro_oauth_not_connected';end if;
 if jsonb_typeof(p_input->'revision')<>'number' or c.revision<>(p_input->>'revision')::integer then raise exception 'Connection changed' using errcode='40001';end if;
 update public.pro_oauth_connections set status='revoked',access_box=null,refresh_box=null,access_expires_at=null,revoked_at=now(),revision=revision+1,updated_at=now()
  where owner_id=p_actor and provider=c.provider returning * into c;
 insert into public.pro_oauth_history(owner_id,provider,mode,action,detail) values(p_actor,c.provider,c.mode,'revoke',jsonb_build_object('providerRevoked',coalesce(p_provider_revoked,false)));
 result:=jsonb_build_object('provider',c.provider,'status',c.status,'revision',c.revision);
 insert into public.pro_connector_actions(owner_id,action_id,scope,input,result) values(p_actor,(p_input->>'actionId')::uuid,'revoke',p_input,result);
 return result;
end $$;

create or replace function public.pro_connectors_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'connections',coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'mode',c.mode,'status',c.status,'accountEmail',c.account_email,'scopes',to_jsonb(c.scopes),
    'connectedAt',c.connected_at,'revokedAt',c.revoked_at,'revision',c.revision,'realmId',c.realm_id,'encrypted',c.access_box is not null) order by c.provider) from public.pro_oauth_connections c where c.owner_id=p_actor),'[]'),
  'history',coalesce((select jsonb_agg(jsonb_build_object('provider',h.provider,'mode',h.mode,'action',h.action,'detail',h.detail,'at',h.at) order by h.at desc) from (select * from public.pro_oauth_history where owner_id=p_actor order by at desc limit 20) h),'[]'),
  'outbox',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'provider',o.provider,'mode',o.mode,'from',o.from_email,'to',to_jsonb(o.to_emails),'subject',o.subject,'body',o.body,'workId',o.work_id,
    'attachments',o.attachments,'status',o.status,'confirmedAt',o.confirmed_at,'error',o.error,'createdAt',o.created_at) order by o.created_at desc) from (select * from public.pro_email_outbox where owner_id=p_actor order by created_at desc limit 30) o),'[]'),
  'calendar',jsonb_build_object(
   'links',coalesce((select jsonb_agg(jsonb_build_object('provider',l.provider,'kind',l.local_kind,'localId',l.local_id,'remoteId',l.remote_id,'title',l.title,'status',l.status,'conflict',l.conflict,'syncedAt',l.synced_at,'revision',l.revision) order by l.local_kind,l.title) from public.pro_calendar_links l where l.owner_id=p_actor and l.status<>'removed'),'[]'),
   'external',coalesce((select jsonb_agg(jsonb_build_object('provider',e.provider,'remoteId',e.remote_id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,'allDay',e.all_day) order by e.starts_at) from public.pro_calendar_external e where e.owner_id=p_actor),'[]')),
  'works',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'label',w.service||' · '||w.client) order by w.position desc) from (select * from public.pro_work where user_id=p_actor and not cancelled order by position desc limit 50) w),'[]'));
end $$;

-- Email send record. confirmed must be true (the owner confirmed THIS message in the UI). Idempotent.
create or replace function public.pro_email_record(p_actor uuid,p_input jsonb,p_mode text,p_from text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior jsonb;c public.pro_oauth_connections;oid uuid:=gen_random_uuid();o public.pro_email_outbox;result jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 prior:=public.pro_connector_receipt(p_actor,p_input,'email');if prior is not null then return prior||jsonb_build_object('duplicate',true);end if;
 if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'Each send needs explicit confirmation' using errcode='22023',hint='pro_email_confirm';end if;
 select * into c from public.pro_oauth_connections where owner_id=p_actor and provider=p_input->>'provider' and status='connected';
 if not found then raise exception 'Mailbox not connected' using errcode='22023',hint='pro_oauth_not_connected';end if;
 if c.mode<>p_mode then raise exception 'Connection mode differs' using errcode='22023',hint='pro_oauth_mode';end if;
 if p_input->>'workId' is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=p_input->>'workId') then raise exception 'Unknown project' using errcode='22023';end if;
 insert into public.pro_email_outbox(owner_id,id,provider,mode,from_email,to_emails,subject,body,work_id,attachments,status,confirmed_at)
 values(p_actor,oid,c.provider,p_mode,coalesce(p_from,c.account_email,'buzon@desconocido.local'),(select array_agg(lower(btrim(x))) from jsonb_array_elements_text(p_input->'to') x),
  p_input->>'subject',p_input->>'body',p_input->>'workId',coalesce(p_input->'attachments','[]'),case when p_mode='mock' then 'simulated' else 'queued' end,now()) returning * into o;
 result:=jsonb_build_object('id',o.id,'status',o.status,'mode',o.mode);
 insert into public.pro_connector_actions(owner_id,action_id,scope,input,result) values(p_actor,(p_input->>'actionId')::uuid,'email',p_input,result);
 return result;
exception when check_violation or not_null_violation then raise exception 'Invalid email' using errcode='22023';
end $$;
create or replace function public.pro_email_result(p_actor uuid,p_id uuid,p_ok boolean,p_message_id text,p_error text) returns void
language sql security invoker set search_path=public,pg_temp as $$
 update public.pro_email_outbox set status=case when p_ok then 'sent' else 'failed' end,provider_message_id=left(p_message_id,200),error=left(p_error,300)
 where owner_id=p_actor and id=p_id and status='queued' $$;

-- Calendar sources: scheduled jobs of the agenda and open dated tasks (America/Costa_Rica dates).
create or replace function public.pro_calendar_sources(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x) from (
  select jsonb_build_object('kind','appointment','localId',w.id,'title',w.service||' · '||w.client,'startsAt',public.pro_instant(w.start),
   'endsAt',coalesce(public.pro_instant(nullif(btrim(w."end"),'')),public.pro_instant(w.start)+interval '1 hour'),'allDay',false,'revision',null) x
  from public.pro_work w where w.user_id=p_actor and not w.cancelled and w.stage<>'completed' and btrim(w.start)<>'' and public.pro_instant(w.start) is not null
  union all
  select jsonb_build_object('kind','task','localId',t.id::text,'title',t.title,'startsAt',(t.due_date::timestamp at time zone 'America/Costa_Rica'),
   'endsAt',((t.due_date+1)::timestamp at time zone 'America/Costa_Rica'),'allDay',true,'revision',t.revision)
  from public.pro_work_tasks t where t.owner_id=p_actor and not t.archived and t.status='open' and t.due_date is not null
 ) s),'[]');
end $$;
create or replace function public.pro_calendar_link_put(p_actor uuid,p_link jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into public.pro_calendar_links(owner_id,provider,mode,local_kind,local_id,remote_id,local_fingerprint,remote_etag,status,conflict,title,synced_at)
 values(p_actor,p_link->>'provider',p_link->>'mode',p_link->>'kind',p_link->>'localId',p_link->>'remoteId',p_link->>'fingerprint',p_link->>'etag',coalesce(p_link->>'status','synced'),
  case when p_link->>'status'='conflict' then p_link->'conflict' end,left(p_link->>'title',300),now())
 on conflict(owner_id,provider,local_kind,local_id) do update set mode=excluded.mode,remote_id=excluded.remote_id,local_fingerprint=excluded.local_fingerprint,remote_etag=excluded.remote_etag,
  status=excluded.status,conflict=excluded.conflict,title=excluded.title,synced_at=now(),revision=pro_calendar_links.revision+1;
exception when check_violation or not_null_violation then raise exception 'Invalid calendar link' using errcode='22023';
end $$;
-- A task moved in the calendar: CAS on the task revision (a local edit in between becomes a conflict).
create or replace function public.pro_calendar_apply_task_date(p_actor uuid,p_task uuid,p_revision integer,p_date date) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare t public.pro_work_tasks;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into t from public.pro_work_tasks where owner_id=p_actor and id=p_task for update;
 if not found or t.archived then return jsonb_build_object('ok',false,'reason','missing');end if;
 if t.revision<>p_revision then return jsonb_build_object('ok',false,'reason','changed');end if;
 update public.pro_work_tasks set due_date=p_date,revision=revision+1,updated_at=now() where owner_id=p_actor and id=p_task returning * into t;
 return jsonb_build_object('ok',true,'revision',t.revision);
end $$;
create or replace function public.pro_calendar_external_put(p_actor uuid,p_provider text,p_rows jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 delete from public.pro_calendar_external where owner_id=p_actor and provider=p_provider;
 insert into public.pro_calendar_external(owner_id,provider,remote_id,title,starts_at,ends_at,all_day)
 select p_actor,p_provider,r->>'remoteId',left(r->>'title',300),(r->>'startsAt')::timestamptz,(r->>'endsAt')::timestamptz,coalesce((r->>'allDay')::boolean,false) from jsonb_array_elements(coalesce(p_rows,'[]')) r limit 200;
end $$;

do $$declare n text;begin foreach n in array array['pro_oauth_states','pro_oauth_connections','pro_oauth_history','pro_connector_actions','pro_email_outbox','pro_calendar_links','pro_calendar_external','pro_mock_calendar_events'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select,insert,update,delete on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro\_oauth\_%' or p.proname like 'pro\_email\_%' or p.proname like 'pro\_calendar\_%' or p.proname like 'pro\_connector%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_connectors_immutable(%' and f::text not like 'pro_email_outbox_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
