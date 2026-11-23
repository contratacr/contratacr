-- ContrataCR Pro, row 13 (work calendar). PRO_ENABLED stays false: nothing here turns Pro on.
-- One calendar per company (owner): working weekdays (0 = Sunday ... 6 = Saturday) plus holiday / extra-workday
-- exceptions. Read by the owner and the current team (Gantt shading, working-day counts); written only by the owner
-- with an optimistic revision (a second tab gets 40001). It never moves a task: it only informs the schedule.
begin;

create table if not exists public.pro_work_calendars(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 revision integer not null check(revision>0),
 work_days smallint[] not null check(cardinality(work_days) between 1 and 7),
 exceptions jsonb not null default '[]'::jsonb check(jsonb_typeof(exceptions)='array' and jsonb_array_length(exceptions)<=200),
 updated_at timestamptz not null default clock_timestamp());

create or replace function public.pro_work_calendar_read(p_owner uuid,p_person uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_work_timer_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_build_object('revision',c.revision,'workDays',to_jsonb(c.work_days),'exceptions',c.exceptions) from public.pro_work_calendars c where c.owner_id=p_owner),
  jsonb_build_object('revision',0,'workDays',jsonb_build_array(1,2,3,4,5),'exceptions','[]'::jsonb));
end $$;

create or replace function public.pro_work_calendar_save(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rev integer;cur integer;days smallint[];e jsonb;seen text[]:=array[]::text[];d date;
begin
 if p_person is distinct from p_owner or not public.pro_work_timer_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if public.pro_ops_keys(p_input)<>array['exceptions','revision','workDays']
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false)
  or jsonb_typeof(p_input->'workDays') is distinct from 'array' or jsonb_typeof(p_input->'exceptions') is distinct from 'array'
  or jsonb_array_length(p_input->'workDays') not between 1 and 7 or jsonb_array_length(p_input->'exceptions')>200 then
  raise exception 'Invalid calendar' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_input->'workDays') v where jsonb_typeof(v)<>'number' or (v#>>'{}')!~'^[0-6]$') then raise exception 'Invalid calendar' using errcode='22023';end if;
 select array_agg(distinct (v#>>'{}')::smallint order by (v#>>'{}')::smallint) into days from jsonb_array_elements(p_input->'workDays') v;
 if cardinality(days)<>jsonb_array_length(p_input->'workDays') then raise exception 'Invalid calendar' using errcode='22023';end if;
 for e in select * from jsonb_array_elements(p_input->'exceptions') loop
  if public.pro_ops_keys(e)<>array['day','kind','label'] or jsonb_typeof(e->'day') is distinct from 'string' or jsonb_typeof(e->'label') is distinct from 'string'
   or e->>'kind' not in('holiday','workday') or not public.pro_ops_text_ok(e->>'label',1,80) or (e->>'day')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid calendar' using errcode='22023';end if;
  begin d:=(e->>'day')::date;exception when others then raise exception 'Invalid calendar' using errcode='22023';end;
  if d<date'1900-01-01' or d>date'2100-12-31' or (e->>'day')=any(seen) then raise exception 'Invalid calendar' using errcode='22023';end if;
  seen:=seen||(e->>'day');
 end loop;
 rev:=(p_input->>'revision')::integer;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-calendar:'||p_owner::text,0));
 select revision into cur from public.pro_work_calendars where owner_id=p_owner for update;cur:=coalesce(cur,0);
 if cur<>rev then raise exception 'Calendar changed' using errcode='40001';end if;
 insert into public.pro_work_calendars(owner_id,revision,work_days,exceptions) values(p_owner,cur+1,days,p_input->'exceptions')
  on conflict(owner_id) do update set revision=excluded.revision,work_days=excluded.work_days,exceptions=excluded.exceptions,updated_at=clock_timestamp();
 return jsonb_build_object('revision',cur+1);
end $$;

alter table public.pro_work_calendars enable row level security;
revoke all on public.pro_work_calendars from public,anon,authenticated;
grant all on public.pro_work_calendars to service_role;
revoke all on function public.pro_work_calendar_read(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pro_work_calendar_save(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_work_calendar_read(uuid,uuid) to service_role;
grant execute on function public.pro_work_calendar_save(uuid,uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
