-- LOCAL PRO ONLY. Additive requests, not a rewrite/backfill of existing bookings.
-- No notifications, emails, push outbox, charges or customer ledger mutations.
begin;
create table if not exists public.pro_appointment_requests(
 id uuid primary key,position bigint generated always as identity unique,
 professional_id uuid not null references public.professionals(id),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 client_user_id uuid not null references public.profiles(id) on delete cascade,
 client_name text not null check(length(client_name) between 1 and 160),
 professional_name text not null check(length(professional_name) between 1 and 160),professional_slug text,
 service text not null check(length(service) between 1 and 160),duration_minutes integer not null check(duration_minutes between 15 and 480 and duration_minutes%15=0),
 location_kind text not null check(location_kind in ('agree','provider','customer','online')),
 location_text text not null default '' check(length(location_text)<=500),note text not null default '' check(length(note)<=500),
 requested_start timestamptz,preferred_day date,preference text not null default '' check(length(preference)<=200),
 proposed_start timestamptz,proposed_duration_minutes integer check(proposed_duration_minutes between 15 and 480 and proposed_duration_minutes%15=0),
 status text not null default 'requested' check(status in ('requested','proposed','confirmed','declined','cancelled','completed')),
 revision integer not null default 0 check(revision>=0),work_id text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(owner_id<>client_user_id),check(location_kind<>'customer' or length(btrim(location_text))>0),
 check((proposed_start is null)=(proposed_duration_minutes is null)),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id)
);
create index if not exists pro_appointment_owner_page on public.pro_appointment_requests(owner_id,position desc);
create index if not exists pro_appointment_client_page on public.pro_appointment_requests(client_user_id,position desc);
create index if not exists pro_appointment_client_created on public.pro_appointment_requests(client_user_id,created_at desc);
create unique index if not exists pro_appointment_work_once on public.pro_appointment_requests(owner_id,work_id) where work_id is not null;
-- Round 1 (2026-11-12): 'project_invite' rows link a customer account to an existing job via a
-- one-time invitation (work-client-invitations-local.sql). They are not appointments: lead lists,
-- the provider request list and the agenda lifecycle sync ignore them.
alter table public.pro_appointment_requests add column if not exists origin text not null default 'booking';
do $$begin if not exists(select 1 from pg_constraint where conname='pro_appointment_requests_origin_check') then alter table public.pro_appointment_requests add constraint pro_appointment_requests_origin_check check(origin in('booking','project_invite'));end if;end $$;
create table if not exists public.pro_appointment_events(
 position bigint generated always as identity primary key,request_id uuid not null references public.pro_appointment_requests(id) on delete cascade,
 actor_id uuid not null,side text not null check(side in ('provider','client')),action text not null,
 note text not null default '' check(length(note)<=500),start_at timestamptz,end_at timestamptz,
 status text not null check(status in ('requested','proposed','confirmed','declined','cancelled','completed')),at timestamptz not null default now()
);
create index if not exists pro_appointment_event_page on public.pro_appointment_events(request_id,position desc);
create table if not exists public.pro_appointment_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 request_id uuid not null references public.pro_appointment_requests(id) on delete cascade,input jsonb not null,result jsonb not null,
 primary key(actor_id,action_id)
);

