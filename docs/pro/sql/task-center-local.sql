-- LOCAL PRO ONLY. Read-only cross-job task center and job picker.
-- Reuses normalized tasks/jobs, does not create, migrate or update any record.
begin;
create index if not exists pro_task_center_owner_due_page on public.pro_work_tasks(owner_id,due_date asc nulls last,id) where not archived;
create or replace function public.pro_task_center_read(p_actor uuid,p_status text default 'open',p_timing text default 'all',p_query text default '',p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today_cr date:=(now() at time zone 'America/Costa_Rica')::date;needle text;cursor_due date;cursor_id uuid;items jsonb;open_count integer;done_count integer;overdue_count integer;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
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
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
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
revoke all on function public.pro_task_center_read(uuid,text,text,text,uuid),public.pro_task_center_jobs_read(uuid,text,text) from public,anon,authenticated;
grant execute on function public.pro_task_center_read(uuid,text,text,text,uuid),public.pro_task_center_jobs_read(uuid,text,text) to service_role;
commit;
