-- LOCAL PRO ONLY. Deliberate allowlisted correction to seven owner-private RPCs.
-- Payloads, signatures, receipts, histories, tables and actor/work scope remain
-- unchanged. Public appointment eligibility and all team/client readers stay intact.
begin;
create or replace function public.pro_private_work_tools_enabled(p_actor uuid)returns boolean language sql volatile security invoker set search_path=public,pg_temp as $$
 -- Single Pro entitlement rule (pro_entitled, pro-entitled-draft.sql); signature and volatility kept.
 select public.pro_entitled(p_actor);
$$;
create or replace function public.pro_work_tasks_read(p_actor uuid,p_work text,p_status text default 'open',p_after uuid default null,p_archived boolean default false,p_task uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare task public.pro_work_tasks;items jsonb;hist jsonb;cursor_id uuid;cursor_due date;open_count integer;done_count integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
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
  -- Round 7B: the list follows the plan (planned start), then the due date; same key for the cursor.
  select coalesce(sp.planned_start,t.due_date,date '9999-12-31') into cursor_due from public.pro_work_tasks t left join public.pro_work_schedule_plans sp on sp.owner_id=t.owner_id and sp.work_id=t.work_id and sp.task_id=t.id where t.owner_id=p_actor and t.work_id=p_work and t.id=p_after;
  if not found then raise exception 'Invalid task cursor' using errcode='22023';end if;
 end if;
 select count(*) filter(where status='open'),count(*) filter(where status='done') into open_count,done_count from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and not archived;
 select coalesce(jsonb_agg(public.pro_work_task_json(t.task) order by t.k,t.id),'[]'::jsonb) into items from (
  select x as task,x.id,coalesce(sp.planned_start,x.due_date,date '9999-12-31') k from public.pro_work_tasks x left join public.pro_work_schedule_plans sp on sp.owner_id=x.owner_id and sp.work_id=x.work_id and sp.task_id=x.id
  where x.owner_id=p_actor and x.work_id=p_work and x.archived=p_archived and (p_status='all' or x.status=p_status) and (p_after is null or (coalesce(sp.planned_start,x.due_date,date '9999-12-31'),x.id)>(cursor_due,p_after)) order by 3,x.id limit 21
 ) t;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('workId',p_work,'items',items,'nextCursor',cursor_id,'counts',jsonb_build_object('open',open_count,'done',done_count));
end $$;
create or replace function public.pro_work_tasks_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;tid uuid;aid uuid;act text;rev integer;keys text[];receipt public.pro_work_task_actions;task public.pro_work_tasks;before_json jsonb;after_json jsonb;result jsonb;due date;task_title text;task_details text;task_assignee text;task_exists boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
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
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-task-action:'||p_actor::text||':'||aid::text,0));
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 select * into receipt from public.pro_work_task_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||wid,0));
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 select * into task from public.pro_work_tasks where owner_id=p_actor and id=tid for update;task_exists:=found;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 if act='create' then
  if rev<>0 then raise exception 'Create requires zero revision' using errcode='22023';end if;
  if task_exists then raise exception 'Task identity already exists' using errcode='22023';end if;
  if (select count(*) from public.pro_work_tasks where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Task limit reached' using errcode='54000';end if;
  insert into public.pro_work_tasks(owner_id,work_id,id,title,details,due_date,assignee) values(p_actor,wid,tid,task_title,task_details,due,task_assignee) returning * into task;
 else
  if not task_exists or task.work_id<>wid then raise exception 'Forbidden' using errcode='42501';end if;
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
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 return result;
end $$;
create or replace function public.pro_work_updates_read(p_actor uuid,p_work text,p_after uuid default null,p_entry uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare entry public.pro_work_updates;items jsonb;hist jsonb;cursor_time timestamptz;cursor_id uuid;can_share boolean;recipient uuid;recipient_name text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_after is not null and p_entry is not null then raise exception 'Invalid progress query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 can_share:=public.pro_work_update_can_share(p_actor,p_work);
 if can_share then
  select ar.client_user_id,ar.client_name into recipient,recipient_name from public.pro_appointment_requests ar join public.profiles c on c.id=ar.client_user_id
   where ar.owner_id=p_actor and ar.work_id=p_work and ar.status in('confirmed','completed') and not coalesce(c.is_disabled,false);
 end if;
 if p_entry is not null then
  select * into entry from public.pro_work_updates where owner_id=p_actor and work_id=p_work and id=p_entry;
  if not found then return null;end if;
  select coalesce(jsonb_agg(x.content order by x.revision desc),'[]'::jsonb) into hist from (
   select (h.after_entry->>'revision')::integer as revision,jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_entry,'after',h.after_entry) as content
   from public.pro_work_update_history h where h.owner_id=p_actor and h.work_id=p_work and h.entry_id=p_entry order by (h.after_entry->>'revision')::integer desc limit 20
  ) x;
  return jsonb_build_object('entry',public.pro_work_update_json(entry),'history',hist,'canShare',can_share,'recipientId',recipient,'recipientName',recipient_name);
 end if;
 if p_after is not null then
  select created_at into cursor_time from public.pro_work_updates where owner_id=p_actor and work_id=p_work and id=p_after;
  if not found then raise exception 'Invalid progress cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(public.pro_work_update_json(e::public.pro_work_updates) order by e.created_at desc,e.id desc),'[]'::jsonb) into items from (
  select * from public.pro_work_updates where owner_id=p_actor and work_id=p_work and (p_after is null or (created_at,id)<(cursor_time,p_after)) order by created_at desc,id desc limit 21
 ) e;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('workId',p_work,'items',items,'nextCursor',cursor_id,'canShare',can_share,'recipientId',recipient,'recipientName',recipient_name);
