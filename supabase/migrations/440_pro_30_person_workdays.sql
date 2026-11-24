-- ContrataCR Pro row 13 (2026-11-23): working days PER PERSON. A person (team member or subcontractor contributor) may
-- have their own working weekdays (part time, split shifts). The company calendar keeps the holidays and extra working
-- days for everyone; only the weekday rule is replaced for people with a saved row. The two controlled operations of
-- migration 400 (shift with the work calendar, adjust to the work calendar) now use the working days of the person
-- assigned to each moved task (company calendar when nobody is assigned or the person has no row). Preview and apply
-- share the same compute functions, so they stay consistent. Nothing is sent and no date moves by itself.
begin;

create table if not exists public.pro_person_workdays(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 person_id uuid not null references public.profiles(id) on delete cascade,
 work_days smallint[] not null check(cardinality(work_days) between 1 and 7),
 revision integer not null check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id));

create or replace function public.pro_cal_assignee(p_owner uuid,p_task uuid) returns uuid
language sql stable security invoker set search_path=public,pg_temp as $$
 select g.member_user_id from public.pro_team_task_assignments a
  join public.pro_team_grants g on g.id=a.grant_id and g.owner_id=a.owner_id and g.active
  where a.owner_id=p_owner and a.task_id=p_task limit 1
$$;

create or replace function public.pro_cal_is_workday_for(p_owner uuid,p_person uuid,p_day date) returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pw smallint[];k text;
begin
 if p_person is null then return public.pro_cal_is_workday(p_owner,p_day);end if;
 select w.work_days into pw from public.pro_person_workdays w where w.owner_id=p_owner and w.person_id=p_person;
 if pw is null then return public.pro_cal_is_workday(p_owner,p_day);end if;
 select x->>'kind' into k from public.pro_work_calendars c,jsonb_array_elements(c.exceptions) x where c.owner_id=p_owner and x->>'day'=to_char(p_day,'YYYY-MM-DD') limit 1;
 if k is not null then return k='workday';end if;
 return extract(dow from p_day)::smallint=any(pw);
end $$;

create or replace function public.pro_cal_next_workday_for(p_owner uuid,p_person uuid,p_day date) returns date
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i integer;d date;
begin
 for i in 0..400 loop d:=p_day+i;if public.pro_cal_is_workday_for(p_owner,p_person,d) then return d;end if;end loop;
 return p_day;
end $$;

create or replace function public.pro_cal_workdays_for(p_owner uuid,p_person uuid,p_start date,p_end date) returns integer
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i integer;n integer:=0;
begin
 if p_end<p_start or p_end-p_start>3700 then return 0;end if;
 for i in 0..(p_end-p_start) loop if public.pro_cal_is_workday_for(p_owner,p_person,p_start+i) then n:=n+1;end if;end loop;
 return n;
end $$;

create or replace function public.pro_cal_end_for_person(p_owner uuid,p_person uuid,p_start date,p_n integer) returns date
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i integer;c integer:=0;d date;
begin
 if p_n<1 then return p_start;end if;
 for i in 0..3700 loop d:=p_start+i;if public.pro_cal_is_workday_for(p_owner,p_person,d) then c:=c+1;if c>=p_n then return d;end if;end if;end loop;
 return p_start+p_n-1;
end $$;

