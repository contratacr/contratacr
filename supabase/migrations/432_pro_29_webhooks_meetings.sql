-- Pro row 72: outgoing webhooks (external automation) and meetings with a video link.
-- Webhooks: owner endpoints (https only), the signing secret exists ONLY as an AES-GCM envelope (shown once to the owner at
-- creation), revocable, optimistic concurrency; a per-owner delivery log without bodies (event, mode, status, attempts, code).
-- Sandbox mode (default) records deliveries as "simulated" and never opens a connection; live mode is decided by the server.
-- Meetings: a meeting with a mock video link (meet/teams/zoom adapter in mock mode) linked to a job, cancellable; when the matching
-- calendar is connected in mock mode a stand-in event is added to the mock calendar. Nothing here sends mail or calls a provider.
-- All tables: RLS on, service_role only; functions security invoker, gated by pro_private_work_tools_enabled.
begin;
create table if not exists public.pro_webhook_endpoints(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 80),
 url text not null check(length(url)<=600 and url~'^https://[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?(/[^[:space:]]*)?$'),
 events text[] not null check(cardinality(events) between 1 and 3 and events<@array['lead.created','quote.accepted','invoice.paid']::text[]),
 secret_box text not null check(public.pro_oauth_box_ok(secret_box) and secret_box is not null),
 secret_hint text not null check(secret_hint~'^[A-Za-z0-9_-]{4}$'),
 status text not null default 'active' check(status in('active','paused','revoked')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),revoked_at timestamptz,
 primary key(owner_id,id),check((status='revoked')=(revoked_at is not null))
);
create table if not exists public.pro_webhook_deliveries(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,endpoint_id uuid not null,
 event text not null check(event in('lead.created','quote.accepted','invoice.paid','test.ping')),
 mode text not null check(mode in('sandbox','live')),
 status text not null check(status in('simulated','delivered','failed')),
 attempts integer not null default 1 check(attempts between 1 and 10),
 http_status integer check(http_status is null or http_status between 100 and 599),
 error text check(error is null or length(error)<=200),
 created_at timestamptz not null default now(),
 primary key(owner_id,id),foreign key(owner_id,endpoint_id) references public.pro_webhook_endpoints(owner_id,id) on delete cascade
);
create index if not exists pro_webhook_deliveries_recent on public.pro_webhook_deliveries(owner_id,created_at desc);
create table if not exists public.pro_meetings(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 work_id text,title text not null check(length(btrim(title)) between 1 and 120),
 provider text not null check(provider in('meet','teams','zoom')),mode text not null default 'mock' check(mode in('mock','sandbox','production')),
 join_url text not null check(length(join_url)<=300 and join_url~'^https://[^[:space:]]+$'),
 starts_at timestamptz not null,duration_minutes integer not null check(duration_minutes between 15 and 480),
 status text not null default 'scheduled' check(status in('scheduled','cancelled')),
 calendar_provider text check(calendar_provider is null or calendar_provider in('google','microsoft')),calendar_event_id text,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete set null(work_id)
);
create index if not exists pro_meetings_upcoming on public.pro_meetings(owner_id,starts_at desc);

create or replace function public.pro_webhooks_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'endpoints',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'url',e.url,'events',to_jsonb(e.events),'status',e.status,'secretHint',e.secret_hint,
    'revision',e.revision,'createdAt',e.created_at) order by e.created_at desc) from public.pro_webhook_endpoints e where e.owner_id=p_actor),'[]'::jsonb),
  'deliveries',coalesce((select jsonb_agg(x order by x->>'createdAt' desc) from (select jsonb_build_object('id',d.id,'endpointId',d.endpoint_id,'event',d.event,'mode',d.mode,
    'status',d.status,'attempts',d.attempts,'httpStatus',d.http_status,'error',d.error,'createdAt',d.created_at) x
    from public.pro_webhook_deliveries d where d.owner_id=p_actor order by d.created_at desc limit 30) q),'[]'::jsonb));
end $$;

