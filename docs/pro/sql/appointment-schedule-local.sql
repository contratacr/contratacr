-- LOCAL ONLY. Weekly rules do not rewrite or materialize legacy availability/work.
begin;
create table if not exists public.pro_appointment_schedules(
 owner_id uuid primary key references profiles(id) on delete cascade,
 revision integer not null check(revision>0),duration_minutes integer not null check(duration_minutes between 15 and 480 and duration_minutes%15=0),
 weekly jsonb not null,closed_dates jsonb not null
);
create table if not exists public.pro_appointment_schedule_actions(
 owner_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,primary key(owner_id,action_id)
);
create or replace function public.pro_appointment_schedule_record(p_actor uuid,p_input jsonb default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s pro_appointment_schedules;prior pro_appointment_schedule_actions;result jsonb;b jsonb;d jsonb;aid uuid;
begin
 if not pro_appointment_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));select * into s from pro_appointment_schedules where owner_id=p_actor;
 if p_input is not null then
  if jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& array['revision','actionId','durationMinutes','weekly','closedDates']) or (select count(*) from jsonb_object_keys(p_input))<>5 or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]+$' or jsonb_typeof(p_input->'durationMinutes') is distinct from 'number' or (p_input->>'durationMinutes')!~'^[0-9]+$' or (p_input->>'durationMinutes')::integer not between 15 and 480 or (p_input->>'durationMinutes')::integer%15<>0 or jsonb_typeof(p_input->'weekly') is distinct from 'array' or jsonb_typeof(p_input->'closedDates') is distinct from 'array' then raise exception 'Invalid schedule' using errcode='22023';end if;
  aid:=(p_input->>'actionId')::uuid;select * into prior from pro_appointment_schedule_actions where owner_id=p_actor and action_id=aid;
  if found then if prior.input is distinct from p_input then raise exception 'Changed retry' using errcode='22023';end if;return prior.result;end if;
  if (p_input->>'revision')::integer<>coalesce(s.revision,0) then raise exception 'Schedule changed' using errcode='40001';end if;
  if jsonb_array_length(p_input->'weekly')>28 or jsonb_array_length(p_input->'closedDates')>90 then raise exception 'Too many rules' using errcode='22023';end if;
  for b in select value from jsonb_array_elements(p_input->'weekly') loop
   if jsonb_typeof(b) is distinct from 'object' or not(b ?& array['weekday','start','end']) or (select count(*) from jsonb_object_keys(b))<>3 or jsonb_typeof(b->'weekday') is distinct from 'number' or (b->>'weekday')!~'^[1-7]$' or jsonb_typeof(b->'start') is distinct from 'string' or jsonb_typeof(b->'end') is distinct from 'string' or (b->>'start')!~'^([01][0-9]|2[0-3]):(00|15|30|45)$' or (b->>'end')!~'^([01][0-9]|2[0-3]):(00|15|30|45)$' or (b->>'end')<=(b->>'start') then raise exception 'Invalid weekly block' using errcode='22023';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_input->'weekly') with ordinality a(v,n),jsonb_array_elements(p_input->'weekly') with ordinality b(v,n) where a.n<b.n and a.v->>'weekday'=b.v->>'weekday' and a.v->>'start'<b.v->>'end' and b.v->>'start'<a.v->>'end') then raise exception 'Overlapping hours' using errcode='22023';end if;
  for d in select value from jsonb_array_elements(p_input->'closedDates') loop
   if jsonb_typeof(d) is distinct from 'string' or (d#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((d#>>'{}')::date,'YYYY-MM-DD')<>(d#>>'{}') then raise exception 'Invalid closed day' using errcode='22023';end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(p_input->'closedDates'))<>jsonb_array_length(p_input->'closedDates') then raise exception 'Duplicate closed day' using errcode='22023';end if;
  insert into pro_appointment_schedules values(p_actor,coalesce(s.revision,0)+1,(p_input->>'durationMinutes')::integer,p_input->'weekly',p_input->'closedDates') on conflict(owner_id) do update set revision=excluded.revision,duration_minutes=excluded.duration_minutes,weekly=excluded.weekly,closed_dates=excluded.closed_dates returning * into s;
 end if;
 result:=jsonb_build_object('revision',coalesce(s.revision,0),'durationMinutes',coalesce(s.duration_minutes,60),'weekly',coalesce(s.weekly,'[]'),'closedDates',coalesce(s.closed_dates,'[]'));
 if p_input is not null then insert into pro_appointment_schedule_actions values(p_actor,aid,p_input,result);end if;return result;
end $$;
create or replace function public.pro_appointment_schedule_covers(p_owner uuid,p_start timestamptz,p_duration integer) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select not coalesce(s.closed_dates ? to_char(p_start at time zone 'America/Costa_Rica','YYYY-MM-DD'),false) and (
 exists(select 1 from pro_availability a where a.user_id=p_owner and pro_instant(a.start)<=p_start and pro_instant(a."end")>=p_start+make_interval(mins=>p_duration))
 or exists(select 1 from jsonb_array_elements(coalesce(s.weekly,'[]')) b where (b->>'weekday')::integer=extract(isodow from p_start at time zone 'America/Costa_Rica') and (p_start at time zone 'America/Costa_Rica')::time>=(b->>'start')::time and ((p_start+make_interval(mins=>p_duration)) at time zone 'America/Costa_Rica')::date=(p_start at time zone 'America/Costa_Rica')::date and ((p_start+make_interval(mins=>p_duration)) at time zone 'America/Costa_Rica')::time<=(b->>'end')::time))
 from (select 1) anchor left join pro_appointment_schedules s on s.owner_id=p_owner;
$$;
-- Public starts follow the owner's appointment length. Agreed rescheduling retains its flexibility.
create or replace function public.pro_appointment_schedule_start(p_owner uuid,p_start timestamptz) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select s.owner_id is null or exists(select 1 from pro_availability a where a.user_id=p_owner and pro_instant(a.start)<=p_start and pro_instant(a."end")>p_start and mod(extract(epoch from(p_start-pro_instant(a.start)))/60,s.duration_minutes)=0)
 or exists(select 1 from jsonb_array_elements(coalesce(s.weekly,'[]')) b where (b->>'weekday')::integer=extract(isodow from p_start at time zone 'America/Costa_Rica') and (p_start at time zone 'America/Costa_Rica')::time>=(b->>'start')::time and (p_start at time zone 'America/Costa_Rica')::time<(b->>'end')::time and mod(extract(epoch from((p_start at time zone 'America/Costa_Rica')::time-(b->>'start')::time))/60,s.duration_minutes)=0)
 from (select 1) anchor left join pro_appointment_schedules s on s.owner_id=p_owner;
$$;
revoke all on function pro_appointment_schedule_start(uuid,timestamptz) from public,anon,authenticated;
grant execute on function pro_appointment_schedule_start(uuid,timestamptz) to service_role;
do $$
declare definition text;anchor text:='where pro_appointment_slot_free(p_owner,t,p_duration)';
begin
 definition:=pg_get_functiondef('public.pro_appointment_slots(uuid,date,integer)'::regprocedure);
 if position('pro_appointment_schedule_start' in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Public slot grid changed';end if;
  execute replace(definition,anchor,anchor||' and pro_appointment_schedule_start(p_owner,t)');
 end if;
end $$;
-- Retain notice, buffer and conflict checks from the installed slot predicate.
do $$
declare definition text;signature text;anchor text:='exists(select 1 from pro_availability a where a.user_id=p_owner and pro_instant(a.start)<=p_start and pro_instant(a."end")>=p_start+make_interval(mins=>p_duration))';
begin
 foreach signature in array array['public.pro_appointment_slot_free(uuid,timestamptz,integer)','public.pro_appointment_reschedule_slot_free(uuid,text,timestamptz,integer)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('pro_appointment_schedule_covers' in definition)=0 then
   if position(anchor in definition)=0 then raise exception 'Slot predicate changed';end if;
   execute replace(definition,anchor,'pro_appointment_schedule_covers(p_owner,p_start,p_duration)');
  end if;
 end loop;
end $$;
-- Configuring a weekly schedule explicitly adopts direct reservations. Old requests stay unchanged.
-- Copy the established atomic work/contact creation block, without impersonating the owner.
do $$
declare definition text;anchor text:='event_side:=''client'';event_note:=r.note;';material text;
begin
 definition:=pg_get_functiondef('public.pro_appointment_mutate(uuid,jsonb)'::regprocedure);
 if position('-- weekly-direct-booking' in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Create insertion point changed';end if;
  material:=substring(definition from position('if (select count(*) from pro_work where user_id=owner)>=10000' in definition) for position('elsif act=''decline''' in definition)-position('if (select count(*) from pro_work where user_id=owner)>=10000' in definition));
  if material is null or position('r.work_id:=r.id::text;r.status:=''confirmed'';' in material)=0 then raise exception 'Work creation block changed';end if;
  execute replace(definition,anchor,anchor||'
  -- weekly-direct-booking
  if start_at is not null and exists(select 1 from pro_appointment_schedules where owner_id=owner) then
   if duration<>(select duration_minutes from pro_appointment_schedules where owner_id=owner) then raise exception ''Duration changed'' using errcode=''40001'';end if;
   if not exists(select 1 from pro_visit_preparation p cross join lateral jsonb_array_elements(p.questions) q where p.request_id=r.id and coalesce((q->>''required'')::boolean,false)) then
    '||material||'
    update pro_appointment_requests set work_id=r.work_id,status=r.status,updated_at=now() where id=r.id returning * into r;
   end if;
  end if;');
 end if;
end $$;
do $$
declare definition text;anchor text:='if duration<>(select duration_minutes from pro_appointment_schedules where owner_id=owner) then';
begin
 definition:=pg_get_functiondef('public.pro_appointment_mutate(uuid,jsonb)'::regprocedure);
 if position('pro_appointment_schedule_start(owner,start_at)' in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Direct duration guard changed';end if;
  execute replace(definition,anchor,'if duration<>(select duration_minutes from pro_appointment_schedules where owner_id=owner) or not pro_appointment_schedule_start(owner,start_at) then');
 end if;
end $$;
-- Retired direct endpoint cannot bypass weekly closures or the new request history.
do $$
declare definition text;anchor text:='select revision into v from pro_workspace_core where user_id=p_user for update;';
begin
 definition:=pg_get_functiondef('public.pro_reserve_core(uuid,jsonb,jsonb,integer)'::regprocedure);
 if position('Use the appointment calendar' in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'Legacy booking guard changed';end if;
  execute replace(definition,anchor,'if exists(select 1 from pro_appointment_schedules where owner_id=p_user) then raise exception ''Use the appointment calendar'' using errcode=''40001'';end if; '||anchor);
 end if;
end $$;
create or replace function public.pro_appointment_calendar(p_owner uuid,p_month date,p_duration integer) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d date;last_day date;result jsonb:='[]';slots jsonb;
begin
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month<date_trunc('month',now() at time zone 'America/Costa_Rica')::date or p_month>date_trunc('month',(now() at time zone 'America/Costa_Rica')+interval '90 days')::date then raise exception 'Invalid month' using errcode='22023';end if;
 d:=greatest(p_month,(now() at time zone 'America/Costa_Rica')::date);last_day:=least((p_month+interval '1 month'-interval '1 day')::date,(now() at time zone 'America/Costa_Rica')::date+90);
 while d<=last_day loop
  slots:=pro_appointment_slots(p_owner,d,p_duration)->'slots';
  if jsonb_array_length(slots)>0 then result:=result||jsonb_build_array(jsonb_build_object('day',d,'count',jsonb_array_length(slots),'slots',(select jsonb_agg(v) from (select value v from jsonb_array_elements(slots) limit 3) x)));end if;
  d:=d+1;
 end loop;return result;
end $$;
revoke all on function pro_appointment_calendar(uuid,date,integer) from public,anon,authenticated;
grant execute on function pro_appointment_calendar(uuid,date,integer) to service_role;
alter table pro_appointment_schedules enable row level security;
alter table pro_appointment_schedule_actions enable row level security;
revoke all on pro_appointment_schedules,pro_appointment_schedule_actions from public,anon,authenticated;
grant all on pro_appointment_schedules,pro_appointment_schedule_actions to service_role;
revoke all on function pro_appointment_schedule_record(uuid,jsonb),pro_appointment_schedule_covers(uuid,timestamptz,integer) from public,anon,authenticated;
grant execute on function pro_appointment_schedule_record(uuid,jsonb),pro_appointment_schedule_covers(uuid,timestamptz,integer) to service_role;
notify pgrst,'reload schema';
commit;