create or replace function public.pro_schedule_shift_compute_cal(p_owner uuid,p_work text,p_task uuid,p_start date,p_end date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pp uuid;plan jsonb:='{}'::jsonb;orig jsonb;l record;changed boolean:=true;guard integer:=0;need date;s date;e date;ps date;pe date;answer jsonb:='[]'::jsonb;k text;dur integer;ns date;
begin
 if p_start is null or p_end is null or p_end<p_start or p_start<date'1900-01-01' or p_end>date'2100-12-31' then raise exception 'Invalid period' using errcode='22023';end if;
 select coalesce(jsonb_object_agg(p.task_id::text,jsonb_build_object('s',p.planned_start,'e',p.planned_end)),'{}'::jsonb) into plan from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.id=p.task_id and not t.archived
  where p.owner_id=p_owner and p.work_id=p_work and p.planned_start is not null;
 if not plan ? p_task::text then raise exception 'Task has no planned period' using errcode='22023';end if;
 orig:=plan;plan:=jsonb_set(plan,array[p_task::text],jsonb_build_object('s',p_start,'e',p_end));
 while changed loop
  changed:=false;guard:=guard+1;if guard>600 then raise exception 'Schedule rules do not settle' using errcode='22023';end if;
  for l in select * from public.pro_schedule_links_of(p_owner,p_work) loop
   if not(plan ? l.task_id::text and plan ? l.predecessor_id::text) then continue;end if;
   ps:=(plan->l.predecessor_id::text->>'s')::date;pe:=(plan->l.predecessor_id::text->>'e')::date;s:=(plan->l.task_id::text->>'s')::date;e:=(plan->l.task_id::text->>'e')::date;
   need:=case when l.kind='fs' then pe+1+l.lag_days else ps+l.lag_days end;
   if s<need and l.task_id<>p_task then
    pp:=public.pro_cal_assignee(p_owner,l.task_id);
    ns:=public.pro_cal_next_workday_for(p_owner,pp,need);dur:=greatest(1,public.pro_cal_workdays_for(p_owner,pp,(orig->l.task_id::text->>'s')::date,(orig->l.task_id::text->>'e')::date));
    if ns>date'2100-12-31' or public.pro_cal_end_for_person(p_owner,pp,ns,dur)>date'2100-12-31' then raise exception 'Shift beyond supported dates' using errcode='22023';end if;
    plan:=jsonb_set(plan,array[l.task_id::text],jsonb_build_object('s',ns,'e',public.pro_cal_end_for_person(p_owner,pp,ns,dur)));changed:=true;end if;
  end loop;
 end loop;
 for k in select key from jsonb_each(plan) loop
  if plan->k<>orig->k then answer:=answer||jsonb_build_array(jsonb_build_object('taskId',k,'title',(select title from public.pro_work_tasks where owner_id=p_owner and id=k::uuid),
   'fromStart',orig->k->>'s','fromEnd',orig->k->>'e','toStart',plan->k->>'s','toEnd',plan->k->>'e','moved',k=p_task::text));end if;
 end loop;
 return answer;
end $$;

create or replace function public.pro_schedule_calendarize_compute(p_owner uuid,p_work text,p_tasks uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pp uuid;plan jsonb:='{}'::jsonb;orig jsonb;r record;l record;s date;e date;ns date;ne date;dur integer;need date;answer jsonb:='[]'::jsonb;k text;
begin
 select coalesce(jsonb_object_agg(p.task_id::text,jsonb_build_object('s',p.planned_start,'e',p.planned_end)),'{}'::jsonb) into plan from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.id=p.task_id and not t.archived
  where p.owner_id=p_owner and p.work_id=p_work and p.planned_start is not null;
 orig:=plan;
 for r in select p.task_id,p.planned_start,p.planned_end from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.id=p.task_id and not t.archived and t.status='open'
  where p.owner_id=p_owner and p.work_id=p_work and p.planned_start is not null and (p_tasks is null or p.task_id=any(p_tasks)) order by p.planned_start,p.task_id loop
  pp:=public.pro_cal_assignee(p_owner,r.task_id);
  s:=r.planned_start;e:=r.planned_end;dur:=greatest(1,public.pro_cal_workdays_for(p_owner,pp,s,e));ns:=public.pro_cal_next_workday_for(p_owner,pp,s);
  for l in select * from public.pro_schedule_links_of(p_owner,p_work) x where x.task_id=r.task_id loop
   if not plan ? l.predecessor_id::text then continue;end if;
   need:=case when l.kind='fs' then (plan->l.predecessor_id::text->>'e')::date+1+l.lag_days else (plan->l.predecessor_id::text->>'s')::date+l.lag_days end;
   if need>ns then ns:=public.pro_cal_next_workday_for(p_owner,pp,need);end if;
  end loop;
  if ns>s then
   ne:=public.pro_cal_end_for_person(p_owner,pp,ns,dur);
   if ns>date'2100-12-31' or ne>date'2100-12-31' then raise exception 'Shift beyond supported dates' using errcode='22023';end if;
   plan:=jsonb_set(plan,array[r.task_id::text],jsonb_build_object('s',ns,'e',ne));
  end if;
 end loop;
 for k in select key from jsonb_each(plan) loop
  if plan->k<>orig->k then answer:=answer||jsonb_build_array(jsonb_build_object('taskId',k,'title',(select title from public.pro_work_tasks where owner_id=p_owner and id=k::uuid),
   'fromStart',orig->k->>'s','fromEnd',orig->k->>'e','toStart',plan->k->>'s','toEnd',plan->k->>'e','moved',false));end if;
 end loop;
 return answer;
end $$;

-- People that can have their own working days: current company members and active subcontractor contributors.
create or replace function public.pro_person_workdays_read(p_owner uuid,p_person uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_work_timer_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('people',coalesce((
  select jsonb_agg(jsonb_build_object('personId',u.person_id,'name',u.name,'workDays',to_jsonb(w.work_days),'revision',coalesce(w.revision,0)) order by lower(u.name),u.person_id)
  from (select distinct on (p.person_id) p.person_id,p.name from (
    select (x->>'personId')::uuid as person_id,x->>'name' as name from jsonb_array_elements(public.pro_ops_people(p_owner)) x
    union all
    select g.member_user_id as person_id,g.member_name as name from public.pro_team_grants g where g.owner_id=p_owner and g.active) p
   order by p.person_id,p.name) u
  left join public.pro_person_workdays w on w.owner_id=p_owner and w.person_id=u.person_id),'[]'::jsonb));
end $$;

create or replace function public.pro_person_workdays_save(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;pid uuid;rev integer;cur integer;days smallint[];keys text[];
begin
 if p_person is distinct from p_owner or not public.pro_work_timer_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid workdays' using errcode='22023';end if;
 act:=p_input->>'action';keys:=public.pro_ops_keys(p_input);
 if act='set' then
  if keys is distinct from array['action','personId','revision','workDays'] or jsonb_typeof(p_input->'workDays') is distinct from 'array' or jsonb_array_length(p_input->'workDays') not between 1 and 7
   or exists(select 1 from jsonb_array_elements(p_input->'workDays') v where jsonb_typeof(v)<>'number' or (v#>>'{}')!~'^[0-6]$') then raise exception 'Invalid workdays' using errcode='22023';end if;
  select array_agg(distinct (v#>>'{}')::smallint order by (v#>>'{}')::smallint) into days from jsonb_array_elements(p_input->'workDays') v;
  if cardinality(days)<>jsonb_array_length(p_input->'workDays') then raise exception 'Invalid workdays' using errcode='22023';end if;
 elsif act='clear' then
  if keys is distinct from array['action','personId','revision'] then raise exception 'Invalid workdays' using errcode='22023';end if;
 else raise exception 'Invalid workdays' using errcode='22023';end if;
 if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) or jsonb_typeof(p_input->'personId') is distinct from 'string' then raise exception 'Invalid workdays' using errcode='22023';end if;
 begin pid:=(p_input->>'personId')::uuid;exception when others then raise exception 'Invalid workdays' using errcode='22023';end;
 rev:=(p_input->>'revision')::integer;
 if not exists(select 1 from jsonb_array_elements(public.pro_person_workdays_read(p_owner,p_person)->'people') x where x->>'personId'=pid::text) then raise exception 'Person unavailable' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-person-workdays:'||p_owner::text||':'||pid::text,0));
 select revision into cur from public.pro_person_workdays where owner_id=p_owner and person_id=pid for update;cur:=coalesce(cur,0);
 if cur<>rev then raise exception 'Workdays changed' using errcode='40001';end if;
 if act='clear' then
  if cur=0 then raise exception 'Nothing to clear' using errcode='22023';end if;
  delete from public.pro_person_workdays where owner_id=p_owner and person_id=pid;
  return jsonb_build_object('personId',pid,'revision',0);
 end if;
 insert into public.pro_person_workdays(owner_id,person_id,work_days,revision) values(p_owner,pid,days,cur+1)
  on conflict(owner_id,person_id) do update set work_days=excluded.work_days,revision=excluded.revision,updated_at=clock_timestamp();
 return jsonb_build_object('personId',pid,'revision',cur+1);
end $$;

alter table public.pro_person_workdays enable row level security;
revoke all on public.pro_person_workdays from public,anon,authenticated;
grant all on public.pro_person_workdays to service_role;
do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_cal_assignee','pro_cal_is_workday_for','pro_cal_next_workday_for','pro_cal_workdays_for','pro_cal_end_for_person','pro_schedule_shift_compute_cal','pro_schedule_calendarize_compute','pro_person_workdays_read','pro_person_workdays_save') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
