-- LOCAL PRO ONLY. Manual planned periods and informative dependencies; no reminders or sends.
-- Does not alter existing task due dates, statuses, bookings or workspace JSON.
begin;
create table if not exists public.pro_work_schedule_heads(
 owner_id uuid not null,work_id text not null,revision integer not null check(revision>0),updated_at timestamptz not null default now(),primary key(owner_id,work_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create table if not exists public.pro_work_schedule_phases(
 owner_id uuid not null,work_id text not null,id uuid not null,title text not null check(length(btrim(title)) between 1 and 160),position integer not null check(position between 0 and 999),archived boolean not null default false,
 primary key(owner_id,work_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create table if not exists public.pro_work_schedule_plans(
 owner_id uuid not null,work_id text not null,task_id uuid not null,phase_id uuid,planned_start date,planned_end date,
 primary key(owner_id,work_id,task_id),foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,work_id,phase_id) references public.pro_work_schedule_phases(owner_id,work_id,id),
 check((planned_start is null and planned_end is null) or(planned_start is not null and planned_end is not null and planned_start between date'1900-01-01' and date'2100-12-31' and planned_end between date'1900-01-01' and date'2100-12-31' and planned_start<=planned_end))
);
create table if not exists public.pro_work_schedule_dependencies(
 owner_id uuid not null,work_id text not null,task_id uuid not null,predecessor_id uuid not null,
 primary key(owner_id,work_id,task_id,predecessor_id),check(task_id<>predecessor_id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,work_id,predecessor_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade
);
create index if not exists pro_work_schedule_dependencies_reverse on public.pro_work_schedule_dependencies(owner_id,work_id,predecessor_id,task_id);
create table if not exists public.pro_work_schedule_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,work_id text not null,input jsonb not null,result jsonb not null,before_state jsonb,at timestamptz not null default now(),
 primary key(actor_id,action_id),foreign key(actor_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create or replace function public.pro_work_schedule_owner(p_actor uuid,p_work text) returns void language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin if not coalesce(public.pro_appointment_enabled(p_actor),false) or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;end $$;
create or replace function public.pro_work_schedule_phase_json(p_phase public.pro_work_schedule_phases) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_phase.id,'title',p_phase.title,'position',p_phase.position,'archived',p_phase.archived);
$$;
create or replace function public.pro_work_schedule_plan_json(p_owner uuid,p_work text,p_task uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('taskId',p_task,'phaseId',(select phase_id from public.pro_work_schedule_plans where owner_id=p_owner and work_id=p_work and task_id=p_task),
 'plannedStart',(select to_char(planned_start,'YYYY-MM-DD') from public.pro_work_schedule_plans where owner_id=p_owner and work_id=p_work and task_id=p_task),
 'plannedEnd',(select to_char(planned_end,'YYYY-MM-DD') from public.pro_work_schedule_plans where owner_id=p_owner and work_id=p_work and task_id=p_task),
 'dependsOn',coalesce((select jsonb_agg(predecessor_id order by predecessor_id) from public.pro_work_schedule_dependencies where owner_id=p_owner and work_id=p_work and task_id=p_task),'[]'::jsonb));
$$;
create or replace function public.pro_work_schedule_read(p_actor uuid,p_work text default null,p_grant uuid default null,p_after uuid default null,p_options boolean default false,p_query text default '') returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare own uuid;wid text;g public.pro_team_grants;items jsonb;phases jsonb;cursor_id uuid;rev integer;
begin
 if p_grant is not null then
  if p_work is not null then raise exception 'Ambiguous schedule scope' using errcode='22023';end if;
  g:=public.pro_team_context(p_actor,p_grant,false);own:=g.owner_id;wid:=g.work_id;
 else perform public.pro_work_schedule_owner(p_actor,p_work);own:=p_actor;wid:=p_work;end if;
 if p_query is null or length(p_query)>100 or not p_options and p_query<>'' then raise exception 'Invalid schedule query' using errcode='22023';end if;
 if p_after is not null and not exists(select 1 from public.pro_work_tasks where owner_id=own and work_id=wid and id=p_after and not archived and (p_query='' or position(lower(p_query) in lower(title))>0)) then raise exception 'Invalid schedule cursor' using errcode='22023';end if;
 if p_options then
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title) order by t.id),'[]'::jsonb) into items from(select id,title from public.pro_work_tasks where owner_id=own and work_id=wid and not archived and (p_after is null or id>p_after) and(p_query='' or position(lower(p_query) in lower(title))>0) order by id limit 21)t;
 else
  select coalesce(jsonb_agg(jsonb_build_object('task',jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'dueDate',case when t.due_date is null then null else to_char(t.due_date,'YYYY-MM-DD') end,'revision',t.revision),'plan',public.pro_work_schedule_plan_json(own,wid,t.id),
  'dependencies',coalesce((select jsonb_agg(jsonb_build_object('taskId',d.predecessor_id,'title',case when not dt.archived then dt.title else null end,'status',case when not dt.archived then dt.status else null end,'available',coalesce(not dt.archived,false)) order by d.predecessor_id) from public.pro_work_schedule_dependencies d left join public.pro_work_tasks dt on dt.owner_id=d.owner_id and dt.work_id=d.work_id and dt.id=d.predecessor_id where d.owner_id=own and d.work_id=wid and d.task_id=t.id),'[]'::jsonb)) order by t.id),'[]'::jsonb) into items from(select * from public.pro_work_tasks where owner_id=own and work_id=wid and not archived and(p_after is null or id>p_after) order by id limit 21)t;
 end if;
 if jsonb_array_length(items)>20 then cursor_id:=case when p_options then (items->19->>'id')::uuid else (items->19->'task'->>'id')::uuid end;items:=items-20;end if;
 if p_options then return jsonb_build_object('items',items,'nextCursor',cursor_id);end if;
 select coalesce(jsonb_agg(public.pro_work_schedule_phase_json(p::public.pro_work_schedule_phases) order by p.position,p.id),'[]'::jsonb) into phases from(select * from public.pro_work_schedule_phases where owner_id=own and work_id=wid and not archived order by position,id limit 50)p;
 select revision into rev from public.pro_work_schedule_heads where owner_id=own and work_id=wid;
 return jsonb_build_object('workId',wid,'revision',coalesce(rev,0),'phases',phases,'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_work_schedule_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;wid text;pid uuid;tid uuid;rev integer;current_rev integer;keys text[];phase public.pro_work_schedule_phases;r public.pro_work_schedule_actions;start_date date;end_date date;dependencies uuid[];dep uuid;answer jsonb;before_json jsonb;title_text text;pos integer;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid schedule operation' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if act='phase_save' then
  if keys is distinct from array['action','actionId','phaseId','position','revision','title','workId'] or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'position') is distinct from 'number' or not coalesce((p_input->>'position')~'^[0-9]{1,3}$',false) then raise exception 'Invalid phase fields' using errcode='22023';end if;
  title_text:=btrim(p_input->>'title');pos:=(p_input->>'position')::integer;if length(title_text) not between 1 and 160 or pos not between 0 and 999 then raise exception 'Invalid phase content' using errcode='22023';end if;
 elsif act='phase_archive' then
  if keys is distinct from array['action','actionId','phaseId','revision','workId'] then raise exception 'Invalid phase archive fields' using errcode='22023';end if;
 elsif act='task_plan' then
  if keys is distinct from array['action','actionId','dependsOn','phaseId','plannedEnd','plannedStart','revision','taskId','workId'] or jsonb_typeof(p_input->'dependsOn') is distinct from 'array' or jsonb_array_length(p_input->'dependsOn')>5 or jsonb_typeof(p_input->'phaseId') not in('null','string') or jsonb_typeof(p_input->'plannedStart') not in('null','string') or jsonb_typeof(p_input->'plannedEnd') not in('null','string') then raise exception 'Invalid task plan fields' using errcode='22023';end if;
  if (p_input->>'plannedStart' is null)<>(p_input->>'plannedEnd' is null) then raise exception 'Incomplete planned period' using errcode='22023';end if;
  if p_input->>'plannedStart' is not null then
   if not coalesce((p_input->>'plannedStart')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) or not coalesce((p_input->>'plannedEnd')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid planned date' using errcode='22023';end if;
   start_date:=(p_input->>'plannedStart')::date;end_date:=(p_input->>'plannedEnd')::date;
   if start_date not between date'1900-01-01' and date'2100-12-31' or end_date not between date'1900-01-01' and date'2100-12-31' or start_date>end_date then raise exception 'Invalid planned period' using errcode='22023';end if;
  end if;
  select coalesce(array_agg(value::uuid order by value::uuid),array[]::uuid[]) into dependencies from jsonb_array_elements_text(p_input->'dependsOn');
  if (select count(distinct v) from unnest(dependencies)v)<>cardinality(dependencies) or array_position(dependencies,null) is not null then raise exception 'Duplicate dependency' using errcode='22023';end if;
 elsif act='task_clear' then
  if keys is distinct from array['action','actionId','revision','taskId','workId'] then raise exception 'Invalid task clear fields' using errcode='22023';end if;
 else raise exception 'Unknown schedule operation' using errcode='22023';end if;
 if jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 0 and 2147483646 then raise exception 'Invalid schedule identity' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;wid:=p_input->>'workId';rev:=(p_input->>'revision')::integer;
 if length(wid) not between 1 and 160 then raise exception 'Invalid schedule scope' using errcode='22023';end if;
 if act in('phase_save','phase_archive','task_plan') then pid:=(p_input->>'phaseId')::uuid;if act<>'task_plan' and pid is null then raise exception 'Missing phase identity' using errcode='22023';end if;end if;
 if act in('task_plan','task_clear') then tid:=(p_input->>'taskId')::uuid;if tid is null then raise exception 'Missing task identity' using errcode='22023';end if;end if;
 perform public.pro_work_schedule_owner(p_actor,wid);
 perform pg_advisory_xact_lock(hashtextextended('pro-work-schedule-action:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||wid,0));
 perform public.pro_work_schedule_owner(p_actor,wid);
 select * into r from public.pro_work_schedule_actions where actor_id=p_actor and action_id=aid;
 if found then if r.input is distinct from p_input then raise exception 'Schedule identity reused' using errcode='22023';end if;return r.result;end if;
 select revision into current_rev from public.pro_work_schedule_heads where owner_id=p_actor and work_id=wid for update;current_rev:=coalesce(current_rev,0);
 if rev<>current_rev then raise exception 'Schedule changed' using errcode='40001';end if;
 if current_rev>=2147483647 then raise exception 'Schedule revision exhausted' using errcode='54000';end if;
 if act in('phase_save','phase_archive') then
  select * into phase from public.pro_work_schedule_phases where owner_id=p_actor and work_id=wid and id=pid for update;
  if found then
   before_json:=public.pro_work_schedule_phase_json(phase);
   if phase.archived then raise exception 'Phase archived' using errcode='22023';end if;
   update public.pro_work_schedule_phases set title=case when act='phase_save' then title_text else title end,position=case when act='phase_save' then pos else position end,archived=act='phase_archive' where owner_id=p_actor and work_id=wid and id=pid returning * into phase;
  else
   if act='phase_archive' then raise exception 'Phase unavailable' using errcode='22023';end if;
   if (select count(*) from public.pro_work_schedule_phases where owner_id=p_actor and work_id=wid and not archived)>=50 then raise exception 'Phase limit reached' using errcode='54000';end if;
   insert into public.pro_work_schedule_phases(owner_id,work_id,id,title,position) values(p_actor,wid,pid,title_text,pos) returning * into phase;
  end if;
  answer:=jsonb_build_object('action',act,'workId',wid,'revision',current_rev+1,'phase',public.pro_work_schedule_phase_json(phase));
 else
  perform 1 from public.pro_work_tasks where owner_id=p_actor and work_id=wid and id=tid and not archived for update;if not found then raise exception 'Task unavailable' using errcode='42501';end if;
  before_json:=public.pro_work_schedule_plan_json(p_actor,wid,tid);
  if act='task_clear' then
   delete from public.pro_work_schedule_dependencies where owner_id=p_actor and work_id=wid and task_id=tid;
   delete from public.pro_work_schedule_plans where owner_id=p_actor and work_id=wid and task_id=tid;
  else
   if pid is not null and not exists(select 1 from public.pro_work_schedule_phases where owner_id=p_actor and work_id=wid and id=pid and not archived) then raise exception 'Phase changed' using errcode='40001';end if;
   if tid=any(dependencies) then raise exception 'Task cannot depend on itself' using errcode='22023';end if;
   foreach dep in array dependencies loop
    perform 1 from public.pro_work_tasks where owner_id=p_actor and work_id=wid and id=dep and not archived for update;if not found then raise exception 'Dependency unavailable' using errcode='40001';end if;
   end loop;
   if not exists(select 1 from public.pro_work_schedule_plans where owner_id=p_actor and work_id=wid and task_id=tid) and(select count(*) from public.pro_work_schedule_plans where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Plan task limit reached' using errcode='54000';end if;
   insert into public.pro_work_schedule_plans(owner_id,work_id,task_id,phase_id,planned_start,planned_end) values(p_actor,wid,tid,pid,start_date,end_date) on conflict(owner_id,work_id,task_id) do update set phase_id=excluded.phase_id,planned_start=excluded.planned_start,planned_end=excluded.planned_end;
   delete from public.pro_work_schedule_dependencies where owner_id=p_actor and work_id=wid and task_id=tid;
   insert into public.pro_work_schedule_dependencies(owner_id,work_id,task_id,predecessor_id) select p_actor,wid,tid,v from unnest(dependencies)v;
   if exists(with recursive walk(id) as(select predecessor_id from public.pro_work_schedule_dependencies where owner_id=p_actor and work_id=wid and task_id=tid union select d.predecessor_id from public.pro_work_schedule_dependencies d join walk w on w.id=d.task_id where d.owner_id=p_actor and d.work_id=wid) select 1 from walk where id=tid) then raise exception 'Dependencies contain a cycle' using errcode='40001';end if;
  end if;
  answer:=jsonb_build_object('action',act,'workId',wid,'revision',current_rev+1,'plan',public.pro_work_schedule_plan_json(p_actor,wid,tid));
 end if;
 perform public.pro_work_schedule_owner(p_actor,wid);
 insert into public.pro_work_schedule_heads(owner_id,work_id,revision) values(p_actor,wid,current_rev+1) on conflict(owner_id,work_id) do update set revision=excluded.revision,updated_at=now();
 insert into public.pro_work_schedule_actions(actor_id,action_id,work_id,input,result,before_state) values(p_actor,aid,wid,p_input,answer,before_json);return answer;
end $$;
create or replace function public.pro_work_schedule_action_read(p_actor uuid,p_work text,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_work_schedule_actions;phase public.pro_work_schedule_phases;act text;rev integer;tid uuid;
begin
 perform public.pro_work_schedule_owner(p_actor,p_work);
 select * into r from public.pro_work_schedule_actions where actor_id=p_actor and work_id=p_work and action_id=p_action;if not found then return null;end if;
 select revision into rev from public.pro_work_schedule_heads where owner_id=p_actor and work_id=p_work;act:=r.input->>'action';
 if act in('phase_save','phase_archive') then
  select * into phase from public.pro_work_schedule_phases where owner_id=p_actor and work_id=p_work and id=(r.input->>'phaseId')::uuid;if not found then return null;end if;
  return r.result;
 end if;
 tid:=(r.input->>'taskId')::uuid;
 if not exists(select 1 from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and id=tid and not archived) then raise exception 'Task unavailable' using errcode='42501';end if;
 return r.result;
end $$;
drop trigger if exists pro_work_schedule_actions_immutable on public.pro_work_schedule_actions;
create trigger pro_work_schedule_actions_immutable before update on public.pro_work_schedule_actions for each row execute function public.pro_team_append_only();
alter table public.pro_work_schedule_heads enable row level security;alter table public.pro_work_schedule_phases enable row level security;alter table public.pro_work_schedule_plans enable row level security;alter table public.pro_work_schedule_dependencies enable row level security;alter table public.pro_work_schedule_actions enable row level security;
revoke all on public.pro_work_schedule_heads,public.pro_work_schedule_phases,public.pro_work_schedule_plans,public.pro_work_schedule_dependencies,public.pro_work_schedule_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_schedule_heads,public.pro_work_schedule_phases,public.pro_work_schedule_plans,public.pro_work_schedule_dependencies,public.pro_work_schedule_actions to service_role;
revoke all on function public.pro_work_schedule_owner(uuid,text),public.pro_work_schedule_phase_json(public.pro_work_schedule_phases),public.pro_work_schedule_plan_json(uuid,text,uuid),public.pro_work_schedule_read(uuid,text,uuid,uuid,boolean,text),public.pro_work_schedule_mutate(uuid,jsonb),public.pro_work_schedule_action_read(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pro_work_schedule_owner(uuid,text),public.pro_work_schedule_phase_json(public.pro_work_schedule_phases),public.pro_work_schedule_plan_json(uuid,text,uuid),public.pro_work_schedule_read(uuid,text,uuid,uuid,boolean,text),public.pro_work_schedule_mutate(uuid,jsonb),public.pro_work_schedule_action_read(uuid,text,uuid) to service_role;
commit;
