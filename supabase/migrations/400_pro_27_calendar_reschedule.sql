-- ContrataCR Pro, row 13 (work calendar applied to the schedule) and rows 78/79 (working days when applying plans).
-- PRO_ENABLED stays false: nothing here turns Pro on and nothing is sent.
-- The company calendar (365_pro_work_calendar) used to be informational. This migration lets the owner ASK for the
-- calendar to drive two controlled operations, both previewed first, both recorded in pro_schedule_round10_actions
-- (kind 'shift', so the existing one-step undo works) and both guarded by the job schedule revision (40001 -> 409):
--   * pro_schedule_shift_preview_cal / pro_schedule_shift_cal_apply: the same dependent-pushing shift of Round 10, but a
--     pushed task starts on a working day and keeps its length in WORKING days.
--   * pro_schedule_calendarize_preview / pro_schedule_calendarize_apply: move tasks that start on a holiday/rest day to the
--     next working day (keeping their working-day length, respecting predecessors). Used after applying a task or
--     schedule template, and by the pending plan of an opportunity when it becomes a job (migration 401).
begin;

create or replace function public.pro_cal_is_workday(p_owner uuid,p_day date) returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare c public.pro_work_calendars;k text;
begin
 select * into c from public.pro_work_calendars where owner_id=p_owner;
 if not found then return extract(dow from p_day) between 1 and 5;end if;
 select x->>'kind' into k from jsonb_array_elements(c.exceptions) x where x->>'day'=to_char(p_day,'YYYY-MM-DD') limit 1;
 if k is not null then return k='workday';end if;
 return extract(dow from p_day)::smallint=any(c.work_days);
end $$;

create or replace function public.pro_cal_next_workday(p_owner uuid,p_day date) returns date
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i integer;d date;
begin
 for i in 0..400 loop d:=p_day+i;if public.pro_cal_is_workday(p_owner,d) then return d;end if;end loop;
 return p_day;
end $$;

create or replace function public.pro_cal_workdays(p_owner uuid,p_start date,p_end date) returns integer
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i integer;n integer:=0;
begin
 if p_end<p_start or p_end-p_start>3700 then return 0;end if;
 for i in 0..(p_end-p_start) loop if public.pro_cal_is_workday(p_owner,p_start+i) then n:=n+1;end if;end loop;
 return n;
end $$;

-- Last day of a period that starts on p_start and lasts p_n working days (the start itself counts when it is a working day).
create or replace function public.pro_cal_end_for(p_owner uuid,p_start date,p_n integer) returns date
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i integer;c integer:=0;d date;
begin
 if p_n<1 then return p_start;end if;
 for i in 0..3700 loop d:=p_start+i;if public.pro_cal_is_workday(p_owner,d) then c:=c+1;if c>=p_n then return d;end if;end if;end loop;
 return p_start+p_n-1;
end $$;

