-- LOCAL PRO ONLY. Round 10 (2026-11-15), Jobsite (Houzz Pro parity rows 13, 20, 78, 79).
--  * Schedule dependencies (row 13): each existing predecessor link of the job plan can be
--    finish-to-start (FS, default) or start-to-start (SS) with a lag in days (side table keyed by the
--    task pair; the plan writer keeps owning WHICH predecessors exist). Existing links are migrated
--    once as FS + 0 days (nothing is rewritten). A date change can be previewed with every dependent
--    task that must move to respect FS/SS + lag (push forward, durations kept) and applied in one
--    transaction (schedule revision CAS, 40001 → 409), then undone once while nothing changed since.
--    Multi-job read of planned tasks for a combined schedule.
--  * Daily log automation (row 20): suggestions for one job and date: crew and minutes from the hours
--    ledger (pro_time_report_rows) and timers of that day, tasks completed that day (task history) and
--    tasks planned for that day. Weather comes from the mock adapter in the app (never a provider).
--    Reminder: in-app notification «daily_log_missing» (Round 9 center) for yesterday's work without
--    a daily log entry (owner only; derived on read like the other events, idempotent).
--  * Task templates (row 78): apply with assignee mapping in one transaction (existing apply writer +
--    existing task writer for each mapped task), with its own receipt.
-- Patterns: RLS on, service_role only, security invoker, CAS 40001, idempotent actionId receipts,
-- immutable history. Nothing is sent; no third party is called.
begin;
create table if not exists public.pro_schedule_link_rules(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,task_id uuid not null,predecessor_id uuid not null,
 kind text not null default 'fs' check(kind in('fs','ss')),lag_days integer not null default 0 check(lag_days between -60 and 365),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,work_id,task_id,predecessor_id),check(task_id<>predecessor_id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,work_id,predecessor_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade);
create table if not exists public.pro_schedule_round10_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,work_id text not null,
 kind text not null check(kind in('link','shift','undo')),input jsonb not null,result jsonb not null,before_state jsonb,after_state jsonb,
 revision_after integer,undo_of uuid,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade);
