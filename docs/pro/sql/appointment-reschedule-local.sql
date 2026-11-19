-- LOCAL PRO ONLY. Retain the confirmed slot until the customer accepts a new one.
-- No notifications, new work, charges, materials, or invoice rewrites.
begin;
create table if not exists public.pro_appointment_reschedules(
 id uuid primary key,position bigint generated always as identity unique,
 request_id uuid not null references pro_appointment_requests(id) on delete cascade,
 owner_id uuid not null references profiles(id) on delete cascade,
 work_id text not null,client_user_id uuid not null references profiles(id) on delete cascade,
 from_start timestamptz not null,from_end timestamptz not null,
 start_at timestamptz not null,duration_minutes integer not null check(duration_minutes between 15 and 480 and duration_minutes%15=0),
 note text not null default '' check(length(note)<=500),request_revision integer not null check(request_revision>=0),
 status text not null default 'proposed' check(status in('proposed','accepted','declined','withdrawn')),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(owner_id,work_id) references pro_work(user_id,id),check(from_end>from_start)
);
create unique index if not exists pro_appointment_reschedule_pending on pro_appointment_reschedules(request_id) where status='proposed';
create index if not exists pro_appointment_reschedule_page on pro_appointment_reschedules(request_id,position desc);
create table if not exists public.pro_appointment_reschedule_actions(
 actor_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,
 request_id uuid not null references pro_appointment_requests(id) on delete cascade,
 input jsonb not null,result jsonb not null,primary key(actor_id,action_id)
);
create or replace function public.pro_appointment_reschedule_slot_free(p_owner uuid,p_work text,p_start timestamptz,p_duration integer) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(p_start>now()+make_interval(mins=>coalesce(s.notice_minutes,15)) and p_start<now()+interval '90 days'
 and p_duration between 15 and 480 and p_duration%15=0
 and extract(second from p_start)=0 and extract(minute from p_start)::integer%15=0
 and exists(select 1 from pro_availability a where a.user_id=p_owner and pro_instant(a.start)<=p_start and pro_instant(a."end")>=p_start+make_interval(mins=>p_duration))
 and not exists(select 1 from pro_work w where w.user_id=p_owner and w.id<>p_work and not w.cancelled and pro_instant(w.start)<p_start+make_interval(mins=>p_duration+coalesce(s.buffer_minutes,0)) and pro_instant(w."end")>p_start-make_interval(mins=>coalesce(s.buffer_minutes,0))),false)
 from (select 1) anchor left join pro_visit_settings s on s.owner_id=p_owner;
$$;
create or replace function public.pro_appointment_reschedule_page(p_actor uuid,p_request uuid,p_after bigint default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r pro_appointment_requests;w pro_work;result jsonb;side text;active boolean;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_after<1 then raise exception 'Invalid cursor' using errcode='22023';end if;
 select * into r from pro_appointment_requests where id=p_request and p_actor in(owner_id,client_user_id);if not found or r.work_id is null then return null;end if;
 select * into w from pro_work where user_id=r.owner_id and id=r.work_id and "bookingClientId"=r.client_user_id::text;if not found then return null;end if;
 side:=case when p_actor=r.owner_id then 'provider' else 'client' end;
 active:=r.status='confirmed' and not w.cancelled and w.stage='scheduled' and pro_instant(w.start)>now();
 with page as(select * from pro_appointment_reschedules where request_id=p_request and (p_after is null or position<p_after) order by position desc limit 21)
 select jsonb_build_object('requestId',p_request,'side',side,'requestRevision',r.revision,
 'current',jsonb_build_object('start',pro_appointment_time(pro_instant(w.start)),'end',pro_appointment_time(pro_instant(w."end")),'durationMinutes',extract(epoch from(pro_instant(w."end")-pro_instant(w.start)))::integer/60),
 'canPropose',side='provider' and active and pro_appointment_enabled(r.owner_id) and not exists(select 1 from pro_appointment_reschedules where request_id=p_request and status='proposed'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position,'revision',revision,'status',status,
 'stale',case when status='proposed' then not active or not pro_appointment_enabled(r.owner_id) or request_revision<>r.revision or from_start is distinct from pro_instant(w.start) or from_end is distinct from pro_instant(w."end") or not pro_appointment_reschedule_slot_free(r.owner_id,r.work_id,start_at,duration_minutes) else false end,
 'fromStart',pro_appointment_time(from_start),'fromEnd',pro_appointment_time(from_end),'start',pro_appointment_time(start_at),'end',pro_appointment_time(start_at+make_interval(mins=>duration_minutes)),
 'durationMinutes',duration_minutes,'note',note,'requestRevision',request_revision,'createdAt',created_at,'updatedAt',updated_at) order by position desc) from(select * from page order by position desc limit 20)p),'[]'),
 'nextCursor',case when(select count(*) from page)>20 then(select position from page order by position desc offset 19 limit 1) else null end) into result;
 return result;
