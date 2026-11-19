-- LOCAL PRO ONLY. Round 8 (2026-11-15): person timer (clock-in) per job and activity.
-- One open timer per PERSON (the owner, or each company member working in the owner's company through
-- the role gate), across jobs and tabs: start → stop → review (minutes, date, activity, billable,
-- note can be edited) → save. Saving writes the time entry ONLY through the existing single time
-- writer (pro_time_mutate 'manual', which creates exactly one job-cost time line) and records who
-- worked in pro_time_entry_people. Discard keeps the row (status 'discarded'); nothing is deleted.
-- Not payroll; nothing is sent. Patterns: RLS on, service_role-only, CAS 40001, idempotent actionId,
-- immutable action receipts and history, America/Costa_Rica dates.
begin;
create table if not exists public.pro_work_timers(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 person_id uuid not null,person_name text not null default '' check(length(person_name)<=160),
 work_id text not null,activity_id uuid,billable boolean not null default true,note text not null default '' check(length(note)<=300),
 status text not null check(status in('running','stopped','saved','discarded')),
 started_at timestamptz not null,stopped_at timestamptz,time_entry_id uuid,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,activity_id) references public.pro_time_activities(owner_id,id),
 check(status='running' and stopped_at is null and time_entry_id is null or status in('stopped','discarded') and stopped_at is not null and time_entry_id is null or status='saved' and stopped_at is not null and time_entry_id is not null));
-- One open (running or awaiting review) timer per person.
create unique index if not exists pro_work_timers_one_open on public.pro_work_timers(owner_id,person_id) where status in('running','stopped');
create table if not exists public.pro_work_timer_history(
 owner_id uuid not null,timer_id uuid not null,action_id uuid not null,action text not null check(action in('start','stop','discard','save')),
 actor_id uuid not null,before_row jsonb,after_row jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_work_timer_actions(
 owner_id uuid not null,person_id uuid not null,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id,action_id));

create or replace function public.pro_work_timer_json(t public.pro_work_timers) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',t.id,'workId',t.work_id,'service',(select w.service from public.pro_work w where w.user_id=t.owner_id and w.id=t.work_id),
  'activityId',t.activity_id,'activityName',(select a.name from public.pro_time_activities a where a.owner_id=t.owner_id and a.id=t.activity_id),
  'billable',t.billable,'note',t.note,'status',t.status,'startedAt',t.started_at,'stoppedAt',t.stopped_at,
  'minutes',greatest(1,least(1440,ceil(extract(epoch from (coalesce(t.stopped_at,clock_timestamp())-t.started_at))/60)::integer)),
  'personName',t.person_name,'revision',t.revision,'timeEntryId',t.time_entry_id)
$$;
create or replace function public.pro_work_timer_person_ok(p_owner uuid,p_person uuid) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(public.pro_private_work_tools_enabled(p_owner),false) and p_person is not null and public.pro_role_of(p_person,p_owner) is not null
$$;
create or replace function public.pro_work_timer_read(p_actor uuid,p_person uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare t public.pro_work_timers;
begin
 if not public.pro_work_timer_person_ok(p_actor,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into t from public.pro_work_timers where owner_id=p_actor and person_id=p_person and status in('running','stopped');
 return jsonb_build_object('timer',case when found then public.pro_work_timer_json(t) end,'serverNow',clock_timestamp(),
  'activities',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'billable',a.billable) order by a.name,a.id) from public.pro_time_activities a where a.owner_id=p_actor and not a.archived),'[]'::jsonb));
end $$;

