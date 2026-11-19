-- Pro local only. Private normalized job tasks; no workspace JSON writes.
-- Apply only to the isolated local database after preserving existing data.
begin;
create table if not exists public.pro_work_tasks(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 work_id text not null check(length(work_id) between 1 and 160),id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 160),
 details text not null default '' check(length(details)<=2000),
 due_date date check(due_date between date '1900-01-01' and date '2100-12-31'),
 assignee text not null default '' check(length(assignee)<=160),
 status text not null default 'open' check(status in('open','done')),
 archived boolean not null default false,revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,work_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_work_tasks_page on public.pro_work_tasks(owner_id,work_id,archived,status,due_date,id);
create index if not exists pro_work_tasks_all_page on public.pro_work_tasks(owner_id,work_id,archived,due_date,id);
create table if not exists public.pro_work_task_history(
 owner_id uuid not null,work_id text not null,task_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','complete','reopen','archive','restore')),
 before_task jsonb,after_task jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade
);
create index if not exists pro_work_task_history_page on public.pro_work_task_history(owner_id,work_id,task_id,((after_task->>'revision')::integer) desc);
create table if not exists public.pro_work_task_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
create or replace function public.pro_work_task_json(p_task public.pro_work_tasks) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_task.id,'workId',p_task.work_id,'title',p_task.title,'details',p_task.details,
 'dueDate',case when p_task.due_date is null then null else to_char(p_task.due_date,'YYYY-MM-DD') end,
 'assignee',p_task.assignee,'status',p_task.status,'archived',p_task.archived,'revision',p_task.revision,
 'createdAt',p_task.created_at,'updatedAt',p_task.updated_at);