end $$;
create or replace function public.pro_appointment_reschedule_slots(p_actor uuid,p_request uuid,p_day date,p_duration integer) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r pro_appointment_requests;w pro_work;first_at timestamptz;last_at timestamptz;slots jsonb;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_day is null or p_day<(now() at time zone 'America/Costa_Rica')::date or p_day>(now() at time zone 'America/Costa_Rica')::date+90 or p_duration is null or p_duration<15 or p_duration>480 or p_duration%15<>0 then raise exception 'Invalid day or duration' using errcode='22023';end if;
 select * into r from pro_appointment_requests where id=p_request and p_actor in(owner_id,client_user_id);if not found or r.work_id is null then return null;end if;
 select * into w from pro_work where user_id=r.owner_id and id=r.work_id and "bookingClientId"=r.client_user_id::text;if not found then return null;end if;
 if r.status<>'confirmed' or w.cancelled or w.stage<>'scheduled' or pro_instant(w.start)<=now() or not pro_appointment_enabled(r.owner_id) then return jsonb_build_object('slots','[]'::jsonb,'truncated',false);end if;
 first_at:=p_day::timestamp at time zone 'America/Costa_Rica';last_at:=(p_day+1)::timestamp at time zone 'America/Costa_Rica';
 select coalesce(jsonb_agg(jsonb_build_object('start',pro_appointment_time(t),'end',pro_appointment_time(t+make_interval(mins=>p_duration))) order by t),'[]') into slots
 from generate_series(first_at,last_at-interval '15 minutes',interval '15 minutes') t where pro_appointment_reschedule_slot_free(r.owner_id,r.work_id,t,p_duration);
 return jsonb_build_object('slots',slots,'truncated',false);
end $$;
-- Only a transaction accepting this exact pending proposal can alter its linked time.
-- The original service/client/account linkage protections remain in force.
create or replace function public.pro_appointment_sync_work() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r pro_appointment_requests;new_status text;event_action text;proposal pro_appointment_reschedules;flag text;
begin
 if not exists(select 1 from pro_appointment_requests where owner_id=new.user_id and work_id=new.id) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 select * into r from pro_appointment_requests where owner_id=new.user_id and work_id=new.id for update;
 -- Round 1: a job linked by invitation keeps its own lifecycle (any stage, dates and service);
 -- only the customer of the job cannot change while an account is linked to it.
 if r.origin='project_invite' then
  if new."clientId" is distinct from old."clientId" and r.status in('confirmed','completed') then raise exception 'Unlink the customer account first' using errcode='23514',hint='pro_invite_client_change';end if;
  return new;
 end if;
 if current_setting('contratacr.appointment_request',true)=r.id::text then return new;end if;
 if new.service is distinct from old.service or new."clientId" is distinct from old."clientId" or new."bookingClientId" is distinct from old."bookingClientId" then raise exception 'Use the appointment agreement workflow' using errcode='23514';end if;
 if new.start is distinct from old.start or new."end" is distinct from old."end" then
  flag:=current_setting('contratacr.appointment_reschedule',true);
  select * into proposal from pro_appointment_reschedules where id::text=flag and request_id=r.id and owner_id=new.user_id and work_id=new.id and client_user_id=r.client_user_id and status='proposed';
  if not found or r.status<>'confirmed' or r.revision<>proposal.request_revision or old.cancelled or old.stage<>'scheduled' or new.cancelled is distinct from old.cancelled or new.stage is distinct from old.stage
   or pro_instant(old.start) is distinct from proposal.from_start or pro_instant(old."end") is distinct from proposal.from_end or pro_instant(old.start)<=now()
   or pro_instant(new.start) is distinct from proposal.start_at or pro_instant(new."end") is distinct from proposal.start_at+make_interval(mins=>proposal.duration_minutes) then raise exception 'Use the appointment agreement workflow' using errcode='23514';end if;
  return new;
 end if;
 if new.cancelled is not distinct from old.cancelled and new.stage is not distinct from old.stage then return new;end if;
 if r.status in ('cancelled','completed') or (not new.cancelled and new.stage not in ('scheduled','completed')) then raise exception 'Appointment state cannot be reopened' using errcode='23514';end if;
 if new.cancelled and pro_instant(new.start)<=now() then raise exception 'Appointment already started' using errcode='23514';end if;
 new_status:=case when new.cancelled then 'cancelled' when new.stage='completed' then 'completed' else 'confirmed' end;event_action:=case when new.cancelled then 'cancel' when new.stage='completed' then 'completed' else 'agenda_updated' end;
 update pro_appointment_requests set status=new_status,revision=revision+1,updated_at=now() where id=r.id;
 insert into pro_appointment_events(request_id,actor_id,side,action,start_at,end_at,status) values(r.id,r.owner_id,'provider',event_action,pro_instant(new.start),pro_instant(new."end"),new_status);
 return new;