create unique index if not exists pro_schedule_round10_undo_once on public.pro_schedule_round10_actions(owner_id,undo_of) where undo_of is not null;
create index if not exists pro_schedule_round10_last on public.pro_schedule_round10_actions(owner_id,work_id,at desc);
create table if not exists public.pro_task_template_map_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
do $$declare t text;begin
 foreach t in array array['pro_schedule_round10_actions','pro_task_template_map_actions'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_round10_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['pro_schedule_link_rules','pro_schedule_round10_actions','pro_task_template_map_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
-- One-time migration: every existing predecessor link becomes an explicit FS + 0 rule (same meaning as before).
insert into public.pro_schedule_link_rules(owner_id,work_id,task_id,predecessor_id) select owner_id,work_id,task_id,predecessor_id from public.pro_work_schedule_dependencies on conflict do nothing;

-- Current links of a job (only pairs that still exist in the plan; rule defaults FS + 0).
create or replace function public.pro_schedule_links_of(p_owner uuid,p_work text) returns table(task_id uuid,predecessor_id uuid,kind text,lag_days integer,revision integer) language sql stable security invoker set search_path=public,pg_temp as $$
 select d.task_id,d.predecessor_id,coalesce(r.kind,'fs'),coalesce(r.lag_days,0),coalesce(r.revision,0) from public.pro_work_schedule_dependencies d
 join public.pro_work_tasks a on a.owner_id=d.owner_id and a.id=d.task_id and not a.archived join public.pro_work_tasks b on b.owner_id=d.owner_id and b.id=d.predecessor_id and not b.archived
 left join public.pro_schedule_link_rules r on r.owner_id=d.owner_id and r.work_id=d.work_id and r.task_id=d.task_id and r.predecessor_id=d.predecessor_id
 where d.owner_id=p_owner and d.work_id=p_work $$;

create or replace function public.pro_schedule_links_read(p_owner uuid,p_work text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare last_shift public.pro_schedule_round10_actions;rev integer;
begin
 perform public.pro_work_schedule_owner(p_owner,p_work);
 select revision into rev from public.pro_work_schedule_heads where owner_id=p_owner and work_id=p_work;
 select * into last_shift from public.pro_schedule_round10_actions where owner_id=p_owner and work_id=p_work and kind='shift' order by at desc limit 1;
 return jsonb_build_object('workId',p_work,'revision',coalesce(rev,0),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'assignee',t.assignee,'start',to_char(p.planned_start,'YYYY-MM-DD'),'end',to_char(p.planned_end,'YYYY-MM-DD'),'phaseId',p.phase_id) order by p.planned_start nulls last,t.title,t.id)
   from public.pro_work_tasks t join public.pro_work_schedule_plans p on p.owner_id=t.owner_id and p.work_id=t.work_id and p.task_id=t.id where t.owner_id=p_owner and t.work_id=p_work and not t.archived),'[]'::jsonb),
  'links',coalesce((select jsonb_agg(jsonb_build_object('taskId',l.task_id,'predecessorId',l.predecessor_id,'kind',l.kind,'lagDays',l.lag_days,'revision',l.revision) order by l.task_id,l.predecessor_id) from public.pro_schedule_links_of(p_owner,p_work) l),'[]'::jsonb),
  'lastShift',case when last_shift.action_id is null then null else jsonb_build_object('actionId',last_shift.action_id,'at',last_shift.at,'moved',jsonb_array_length(coalesce(last_shift.after_state,'[]'::jsonb)),
   'undone',exists(select 1 from public.pro_schedule_round10_actions u where u.owner_id=p_owner and u.undo_of=last_shift.action_id),'undoable',last_shift.revision_after=coalesce(rev,0) and not exists(select 1 from public.pro_schedule_round10_actions u where u.owner_id=p_owner and u.undo_of=last_shift.action_id)) end);
end $$;

-- Dates every task must take when one task gets [p_start,p_end]: dependents are pushed forward (never
-- pulled back) until every FS/SS + lag rule holds; durations are kept. Returns the moved tasks only.
create or replace function public.pro_schedule_shift_compute(p_owner uuid,p_work text,p_task uuid,p_start date,p_end date) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare plan jsonb:='{}'::jsonb;orig jsonb;l record;changed boolean:=true;guard integer:=0;need date;s date;e date;ps date;pe date;answer jsonb:='[]'::jsonb;k text;
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
    if e+(need-s)>date'2100-12-31' then raise exception 'Shift beyond supported dates' using errcode='22023';end if;
    plan:=jsonb_set(plan,array[l.task_id::text],jsonb_build_object('s',need,'e',e+(need-s)));changed:=true;end if;
  end loop;
 end loop;
 for k in select key from jsonb_each(plan) loop
  if plan->k<>orig->k then answer:=answer||jsonb_build_array(jsonb_build_object('taskId',k,'title',(select title from public.pro_work_tasks where owner_id=p_owner and id=k::uuid),
   'fromStart',orig->k->>'s','fromEnd',orig->k->>'e','toStart',plan->k->>'s','toEnd',plan->k->>'e','moved',k=p_task::text));end if;
 end loop;
 return answer;
end $$;
create or replace function public.pro_schedule_shift_preview(p_owner uuid,p_work text,p_task uuid,p_start date,p_end date) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin perform public.pro_work_schedule_owner(p_owner,p_work);
 return jsonb_build_object('revision',coalesce((select revision from public.pro_work_schedule_heads where owner_id=p_owner and work_id=p_work),0),'changes',public.pro_schedule_shift_compute(p_owner,p_work,p_task,p_start,p_end));end $$;