create or replace function public.pro_appointment_time(p_value timestamptz) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_value is null then null else to_char(p_value at time zone 'America/Costa_Rica','YYYY-MM-DD"T"HH24:MI:SS')||'-06:00' end;
$$;
create or replace function public.pro_appointment_enabled(p_owner uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 -- Single Pro entitlement rule (pro_entitled, pro-entitled-draft.sql); public booking still needs a professionals row.
 select public.pro_entitled(p_owner) and exists(select 1 from public.professionals where profile_id=p_owner);
$$;
create or replace function public.pro_appointment_slot_free(p_owner uuid,p_start timestamptz,p_duration integer) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(p_start>now()+interval '15 minutes' and p_start<now()+interval '90 days'
 and p_duration between 15 and 480 and p_duration%15=0
 and extract(second from p_start)=0 and extract(minute from p_start)::integer%15=0
 and exists(select 1 from pro_availability a where a.user_id=p_owner and pro_instant(a.start)<=p_start and pro_instant(a."end")>=p_start+make_interval(mins=>p_duration))
 and not exists(select 1 from pro_work w where w.user_id=p_owner and not w.cancelled and pro_instant(w.start)<p_start+make_interval(mins=>p_duration) and pro_instant(w."end")>p_start),false);
$$;
create or replace function public.pro_appointment_slots(p_owner uuid,p_day date,p_duration integer) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare first_at timestamptz;last_at timestamptz;result jsonb;
begin
 if p_day is null or p_day<(now() at time zone 'America/Costa_Rica')::date or p_day>(now() at time zone 'America/Costa_Rica')::date+90 or p_duration is null or p_duration<15 or p_duration>480 or p_duration%15<>0 then raise exception 'Invalid day or duration' using errcode='22023';end if;
 if not pro_appointment_enabled(p_owner) then return jsonb_build_object('slots','[]'::jsonb,'truncated',false);end if;
 first_at:=p_day::timestamp at time zone 'America/Costa_Rica';last_at:=(p_day+1)::timestamp at time zone 'America/Costa_Rica';
 select coalesce(jsonb_agg(jsonb_build_object('start',pro_appointment_time(t),'end',pro_appointment_time(t+make_interval(mins=>p_duration))) order by t),'[]') into result
 from generate_series(first_at,last_at-interval '15 minutes',interval '15 minutes') t where pro_appointment_slot_free(p_owner,t,p_duration);
 return jsonb_build_object('slots',result,'truncated',false);
end $$;
create or replace function public.pro_appointment_record(p_actor uuid,p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'position',r.position,'professionalId',r.professional_id,'professionalName',r.professional_name,'professionalSlug',coalesce(p.slug,r.professional_slug),
 'clientName',r.client_name,'service',r.service,'durationMinutes',r.duration_minutes,'locationKind',r.location_kind,'locationText',r.location_text,'note',r.note,
 'requestedStart',pro_appointment_time(r.requested_start),'preferredDay',r.preferred_day,'preference',r.preference,'proposedStart',pro_appointment_time(r.proposed_start),'proposedDurationMinutes',r.proposed_duration_minutes,
 'status',r.status,'revision',r.revision,'workId',r.work_id,
 'start',pro_appointment_time(case when r.work_id is not null then pro_instant(w.start) when r.status='proposed' then r.proposed_start else r.requested_start end),
 'end',pro_appointment_time(case when r.work_id is not null then pro_instant(w."end") when r.status='proposed' then r.proposed_start+make_interval(mins=>r.proposed_duration_minutes) else r.requested_start+make_interval(mins=>r.duration_minutes) end),
 'workStage',w.stage,'workCancelled',coalesce(w.cancelled,false),'origin',r.origin,'createdAt',r.created_at,'updatedAt',r.updated_at,'side',case when r.owner_id=p_actor then 'provider' else 'client' end)
 from pro_appointment_requests r left join professionals p on p.id=r.professional_id left join pro_work w on w.user_id=r.owner_id and w.id=r.work_id
 where r.id=p_id and p_actor in(r.owner_id,r.client_user_id) and exists(select 1 from profiles p where p.id=p_actor and not coalesce(p.is_disabled,false));
$$;
create or replace function public.pro_appointment_page(p_actor uuid,p_side text,p_after bigint default null,p_status text default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;next_key bigint;
begin
 if p_side not in ('provider','client') or p_side is null or p_after<1 or p_status is not null and p_status not in ('requested','proposed','confirmed','declined','cancelled','completed') then raise exception 'Invalid page' using errcode='22023';end if;
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 with page as(select id,position from pro_appointment_requests where (case when p_side='provider' then owner_id else client_user_id end)=p_actor and (p_side='client' or origin='booking') and (p_after is null or position<p_after) and (p_status is null or status=p_status) order by position desc limit 21)
 select coalesce((select jsonb_agg(pro_appointment_record(p_actor,id) order by position desc) from(select * from page order by position desc limit 20) x),'[]'),case when(select count(*) from page)>20 then(select position from page order by position desc offset 19 limit 1) else null end into result,next_key;
 return jsonb_build_object('items',result,'nextCursor',next_key);
end $$;
create or replace function public.pro_appointment_detail(p_actor uuid,p_id uuid,p_after bigint default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;events jsonb;next_key bigint;
begin
 if p_after<1 then raise exception 'Invalid cursor' using errcode='22023';end if;
 result:=pro_appointment_record(p_actor,p_id);if result is null then return null;end if;
 with page as(select * from pro_appointment_events where request_id=p_id and(p_after is null or position<p_after) order by position desc limit 21)
 select coalesce((select jsonb_agg(jsonb_build_object('position',position,'action',action,'side',side,'note',note,'start',pro_appointment_time(start_at),'end',pro_appointment_time(end_at),'status',status,'at',at) order by position desc) from(select * from page order by position desc limit 20) x),'[]'),case when(select count(*) from page)>20 then(select position from page order by position desc offset 19 limit 1) else null end into events,next_key;
 return jsonb_build_object('request',result,'events',events,'nextCursor',next_key);
end $$;

create or replace function public.pro_appointment_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;rid uuid;aid uuid;pid uuid;owner uuid;provider public.professionals;actor public.profiles;r public.pro_appointment_requests;prior public.pro_appointment_actions;
 keys text[];required text[];start_at timestamptz;duration integer;preferred date;current_rev integer;client_id text;client_name text;result jsonb;event_note text:='';event_side text;prior_flag text;
begin
 if p_actor is null or p_input is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& array['action','id','actionId']) or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid operation' using errcode='22023';end if;
 act:=p_input->>'action';rid:=(p_input->>'id')::uuid;aid:=(p_input->>'actionId')::uuid;
 if act not in ('create','propose','confirm','accept','decline','cancel') then raise exception 'Invalid operation' using errcode='22023';end if;
 select * into actor from profiles where id=p_actor and not coalesce(is_disabled,false);if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if act='create' then
  -- A separate client namespace never collides with the agenda owner lock.
  -- Only CREATE takes it, before the owner lock, so daily quota checks serialize across providers.
  perform pg_advisory_xact_lock(hashtextextended('appointment-client:'||p_actor::text,0));
  if jsonb_typeof(p_input->'professionalId') is distinct from 'string' then raise exception 'Invalid provider' using errcode='22023';end if;
  pid:=(p_input->>'professionalId')::uuid;select * into provider from professionals where id=pid;if not found then raise exception 'Provider unavailable' using errcode='42501';end if;owner:=provider.profile_id;
 else select owner_id into owner from pro_appointment_requests where id=rid and p_actor in(owner_id,client_user_id);if not found then raise exception 'Request unavailable' using errcode='42501';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into prior from pro_appointment_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Idempotency key changed' using errcode='22023';end if;return prior.result;end if;
 if act not in ('cancel','decline') and not pro_appointment_enabled(owner) then raise exception 'Provider unavailable' using errcode='42501';end if;
 if act='create' then
  required:=array['action','id','actionId','professionalId','service','durationMinutes','locationKind','locationText','note','start','preferredDay','preference'];keys:=array(select jsonb_object_keys(p_input));
  if not(keys<@required and keys@>required) then raise exception 'Invalid request fields' using errcode='22023';end if;
  if owner=p_actor then raise exception 'Cannot request own service' using errcode='42501';end if;
  if exists(select 1 from pro_appointment_requests where id=rid) then raise exception 'Request ID already exists' using errcode='22023';end if;
  if jsonb_typeof(p_input->'service') is distinct from 'string' or length(btrim(p_input->>'service')) not between 1 and 160
   or jsonb_typeof(p_input->'durationMinutes') is distinct from 'number' or (p_input->>'durationMinutes')!~'^[0-9]{1,3}$'
   or jsonb_typeof(p_input->'locationKind') is distinct from 'string' or p_input->>'locationKind' not in ('agree','provider','customer','online')
   or jsonb_typeof(p_input->'locationText') is distinct from 'string' or length(p_input->>'locationText')>500
   or jsonb_typeof(p_input->'note') is distinct from 'string' or length(p_input->>'note')>500
   or jsonb_typeof(p_input->'preference') is distinct from 'string' or length(p_input->>'preference')>200
   or jsonb_typeof(p_input->'start') not in ('string','null') or jsonb_typeof(p_input->'preferredDay') not in ('string','null') then raise exception 'Invalid request values' using errcode='22023';end if;
  duration:=(p_input->>'durationMinutes')::integer;if duration<15 or duration>480 or duration%15<>0 then raise exception 'Invalid duration' using errcode='22023';end if;
  if p_input->>'locationKind'='customer' and btrim(p_input->>'locationText')='' then raise exception 'Location required' using errcode='22023';end if;
  if p_input->>'preferredDay' is not null then
   if (p_input->>'preferredDay')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid preferred date' using errcode='22023';end if;
   begin preferred:=(p_input->>'preferredDay')::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid preferred date' using errcode='22023';end;
   if preferred<(now() at time zone 'America/Costa_Rica')::date or preferred>(now() at time zone 'America/Costa_Rica')::date+90 then raise exception 'Invalid preferred date' using errcode='22023';end if;
  end if;
  if p_input->>'start' is not null then start_at:=pro_instant(p_input->>'start');if not pro_appointment_slot_free(owner,start_at,duration) then raise exception 'Slot unavailable' using errcode='40001';end if;end if;
  if (select count(*) from pro_appointment_requests where client_user_id=p_actor and owner_id=owner and status in ('requested','proposed','confirmed'))>=20 or (select count(*) from pro_appointment_requests where client_user_id=p_actor and created_at>=date_trunc('day',now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')>=100 then raise exception 'Request limit reached' using errcode='54000';end if;
  client_name:=left(coalesce(nullif(btrim(actor.full_name),''),'Cliente'),160);
  insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,professional_slug,service,duration_minutes,location_kind,location_text,note,requested_start,preferred_day,preference)
  values(rid,pid,owner,p_actor,client_name,left(coalesce(nullif(btrim(provider.business_name),''),'Profesional'),160),provider.slug,btrim(p_input->>'service'),duration,p_input->>'locationKind',btrim(p_input->>'locationText'),btrim(p_input->>'note'),start_at,preferred,btrim(p_input->>'preference')) returning * into r;
  event_side:='client';event_note:=r.note;
 else
  select * into r from pro_appointment_requests where id=rid for update;
  required:=case when act='propose' then array['action','id','actionId','revision','start','durationMinutes','note'] when act in ('cancel','decline') then array['action','id','actionId','revision','note'] else array['action','id','actionId','revision'] end;
  keys:=array(select jsonb_object_keys(p_input));
  if not(keys<@required and keys@>required) or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]{1,9}$' then raise exception 'Invalid action fields' using errcode='22023';end if;
  if r.revision<>(p_input->>'revision')::integer then raise exception 'Request changed' using errcode='40001';end if;
  if act in ('propose','confirm','decline') and p_actor<>owner or act='accept' and p_actor<>r.client_user_id then raise exception 'Forbidden action' using errcode='42501';end if;
  if act in ('propose','confirm','decline') and r.status not in ('requested','proposed') or act='accept' and r.status<>'proposed' or act='cancel' and r.status not in ('requested','proposed','confirmed') then raise exception 'Invalid request state' using errcode='40001';end if;
  event_side:=case when p_actor=owner then 'provider' else 'client' end;
  if act in ('propose','decline','cancel') then
   if jsonb_typeof(p_input->'note') is distinct from 'string' or length(p_input->>'note')>500 then raise exception 'Invalid note' using errcode='22023';end if;event_note:=btrim(p_input->>'note');
  end if;
  if act='propose' then
   if jsonb_typeof(p_input->'start') is distinct from 'string' or jsonb_typeof(p_input->'durationMinutes') is distinct from 'number' or (p_input->>'durationMinutes')!~'^[0-9]{1,3}$' then raise exception 'Invalid proposal' using errcode='22023';end if;
   start_at:=pro_instant(p_input->>'start');duration:=(p_input->>'durationMinutes')::integer;
   if not pro_appointment_slot_free(owner,start_at,duration) then raise exception 'Slot unavailable' using errcode='40001';end if;
   r.proposed_start:=start_at;r.proposed_duration_minutes:=duration;r.status:='proposed';
  elsif act in ('confirm','accept') then
   if act='confirm' and r.status<>'requested' then raise exception 'Client must accept proposal' using errcode='40001';end if;
   start_at:=case when act='confirm' then r.requested_start else r.proposed_start end;duration:=case when act='confirm' then r.duration_minutes else r.proposed_duration_minutes end;
   if not pro_appointment_slot_free(owner,start_at,duration) then raise exception 'Slot unavailable' using errcode='40001';end if;
   if (select count(*) from pro_work where user_id=owner)>=10000 then raise exception 'Work limit reached' using errcode='54000';end if;
   select revision into current_rev from pro_workspace_core where user_id=owner for update;
   insert into pro_workspace_core(user_id,document,revision) values(owner,'{"version":1,"social":[]}',coalesce(current_rev,0)) on conflict do nothing;
   client_id:='reservation-'||r.client_user_id::text;
   -- Only create a missing contact; never overwrite saved fiscal/contact details.
   insert into pro_clients(user_id,id,name,email,phone,notes,archived) values(owner,client_id,r.client_name,'','','',false) on conflict(user_id,id) do nothing;
   if exists(select 1 from pro_clients where user_id=owner and id=client_id and archived) then update pro_clients set archived=false where user_id=owner and id=client_id;end if;
   insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled,"bookingClientId")
   select owner,r.id::text,c.name,r.service,'scheduled',pro_appointment_time(start_at),pro_appointment_time(start_at+make_interval(mins=>duration)),client_id,false,r.client_user_id::text from pro_clients c where c.user_id=owner and c.id=client_id;
   update pro_workspace_core set revision=revision+1,updated_at=now(),panel_fields=case when 'work'=any(panel_fields) then panel_fields else array_append(panel_fields,'work') end where user_id=owner;
   r.work_id:=r.id::text;r.status:='confirmed';
  elsif act='decline' then r.status:='declined';
  elsif act='cancel' then
   if r.work_id is not null then
    if not exists(select 1 from pro_work w where w.user_id=owner and w.id=r.work_id and not w.cancelled and w.stage<>'completed' and w."bookingClientId"=r.client_user_id::text and pro_instant(w.start)>now()) then raise exception 'Appointment already changed or started' using errcode='40001';end if;
    prior_flag:=current_setting('contratacr.appointment_request',true);perform set_config('contratacr.appointment_request',r.id::text,true);
    update pro_work set cancelled=true where user_id=owner and id=r.work_id;
    perform set_config('contratacr.appointment_request',coalesce(prior_flag,''),true);
    update pro_workspace_core set revision=revision+1,updated_at=now() where user_id=owner;
   end if;r.status:='cancelled';
  end if;
  r.revision:=r.revision+1;
  update pro_appointment_requests set proposed_start=r.proposed_start,proposed_duration_minutes=r.proposed_duration_minutes,status=r.status,revision=r.revision,work_id=r.work_id,updated_at=now() where id=r.id returning * into r;
 end if;
 if r.work_id is not null then select pro_instant(w.start),extract(epoch from(pro_instant(w."end")-pro_instant(w.start)))::integer/60 into start_at,duration from pro_work w where w.user_id=owner and w.id=r.work_id;
 elsif r.status='proposed' then start_at:=r.proposed_start;duration:=r.proposed_duration_minutes;
 else start_at:=r.requested_start;duration:=r.duration_minutes;end if;
 insert into pro_appointment_events(request_id,actor_id,side,action,note,start_at,end_at,status) values(r.id,p_actor,event_side,act,event_note,start_at,start_at+make_interval(mins=>duration),r.status);
 result:=jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'workId',r.work_id);
 insert into pro_appointment_actions(actor_id,action_id,request_id,input,result) values(p_actor,aid,r.id,p_input,result);
 return result;
