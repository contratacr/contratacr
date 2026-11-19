-- LOCAL PRO ONLY. Project schedule (families 13/79): full Gantt read over the existing
-- plan (phases, planned periods, informative predecessors, key dates), immutable
-- baselines with per-task/phase/milestone deviation, and an opt-in customer view
-- (pro_client_dashboards.show_schedule, off by default) without internal data.
-- Does not alter tasks, plans, dependencies, milestones, receipts or their writers.
begin;
create table if not exists public.pro_work_schedule_baselines(
 owner_id uuid not null,work_id text not null,id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 120),
 schedule_revision integer not null check(schedule_revision>=0),
 task_count integer not null check(task_count between 0 and 500),milestone_count integer not null check(milestone_count between 0 and 500),
 seq bigint generated always as identity,captured_at timestamptz not null default now(),
 primary key(owner_id,work_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_work_schedule_baselines_latest on public.pro_work_schedule_baselines(owner_id,work_id,seq desc);
create table if not exists public.pro_work_schedule_baseline_items(
 owner_id uuid not null,work_id text not null,baseline_id uuid not null,
 kind text not null check(kind in('task','milestone')),ref_id uuid not null,phase_id uuid,
 title text not null check(length(title) between 1 and 160),planned_start date not null,planned_end date not null,
 check(planned_start<=planned_end),check(kind='task' or(planned_start=planned_end and phase_id is null)),
 primary key(owner_id,work_id,baseline_id,kind,ref_id),
 foreign key(owner_id,work_id,baseline_id) references public.pro_work_schedule_baselines(owner_id,work_id,id) on delete cascade
);
create table if not exists public.pro_work_schedule_baseline_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,work_id text not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id),
 foreign key(actor_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
-- Baselines are snapshots: no row is ever updated, and only a cascade from the
-- job/account (trigger depth >= 2) may delete them.
create or replace function public.pro_work_schedule_baseline_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and pg_trigger_depth()>=2 then return old;end if;
 raise exception 'Schedule baselines are immutable' using errcode='23514';
end $$;
drop trigger if exists pro_work_schedule_baselines_immutable on public.pro_work_schedule_baselines;
create trigger pro_work_schedule_baselines_immutable before update or delete on public.pro_work_schedule_baselines for each row execute function public.pro_work_schedule_baseline_immutable();
drop trigger if exists pro_work_schedule_baseline_items_immutable on public.pro_work_schedule_baseline_items;
create trigger pro_work_schedule_baseline_items_immutable before update or delete on public.pro_work_schedule_baseline_items for each row execute function public.pro_work_schedule_baseline_immutable();
drop trigger if exists pro_work_schedule_baseline_actions_immutable on public.pro_work_schedule_baseline_actions;
create trigger pro_work_schedule_baseline_actions_immutable before update or delete on public.pro_work_schedule_baseline_actions for each row execute function public.pro_work_schedule_baseline_immutable();

create or replace function public.pro_work_schedule_baseline_json(p_row public.pro_work_schedule_baselines) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'title',p_row.title,'capturedAt',p_row.captured_at,'scheduleRevision',p_row.schedule_revision,'taskCount',p_row.task_count,'milestoneCount',p_row.milestone_count);
$$;

