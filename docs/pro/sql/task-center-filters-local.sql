-- LOCAL PRO ONLY. Round 9 (2026-11-15): task center filters by job and by responsible person (row 15).
-- Same read as pro_task_center_planning_read (same counts, order, cursor and planning context) plus two
-- optional filters: p_work (one job) and p_assignee (a «Responsable» name, or '~none' for unassigned).
-- Counts follow the same filters so «Atrasadas» matches the list. Read only. Bulk reassign uses the
-- existing single task writer (pro_work_tasks_mutate 'update') from the app, one task at a time.
begin;
create or replace function public.pro_task_center_filtered_read(p_actor uuid,p_status text,p_timing text,p_query text,p_after uuid,p_work text,p_assignee text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today_cr date:=(now() at time zone 'America/Costa_Rica')::date;needle text;cursor_due date;cursor_id uuid;items jsonb;open_count integer;done_count integer;overdue_count integer;metadata jsonb;
begin
 -- Closing round: same access as the other job tools (private-work-tools-access-local.sql): an active Pro account
 -- without a directory profile also reads its task center (pro_task_center_read already did).
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status is null or p_status not in('open','done','all') or p_timing is null or p_timing not in('all','overdue','today','upcoming') or p_query is null or length(p_query)>100 or length(coalesce(p_work,''))>160 or length(coalesce(p_assignee,''))>161 then raise exception 'Invalid task-center query' using errcode='22023';end if;
 needle:=lower(btrim(p_query));
 -- Literal substring matching: percent/underscore never become SQL wildcards.
 select count(*) filter(where t.status='open'),count(*) filter(where t.status='done'),count(*) filter(where t.status='open' and t.due_date<today_cr)
 into open_count,done_count,overdue_count from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
 where t.owner_id=p_actor and not t.archived and public.pro_task_center_planning_matches(t,w,needle) and (p_work is null or t.work_id=p_work) and (p_assignee is null or (p_assignee='~none' and btrim(t.assignee)='') or lower(btrim(t.assignee))=lower(btrim(p_assignee)));
 if p_after is not null then
  select coalesce(t.due_date,date '9999-12-31') into cursor_due from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
  where t.owner_id=p_actor and t.id=p_after and not t.archived and (p_status='all' or t.status=p_status)
  and public.pro_task_center_planning_matches(t,w,needle) and (p_work is null or t.work_id=p_work) and (p_assignee is null or (p_assignee='~none' and btrim(t.assignee)='') or lower(btrim(t.assignee))=lower(btrim(p_assignee)))
  and case p_timing when 'all' then true when 'overdue' then t.status='open' and t.due_date<today_cr when 'today' then t.due_date=today_cr else t.due_date>today_cr end;
  if not found then raise exception 'Task-center cursor changed; refresh the list' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('task',public.pro_work_task_json(x.task),'work',jsonb_build_object('id',x.work_id,'service',x.service,'client',x.client,'stage',x.stage,'cancelled',x.cancelled)) order by (x.task).due_date asc nulls last,(x.task).id),'[]'::jsonb) into items from (
  select t as task,w.id as work_id,w.service,w.client,w.stage,coalesce(w.cancelled,false) as cancelled
  from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
  where t.owner_id=p_actor and not t.archived and (p_status='all' or t.status=p_status)
  and public.pro_task_center_planning_matches(t,w,needle) and (p_work is null or t.work_id=p_work) and (p_assignee is null or (p_assignee='~none' and btrim(t.assignee)='') or lower(btrim(t.assignee))=lower(btrim(p_assignee)))
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
-- Filter options: jobs with tasks and the responsible names in use (plus the owner and active members).
create or replace function public.pro_task_center_filter_options(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 -- Closing round: same access as the other job tools (private-work-tools-access-local.sql): an active Pro account
 -- without a directory profile also reads its task center (pro_task_center_read already did).
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'service',w.service,'client',w.client) order by w.service,w.id) from (select w.id,w.service,w.client from public.pro_work w where w.user_id=p_actor and exists(select 1 from public.pro_work_tasks t where t.owner_id=p_actor and t.work_id=w.id and not t.archived) order by w.service,w.id limit 300) w),'[]'::jsonb),
  'assignees',coalesce((select jsonb_agg(n order by lower(n)) from (select distinct on(lower(n)) n from (
     select btrim(assignee) n from public.pro_work_tasks where owner_id=p_actor and not archived and btrim(assignee)<>''
     union all select nullif(btrim(full_name),'') from public.profiles where id=p_actor
     union all select nullif(btrim(member_name),'') from public.pro_company_members where owner_id=p_actor and active) x where n is not null order by lower(n),n limit 300) y),'[]'::jsonb));
end $$;
revoke all on function public.pro_task_center_filtered_read(uuid,text,text,text,uuid,text,text),public.pro_task_center_filter_options(uuid) from public,anon,authenticated;
grant execute on function public.pro_task_center_filtered_read(uuid,text,text,text,uuid,text,text),public.pro_task_center_filter_options(uuid) to service_role;
commit;
notify pgrst,'reload schema';