end $$;
create or replace function public.pro_appointment_reschedule_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;rid uuid;aid uuid;request uuid;owner uuid;r pro_appointment_requests;w pro_work;p pro_appointment_reschedules;prior pro_appointment_reschedule_actions;keys text[];required text[];start_at timestamptz;duration integer;result jsonb;prior_flag text;
begin
 if p_actor is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& array['action','requestId','id','actionId']) or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'requestId') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid operation' using errcode='22023';end if;
 act:=p_input->>'action';rid:=(p_input->>'id')::uuid;aid:=(p_input->>'actionId')::uuid;request:=(p_input->>'requestId')::uuid;
 if act not in('propose','accept','decline','withdraw') then raise exception 'Invalid action' using errcode='22023';end if;
 required:=case when act='propose' then array['action','requestId','id','actionId','requestRevision','start','durationMinutes','note'] else array['action','requestId','id','actionId','revision'] end;keys:=array(select jsonb_object_keys(p_input));
 if not(keys<@required and keys@>required) then raise exception 'Invalid fields' using errcode='22023';end if;
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id into owner from pro_appointment_requests where id=request and p_actor in(owner_id,client_user_id);if not found then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into prior from pro_appointment_reschedule_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.request_id<>request or prior.input is distinct from p_input then raise exception 'Changed retry' using errcode='22023';end if;return prior.result;end if;
 select * into r from pro_appointment_requests where id=request for update;
 select * into w from pro_work where user_id=owner and id=r.work_id and "bookingClientId"=r.client_user_id::text for update;
 if w.id is null then raise exception 'Unavailable appointment' using errcode='42501';end if;
 if act in('propose','accept') and not pro_appointment_enabled(owner) then raise exception 'Provider unavailable' using errcode='42501';end if;
 if act='propose' then
  if p_actor<>owner then raise exception 'Only provider proposes' using errcode='42501';end if;
  if jsonb_typeof(p_input->'requestRevision') is distinct from 'number' or (p_input->>'requestRevision')!~'^[0-9]{1,9}$' or jsonb_typeof(p_input->'start') is distinct from 'string' or jsonb_typeof(p_input->'durationMinutes') is distinct from 'number' or (p_input->>'durationMinutes')!~'^[0-9]{1,3}$' or jsonb_typeof(p_input->'note') is distinct from 'string' or length(p_input->>'note')>500 then raise exception 'Invalid proposal' using errcode='22023';end if;
  if r.revision<>(p_input->>'requestRevision')::integer or r.status<>'confirmed' or w.cancelled or w.stage<>'scheduled' or pro_instant(w.start)<=now() then raise exception 'Appointment changed or started' using errcode='40001';end if;
  start_at:=pro_instant(p_input->>'start');duration:=(p_input->>'durationMinutes')::integer;
  if not pro_appointment_reschedule_slot_free(owner,w.id,start_at,duration) or start_at=pro_instant(w.start) and start_at+make_interval(mins=>duration)=pro_instant(w."end") then raise exception 'Unavailable or unchanged slot' using errcode='40001';end if;
  if (select count(*) from pro_appointment_reschedules where request_id=request)>=100 then raise exception 'History limit' using errcode='54000';end if;
  insert into pro_appointment_reschedules(id,request_id,owner_id,work_id,client_user_id,from_start,from_end,start_at,duration_minutes,note,request_revision) values(rid,request,owner,w.id,r.client_user_id,pro_instant(w.start),pro_instant(w."end"),start_at,duration,btrim(p_input->>'note'),r.revision) returning * into p;
 else
  if jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]{1,9}$' then raise exception 'Invalid revision' using errcode='22023';end if;
  select * into p from pro_appointment_reschedules where id=rid and request_id=request for update;
  if not found then raise exception 'Unavailable proposal' using errcode='42501';end if;
  if p.status<>'proposed' or p.revision<>(p_input->>'revision')::integer then raise exception 'Proposal changed' using errcode='40001';end if;
  if act='withdraw' and p_actor<>owner or act in('accept','decline') and p_actor<>r.client_user_id then raise exception 'Forbidden action' using errcode='42501';end if;
  if act='accept' then
   if r.status<>'confirmed' or r.revision<>p.request_revision or w.cancelled or w.stage<>'scheduled' or pro_instant(w.start)<=now() or pro_instant(w.start) is distinct from p.from_start or pro_instant(w."end") is distinct from p.from_end then raise exception 'Appointment changed or started' using errcode='40001';end if;
   if not pro_appointment_reschedule_slot_free(owner,w.id,p.start_at,p.duration_minutes) then raise exception 'Slot unavailable' using errcode='40001';end if;
   prior_flag:=current_setting('contratacr.appointment_reschedule',true);perform set_config('contratacr.appointment_reschedule',p.id::text,true);
   update pro_work set start=pro_appointment_time(p.start_at),"end"=pro_appointment_time(p.start_at+make_interval(mins=>p.duration_minutes)) where user_id=owner and id=w.id;
   perform set_config('contratacr.appointment_reschedule',coalesce(prior_flag,''),true);
   update pro_appointment_requests set revision=revision+1,updated_at=now() where id=request returning * into r;
   update pro_workspace_core set revision=revision+1,updated_at=now() where user_id=owner;
   insert into pro_appointment_events(request_id,actor_id,side,action,note,start_at,end_at,status) values(request,p_actor,'client','reschedule',p.note,p.start_at,p.start_at+make_interval(mins=>p.duration_minutes),'confirmed');
  end if;
  update pro_appointment_reschedules set status=case when act='accept' then 'accepted' when act='decline' then 'declined' else 'withdrawn' end,revision=revision+1,updated_at=now() where id=p.id returning * into p;
 end if;
 result:=jsonb_build_object('id',p.id,'revision',p.revision,'status',p.status,'requestRevision',r.revision);
 insert into pro_appointment_reschedule_actions values(p_actor,aid,request,p_input,result);
 return result;