create or replace function public.pro_webhook_endpoint_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;eid uuid;rev integer;cur public.pro_webhook_endpoints;evs text[];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid endpoint' using errcode='22023';end if;
 act:=p_input->>'action';
 if act not in('create','pause','resume','revoke') then raise exception 'Invalid action' using errcode='22023';end if;
 if not coalesce((p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then raise exception 'Invalid id' using errcode='22023';end if;
 eid:=(p_input->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('pro-webhook:'||p_actor::text,0));
 if act='create' then
  if jsonb_typeof(p_input->'events') is distinct from 'array' then raise exception 'Invalid events' using errcode='22023';end if;
  select array_agg(distinct value) into evs from jsonb_array_elements_text(p_input->'events');
  if (select count(*) from public.pro_webhook_endpoints where owner_id=p_actor and status<>'revoked')>=10 then raise exception 'Too many endpoints' using errcode='54000';end if;
  insert into public.pro_webhook_endpoints(owner_id,id,name,url,events,secret_box,secret_hint)
  values(p_actor,eid,btrim(p_input->>'name'),p_input->>'url',evs,p_input->>'secretBox',p_input->>'secretHint');
 else
  if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid revision' using errcode='22023';end if;
  rev:=(p_input->>'revision')::integer;
  select * into cur from public.pro_webhook_endpoints where owner_id=p_actor and id=eid for update;
  if not found then raise exception 'Endpoint unavailable' using errcode='P0002';end if;
  if cur.revision<>rev then raise exception 'Stale endpoint' using errcode='40001';end if;
  if cur.status='revoked' then raise exception 'Endpoint revoked' using errcode='22023';end if;
  if act='revoke' then update public.pro_webhook_endpoints set status='revoked',revoked_at=now(),revision=revision+1,updated_at=now() where owner_id=p_actor and id=eid;
  else update public.pro_webhook_endpoints set status=case when act='pause' then 'paused' else 'active' end,revision=revision+1,updated_at=now() where owner_id=p_actor and id=eid;end if;
 end if;
 return (select jsonb_build_object('id',e.id,'name',e.name,'url',e.url,'events',to_jsonb(e.events),'status',e.status,'secretHint',e.secret_hint,'revision',e.revision,'createdAt',e.created_at)
  from public.pro_webhook_endpoints e where e.owner_id=p_actor and e.id=eid);
end $$;

-- Server-side only: the active endpoints subscribed to an event, with the secret envelope (never returned to a browser).
create or replace function public.pro_webhook_targets(p_actor uuid,p_event text,p_endpoint uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_event not in('lead.created','quote.accepted','invoice.paid','test.ping') then raise exception 'Invalid event' using errcode='22023';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'url',e.url,'secretBox',e.secret_box))
  from public.pro_webhook_endpoints e where e.owner_id=p_actor and e.status='active'
   and (p_endpoint is not null and e.id=p_endpoint or p_endpoint is null and p_event=any(e.events))),'[]'::jsonb);
end $$;

create or replace function public.pro_webhook_delivery_log(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare did uuid:=gen_random_uuid();
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid delivery' using errcode='22023';end if;
 insert into public.pro_webhook_deliveries(owner_id,id,endpoint_id,event,mode,status,attempts,http_status,error)
 values(p_actor,did,(p_input->>'endpointId')::uuid,p_input->>'event',p_input->>'mode',p_input->>'status',coalesce((p_input->>'attempts')::integer,1),
  nullif(p_input->>'httpStatus','')::integer,left(nullif(p_input->>'error',''),200));
 delete from public.pro_webhook_deliveries where owner_id=p_actor and id in(select id from public.pro_webhook_deliveries where owner_id=p_actor order by created_at desc offset 200);
 return jsonb_build_object('id',did);
end $$;

create or replace function public.pro_meetings_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'meetings',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'workId',m.work_id,'title',m.title,'provider',m.provider,'mode',m.mode,'joinUrl',m.join_url,
    'startsAt',m.starts_at,'durationMinutes',m.duration_minutes,'status',m.status,'calendarProvider',m.calendar_provider,'revision',m.revision) order by m.starts_at desc)
    from (select * from public.pro_meetings where owner_id=p_actor order by starts_at desc limit 50) m),'[]'::jsonb),
  'works',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'label',w.client||' - '||w.service) order by w.position desc)
    from (select * from public.pro_work where user_id=p_actor and not cancelled order by position desc limit 100) w),'[]'::jsonb));
end $$;