-- Owner Gantt: every active task (plan limit 500), all active phases and key dates,
-- the latest baseline and deviation in civil days (positive = later than baseline).
create or replace function public.pro_work_gantt_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare rev integer;base public.pro_work_schedule_baselines;tasks jsonb;phases jsonb;milestones jsonb;baselines jsonb;today date;show boolean;cur_end date;base_end date;cur_start date;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid schedule query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 today:=(now() at time zone 'America/Costa_Rica')::date;
 select revision into rev from public.pro_work_schedule_heads where owner_id=p_actor and work_id=p_work;
 select * into base from public.pro_work_schedule_baselines where owner_id=p_actor and work_id=p_work order by seq desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',t.id,'title',t.title,'status',t.status,'revision',t.revision,
   'dueDate',case when t.due_date is null then null else to_char(t.due_date,'YYYY-MM-DD') end,
   'phaseId',p.phase_id,'plannedStart',to_char(p.planned_start,'YYYY-MM-DD'),'plannedEnd',to_char(p.planned_end,'YYYY-MM-DD'),
   'dependsOn',coalesce((select jsonb_agg(d.predecessor_id order by d.predecessor_id) from public.pro_work_schedule_dependencies d where d.owner_id=t.owner_id and d.work_id=t.work_id and d.task_id=t.id),'[]'::jsonb),
   'baselineStart',to_char(b.planned_start,'YYYY-MM-DD'),'baselineEnd',to_char(b.planned_end,'YYYY-MM-DD'),
   'startVarianceDays',case when p.planned_start is null or b.planned_start is null then null else p.planned_start-b.planned_start end,
   'endVarianceDays',case when p.planned_end is null or b.planned_end is null then null else p.planned_end-b.planned_end end
  ) order by p.planned_start nulls last,t.title,t.id),'[]'::jsonb) into tasks
 from (select * from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and not archived order by id limit 500) t
 left join public.pro_work_schedule_plans p on p.owner_id=t.owner_id and p.work_id=t.work_id and p.task_id=t.id
 left join public.pro_work_schedule_baseline_items b on base.id is not null and b.owner_id=t.owner_id and b.work_id=t.work_id and b.baseline_id=base.id and b.kind='task' and b.ref_id=t.id;
 select coalesce(jsonb_agg(x.content order by x.position,x.id),'[]'::jsonb) into phases from (
  select ph.position,ph.id,jsonb_build_object('id',ph.id,'title',ph.title,'position',ph.position,
   'plannedStart',to_char(min(p.planned_start),'YYYY-MM-DD'),'plannedEnd',to_char(max(p.planned_end),'YYYY-MM-DD'),
   'taskCount',count(t.id),'doneCount',count(t.id) filter(where t.status='done'),
   'baselineStart',to_char((select min(b.planned_start) from public.pro_work_schedule_baseline_items b where base.id is not null and b.owner_id=p_actor and b.work_id=p_work and b.baseline_id=base.id and b.kind='task' and b.phase_id=ph.id),'YYYY-MM-DD'),
   'baselineEnd',to_char((select max(b.planned_end) from public.pro_work_schedule_baseline_items b where base.id is not null and b.owner_id=p_actor and b.work_id=p_work and b.baseline_id=base.id and b.kind='task' and b.phase_id=ph.id),'YYYY-MM-DD'),
   'endVarianceDays',max(p.planned_end)-(select max(b.planned_end) from public.pro_work_schedule_baseline_items b where base.id is not null and b.owner_id=p_actor and b.work_id=p_work and b.baseline_id=base.id and b.kind='task' and b.phase_id=ph.id)
  ) content
  from public.pro_work_schedule_phases ph
  left join public.pro_work_schedule_plans p on p.owner_id=ph.owner_id and p.work_id=ph.work_id and p.phase_id=ph.id
   and exists(select 1 from public.pro_work_tasks a where a.owner_id=p.owner_id and a.work_id=p.work_id and a.id=p.task_id and not a.archived)
  left join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id
  where ph.owner_id=p_actor and ph.work_id=p_work and not ph.archived
  group by ph.id,ph.position,ph.title limit 50
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'date',to_char(m.milestone_date,'YYYY-MM-DD'),'notes',m.notes,
   'baselineDate',to_char(b.planned_start,'YYYY-MM-DD'),'varianceDays',case when b.planned_start is null then null else m.milestone_date-b.planned_start end) order by m.milestone_date,m.id),'[]'::jsonb) into milestones
 from (select * from public.pro_work_schedule_milestones where owner_id=p_actor and work_id=p_work and not archived order by milestone_date,id limit 500) m
 left join public.pro_work_schedule_baseline_items b on base.id is not null and b.owner_id=m.owner_id and b.work_id=m.work_id and b.baseline_id=base.id and b.kind='milestone' and b.ref_id=m.id;
 select coalesce(jsonb_agg(public.pro_work_schedule_baseline_json(x) order by x.seq desc),'[]'::jsonb) into baselines from (select * from public.pro_work_schedule_baselines where owner_id=p_actor and work_id=p_work order by seq desc limit 20) x;
 select coalesce(show_schedule,false) into show from public.pro_client_dashboards where owner_id=p_actor and work_id=p_work;
 select max(p.planned_end),min(p.planned_start) into cur_end,cur_start from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id and not t.archived where p.owner_id=p_actor and p.work_id=p_work;
 if base.id is not null then select max(planned_end) into base_end from public.pro_work_schedule_baseline_items where owner_id=p_actor and work_id=p_work and baseline_id=base.id and kind='task';end if;
 return jsonb_build_object('workId',p_work,'revision',coalesce(rev,0),'today',to_char(today,'YYYY-MM-DD'),
  'plannedStart',to_char(cur_start,'YYYY-MM-DD'),'plannedEnd',to_char(cur_end,'YYYY-MM-DD'),
  'baseline',case when base.id is null then null else public.pro_work_schedule_baseline_json(base) end,
  'baselineEnd',to_char(base_end,'YYYY-MM-DD'),'endVarianceDays',case when cur_end is null or base_end is null then null else cur_end-base_end end,
  'baselines',baselines,'phases',phases,'tasks',tasks,'milestones',milestones,'showSchedule',coalesce(show,false));