end $$;
create or replace function public.pro_appointment_reschedule_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if to_jsonb(new)-array['status','revision','updated_at'] is distinct from to_jsonb(old)-array['status','revision','updated_at'] or old.status<>'proposed' or new.status not in('accepted','declined','withdrawn') or new.revision<>old.revision+1 then raise exception 'Immutable reschedule proposal' using errcode='23514';end if;return new;
end $$;
drop trigger if exists pro_appointment_reschedule_immutable on pro_appointment_reschedules;
create trigger pro_appointment_reschedule_immutable before update on pro_appointment_reschedules for each row execute function pro_appointment_reschedule_immutable();
alter table pro_appointment_reschedules enable row level security;
alter table pro_appointment_reschedule_actions enable row level security;
revoke all on pro_appointment_reschedules,pro_appointment_reschedule_actions from public,anon,authenticated;
grant all on pro_appointment_reschedules,pro_appointment_reschedule_actions to service_role;
grant usage,select on sequence pro_appointment_reschedules_position_seq to service_role;
revoke all on function pro_appointment_reschedule_slot_free(uuid,text,timestamptz,integer),pro_appointment_reschedule_page(uuid,uuid,bigint),pro_appointment_reschedule_slots(uuid,uuid,date,integer),pro_appointment_reschedule_mutate(uuid,jsonb),pro_appointment_reschedule_immutable() from public,anon,authenticated;
grant execute on function pro_appointment_reschedule_slot_free(uuid,text,timestamptz,integer),pro_appointment_reschedule_page(uuid,uuid,bigint),pro_appointment_reschedule_slots(uuid,uuid,date,integer),pro_appointment_reschedule_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