create or replace function public.pro_meeting_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;mid uuid;cur public.pro_meetings;prov text;cal text;eid text;starts timestamptz;dur integer;wid text;ttl text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid meeting' using errcode='22023';end if;
 act:=p_input->>'action';
 if act not in('create','cancel') then raise exception 'Invalid action' using errcode='22023';end if;
 if not coalesce((p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then raise exception 'Invalid id' using errcode='22023';end if;
 mid:=(p_input->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('pro-meeting:'||p_actor::text||':'||mid::text,0));
 select * into cur from public.pro_meetings where owner_id=p_actor and id=mid for update;
 if act='create' then
  if found then return (select jsonb_build_object('id',m.id,'status',m.status,'joinUrl',m.join_url,'revision',m.revision) from public.pro_meetings m where m.owner_id=p_actor and m.id=mid);end if;
  prov:=p_input->>'provider';if prov not in('meet','teams','zoom') then raise exception 'Invalid provider' using errcode='22023';end if;
  ttl:=btrim(p_input->>'title');if ttl is null or length(ttl) not between 1 and 120 then raise exception 'Invalid title' using errcode='22023';end if;
  starts:=(p_input->>'startsAt')::timestamptz;dur:=(p_input->>'durationMinutes')::integer;
  if dur not between 15 and 480 or starts<now()-interval '1 day' or starts>now()+interval '2 years' then raise exception 'Invalid time' using errcode='22023';end if;
  wid:=nullif(p_input->>'workId','');
  if wid is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Job unavailable' using errcode='P0002';end if;
  if (select count(*) from public.pro_meetings where owner_id=p_actor and status='scheduled')>=200 then raise exception 'Too many meetings' using errcode='54000';end if;
  cal:=case prov when 'meet' then 'google' when 'teams' then 'microsoft' else null end;
  if cal is not null and exists(select 1 from public.pro_oauth_connections c where c.owner_id=p_actor and c.provider=cal and c.status='connected' and c.mode='mock') then
   eid:='ccr-mtg-'||mid::text;
   insert into public.pro_mock_calendar_events(owner_id,provider,id,title,starts_at,ends_at,origin)
   values(p_actor,cal,eid,left(ttl||' - '||(p_input->>'joinUrl'),300),starts,starts+make_interval(mins=>dur),'ccr') on conflict do nothing;
  else cal:=null;eid:=null;end if;
  insert into public.pro_meetings(owner_id,id,work_id,title,provider,join_url,starts_at,duration_minutes,calendar_provider,calendar_event_id)
  values(p_actor,mid,wid,ttl,prov,p_input->>'joinUrl',starts,dur,cal,eid);
 else
  if not found then raise exception 'Meeting unavailable' using errcode='P0002';end if;
  if jsonb_typeof(p_input->'revision') is distinct from 'number' or cur.revision<>(p_input->>'revision')::integer then raise exception 'Stale meeting' using errcode='40001';end if;
  if cur.status='cancelled' then raise exception 'Meeting cancelled' using errcode='22023';end if;
  update public.pro_meetings set status='cancelled',revision=revision+1,updated_at=now() where owner_id=p_actor and id=mid;
  if cur.calendar_event_id is not null then
   update public.pro_mock_calendar_events set deleted=true,etag=etag+1,updated_at=now() where owner_id=p_actor and provider=cur.calendar_provider and id=cur.calendar_event_id;
  end if;
 end if;
 return (select jsonb_build_object('id',m.id,'status',m.status,'joinUrl',m.join_url,'calendarProvider',m.calendar_provider,'revision',m.revision) from public.pro_meetings m where m.owner_id=p_actor and m.id=mid);
end $$;

do $$declare f record;begin
 alter table public.pro_webhook_endpoints enable row level security;
 alter table public.pro_webhook_deliveries enable row level security;
 alter table public.pro_meetings enable row level security;
 revoke all on public.pro_webhook_endpoints,public.pro_webhook_deliveries,public.pro_meetings from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_webhook_endpoints,public.pro_webhook_deliveries,public.pro_meetings to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_webhooks_read','pro_webhook_endpoint_set','pro_webhook_targets','pro_webhook_delivery_log','pro_meetings_read','pro_meeting_set') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
