-- LOCAL PRO ONLY. Reusable task definitions, NOT priced service packages.
-- No real assignee/grant, attachment, comment, schedule or notification copying.
begin;
create table if not exists public.pro_task_templates(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 80),notes text not null default '' check(length(notes)<=1000),
 revision integer not null default 1 check(revision>0),archived boolean not null default false,
 primary key(owner_id,id)
);
create index if not exists pro_task_templates_page on public.pro_task_templates(owner_id,archived,id);
create table if not exists public.pro_task_template_rows(
 owner_id uuid not null,template_id uuid not null,id uuid not null,position integer not null check(position between 0 and 99),
 title text not null check(length(btrim(title)) between 1 and 160),details text not null default '' check(length(details)<=2000),assignee text not null default '' check(length(assignee)<=160),due_offset integer check(due_offset between -80000 and 80000),
 primary key(owner_id,template_id,id),unique(owner_id,template_id,position),foreign key(owner_id,template_id) references public.pro_task_templates(owner_id,id) on delete cascade
);
create table if not exists public.pro_task_template_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,template_id uuid not null,
 input jsonb not null,result jsonb not null,before_state jsonb,after_state jsonb,at timestamptz not null default now(),primary key(actor_id,action_id),
 foreign key(actor_id,template_id) references public.pro_task_templates(owner_id,id) on delete cascade
);
alter table public.pro_task_template_actions add column if not exists after_state jsonb;
create or replace function public.pro_task_template_summary(p_template public.pro_task_templates) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_template.id,'name',p_template.name,'notes',p_template.notes,'revision',p_template.revision,'archived',p_template.archived,'count',(select count(*) from public.pro_task_template_rows where owner_id=p_template.owner_id and template_id=p_template.id));
$$;
create or replace function public.pro_task_template_detail(p_template public.pro_task_templates) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.pro_task_template_summary(p_template)||jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'details',r.details,'assignee',r.assignee,'dueOffset',r.due_offset) order by r.position) from public.pro_task_template_rows r where r.owner_id=p_template.owner_id and r.template_id=p_template.id),'[]'::jsonb));
$$;
create or replace function public.pro_task_templates_read(p_actor uuid,p_status text default 'active',p_query text default '',p_after uuid default null,p_template uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare t public.pro_task_templates;items jsonb;cursor_id uuid;needle text;want_archived boolean;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_template is not null then
  if p_after is not null then raise exception 'Invalid template detail query' using errcode='22023';end if;
  select * into t from public.pro_task_templates where owner_id=p_actor and id=p_template;if not found then return null;end if;
  return jsonb_build_object('template',public.pro_task_template_detail(t));
 end if;
 if p_status is null or p_status not in('active','archived') or p_query is null or length(p_query)>100 then raise exception 'Invalid template list query' using errcode='22023';end if;
 needle:=lower(btrim(p_query));want_archived:=p_status='archived';
 if p_after is not null and not exists(select 1 from public.pro_task_templates where owner_id=p_actor and id=p_after and archived=want_archived and(needle='' or position(needle in lower(name))>0 or position(needle in lower(notes))>0)) then raise exception 'Template cursor changed' using errcode='22023';end if;
 select coalesce(jsonb_agg(public.pro_task_template_summary(x::public.pro_task_templates) order by x.id),'[]'::jsonb) into items from(select * from public.pro_task_templates where owner_id=p_actor and archived=want_archived and(needle='' or position(needle in lower(name))>0 or position(needle in lower(notes))>0) and(p_after is null or id>p_after) order by id limit 21)x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_task_template_preview(p_actor uuid,p_template uuid,p_work text,p_start text default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare t public.pro_task_templates;r public.pro_task_template_rows;start_day date;due date;items jsonb:='[]'::jsonb;existing integer;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;
 if exists(select 1 from public.pro_work where user_id=p_actor and id=p_work and coalesce(cancelled,false)) then raise exception 'Target work cancelled' using errcode='40001';end if;
 select * into t from public.pro_task_templates where owner_id=p_actor and id=p_template;if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if t.archived then raise exception 'Template archived' using errcode='40001';end if;
 if p_start is not null then
  if not p_start~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid start date' using errcode='22023';end if;start_day:=p_start::date;
  if start_day not between date'1900-01-01' and date'2100-12-31' then raise exception 'Invalid start date' using errcode='22023';end if;
 end if;
 select count(*) into existing from public.pro_work_tasks where owner_id=p_actor and work_id=p_work;
 if existing+(select count(*) from public.pro_task_template_rows where owner_id=p_actor and template_id=p_template)>500 then raise exception 'Target task capacity changed' using errcode='40001';end if;
 for r in select * from public.pro_task_template_rows where owner_id=p_actor and template_id=p_template order by position loop
  due:=null;
  if r.due_offset is not null then
   if start_day is null then raise exception 'Start date required' using errcode='22023';end if;due:=start_day+r.due_offset;
   if due not between date'1900-01-01' and date'2100-12-31' then raise exception 'Resulting task date outside range' using errcode='22023';end if;
  end if;
  items:=items||jsonb_build_array(jsonb_build_object('id',r.id,'title',r.title,'details',r.details,'assignee',r.assignee,'dueDate',case when due is null then null else to_char(due,'YYYY-MM-DD') end));
 end loop;
 if jsonb_array_length(items) not between 1 and 100 then raise exception 'Template rows unavailable' using errcode='22023';end if;
 return jsonb_build_object('template',public.pro_task_template_summary(t),'workId',p_work,'startDate',p_start,'existingCount',existing,'rows',items);
end $$;
create or replace function public.pro_task_templates_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;template_key uuid;rev integer;keys text[];t public.pro_task_templates;receipt public.pro_task_template_actions;r jsonb;ref jsonb;task public.pro_work_tasks;work public.pro_work;
 name_text text;note_text text;rows_json jsonb;before_json jsonb;answer jsonb;preview jsonb;child_input jsonb;work_key text;source_work text;source_day date;offset_days integer;position_index integer;child_ids uuid[];new_ids uuid[];child_id uuid;seen uuid[]:=array[]::uuid[];
 include_details boolean;include_manual boolean;include_dates boolean;row_id uuid;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid task template' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if act='save' then
  if keys is distinct from array['action','actionId','name','notes','revision','rows','templateId'] or jsonb_typeof(p_input->'rows') is distinct from 'array' or jsonb_array_length(p_input->'rows') not between 1 and 100 then raise exception 'Invalid template definition' using errcode='22023';end if;
 elsif act='capture' then
  if not keys @> array['action','actionId','name','notes','revision','selected','templateId'] or not keys <@ array['action','actionId','includeDetails','includeDueDates','includeManual','name','notes','revision','selected','templateId'] or jsonb_typeof(p_input->'selected') is distinct from 'array' or jsonb_array_length(p_input->'selected') not between 1 and 100 then raise exception 'Invalid template capture' using errcode='22023';end if;
  foreach source_work in array array['includeDetails','includeManual','includeDueDates'] loop if p_input ? source_work and jsonb_typeof(p_input->source_work) is distinct from 'boolean' then raise exception 'Invalid copy option' using errcode='22023';end if;end loop;
  include_details:=coalesce((p_input->>'includeDetails')::boolean,false);include_manual:=coalesce((p_input->>'includeManual')::boolean,false);include_dates:=coalesce((p_input->>'includeDueDates')::boolean,true);
 elsif act in('archive','restore') then
  if keys is distinct from array['action','actionId','revision','templateId'] then raise exception 'Invalid template status action' using errcode='22023';end if;
 elsif act='apply' then
  if keys is distinct from array['action','actionId','newTaskIds','revision','startDate','taskActionIds','templateId','workId'] or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'newTaskIds') is distinct from 'array' or jsonb_typeof(p_input->'taskActionIds') is distinct from 'array' or jsonb_typeof(p_input->'startDate') not in('null','string') then raise exception 'Invalid template application' using errcode='22023';end if;
  work_key:=p_input->>'workId';if length(work_key) not between 1 and 160 or jsonb_array_length(p_input->'newTaskIds') not between 1 and 100 or jsonb_array_length(p_input->'taskActionIds')<>jsonb_array_length(p_input->'newTaskIds') then raise exception 'Invalid task identities' using errcode='22023';end if;
  select array_agg(value::uuid order by ordinality) into new_ids from jsonb_array_elements_text(p_input->'newTaskIds')with ordinality;
  select array_agg(value::uuid order by ordinality) into child_ids from jsonb_array_elements_text(p_input->'taskActionIds')with ordinality;
  if (select count(distinct v) from unnest(new_ids)v)<>cardinality(new_ids) or(select count(distinct v) from unnest(child_ids)v)<>cardinality(child_ids) or array_position(new_ids,null) is not null or array_position(child_ids,null) is not null then raise exception 'Repeated task identities' using errcode='22023';end if;
 else raise exception 'Invalid template operation' using errcode='22023';end if;
 if jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'templateId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric not between 0 and 2147483647 then raise exception 'Invalid template identity' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;template_key:=(p_input->>'templateId')::uuid;rev:=(p_input->>'revision')::integer;
 if act<>'apply' and rev>=2147483647 or act='capture' and rev<>0 or act in('archive','restore','apply') and rev=0 then raise exception 'Invalid template revision' using errcode='22023';end if;
 if act in('save','capture') then
  if jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'notes') is distinct from 'string' then raise exception 'Invalid template text' using errcode='22023';end if;name_text:=btrim(p_input->>'name');note_text:=btrim(p_input->>'notes');if length(name_text) not between 1 and 80 or length(note_text)>1000 then raise exception 'Invalid template text' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-task-template-action:'||p_actor::text||':'||aid::text,0));
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into receipt from public.pro_task_template_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Template action identity reused' using errcode='22023';end if;return receipt.result;end if;
 -- Lock every child action BEFORE the target work, matching the original task
 -- writer. No child receipt is adopted without an already committed parent.
 if act='apply' then
  for child_id in select v from unnest(child_ids)v order by v loop perform pg_advisory_xact_lock(hashtextextended('pro-work-task-action:'||p_actor::text||':'||child_id::text,0));end loop;
  perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||work_key,0));
  select * into work from public.pro_work where user_id=p_actor and id=work_key for share;if not found then raise exception 'Forbidden' using errcode='42501';end if;
 elsif act='capture' then
  -- Validate references before deriving the sorted work-lock set.
  for ref in select value from jsonb_array_elements(p_input->'selected') loop
   select array_agg(key order by key) into keys from jsonb_object_keys(ref)key;
   if keys is distinct from array['revision','taskId','workId'] or jsonb_typeof(ref->'workId') is distinct from 'string' or length(ref->>'workId') not between 1 and 160 or jsonb_typeof(ref->'taskId') is distinct from 'string' or jsonb_typeof(ref->'revision') is distinct from 'number' or not coalesce((ref->>'revision')~'^[0-9]{1,10}$',false) or(ref->>'revision')::numeric not between 1 and 2147483647 then raise exception 'Invalid capture reference' using errcode='22023';end if;
   row_id:=(ref->>'taskId')::uuid;if row_id=any(seen) then raise exception 'Repeated capture task' using errcode='22023';end if;seen:=array_append(seen,row_id);
  end loop;
  for source_work in select distinct value->>'workId' from jsonb_array_elements(p_input->'selected') order by 1 loop
   perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||source_work,0));
  end loop;
  for source_work in select distinct value->>'workId' from jsonb_array_elements(p_input->'selected') order by 1 loop
   perform 1 from public.pro_work where user_id=p_actor and id=source_work for share;if not found then raise exception 'Forbidden' using errcode='42501';end if;
  end loop;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-task-template-definition:'||p_actor::text||':'||template_key::text,0));
 select * into t from public.pro_task_templates where owner_id=p_actor and id=template_key for update;
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if act='apply' then
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if t.revision<>rev or t.archived then raise exception 'Template changed' using errcode='40001';end if;
  preview:=public.pro_task_template_preview(p_actor,template_key,work_key,p_input->>'startDate');
  before_json:=jsonb_build_object('template',public.pro_task_template_detail(t),'existingCount',preview->'existingCount');
  if jsonb_array_length(preview->'rows')<>cardinality(new_ids) then raise exception 'Template task count changed' using errcode='40001';end if;
  if exists(select 1 from public.pro_work_task_actions where actor_id=p_actor and action_id=any(child_ids)) or exists(select 1 from public.pro_work_tasks where owner_id=p_actor and id=any(new_ids)) then raise exception 'Task identity already used' using errcode='40001';end if;
  position_index:=1;
  for r in select value from jsonb_array_elements(preview->'rows') loop
   child_input:=jsonb_build_object('action','create','workId',work_key,'taskId',new_ids[position_index],'actionId',child_ids[position_index],'revision',0,'title',r->>'title','details',r->>'details','assignee',r->>'assignee','dueDate',r->'dueDate');
   perform public.pro_work_tasks_mutate(p_actor,child_input);position_index:=position_index+1;
  end loop;
  answer:=jsonb_build_object('action','apply','templateId',template_key,'templateRevision',t.revision,'workId',work_key,'taskIds',to_jsonb(new_ids));
 else
  if found then
   if rev=0 or t.revision<>rev then raise exception 'Template changed' using errcode='40001';end if;
   before_json:=public.pro_task_template_detail(t);
   if act='save' and t.archived or act in('archive','restore') and t.archived=(act='archive') then raise exception 'Template status changed' using errcode='40001';end if;
  else
   if rev<>0 or act not in('save','capture') then raise exception 'Template unavailable' using errcode='42501';end if;
  end if;
  if act='capture' then
   rows_json:='[]'::jsonb;
   for ref in select value from jsonb_array_elements(p_input->'selected') loop
    select * into task from public.pro_work_tasks where owner_id=p_actor and work_id=ref->>'workId' and id=(ref->>'taskId')::uuid and not archived for share;
    if not found then raise exception 'Source task unavailable' using errcode='42501';end if;
    if task.revision<>(ref->>'revision')::integer then raise exception 'Source task changed' using errcode='40001';end if;
    offset_days:=null;
    if include_dates and task.due_date is not null then
     select * into work from public.pro_work where user_id=p_actor and id=task.work_id;
     if work.start~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then source_day:=work.start::date;
     elsif length(work.start)<=80 and work.start~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' and work.start~'(Z|[+-][0-9]{2}:[0-9]{2})$' then source_day:=(work.start::timestamptz at time zone 'America/Costa_Rica')::date;
     else raise exception 'Source job start date is invalid; disable due dates to copy text only' using errcode='22023';end if;
     if source_day not between date'1900-01-01' and date'2100-12-31' then raise exception 'Source job start date outside range' using errcode='22023';end if;
     offset_days:=task.due_date-source_day;if offset_days not between -80000 and 80000 then raise exception 'Source date offset outside range' using errcode='22023';end if;
    end if;
    rows_json:=rows_json||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'title',task.title,'details',case when include_details then task.details else '' end,'assignee',case when include_manual then task.assignee else '' end,'dueOffset',offset_days));
   end loop;
  elsif act='save' then rows_json:=p_input->'rows';end if;
  if act in('save','capture') then
   if t.id is null then insert into public.pro_task_templates(owner_id,id,name,notes) values(p_actor,template_key,name_text,note_text) returning * into t;
   else update public.pro_task_templates set name=name_text,notes=note_text,revision=revision+1 where owner_id=p_actor and id=template_key returning * into t;end if;
   delete from public.pro_task_template_rows where owner_id=p_actor and template_id=template_key;
   position_index:=0;seen:=array[]::uuid[];
   for r in select value from jsonb_array_elements(rows_json) loop
    select array_agg(key order by key) into keys from jsonb_object_keys(r)key;
    if keys is distinct from array['assignee','details','dueOffset','id','title'] or jsonb_typeof(r->'id') is distinct from 'string' or jsonb_typeof(r->'title') is distinct from 'string' or jsonb_typeof(r->'details') is distinct from 'string' or jsonb_typeof(r->'assignee') is distinct from 'string' or jsonb_typeof(r->'dueOffset') not in('null','number') then raise exception 'Invalid template row' using errcode='22023';end if;
    row_id:=(r->>'id')::uuid;if row_id=any(seen) then raise exception 'Repeated template row' using errcode='22023';end if;seen:=array_append(seen,row_id);
    if r->>'dueOffset' is not null and not coalesce((r->>'dueOffset')~'^-?[0-9]{1,5}$',false) then raise exception 'Invalid relative due date' using errcode='22023';end if;
    insert into public.pro_task_template_rows(owner_id,template_id,id,position,title,details,assignee,due_offset) values(p_actor,template_key,row_id,position_index,btrim(r->>'title'),btrim(r->>'details'),btrim(r->>'assignee'),(r->>'dueOffset')::integer);position_index:=position_index+1;
   end loop;
  else update public.pro_task_templates set archived=act='archive',revision=revision+1 where owner_id=p_actor and id=template_key returning * into t;end if;
  answer:=jsonb_build_object('action',act,'template',public.pro_task_template_summary(t));
 end if;
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into public.pro_task_template_actions(actor_id,action_id,template_id,input,result,before_state,after_state) values(p_actor,aid,template_key,p_input,answer,before_json,case when act='apply' then null else public.pro_task_template_detail(t) end);return answer;
end $$;
create or replace function public.pro_task_template_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_task_template_actions;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_task_template_actions where actor_id=p_actor and action_id=p_action;if not found then return jsonb_build_object('receipt',null);end if;
 return jsonb_build_object('receipt',jsonb_build_object('input',r.input,'result',r.result));
end $$;
drop trigger if exists pro_task_template_actions_immutable on public.pro_task_template_actions;
create trigger pro_task_template_actions_immutable before update on public.pro_task_template_actions for each row execute function public.pro_team_append_only();
alter table public.pro_task_templates enable row level security;alter table public.pro_task_template_rows enable row level security;alter table public.pro_task_template_actions enable row level security;
revoke all on public.pro_task_templates,public.pro_task_template_rows,public.pro_task_template_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_task_templates,public.pro_task_template_rows,public.pro_task_template_actions to service_role;
revoke all on function public.pro_task_template_summary(public.pro_task_templates),public.pro_task_template_detail(public.pro_task_templates),public.pro_task_templates_read(uuid,text,text,uuid,uuid),public.pro_task_template_preview(uuid,uuid,text,text),public.pro_task_templates_mutate(uuid,jsonb),public.pro_task_template_action_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_task_template_summary(public.pro_task_templates),public.pro_task_template_detail(public.pro_task_templates),public.pro_task_templates_read(uuid,text,text,uuid,uuid),public.pro_task_template_preview(uuid,uuid,text,text),public.pro_task_templates_mutate(uuid,jsonb),public.pro_task_template_action_read(uuid,uuid) to service_role;
commit;