end $$;
create or replace function public.pro_work_updates_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;eid uuid;aid uuid;act text;rev integer;keys text[];receipt public.pro_work_update_actions;entry public.pro_work_updates;w public.pro_work;r public.pro_appointment_requests;before_json jsonb;after_json jsonb;result jsonb;entry_title text;entry_text text;recipient uuid;publication integer;entry_exists boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid progress' using errcode='22023';end if;
 act:=p_input->>'action';wid:=p_input->>'workId';
 if act is null or act not in('create','update','publish') or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(wid) not between 1 and 160
 or jsonb_typeof(p_input->'entryId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
 or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) then raise exception 'Invalid progress identity' using errcode='22023';end if;
 if (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 eid:=(p_input->>'entryId')::uuid;aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if act in('create','update') then
  if keys<>array['action','actionId','entryId','revision','text','title','workId'] or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'text') is distinct from 'string' then raise exception 'Invalid progress fields' using errcode='22023';end if;
  entry_title:=btrim(p_input->>'title');entry_text:=btrim(p_input->>'text');
  if length(entry_title) not between 1 and 160 or length(entry_text) not between 1 and 2000 then raise exception 'Invalid progress text' using errcode='22023';end if;
 else
  if keys<>array['action','actionId','entryId','recipientId','revision','workId'] or jsonb_typeof(p_input->'recipientId') is distinct from 'string' then raise exception 'Unexpected progress fields' using errcode='22023';end if;
  recipient:=(p_input->>'recipientId')::uuid;
 end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-update-action:'||p_actor::text||':'||aid::text,0));
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 select * into receipt from public.pro_work_update_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-updates:'||p_actor::text||':'||wid,0));
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 -- Match appointment cancel/reschedule ordering: request first, then work.
 -- A private create/update never locks the request. Receipt replay above never
 -- re-targets an already committed publication to a newly linked customer.
 if act='publish' then
  select ar.* into r from public.pro_appointment_requests ar where ar.owner_id=p_actor and ar.work_id=wid for share of ar;
  if not found then raise exception 'No linked customer' using errcode='42501';end if;
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 end if;
 select * into w from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 select * into entry from public.pro_work_updates where owner_id=p_actor and id=eid for update;entry_exists:=found;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 if act='create' then
  if rev<>0 then raise exception 'Create requires zero revision' using errcode='22023';end if;
  if entry_exists then raise exception 'Progress identity already exists' using errcode='22023';end if;
  if (select count(*) from public.pro_work_updates where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Progress entry limit' using errcode='54000';end if;
  insert into public.pro_work_updates(owner_id,work_id,id,title,text) values(p_actor,wid,eid,entry_title,entry_text) returning * into entry;
 else
  if not entry_exists or entry.work_id<>wid then raise exception 'Forbidden' using errcode='42501';end if;
  if rev<>entry.revision then raise exception 'Progress changed' using errcode='40001';end if;
  before_json:=public.pro_work_update_json(entry);
  if act='update' then
   update public.pro_work_updates set title=entry_title,text=entry_text,revision=revision+1,updated_at=now() where owner_id=p_actor and id=eid returning * into entry;
  else
   if entry.published_revision is not distinct from entry.revision then raise exception 'No private changes to share' using errcode='22023';end if;
   if coalesce(w.cancelled,false) then raise exception 'Cancelled job cannot share progress' using errcode='42501';end if;
   if r.client_user_id<>recipient then raise exception 'The share recipient changed' using errcode='40001';end if;
   if r.status not in('confirmed','completed') or not exists(select 1 from public.profiles where id=r.client_user_id and not coalesce(is_disabled,false)) then raise exception 'No linked confirmed customer' using errcode='42501';end if;
   update public.pro_work_updates set revision=revision+1,published_revision=revision+1,updated_at=now() where owner_id=p_actor and id=eid returning * into entry;
   select coalesce(max(version),0)+1 into publication from public.pro_work_update_versions where owner_id=p_actor and entry_id=eid;
   insert into public.pro_work_update_versions(owner_id,work_id,entry_id,version,entry_revision,client_user_id,recipient_name,title,text,service,entry_created_at)
    values(p_actor,wid,eid,publication,entry.revision,r.client_user_id,r.client_name,entry.title,entry.text,w.service,entry.created_at);
  end if;
 end if;
 after_json:=public.pro_work_update_json(entry);result:=jsonb_build_object('entry',after_json);
 insert into public.pro_work_update_history(owner_id,work_id,entry_id,action_id,action,before_entry,after_entry) values(p_actor,wid,eid,aid,act,before_json,after_json);
 insert into public.pro_work_update_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid)then raise exception 'Forbidden' using errcode='42501';end if;
 return result;