end $$;

-- Only linked NEW requests are governed. All legacy jobs retain their old behavior.
create or replace function public.pro_appointment_sync_work() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;new_status text;event_action text;
begin
 if not exists(select 1 from pro_appointment_requests where owner_id=new.user_id and work_id=new.id) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 select * into r from pro_appointment_requests where owner_id=new.user_id and work_id=new.id for update;
 if r.origin='project_invite' then
  if new."clientId" is distinct from old."clientId" and r.status in('confirmed','completed') then raise exception 'Unlink the customer account first' using errcode='23514',hint='pro_invite_client_change';end if;
  return new;
 end if;
 if current_setting('contratacr.appointment_request',true)=r.id::text then return new;end if;
 if new.start is distinct from old.start or new."end" is distinct from old."end" or new.service is distinct from old.service or new."clientId" is distinct from old."clientId" or new."bookingClientId" is distinct from old."bookingClientId" then raise exception 'Use the appointment agreement workflow' using errcode='23514';end if;
 if new.cancelled is not distinct from old.cancelled and new.stage is not distinct from old.stage then return new;end if;
 if r.status in ('cancelled','completed') or (not new.cancelled and new.stage not in ('scheduled','completed')) then raise exception 'Appointment state cannot be reopened' using errcode='23514';end if;
 if new.cancelled and pro_instant(new.start)<=now() then raise exception 'Appointment already started' using errcode='23514';end if;
 new_status:=case when new.cancelled then 'cancelled' when new.stage='completed' then 'completed' else 'confirmed' end;event_action:=case when new.cancelled then 'cancel' when new.stage='completed' then 'complete' else 'agenda_updated' end;
 update pro_appointment_requests set status=new_status,revision=revision+1,updated_at=now() where id=r.id;
 insert into pro_appointment_events(request_id,actor_id,side,action,start_at,end_at,status) values(r.id,r.owner_id,'provider',event_action,pro_instant(new.start),pro_instant(new."end"),new_status);
 return new;