create or replace function public.pro_work_timer_mutate(p_actor uuid,p_person uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;tid uuid;keys text[];hash text:=md5(p_input::text);prior public.pro_work_timer_actions;
 t public.pro_work_timers;before_json jsonb;answer jsonb;rev integer;v_minutes integer;v_day date;today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;
 v_activity uuid;v_note text;entry uuid;written jsonb;who text;
begin
 if not public.pro_work_timer_person_ok(p_actor,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid timer' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act is null or not(
   act='start' and keys=array['action','actionId','activityId','billable','note','workId']
   or act in('stop','discard') and keys=array['action','actionId','revision','timerId']
   or act='save' and keys=array['action','actionId','activityId','billable','date','minutes','note','revision','timerId']) then raise exception 'Invalid timer' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;tid:=nullif(p_input->>'timerId','')::uuid;v_activity:=nullif(p_input->>'activityId','')::uuid;
  exception when others then raise exception 'Invalid timer' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-timer:'||p_actor::text||':'||p_person::text,0));
 select * into prior from public.pro_work_timer_actions where owner_id=p_actor and person_id=p_person and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if act in('start','save') then
  if jsonb_typeof(p_input->'billable') is distinct from 'boolean' or jsonb_typeof(p_input->'note') is distinct from 'string' or length(btrim(p_input->>'note'))>300
   or jsonb_typeof(p_input->'activityId') not in('string','null') then raise exception 'Invalid timer' using errcode='22023';end if;
  v_note:=btrim(p_input->>'note');
  if v_activity is not null and not exists(select 1 from public.pro_time_activities where owner_id=p_actor and id=v_activity and not archived) then raise exception 'Activity unavailable' using errcode='40001';end if;
 end if;
 if act='start' then
  if jsonb_typeof(p_input->'workId') is distinct from 'string' or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_input->>'workId' and not coalesce(cancelled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(select 1 from public.pro_work_timers where owner_id=p_actor and person_id=p_person and status in('running','stopped')) then raise exception 'A timer is already open' using errcode='40001';end if;
  who:=left(coalesce(nullif(btrim((select member_name from public.pro_company_members where owner_id=p_actor and member_user_id=p_person and active)),''),nullif(public.pro_team_name(p_person),''),'Propietario'),160);
  insert into public.pro_work_timers(owner_id,id,person_id,person_name,work_id,activity_id,billable,note,status,started_at)
   values(p_actor,aid,p_person,who,p_input->>'workId',v_activity,(p_input->>'billable')::boolean,v_note,'running',clock_timestamp()) returning * into t;
 else
  begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid timer' using errcode='22023';end;
  select * into t from public.pro_work_timers where owner_id=p_actor and id=tid and person_id=p_person for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if t.revision<>rev then raise exception 'Timer changed' using errcode='40001';end if;
  before_json:=public.pro_work_timer_json(t);
  if act='stop' then
   if t.status<>'running' then raise exception 'Timer not running' using errcode='40001';end if;
   update public.pro_work_timers set status='stopped',stopped_at=clock_timestamp(),revision=revision+1 where owner_id=p_actor and id=tid returning * into t;
  elsif act='discard' then
   if t.status not in('running','stopped') then raise exception 'Timer closed' using errcode='40001';end if;
   update public.pro_work_timers set status='discarded',stopped_at=coalesce(stopped_at,clock_timestamp()),revision=revision+1 where owner_id=p_actor and id=tid returning * into t;
  else
   if t.status<>'stopped' then raise exception 'Stop the timer before saving' using errcode='40001';end if;
   if jsonb_typeof(p_input->'minutes') is distinct from 'number' or not coalesce((p_input->>'minutes')~'^[0-9]{1,4}$',false) then raise exception 'Invalid minutes' using errcode='22023';end if;
   v_minutes:=(p_input->>'minutes')::integer;
   begin v_day:=(p_input->>'date')::date;exception when others then raise exception 'Invalid date' using errcode='22023';end;
   if v_minutes not between 1 and 1440 or v_day is null or v_day>today or v_day<today-366 then raise exception 'Invalid time values' using errcode='22023';end if;
   entry:=gen_random_uuid();
   -- The single time writer: one time entry and its one job-cost line.
   written:=public.pro_time_mutate(p_actor,jsonb_build_object('action','manual','actionId',gen_random_uuid(),'entryId',entry,'workId',t.work_id,
     'activityId',v_activity,'billable',(p_input->>'billable')::boolean,'date',v_day::text,'minutes',v_minutes,'note',v_note));
   insert into public.pro_time_entry_people(owner_id,entry_id,grant_id,name) values(p_actor,entry,null,coalesce(nullif(t.person_name,''),'Propietario')) on conflict(owner_id,entry_id) do nothing;
   update public.pro_work_timers set status='saved',time_entry_id=entry,activity_id=v_activity,billable=(p_input->>'billable')::boolean,note=v_note,revision=revision+1 where owner_id=p_actor and id=tid returning * into t;
  end if;
 end if;
 insert into public.pro_work_timer_history(owner_id,timer_id,action_id,action,actor_id,before_row,after_row) values(p_actor,t.id,aid,act,p_person,before_json,public.pro_work_timer_json(t));
 answer:=jsonb_build_object('action',act,'timer',public.pro_work_timer_json(t),'entryId',t.time_entry_id);
 insert into public.pro_work_timer_actions(owner_id,person_id,action_id,input_hash,result) values(p_actor,p_person,aid,hash,answer);
 return answer;
end $$;

create or replace function public.pro_work_timer_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Timer history is immutable' using errcode='23514';end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_work_timers','pro_work_timer_history','pro_work_timer_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_work_timer_history','pro_work_timer_actions'] loop
  execute format('drop trigger if exists pro_work_timer_immutable on public.%I',t);execute format('create trigger pro_work_timer_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_work_timer_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_work_timer_json','pro_work_timer_person_ok','pro_work_timer_read','pro_work_timer_mutate','pro_work_timer_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