end $$;
create or replace function public.pro_task_center_read(p_actor uuid,p_status text default 'open',p_timing text default 'all',p_query text default '',p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today_cr date:=(now() at time zone 'America/Costa_Rica')::date;needle text;cursor_due date;cursor_id uuid;items jsonb;open_count integer;done_count integer;overdue_count integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status is null or p_status not in('open','done','all') or p_timing is null or p_timing not in('all','overdue','today','upcoming') or p_query is null or length(p_query)>100 then raise exception 'Invalid task-center query' using errcode='22023';end if;
 needle:=lower(btrim(p_query));
 -- Literal substring matching: percent/underscore never become SQL wildcards.
 select count(*) filter(where t.status='open'),count(*) filter(where t.status='done'),count(*) filter(where t.status='open' and t.due_date<today_cr)
 into open_count,done_count,overdue_count from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
 where t.owner_id=p_actor and not t.archived and (needle='' or position(needle in lower(t.title))>0 or position(needle in lower(t.details))>0 or position(needle in lower(t.assignee))>0 or position(needle in lower(w.service))>0 or position(needle in lower(w.client))>0);
 if p_after is not null then
  select coalesce(t.due_date,date '9999-12-31') into cursor_due from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
  where t.owner_id=p_actor and t.id=p_after and not t.archived and (p_status='all' or t.status=p_status)
  and (needle='' or position(needle in lower(t.title))>0 or position(needle in lower(t.details))>0 or position(needle in lower(t.assignee))>0 or position(needle in lower(w.service))>0 or position(needle in lower(w.client))>0)
  and case p_timing when 'all' then true when 'overdue' then t.status='open' and t.due_date<today_cr when 'today' then t.due_date=today_cr else t.due_date>today_cr end;
  if not found then raise exception 'Task-center cursor changed; refresh the list' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('task',public.pro_work_task_json(x.task),'work',jsonb_build_object('id',x.work_id,'service',x.service,'client',x.client,'stage',x.stage,'cancelled',x.cancelled)) order by (x.task).due_date asc nulls last,(x.task).id),'[]'::jsonb) into items from (
  select t as task,w.id as work_id,w.service,w.client,w.stage,coalesce(w.cancelled,false) as cancelled
  from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
  where t.owner_id=p_actor and not t.archived and (p_status='all' or t.status=p_status)
  and (needle='' or position(needle in lower(t.title))>0 or position(needle in lower(t.details))>0 or position(needle in lower(t.assignee))>0 or position(needle in lower(w.service))>0 or position(needle in lower(w.client))>0)
  and case p_timing when 'all' then true when 'overdue' then t.status='open' and t.due_date<today_cr when 'today' then t.due_date=today_cr else t.due_date>today_cr end
  and (p_after is null or (coalesce(t.due_date,date '9999-12-31'),t.id)>(cursor_due,p_after))
  order by t.due_date asc nulls last,t.id limit 21
 ) x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->'task'->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor_id,'counts',jsonb_build_object('open',open_count,'done',done_count,'overdue',overdue_count));