end $$;

create or replace function public.pro_work_schedule_baseline_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];wid text;aid uuid;rev integer;current_rev integer;title_text text;receipt public.pro_work_schedule_baseline_actions;bid uuid;tc integer;mc integer;row public.pro_work_schedule_baselines;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid baseline' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if p_input->>'action' is distinct from 'baseline_save' or keys is distinct from array['action','actionId','revision','title','workId']
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'title') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric>2147483646
 then raise exception 'Invalid baseline fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;title_text:=btrim(p_input->>'title');
 if length(wid) not between 1 and 160 or length(title_text) not between 1 and 120 then raise exception 'Invalid baseline content' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-baseline-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_schedule_baseline_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 -- Same serialization as every plan writer, so the snapshot matches one revision.
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||wid,0));
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 select revision into current_rev from public.pro_work_schedule_heads where owner_id=p_actor and work_id=wid;current_rev:=coalesce(current_rev,0);
 if rev<>current_rev then raise exception 'Schedule changed' using errcode='40001';end if;
 if (select count(*) from public.pro_work_schedule_baselines where owner_id=p_actor and work_id=wid)>=20 then raise exception 'Baseline limit reached' using errcode='54000';end if;
 select count(*) into tc from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id and not t.archived where p.owner_id=p_actor and p.work_id=wid and p.planned_start is not null;
 select count(*) into mc from public.pro_work_schedule_milestones where owner_id=p_actor and work_id=wid and not archived;
 if tc=0 and mc=0 then raise exception 'Nothing to capture' using errcode='22023';end if;
 if tc>500 or mc>500 then raise exception 'Baseline too large' using errcode='54000';end if;
 bid:=gen_random_uuid();
 insert into public.pro_work_schedule_baselines(owner_id,work_id,id,title,schedule_revision,task_count,milestone_count) values(p_actor,wid,bid,title_text,current_rev,tc,mc) returning * into row;
 insert into public.pro_work_schedule_baseline_items(owner_id,work_id,baseline_id,kind,ref_id,phase_id,title,planned_start,planned_end)
  select p_actor,wid,bid,'task',t.id,p.phase_id,t.title,p.planned_start,p.planned_end from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id and not t.archived where p.owner_id=p_actor and p.work_id=wid and p.planned_start is not null
  union all select p_actor,wid,bid,'milestone',m.id,null,m.title,m.milestone_date,m.milestone_date from public.pro_work_schedule_milestones m where m.owner_id=p_actor and m.work_id=wid and not m.archived;
 result:=jsonb_build_object('baseline',public.pro_work_schedule_baseline_json(row));
 insert into public.pro_work_schedule_baseline_actions(actor_id,action_id,work_id,input,result) values(p_actor,aid,wid,p_input,result);
 return result;