$$;
create or replace function public.pro_work_tasks_read(p_actor uuid,p_work text,p_status text default 'open',p_after uuid default null,p_archived boolean default false,p_task uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare task public.pro_work_tasks;items jsonb;hist jsonb;cursor_id uuid;cursor_due date;open_count integer;done_count integer;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_status is null or p_status not in('open','done','all') or p_archived is null then raise exception 'Invalid task query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 if p_task is not null then
  select * into task from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and id=p_task;
  if not found then return null;end if;
  select coalesce(jsonb_agg(x.content order by x.revision desc),'[]'::jsonb) into hist from (
   select (h.after_task->>'revision')::integer as revision,jsonb_build_object('actionId',h.action_id,'at',h.at,'action',h.action,'before',h.before_task,'after',h.after_task) as content
   from public.pro_work_task_history h where h.owner_id=p_actor and h.work_id=p_work and h.task_id=p_task order by (h.after_task->>'revision')::integer desc limit 20
  ) x;
  return jsonb_build_object('task',public.pro_work_task_json(task),'history',hist);
 end if;
 if p_after is not null then
  select coalesce(due_date,date '9999-12-31') into cursor_due from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and id=p_after;
  if not found then raise exception 'Invalid task cursor' using errcode='22023';end if;
 end if;
 select count(*) filter(where status='open'),count(*) filter(where status='done') into open_count,done_count from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and not archived;
 select coalesce(jsonb_agg(public.pro_work_task_json(t::public.pro_work_tasks) order by t.due_date asc nulls last,t.id),'[]'::jsonb) into items from (
  select * from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and archived=p_archived and (p_status='all' or status=p_status) and (p_after is null or (coalesce(due_date,date '9999-12-31'),id)>(cursor_due,p_after)) order by due_date asc nulls last,id limit 21
 ) t;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('workId',p_work,'items',items,'nextCursor',cursor_id,'counts',jsonb_build_object('open',open_count,'done',done_count));
end $$;
create or replace function public.pro_work_tasks_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;tid uuid;aid uuid;act text;rev integer;keys text[];receipt public.pro_work_task_actions;task public.pro_work_tasks;before_json jsonb;after_json jsonb;result jsonb;due date;task_title text;task_details text;task_assignee text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid task' using errcode='22023';end if;
 act:=p_input->>'action';wid:=p_input->>'workId';
 if act is null or act not in('create','update','complete','reopen','archive','restore') or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(wid) not between 1 and 160
 or jsonb_typeof(p_input->'taskId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
 or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false)
 then raise exception 'Invalid task identity' using errcode='22023';end if;
 if (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 tid:=(p_input->>'taskId')::uuid;aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if act in('create','update') then
  if keys<>array['action','actionId','assignee','details','dueDate','revision','taskId','title','workId']
   or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'details') is distinct from 'string' or jsonb_typeof(p_input->'assignee') is distinct from 'string'
   or not coalesce(jsonb_typeof(p_input->'dueDate') in('null','string'),false)
  then raise exception 'Invalid task fields' using errcode='22023';end if;
  task_title:=btrim(p_input->>'title');task_details:=btrim(p_input->>'details');task_assignee:=btrim(p_input->>'assignee');
  if length(task_title) not between 1 and 160 or length(task_details)>2000 or length(task_assignee)>160 then raise exception 'Invalid task text' using errcode='22023';end if;
  if p_input->'dueDate'<>'null'::jsonb then
   if not coalesce((p_input->>'dueDate')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid date' using errcode='22023';end if;
   due:=(p_input->>'dueDate')::date;
   if due<date '1900-01-01' or due>date '2100-12-31' or to_char(due,'YYYY-MM-DD')<>p_input->>'dueDate' then raise exception 'Invalid date' using errcode='22023';end if;
  end if;
 else
  if keys<>array['action','actionId','revision','taskId','workId'] then raise exception 'Unexpected task fields' using errcode='22023';end if;
 end if;
 -- Action identity is serialized first, including concurrent retries for two jobs.
 perform pg_advisory_xact_lock(hashtextextended('pro-work-task-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_task_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||wid,0));
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into task from public.pro_work_tasks where owner_id=p_actor and id=tid for update;
 if act='create' then
  if rev<>0 then raise exception 'Create requires zero revision' using errcode='22023';end if;
  if found then raise exception 'Task identity already exists' using errcode='22023';end if;
  if (select count(*) from public.pro_work_tasks where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Task limit reached' using errcode='54000';end if;
  insert into public.pro_work_tasks(owner_id,work_id,id,title,details,due_date,assignee) values(p_actor,wid,tid,task_title,task_details,due,task_assignee) returning * into task;
 else
  if not found or task.work_id<>wid then raise exception 'Forbidden' using errcode='42501';end if;
  if rev<>task.revision then raise exception 'Task changed' using errcode='40001';end if;
  before_json:=public.pro_work_task_json(task);
  if act='update' then
   if task.archived then raise exception 'Restore task before editing' using errcode='22023';end if;
   update public.pro_work_tasks set title=task_title,details=task_details,due_date=due,assignee=task_assignee,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into task;
  elsif act in('complete','reopen') then
   if task.archived or (act='complete' and task.status<>'open') or (act='reopen' and task.status<>'done') then raise exception 'Invalid task transition' using errcode='22023';end if;
   update public.pro_work_tasks set status=case when act='complete' then 'done' else 'open' end,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into task;
  elsif act in('archive','restore') then
   if task.archived=(act='archive') then raise exception 'Invalid archive transition' using errcode='22023';end if;
   update public.pro_work_tasks set archived=(act='archive'),revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into task;
  end if;
 end if;
 after_json:=public.pro_work_task_json(task);result:=jsonb_build_object('task',after_json);
 insert into public.pro_work_task_history(owner_id,work_id,task_id,action_id,action,before_task,after_task) values(p_actor,wid,tid,aid,act,before_json,after_json);
 insert into public.pro_work_task_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.pro_work_task_history_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Task history is immutable' using errcode='23514';end $$;
drop trigger if exists pro_work_task_history_immutable on public.pro_work_task_history;
create trigger pro_work_task_history_immutable before update on public.pro_work_task_history for each row execute function public.pro_work_task_history_immutable();
drop trigger if exists pro_work_task_action_immutable on public.pro_work_task_actions;
create trigger pro_work_task_action_immutable before update on public.pro_work_task_actions for each row execute function public.pro_work_task_history_immutable();
alter table public.pro_work_tasks enable row level security;
alter table public.pro_work_task_history enable row level security;
alter table public.pro_work_task_actions enable row level security;
revoke all on public.pro_work_tasks,public.pro_work_task_history,public.pro_work_task_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_tasks,public.pro_work_task_history,public.pro_work_task_actions to service_role;
revoke all on function public.pro_work_task_json(public.pro_work_tasks),public.pro_work_tasks_read(uuid,text,text,uuid,boolean,uuid),public.pro_work_tasks_mutate(uuid,jsonb),public.pro_work_task_history_immutable() from public,anon,authenticated;
grant execute on function public.pro_work_task_json(public.pro_work_tasks),public.pro_work_tasks_read(uuid,text,text,uuid,boolean,uuid),public.pro_work_tasks_mutate(uuid,jsonb) to service_role;
commit;
