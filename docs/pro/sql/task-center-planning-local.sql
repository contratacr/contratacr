-- LOCAL PRO ONLY. Owner read-only planning metadata alongside unchanged legacy task rows.
-- No workspace JSON, mutations, private collaboration grants or existing RPC replacements.
begin;
create or replace function public.pro_task_center_planning_matches(p_task public.pro_work_tasks,p_work public.pro_work,p_needle text) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select p_needle='' or position(p_needle in lower(p_task.title))>0 or position(p_needle in lower(p_task.details))>0 or position(p_needle in lower(p_task.assignee))>0 or position(p_needle in lower(p_work.service))>0 or position(p_needle in lower(p_work.client))>0
 or coalesce((select (a.assignment->>'active')::boolean and position(p_needle in lower(a.assignment->>'name'))>0 from(select public.pro_team_assignment_json(p_task.owner_id,p_task.id) assignment)a),false)
 or exists(select 1 from public.pro_work_schedule_plans p join public.pro_work_schedule_phases phase on phase.owner_id=p.owner_id and phase.work_id=p.work_id and phase.id=p.phase_id where p.owner_id=p_task.owner_id and p.work_id=p_task.work_id and p.task_id=p_task.id and not phase.archived and position(p_needle in lower(phase.title))>0);
$$;
create or replace function public.pro_task_center_planning_context(p_task public.pro_work_tasks) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('taskId',p_task.id,'assignment',public.pro_team_assignment_json(p_task.owner_id,p_task.id),
 'plan',(select jsonb_build_object('phaseId',p.phase_id,'phaseName',phase.title,'phaseArchived',coalesce(phase.archived,false),'plannedStart',to_char(p.planned_start,'YYYY-MM-DD'),'plannedEnd',to_char(p.planned_end,'YYYY-MM-DD'))
 from public.pro_work_schedule_plans p left join public.pro_work_schedule_phases phase on phase.owner_id=p.owner_id and phase.work_id=p.work_id and phase.id=p.phase_id where p.owner_id=p_task.owner_id and p.work_id=p_task.work_id and p.task_id=p_task.id));
$$;
create or replace function public.pro_task_center_planning_read(p_actor uuid,p_status text default 'open',p_timing text default 'all',p_query text default '',p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today_cr date:=(now() at time zone 'America/Costa_Rica')::date;needle text;cursor_due date;cursor_id uuid;items jsonb;open_count integer;done_count integer;overdue_count integer;metadata jsonb;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
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
revoke all on function public.pro_task_center_planning_matches(public.pro_work_tasks,public.pro_work,text),public.pro_task_center_planning_context(public.pro_work_tasks),public.pro_task_center_planning_read(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.pro_task_center_planning_matches(public.pro_work_tasks,public.pro_work,text),public.pro_task_center_planning_context(public.pro_work_tasks),public.pro_task_center_planning_read(uuid,text,text,text,uuid) to service_role;
commit;