end $$;
revoke all on function public.pro_appointment_sync_work() from public,anon,authenticated;
drop trigger if exists pro_appointment_sync_work on public.pro_work;
create trigger pro_appointment_sync_work before update on public.pro_work for each row execute function public.pro_appointment_sync_work();

alter table public.pro_appointment_requests enable row level security;
alter table public.pro_appointment_events enable row level security;
alter table public.pro_appointment_actions enable row level security;
revoke all on public.pro_appointment_requests,public.pro_appointment_events,public.pro_appointment_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_appointment_requests,public.pro_appointment_events,public.pro_appointment_actions to service_role;
grant usage,select on sequence public.pro_appointment_requests_position_seq,public.pro_appointment_events_position_seq to service_role;
revoke all on function public.pro_appointment_time(timestamptz),public.pro_appointment_enabled(uuid),public.pro_appointment_slot_free(uuid,timestamptz,integer),public.pro_appointment_slots(uuid,date,integer),public.pro_appointment_record(uuid,uuid),public.pro_appointment_page(uuid,text,bigint,text),public.pro_appointment_detail(uuid,uuid,bigint),public.pro_appointment_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_appointment_time(timestamptz),public.pro_appointment_enabled(uuid),public.pro_appointment_slot_free(uuid,timestamptz,integer),public.pro_appointment_slots(uuid,date,integer),public.pro_appointment_record(uuid,uuid),public.pro_appointment_page(uuid,text,bigint,text),public.pro_appointment_detail(uuid,uuid,bigint),public.pro_appointment_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