-- Same contract as pro_schedule_shift_compute, in working days: dependents are pushed forward only, start on a working
-- day and keep their length in working days. The moved task keeps exactly the period the person chose.
create or replace function public.pro_schedule_shift_compute_cal(p_owner uuid,p_work text,p_task uuid,p_start date,p_end date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare plan jsonb:='{}'::jsonb;orig jsonb;l record;changed boolean:=true;guard integer:=0;need date;s date;e date;ps date;pe date;answer jsonb:='[]'::jsonb;k text;dur integer;ns date;
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
    ns:=public.pro_cal_next_workday(p_owner,need);dur:=greatest(1,public.pro_cal_workdays(p_owner,(orig->l.task_id::text->>'s')::date,(orig->l.task_id::text->>'e')::date));
    if ns>date'2100-12-31' or public.pro_cal_end_for(p_owner,ns,dur)>date'2100-12-31' then raise exception 'Shift beyond supported dates' using errcode='22023';end if;
    plan:=jsonb_set(plan,array[l.task_id::text],jsonb_build_object('s',ns,'e',public.pro_cal_end_for(p_owner,ns,dur)));changed:=true;end if;
  end loop;
 end loop;
 for k in select key from jsonb_each(plan) loop
  if plan->k<>orig->k then answer:=answer||jsonb_build_array(jsonb_build_object('taskId',k,'title',(select title from public.pro_work_tasks where owner_id=p_owner and id=k::uuid),
   'fromStart',orig->k->>'s','fromEnd',orig->k->>'e','toStart',plan->k->>'s','toEnd',plan->k->>'e','moved',k=p_task::text));end if;
 end loop;
 return answer;
end $$;

create or replace function public.pro_schedule_shift_preview_cal(p_owner uuid,p_work text,p_task uuid,p_start date,p_end date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin perform public.pro_work_schedule_owner(p_owner,p_work);
 return jsonb_build_object('revision',coalesce((select revision from public.pro_work_schedule_heads where owner_id=p_owner and work_id=p_work),0),'changes',public.pro_schedule_shift_compute_cal(p_owner,p_work,p_task,p_start,p_end));end $$;

-- Writes a list of changes {taskId,title,fromStart,fromEnd,toStart,toEnd} as ONE undoable action (kind 'shift').
create or replace function public.pro_schedule_changes_write(p_owner uuid,p_work text,p_action uuid,p_input jsonb,p_changes jsonb,p_cur integer) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb;answer jsonb;
begin
 for c in select value from jsonb_array_elements(p_changes) loop
  update public.pro_work_schedule_plans set planned_start=(c->>'toStart')::date,planned_end=(c->>'toEnd')::date where owner_id=p_owner and work_id=p_work and task_id=(c->>'taskId')::uuid
   and planned_start=(c->>'fromStart')::date and planned_end=(c->>'fromEnd')::date;
  if not found then raise exception 'Plan changed' using errcode='40001';end if;
 end loop;
 insert into public.pro_work_schedule_heads(owner_id,work_id,revision) values(p_owner,p_work,p_cur+1) on conflict(owner_id,work_id) do update set revision=excluded.revision,updated_at=now();
 answer:=jsonb_build_object('action',p_input->>'action','workId',p_work,'revision',p_cur+1,'changes',p_changes);
 insert into public.pro_schedule_round10_actions(owner_id,action_id,work_id,kind,input,result,before_state,after_state,revision_after)
  values(p_owner,p_action,p_work,'shift',p_input,answer,(select jsonb_agg(jsonb_build_object('taskId',x->>'taskId','start',x->>'fromStart','end',x->>'fromEnd')) from jsonb_array_elements(p_changes) x),p_changes,p_cur+1);
 return answer;
end $$;

create or replace function public.pro_schedule_shift_cal_apply(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;wid text;rev integer;cur integer;receipt public.pro_schedule_round10_actions;tid uuid;changes jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid schedule action' using errcode='22023';end if;
 select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if p_input->>'action' is distinct from 'shift_cal' or keys is distinct from array['action','actionId','end','revision','start','taskId','workId']
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483646 then raise exception 'Unexpected schedule fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;tid:=(p_input->>'taskId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 wid:=p_input->>'workId';rev:=(p_input->>'revision')::integer;perform public.pro_work_schedule_owner(p_owner,wid);
 perform pg_advisory_xact_lock(hashtextextended('pro-schedule-round10:'||p_owner::text||':'||aid::text,0));
 select * into receipt from public.pro_schedule_round10_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_owner::text||':'||wid,0));
 select coalesce(revision,0) into cur from public.pro_work_schedule_heads where owner_id=p_owner and work_id=wid;cur:=coalesce(cur,0);
 if cur<>rev then raise exception 'Schedule changed' using errcode='40001';end if;
 if coalesce(p_input->>'start','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p_input->>'end','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid dates' using errcode='22023';end if;
 changes:=public.pro_schedule_shift_compute_cal(p_owner,wid,tid,(p_input->>'start')::date,(p_input->>'end')::date);
 if jsonb_array_length(changes)=0 then raise exception 'Nothing to change' using errcode='22023';end if;
 return public.pro_schedule_changes_write(p_owner,wid,aid,p_input,changes,cur);
end $$;

-- Tasks of a job (open, planned) whose start falls on a rest day or holiday, moved to the next working day with their
-- working-day length; processed in start order so a successor also waits for its predecessors (FS/SS + lag rules).
-- p_tasks null = every planned open task of the job.
create or replace function public.pro_schedule_calendarize_compute(p_owner uuid,p_work text,p_tasks uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare plan jsonb:='{}'::jsonb;orig jsonb;r record;l record;s date;e date;ns date;ne date;dur integer;need date;answer jsonb:='[]'::jsonb;k text;
begin
 select coalesce(jsonb_object_agg(p.task_id::text,jsonb_build_object('s',p.planned_start,'e',p.planned_end)),'{}'::jsonb) into plan from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.id=p.task_id and not t.archived
  where p.owner_id=p_owner and p.work_id=p_work and p.planned_start is not null;
 orig:=plan;
 for r in select p.task_id,p.planned_start,p.planned_end from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.id=p.task_id and not t.archived and t.status='open'
  where p.owner_id=p_owner and p.work_id=p_work and p.planned_start is not null and (p_tasks is null or p.task_id=any(p_tasks)) order by p.planned_start,p.task_id loop
  s:=r.planned_start;e:=r.planned_end;dur:=greatest(1,public.pro_cal_workdays(p_owner,s,e));ns:=public.pro_cal_next_workday(p_owner,s);
  for l in select * from public.pro_schedule_links_of(p_owner,p_work) x where x.task_id=r.task_id loop
   if not plan ? l.predecessor_id::text then continue;end if;
   need:=case when l.kind='fs' then (plan->l.predecessor_id::text->>'e')::date+1+l.lag_days else (plan->l.predecessor_id::text->>'s')::date+l.lag_days end;
   if need>ns then ns:=public.pro_cal_next_workday(p_owner,need);end if;
  end loop;
  if ns>s then
   ne:=public.pro_cal_end_for(p_owner,ns,dur);
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

create or replace function public.pro_schedule_calendarize_preview(p_owner uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin perform public.pro_work_schedule_owner(p_owner,p_work);
 return jsonb_build_object('revision',coalesce((select revision from public.pro_work_schedule_heads where owner_id=p_owner and work_id=p_work),0),'changes',public.pro_schedule_calendarize_compute(p_owner,p_work,null));end $$;

create or replace function public.pro_schedule_calendarize_apply(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;wid text;rev integer;cur integer;receipt public.pro_schedule_round10_actions;changes jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid schedule action' using errcode='22023';end if;
 select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if p_input->>'action' is distinct from 'calendarize' or keys is distinct from array['action','actionId','revision','workId']
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483646 then raise exception 'Unexpected schedule fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 wid:=p_input->>'workId';rev:=(p_input->>'revision')::integer;perform public.pro_work_schedule_owner(p_owner,wid);
 perform pg_advisory_xact_lock(hashtextextended('pro-schedule-round10:'||p_owner::text||':'||aid::text,0));
 select * into receipt from public.pro_schedule_round10_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_owner::text||':'||wid,0));
 select coalesce(revision,0) into cur from public.pro_work_schedule_heads where owner_id=p_owner and work_id=wid;cur:=coalesce(cur,0);
 if cur<>rev then raise exception 'Schedule changed' using errcode='40001';end if;
 changes:=public.pro_schedule_calendarize_compute(p_owner,wid,null);
 if jsonb_array_length(changes)=0 then raise exception 'Nothing to change' using errcode='22023';end if;
 return public.pro_schedule_changes_write(p_owner,wid,aid,p_input,changes,cur);
end $$;

-- Due dates (not periods) that fall on a rest day or holiday move to the next working day through the existing task
-- writer (history kept). Used for task templates, which have due dates only.
create or replace function public.pro_tasks_calendarize_due(p_owner uuid,p_work text,p_tasks uuid[],p_seed text) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare t public.pro_work_tasks;n integer:=0;nd date;
begin
 for t in select * from public.pro_work_tasks where owner_id=p_owner and work_id=p_work and id=any(p_tasks) and not archived and due_date is not null order by id loop
  nd:=public.pro_cal_next_workday(p_owner,t.due_date);
  if nd<>t.due_date then
   perform public.pro_work_tasks_mutate(p_owner,jsonb_build_object('action','update','actionId',public.pro_lead_import_uuid(p_seed||':due:'||t.id::text),'workId',t.work_id,'taskId',t.id,'revision',t.revision,
    'title',t.title,'details',t.details,'assignee',t.assignee,'dueDate',to_char(nd,'YYYY-MM-DD')));n:=n+1;end if;
 end loop;
 return n;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro\_cal\_%' or p.proname in('pro_schedule_shift_compute_cal','pro_schedule_shift_preview_cal','pro_schedule_changes_write','pro_schedule_shift_cal_apply','pro_schedule_calendarize_compute','pro_schedule_calendarize_preview','pro_schedule_calendarize_apply','pro_tasks_calendarize_due'))
 loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;
commit;
notify pgrst,'reload schema';