create or replace function public.pro_schedule_mutate(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;wid text;rev integer;cur integer;receipt public.pro_schedule_round10_actions;answer jsonb;changes jsonb;c jsonb;tid uuid;pid uuid;rule public.pro_schedule_link_rules;
 orig public.pro_schedule_round10_actions;before_json jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid schedule action' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from (case act when 'link_set' then array['action','actionId','kind','lagDays','predecessorId','revision','taskId','workId'] when 'shift' then array['action','actionId','end','revision','start','taskId','workId'] when 'undo' then array['action','actionId','revision','shiftId','workId'] end)
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483646 then raise exception 'Unexpected schedule fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 wid:=p_input->>'workId';rev:=(p_input->>'revision')::integer;perform public.pro_work_schedule_owner(p_owner,wid);
 perform pg_advisory_xact_lock(hashtextextended('pro-schedule-round10:'||p_owner::text||':'||aid::text,0));
 select * into receipt from public.pro_schedule_round10_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 -- Same per-job serialization as the plan writer.
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_owner::text||':'||wid,0));
 if act='link_set' then
  begin tid:=(p_input->>'taskId')::uuid;pid:=(p_input->>'predecessorId')::uuid;exception when others then raise exception 'Invalid link' using errcode='22023';end;
  if p_input->>'kind' not in('fs','ss') or jsonb_typeof(p_input->'lagDays') is distinct from 'number' or(p_input->>'lagDays')!~'^-?[0-9]{1,3}$' or(p_input->>'lagDays')::integer not between -60 and 365 then raise exception 'Invalid link rule' using errcode='22023';end if;
  if not exists(select 1 from public.pro_schedule_links_of(p_owner,wid) l where l.task_id=tid and l.predecessor_id=pid) then raise exception 'Link unavailable' using errcode='P0002';end if;
  select * into rule from public.pro_schedule_link_rules where owner_id=p_owner and work_id=wid and task_id=tid and predecessor_id=pid for update;
  if coalesce(rule.revision,0)<>rev then raise exception 'Link changed' using errcode='40001';end if;
  before_json:=case when rule.task_id is null then jsonb_build_object('kind','fs','lagDays',0) else jsonb_build_object('kind',rule.kind,'lagDays',rule.lag_days) end;
  insert into public.pro_schedule_link_rules(owner_id,work_id,task_id,predecessor_id,kind,lag_days) values(p_owner,wid,tid,pid,p_input->>'kind',(p_input->>'lagDays')::integer)
   on conflict(owner_id,work_id,task_id,predecessor_id) do update set kind=excluded.kind,lag_days=excluded.lag_days,revision=public.pro_schedule_link_rules.revision+1,updated_at=clock_timestamp() returning * into rule;
  answer:=jsonb_build_object('action','link_set','taskId',tid,'predecessorId',pid,'kind',rule.kind,'lagDays',rule.lag_days,'revision',rule.revision);
  insert into public.pro_schedule_round10_actions(owner_id,action_id,work_id,kind,input,result,before_state,after_state) values(p_owner,aid,wid,'link',p_input,answer,before_json,jsonb_build_object('kind',rule.kind,'lagDays',rule.lag_days));
  return answer;
 end if;
 select coalesce(revision,0) into cur from public.pro_work_schedule_heads where owner_id=p_owner and work_id=wid;cur:=coalesce(cur,0);
 if cur<>rev then raise exception 'Schedule changed' using errcode='40001';end if;
 if act='shift' then
  begin tid:=(p_input->>'taskId')::uuid;exception when others then raise exception 'Invalid task' using errcode='22023';end;
  if coalesce(p_input->>'start','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p_input->>'end','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid dates' using errcode='22023';end if;
  changes:=public.pro_schedule_shift_compute(p_owner,wid,tid,(p_input->>'start')::date,(p_input->>'end')::date);
  if jsonb_array_length(changes)=0 then raise exception 'Nothing to change' using errcode='22023';end if;
 else
  begin select * into orig from public.pro_schedule_round10_actions where owner_id=p_owner and action_id=(p_input->>'shiftId')::uuid and work_id=wid and kind='shift';exception when others then raise exception 'Invalid shift' using errcode='22023';end;
  if orig.action_id is null then raise exception 'Shift unavailable' using errcode='P0002';end if;
  if orig.revision_after<>cur or exists(select 1 from public.pro_schedule_round10_actions where owner_id=p_owner and undo_of=orig.action_id) then raise exception 'Schedule changed since that shift' using errcode='40001';end if;
  select coalesce(jsonb_agg(jsonb_build_object('taskId',x->>'taskId','title',x->>'title','fromStart',x->>'toStart','fromEnd',x->>'toEnd','toStart',x->>'fromStart','toEnd',x->>'fromEnd')),'[]'::jsonb) into changes from jsonb_array_elements(orig.after_state) x;
 end if;
 for c in select value from jsonb_array_elements(changes) loop
  update public.pro_work_schedule_plans set planned_start=(c->>'toStart')::date,planned_end=(c->>'toEnd')::date where owner_id=p_owner and work_id=wid and task_id=(c->>'taskId')::uuid
   and planned_start=(c->>'fromStart')::date and planned_end=(c->>'fromEnd')::date;
  if not found then raise exception 'Plan changed' using errcode='40001';end if;
 end loop;
 insert into public.pro_work_schedule_heads(owner_id,work_id,revision) values(p_owner,wid,cur+1) on conflict(owner_id,work_id) do update set revision=excluded.revision,updated_at=now();
 answer:=jsonb_build_object('action',act,'workId',wid,'revision',cur+1,'changes',changes);
 insert into public.pro_schedule_round10_actions(owner_id,action_id,work_id,kind,input,result,before_state,after_state,revision_after,undo_of)
  values(p_owner,aid,wid,act,p_input,answer,(select jsonb_agg(jsonb_build_object('taskId',x->>'taskId','start',x->>'fromStart','end',x->>'fromEnd')) from jsonb_array_elements(changes) x),changes,cur+1,case when act='undo' then orig.action_id end);
 return answer;
end $$;

-- Combined schedule: planned tasks of every active job overlapping a period (≤ 500 rows).
create or replace function public.pro_schedule_multi_read(p_owner uuid,p_from date,p_to date) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 then raise exception 'Invalid period' using errcode='22023';end if;
 return jsonb_build_object('from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),
  'items',coalesce((select jsonb_agg(x.j order by x.s,x.svc,x.title) from(select jsonb_build_object('workId',w.id,'service',w.service,'client',coalesce(w.client,''),'taskId',t.id,'title',t.title,'status',t.status,'assignee',t.assignee,
     'start',to_char(p.planned_start,'YYYY-MM-DD'),'end',to_char(p.planned_end,'YYYY-MM-DD'),'overdue',t.status='open' and p.planned_end<(now() at time zone 'America/Costa_Rica')::date) j,p.planned_start s,w.service svc,t.title
    from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.id=p.task_id and not t.archived join public.pro_work w on w.user_id=p.owner_id and w.id=p.work_id and not coalesce(w.cancelled,false)
    where p.owner_id=p_owner and p.planned_start<=p_to and p.planned_end>=p_from order by p.planned_start,w.service,t.title limit 500)x),'[]'::jsonb));
end $$;

-- Daily log suggestions for one job and Costa Rica date (read only; the entry is saved by the existing writer).
create or replace function public.pro_daily_log_autofill(p_owner uuid,p_work text,p_date date) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_work_schedule_owner(p_owner,p_work);
 if p_date is null or p_date<date'1900-01-01' or p_date>date'2100-12-31' then raise exception 'Invalid date' using errcode='22023';end if;
 return jsonb_build_object('workId',p_work,'date',to_char(p_date,'YYYY-MM-DD'),
  'crew',(select jsonb_build_object('people',coalesce(jsonb_agg(jsonb_build_object('key',k,'name',n,'minutes',m) order by n),'[]'::jsonb),'count',count(*),'minutes',coalesce(sum(m),0)::integer)
   from(select k,min(n) n,sum(m)::integer m from(
     select r.person_key k,coalesce(nullif(r.person_name,''),'—') n,r.minutes m from public.pro_time_report_rows(p_owner,p_date,p_date) r where r.work_id=p_work
     union all select 'person:'||t.person_id::text,coalesce(nullif(t.person_name,''),'—'),0 from public.pro_work_timers t where t.owner_id=p_owner and t.work_id=p_work and t.status in('running','stopped') and(t.started_at at time zone 'America/Costa_Rica')::date=p_date) y group by k) z),
  'completed',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title) order by t.title) from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and not t.archived and t.status='done'
   and exists(select 1 from public.pro_work_task_history h where h.owner_id=t.owner_id and h.task_id=t.id and h.action='complete' and(h.at at time zone 'America/Costa_Rica')::date=p_date)),'[]'::jsonb),
  'planned',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title) order by t.title) from public.pro_work_tasks t join public.pro_work_schedule_plans p on p.owner_id=t.owner_id and p.task_id=t.id
   where t.owner_id=p_owner and t.work_id=p_work and not t.archived and t.status='open' and p_date between p.planned_start and p.planned_end),'[]'::jsonb),
  'existing',exists(select 1 from public.pro_daily_logs l where l.owner_id=p_owner and l.work_id=p_work and l.log_date=p_date and not l.archived));
