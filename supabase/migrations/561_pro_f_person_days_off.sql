-- Pro row 13 (batch F): days off PER PERSON (vacation, leave, a personal day) on top of the per-person working weekdays
-- of migration 440. A day off of the person assigned to a task is never a working day for that task, even when the
-- company calendar marks it as an extra working day. The two controlled operations of migration 400/440 (shift with the
-- work calendar, adjust to the work calendar) read it through pro_cal_is_workday_for, so preview and apply stay consistent.
-- Whole list per person (up to 60 civil dates) with its own revision (409 on a stale tab). Only the owner writes.
-- Nothing is sent and no date moves by itself.
begin;
create table if not exists public.pro_person_days_off(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 person_id uuid not null references public.profiles(id) on delete cascade,
 days date[] not null check(cardinality(days) between 1 and 60),
 revision integer not null check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id));
alter table public.pro_person_days_off enable row level security;
revoke all on public.pro_person_days_off from public,anon,authenticated;
grant all on public.pro_person_days_off to service_role;

create or replace function public.pro_cal_is_workday_for(p_owner uuid,p_person uuid,p_day date) returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pw smallint[];k text;
begin
 if p_person is null then return public.pro_cal_is_workday(p_owner,p_day);end if;
 if exists(select 1 from public.pro_person_days_off o where o.owner_id=p_owner and o.person_id=p_person and p_day=any(o.days)) then return false;end if;
 select w.work_days into pw from public.pro_person_workdays w where w.owner_id=p_owner and w.person_id=p_person;
 if pw is null then return public.pro_cal_is_workday(p_owner,p_day);end if;
 select x->>'kind' into k from public.pro_work_calendars c,jsonb_array_elements(c.exceptions) x where c.owner_id=p_owner and x->>'day'=to_char(p_day,'YYYY-MM-DD') limit 1;
 if k is not null then return k='workday';end if;
 return extract(dow from p_day)::smallint=any(pw);
end $$;

create or replace function public.pro_person_workdays_read(p_owner uuid,p_person uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_work_timer_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('people',coalesce((
  select jsonb_agg(jsonb_build_object('personId',u.person_id,'name',u.name,'workDays',to_jsonb(w.work_days),'revision',coalesce(w.revision,0),
   'daysOff',coalesce((select jsonb_agg(to_char(d,'YYYY-MM-DD') order by d) from unnest(o.days) d),'[]'::jsonb),'daysOffRevision',coalesce(o.revision,0)) order by lower(u.name),u.person_id)
  from (select distinct on (p.person_id) p.person_id,p.name from (
    select (x->>'personId')::uuid as person_id,x->>'name' as name from jsonb_array_elements(public.pro_ops_people(p_owner)) x
    union all
    select g.member_user_id as person_id,g.member_name as name from public.pro_team_grants g where g.owner_id=p_owner and g.active) p
   order by p.person_id,p.name) u
  left join public.pro_person_workdays w on w.owner_id=p_owner and w.person_id=u.person_id
  left join public.pro_person_days_off o on o.owner_id=p_owner and o.person_id=u.person_id),'[]'::jsonb));
end $$;

create or replace function public.pro_person_days_off_save(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare pid uuid;rev integer;cur integer;days date[];n integer;
begin
 if p_person is distinct from p_owner or not public.pro_work_timer_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is distinct from 'days_off'
  or public.pro_ops_keys(p_input) is distinct from array['action','daysOff','personId','revision']
  or jsonb_typeof(p_input->'daysOff') is distinct from 'array' or jsonb_array_length(p_input->'daysOff')>60
  or exists(select 1 from jsonb_array_elements(p_input->'daysOff') v where jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^\d{4}-\d{2}-\d{2}$')
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false)
  or jsonb_typeof(p_input->'personId') is distinct from 'string' then raise exception 'Invalid days off' using errcode='22023';end if;
 begin
  pid:=(p_input->>'personId')::uuid;
  select array_agg(distinct (v#>>'{}')::date order by (v#>>'{}')::date) into days from jsonb_array_elements(p_input->'daysOff') v;
 exception when others then raise exception 'Invalid days off' using errcode='22023';end;
 n:=coalesce(cardinality(days),0);
 if n<>jsonb_array_length(p_input->'daysOff') or exists(select 1 from unnest(days) d where d<date'2000-01-01' or d>date'2100-12-31'
   or to_char(d,'YYYY-MM-DD') not in(select v#>>'{}' from jsonb_array_elements(p_input->'daysOff') v)) then raise exception 'Invalid days off' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;
 if not exists(select 1 from jsonb_array_elements(public.pro_person_workdays_read(p_owner,p_person)->'people') x where x->>'personId'=pid::text) then raise exception 'Person unavailable' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-person-days-off:'||p_owner::text||':'||pid::text,0));
 select revision into cur from public.pro_person_days_off where owner_id=p_owner and person_id=pid for update;cur:=coalesce(cur,0);
 if cur<>rev then raise exception 'Days off changed' using errcode='40001';end if;
 if n=0 then
  if cur=0 then raise exception 'Nothing to clear' using errcode='22023';end if;
  delete from public.pro_person_days_off where owner_id=p_owner and person_id=pid;
  return jsonb_build_object('personId',pid,'revision',0);
 end if;
 insert into public.pro_person_days_off(owner_id,person_id,days,revision) values(p_owner,pid,days,cur+1)
  on conflict(owner_id,person_id) do update set days=excluded.days,revision=excluded.revision,updated_at=clock_timestamp();
 return jsonb_build_object('personId',pid,'revision',cur+1);
end $$;

do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_cal_is_workday_for','pro_person_workdays_read','pro_person_days_off_save') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