end $$;
create or replace function public.pro_task_center_jobs_read(p_actor uuid,p_query text default '',p_after text default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare needle text;items jsonb;cursor_id text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_query is null or length(p_query)>100 or p_after is not null and length(p_after) not between 1 and 160 then raise exception 'Invalid job-picker query' using errcode='22023';end if;
 needle:=lower(btrim(p_query));
 if p_after is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=p_after and not coalesce(cancelled,false)
 and (needle='' or position(needle in lower(service))>0 or position(needle in lower(client))>0)) then raise exception 'Job-picker cursor changed; refresh the list' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'service',w.service,'client',w.client,'start',w.start,'stage',w.stage,'cancelled',false) order by w.id),'[]'::jsonb) into items from (
  select id,service,client,start,stage from public.pro_work where user_id=p_actor and not coalesce(cancelled,false)
  and (needle='' or position(needle in lower(service))>0 or position(needle in lower(client))>0) and (p_after is null or id>p_after) order by id limit 21
 ) w;
 if jsonb_array_length(items)>20 then cursor_id:=items->19->>'id';items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_task_center_planning_read(p_actor uuid,p_status text default 'open',p_timing text default 'all',p_query text default '',p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today_cr date:=(now() at time zone 'America/Costa_Rica')::date;needle text;cursor_due date;cursor_id uuid;items jsonb;open_count integer;done_count integer;overdue_count integer;metadata jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status is null or p_status not in('open','done','all') or p_timing is null or p_timing not in('all','overdue','today','upcoming') or p_query is null or length(p_query)>100 then raise exception 'Invalid task-center query' using errcode='22023';end if;
 needle:=lower(btrim(p_query));
 -- Literal substring matching: percent/underscore never become SQL wildcards.
 select count(*) filter(where t.status='open'),count(*) filter(where t.status='done'),count(*) filter(where t.status='open' and t.due_date<today_cr)
 into open_count,done_count,overdue_count from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
 where t.owner_id=p_actor and not t.archived and public.pro_task_center_planning_matches(t,w,needle);
 if p_after is not null then
  select coalesce(t.due_date,date '9999-12-31') into cursor_due from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
  where t.owner_id=p_actor and t.id=p_after and not t.archived and (p_status='all' or t.status=p_status)
  and public.pro_task_center_planning_matches(t,w,needle)
  and case p_timing when 'all' then true when 'overdue' then t.status='open' and t.due_date<today_cr when 'today' then t.due_date=today_cr else t.due_date>today_cr end;
  if not found then raise exception 'Task-center cursor changed; refresh the list' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('task',public.pro_work_task_json(x.task),'work',jsonb_build_object('id',x.work_id,'service',x.service,'client',x.client,'stage',x.stage,'cancelled',x.cancelled)) order by (x.task).due_date asc nulls last,(x.task).id),'[]'::jsonb) into items from (
  select t as task,w.id as work_id,w.service,w.client,w.stage,coalesce(w.cancelled,false) as cancelled
  from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
  where t.owner_id=p_actor and not t.archived and (p_status='all' or t.status=p_status)
  and public.pro_task_center_planning_matches(t,w,needle)
  and case p_timing when 'all' then true when 'overdue' then t.status='open' and t.due_date<today_cr when 'today' then t.due_date=today_cr else t.due_date>today_cr end
  and (p_after is null or (coalesce(t.due_date,date '9999-12-31'),t.id)>(cursor_due,p_after))
  order by t.due_date asc nulls last,t.id limit 21
 ) x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->'task'->>'id')::uuid;items:=items-20;end if;
 -- Resolve metadata from this exact bounded page inside the same SQL snapshot.
 select coalesce(jsonb_agg(public.pro_task_center_planning_context(t) order by i.ordinality),'[]'::jsonb) into metadata
 from jsonb_array_elements(items) with ordinality i(entry,ordinality)
 join public.pro_work_tasks t on t.owner_id=p_actor and t.id=(i.entry->'task'->>'id')::uuid and t.work_id=(i.entry->'task'->>'workId');
 return jsonb_build_object('page',jsonb_build_object('items',items,'nextCursor',cursor_id,'counts',jsonb_build_object('open',open_count,'done',done_count,'overdue',overdue_count)),'context',metadata);
end $$;
-- Exact allowlist, rather than broad grants over similarly named functions.
revoke all on function public.pro_private_work_tools_enabled(uuid),public.pro_work_tasks_read(uuid,text,text,uuid,boolean,uuid),public.pro_work_tasks_mutate(uuid,jsonb),public.pro_work_updates_read(uuid,text,uuid,uuid),public.pro_work_updates_mutate(uuid,jsonb),public.pro_task_center_read(uuid,text,text,text,uuid),public.pro_task_center_jobs_read(uuid,text,text),public.pro_task_center_planning_read(uuid,text,text,text,uuid)from public,anon,authenticated;
grant execute on function public.pro_private_work_tools_enabled(uuid),public.pro_work_tasks_read(uuid,text,text,uuid,boolean,uuid),public.pro_work_tasks_mutate(uuid,jsonb),public.pro_work_updates_read(uuid,text,uuid,uuid),public.pro_work_updates_mutate(uuid,jsonb),public.pro_task_center_read(uuid,text,text,text,uuid),public.pro_task_center_jobs_read(uuid,text,text),public.pro_task_center_planning_read(uuid,text,text,text,uuid)to service_role;
commit;
notify pgrst,'reload schema';