end $$;

-- Task template application with assignee mapping (one transaction, own receipt).
create or replace function public.pro_task_template_apply_mapped(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.pro_task_template_map_actions;inner_input jsonb;inner_result jsonb;map jsonb;k text;tid uuid;t public.pro_work_tasks;mapped integer:=0;answer jsonb;target text;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is distinct from 'apply' or jsonb_typeof(p_input->'assigneeMap') is distinct from 'object' then raise exception 'Invalid mapped application' using errcode='22023';end if;
 map:=p_input->'assigneeMap';if(select count(*) from jsonb_object_keys(map))>20 then raise exception 'Too many assignees' using errcode='22023';end if;
 for k in select key from jsonb_each(map) loop
  if length(k) not between 1 and 160 or jsonb_typeof(map->k) is distinct from 'string' or length(btrim(map->>k))>160 then raise exception 'Invalid assignee mapping' using errcode='22023';end if;end loop;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-task-template-map:'||p_owner::text||':'||aid::text,0));
 select * into receipt from public.pro_task_template_map_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 inner_input:=p_input-'assigneeMap';inner_result:=public.pro_task_templates_mutate(p_owner,inner_input);
 for tid in select value::uuid from jsonb_array_elements_text(p_input->'newTaskIds') loop
  select * into t from public.pro_work_tasks where owner_id=p_owner and id=tid;
  if t.id is null then continue;end if;
  if btrim(t.assignee)<>'' and map ? btrim(t.assignee) then
   target:=btrim(map->>btrim(t.assignee));
   if target is distinct from btrim(t.assignee) then
    perform public.pro_work_tasks_mutate(p_owner,jsonb_build_object('action','update','actionId',public.pro_lead_import_uuid('pro-task-template-map:'||aid::text||':'||tid::text),'workId',t.work_id,'taskId',t.id,'revision',t.revision,
     'title',t.title,'details',t.details,'assignee',target,'dueDate',case when t.due_date is null then null else to_char(t.due_date,'YYYY-MM-DD') end));mapped:=mapped+1;end if;
  end if;
 end loop;
 answer:=jsonb_build_object('action','apply_mapped','applied',inner_result,'mapped',mapped);
 insert into public.pro_task_template_map_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

-- Notifications: new event «daily_log_missing» (Round 9 center).
alter table public.pro_notifications drop constraint if exists pro_notifications_event_check;
alter table public.pro_notifications add constraint pro_notifications_event_check check(event in('task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received','daily_log_missing'));
create or replace function public.pro_notification_events() returns text[] language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received','daily_log_missing']
$$;
-- Same derivation as pro-notifications-local.sql plus the Round 10 daily log reminder.
create or replace function public.pro_notifications_sync(p_owner uuid,p_person uuid,p_today date) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare st jsonb;who text;n integer;plan record;item jsonb;overdue jsonb:='[]'::jsonb;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 st:=public.pro_notification_settings_json(p_owner,p_person);who:=public.pro_notification_person_name(p_owner,p_person);
 -- Overdue payment-plan installments (after the person's grace days), from the plan's own state.
 for plan in select id,work_id from public.pro_payment_plans where owner_id=p_owner and status='active' limit 200 loop
  for item in select value from jsonb_array_elements(coalesce(public.pro_payment_plan_state(p_owner,plan.id,p_today-(st->>'overdueGraceDays')::integer)->'items','[]'::jsonb)) loop
   if item->>'status'='overdue' then overdue:=overdue||jsonb_build_array(jsonb_build_object('key',plan.id::text||':'||coalesce(item->>'seq','')||':'||coalesce(item->>'dueDate',''),
    'title',left(coalesce((select service from public.pro_work where user_id=p_owner and id=plan.work_id),'Plan de pagos'),200),'body',coalesce(item->>'dueDate',''),
    'link',jsonb_build_object('tab','pro_agenda','cita',plan.work_id,'vistaTrabajo','costs','due',item->>'dueDate','amountCents',coalesce((item->>'amountCents')::bigint,0)-coalesce((item->>'appliedCents')::bigint,0))));end if;
  end loop;
 end loop;
 -- One statement, no temporary tables; only enabled in-app events become notifications; email drafts
 -- only where the person chose email (never sent).
 with events(event,source_key,title,body,link,at) as(
  -- Tasks assigned to this person (by its name as «Responsable»).
  select 'task_assigned',t.id::text||':'||lower(t.assignee),left(t.title,200),left(w.service,400),jsonb_build_object('tab','pro_agenda','cita',t.work_id,'vistaTrabajo','tasks'),t.updated_at
   from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
   where who is not null and t.owner_id=p_owner and not t.archived and t.status='open' and lower(btrim(t.assignee))=lower(who) and t.updated_at>clock_timestamp()-interval '60 days'
  union all
  -- Due soon / overdue tasks of this person (unassigned tasks: the owner).
  select 'task_due',t.id::text||':'||t.due_date::text,left(t.title,200),left(w.service,400),jsonb_build_object('tab','pro_agenda','cita',t.work_id,'vistaTrabajo','tasks','due',t.due_date::text,'overdue',t.due_date<p_today),clock_timestamp()
   from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
   where t.owner_id=p_owner and not t.archived and t.status='open' and t.due_date is not null and t.due_date<=p_today+(st->>'dueSoonDays')::integer and t.due_date>=p_today-30
    and (who is not null and lower(btrim(t.assignee))=lower(who) or btrim(t.assignee)='' and p_person=p_owner)
  union all
  -- Customer messages in job threads (last 30 days).
  select 'client_message',m.id::text,left(coalesce(nullif(m.author_name,''),'Cliente'),200),left(m.body,400),jsonb_build_object('tab','pro_agenda','cita',m.work_id,'vistaTrabajo','messages'),m.created_at
   from public.pro_work_messages m where m.owner_id=p_owner and m.side='client' and m.created_at>clock_timestamp()-interval '30 days'
  union all
  -- Customer answers to shared quotes.
  select case s.status when 'accepted' then 'quote_accepted' else 'quote_changes' end,p.id::text||':'||s.status||':'||s.revision,left(e.title,200),'',jsonb_build_object('tab','quotes','estimacionPrivada',p.estimate_id::text),p.created_at
   from public.pro_private_estimate_publications p join public.pro_private_estimate_publication_states s on s.publication_id=p.id join public.pro_private_estimates e on e.owner_id=p.owner_id and e.id=p.estimate_id
   where p.owner_id=p_owner and s.status in('accepted','changes_requested') and p.created_at>clock_timestamp()-interval '90 days'
  union all
  -- Payments applied to invoice drafts (not voided).
  select 'invoice_paid',a.id::text,left(d.title,200),a.amount_cents::text,jsonb_build_object('tab','pro_billing','amountCents',a.amount_cents),a.created_at
   from public.pro_invoice_payment_applications a join public.pro_invoice_drafts d on d.user_id=a.user_id and d.id=a.draft_id
   where a.user_id=p_owner and a.created_at>clock_timestamp()-interval '30 days' and not exists(select 1 from public.pro_invoice_payment_voids v where v.user_id=a.user_id and v.application_id=a.id)
  union all
  select 'invoice_overdue',o->>'key',o->>'title',o->>'body',o->'link',clock_timestamp() from jsonb_array_elements(overdue) o
  union all
  -- Vendor bid responses.
  select 'bid_received',r.package_id::text||':'||r.supplier_id::text,left(b.title,200),left(coalesce((select v.name from public.pro_expense_suppliers v where v.user_id=r.owner_id and v.id=r.supplier_id),''),400),jsonb_build_object('tab','pro_agenda','cita',b.work_id,'vistaTrabajo','bids'),r.recorded_at
   from public.pro_bid_responses r join public.pro_bid_packages b on b.owner_id=r.owner_id and b.id=r.package_id
   where r.owner_id=p_owner and r.recorded_at>clock_timestamp()-interval '30 days'
  union all
  -- Round 10: daily log reminder (owner only). Yesterday (Costa Rica) had work on the job (hours,
  -- a timer or a completed task) but the job has no daily log entry for that date.
  select 'daily_log_missing',w.id||':'||(p_today-1)::text,left(w.service,200),left(coalesce(w.client,''),400),jsonb_build_object('tab','pro_agenda','cita',w.id,'vistaTrabajo','updates','date',(p_today-1)::text),clock_timestamp()
   from public.pro_work w where p_person=p_owner and w.user_id=p_owner and not coalesce(w.cancelled,false)
    and not exists(select 1 from public.pro_daily_logs l where l.owner_id=p_owner and l.work_id=w.id and l.log_date=p_today-1 and not l.archived)
    and(exists(select 1 from public.pro_time_entries e where e.owner_id=p_owner and e.work_id=w.id and e.status='stopped' and e.recorded_on=p_today-1)
     or exists(select 1 from public.pro_work_timers t where t.owner_id=p_owner and t.work_id=w.id and(t.started_at at time zone 'America/Costa_Rica')::date=p_today-1)
     or exists(select 1 from public.pro_work_task_history h where h.owner_id=p_owner and h.work_id=w.id and h.action='complete' and(h.at at time zone 'America/Costa_Rica')::date=p_today-1))),
 ins as(insert into public.pro_notifications(owner_id,person_id,event,source_key,title,body,link,created_at)
  select distinct on(e.event,e.source_key) p_owner,p_person,e.event,e.source_key,e.title,e.body,e.link,least(coalesce(e.at,clock_timestamp()),clock_timestamp())
  from events e where public.pro_notification_enabled(st,e.event,'inApp')
  on conflict(owner_id,person_id,event,source_key) do nothing returning *),
 drafts as(insert into public.pro_notification_email_drafts(owner_id,person_id,notification_id,subject,body)
  select i.owner_id,i.person_id,i.id,left('ContrataCR Pro: '||i.title,200),i.title||case when i.body<>'' then E'\n'||i.body else '' end
  from ins i where public.pro_notification_enabled(st,i.event,'email') returning 1)
 select count(*) into n from ins;
 return n;
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_schedule_links_of','pro_schedule_links_read','pro_schedule_shift_compute','pro_schedule_shift_preview','pro_schedule_mutate','pro_schedule_multi_read','pro_daily_log_autofill','pro_task_template_apply_mapped','pro_notification_events','pro_notifications_sync') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