end $$;

-- Customer view: phases (title, overall period, progress counts), tasks without a
-- phase grouped as one row, and key dates. Never task titles, notes, assignees,
-- dependencies, baselines or revisions. Same audience/gating as allowances.
create or replace function public.pro_work_schedule_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;req_status text;enabled boolean;phases jsonb;general jsonb;milestones jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id,status into owner,wid,req_status from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select coalesce(show_schedule,false) into enabled from public.pro_client_dashboards where owner_id=owner and work_id=wid;
 if req_status not in('confirmed','completed') or not coalesce(enabled,false) then return jsonb_build_object('visible',false);end if;
 select coalesce(jsonb_agg(x.content order by x.position,x.start nulls last),'[]'::jsonb) into phases from (
  select ph.position,min(p.planned_start) start,jsonb_build_object('title',ph.title,'plannedStart',to_char(min(p.planned_start),'YYYY-MM-DD'),'plannedEnd',to_char(max(p.planned_end),'YYYY-MM-DD'),
   'total',count(t.id),'done',count(t.id) filter(where t.status='done')) content
  from public.pro_work_schedule_phases ph
  left join public.pro_work_schedule_plans p on p.owner_id=ph.owner_id and p.work_id=ph.work_id and p.phase_id=ph.id
   and exists(select 1 from public.pro_work_tasks a where a.owner_id=p.owner_id and a.work_id=p.work_id and a.id=p.task_id and not a.archived)
  left join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id
  where ph.owner_id=owner and ph.work_id=wid and not ph.archived group by ph.id,ph.position,ph.title limit 50
 ) x;
 select case when count(t.id)=0 then null else jsonb_build_object('plannedStart',to_char(min(p.planned_start),'YYYY-MM-DD'),'plannedEnd',to_char(max(p.planned_end),'YYYY-MM-DD'),'total',count(t.id),'done',count(t.id) filter(where t.status='done')) end into general
  from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id and not t.archived
  where p.owner_id=owner and p.work_id=wid and p.planned_start is not null and(p.phase_id is null or not exists(select 1 from public.pro_work_schedule_phases ph where ph.owner_id=p.owner_id and ph.work_id=p.work_id and ph.id=p.phase_id and not ph.archived));
 select coalesce(jsonb_agg(jsonb_build_object('title',m.title,'date',to_char(m.milestone_date,'YYYY-MM-DD')) order by m.milestone_date,m.id),'[]'::jsonb) into milestones
  from (select * from public.pro_work_schedule_milestones where owner_id=owner and work_id=wid and not archived order by milestone_date,id limit 200) m;
 return jsonb_build_object('visible',true,'today',to_char((now() at time zone 'America/Costa_Rica')::date,'YYYY-MM-DD'),'phases',phases,'general',general,'milestones',milestones);
end $$;

alter table public.pro_work_schedule_baselines enable row level security;
alter table public.pro_work_schedule_baseline_items enable row level security;
alter table public.pro_work_schedule_baseline_actions enable row level security;
revoke all on public.pro_work_schedule_baselines,public.pro_work_schedule_baseline_items,public.pro_work_schedule_baseline_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_schedule_baselines,public.pro_work_schedule_baseline_items,public.pro_work_schedule_baseline_actions to service_role;
grant usage,select on sequence public.pro_work_schedule_baselines_seq_seq to service_role;
revoke all on function public.pro_work_schedule_baseline_immutable(),public.pro_work_schedule_baseline_json(public.pro_work_schedule_baselines),public.pro_work_gantt_read(uuid,text),public.pro_work_schedule_baseline_mutate(uuid,jsonb),public.pro_work_schedule_client_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_work_schedule_baseline_json(public.pro_work_schedule_baselines),public.pro_work_gantt_read(uuid,text),public.pro_work_schedule_baseline_mutate(uuid,jsonb),public.pro_work_schedule_client_read(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
