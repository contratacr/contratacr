-- LOCAL PRO ONLY. Bounded civil timeline, read-only normalized tasks/plans/milestones.
-- No existing function changes, data backfill, workspace reads or scheduling writes.
begin;
create or replace function public.pro_work_timeline_item_json(p_task public.pro_work_tasks) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('task',jsonb_build_object('id',p_task.id,'title',p_task.title,'status',p_task.status,'dueDate',case when p_task.due_date is null then null else to_char(p_task.due_date,'YYYY-MM-DD') end,'revision',p_task.revision),
 'plan',public.pro_work_schedule_plan_json(p_task.owner_id,p_task.work_id,p_task.id),
 'dependencies',coalesce((select jsonb_agg(jsonb_build_object('taskId',d.predecessor_id,'title',case when not dt.archived then dt.title else null end,'status',case when not dt.archived then dt.status else null end,'available',coalesce(not dt.archived,false)) order by d.predecessor_id)
 from public.pro_work_schedule_dependencies d left join public.pro_work_tasks dt on dt.owner_id=d.owner_id and dt.work_id=d.work_id and dt.id=d.predecessor_id where d.owner_id=p_task.owner_id and d.work_id=p_task.work_id and d.task_id=p_task.id),'[]'::jsonb));
$$;
create or replace function public.pro_work_timeline_read(p_actor uuid,p_work text default null,p_grant uuid default null,p_from text default null,p_to text default null,p_after text default null,p_revision integer default null,p_snapshot text default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare own uuid;wid text;g public.pro_team_grants;first_day date;last_day date;rev integer;items jsonb;phases jsonb;cursor_id uuid;cursor_kind integer;cursor_day date;next_cursor text;planned_count bigint;milestone_count bigint;unscheduled_count bigint;snapshot_token text;
begin
 if p_grant is not null then
  if p_work is not null then raise exception 'Ambiguous timeline scope' using errcode='22023';end if;
  g:=public.pro_team_context(p_actor,p_grant,false);own:=g.owner_id;wid:=g.work_id;
 else perform public.pro_work_schedule_owner(p_actor,p_work);own:=p_actor;wid:=p_work;end if;
 if p_from is null or p_to is null or not p_from~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not p_to~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid timeline dates' using errcode='22023';end if;
 first_day:=p_from::date;last_day:=p_to::date;
 if first_day not between date'1900-01-01' and date'2100-12-31' or last_day not between date'1900-01-01' and date'2100-12-31' or last_day-first_day not between 0 and 92 then raise exception 'Invalid timeline window' using errcode='22023';end if;
 select revision into rev from public.pro_work_schedule_heads where owner_id=own and work_id=wid;rev:=coalesce(rev,0);
 -- Hash only identity/revision/archive state, never private task content. All tasks
 -- also cover unscheduled totals and new/archived tasks between pages.
 select md5(own::text||':'||length(wid)::text||':'||wid||':'||p_from||':'||p_to||':'||rev::text||':'||coalesce(string_agg(t.id::text||':'||t.revision::text||':'||t.archived::text,',' order by t.id),'')) into snapshot_token from public.pro_work_tasks t where t.owner_id=own and t.work_id=wid;
 if p_snapshot is not null and not p_snapshot~'^[a-f0-9]{32}$' or p_after is not null and p_snapshot is null then raise exception 'Missing timeline snapshot' using errcode='22023';end if;
 if p_snapshot is not null and p_snapshot<>snapshot_token then raise exception 'Timeline tasks changed' using errcode='40001';end if;
 if p_revision is not null and p_revision<0 or p_after is not null and p_revision is null then raise exception 'Missing timeline revision' using errcode='22023';end if;
 if p_revision is not null and p_revision<>rev then raise exception 'Timeline changed' using errcode='40001';end if;
 if p_after is not null then
  if length(p_after)>48 or not p_after~'^(task|milestone):[a-fA-F0-9-]{36}$' then raise exception 'Invalid timeline cursor' using errcode='22023';end if;
  cursor_id:=split_part(p_after,':',2)::uuid;
  if split_part(p_after,':',1)='task' then
   cursor_kind:=0;
   select p.planned_start into cursor_day from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id
   where p.owner_id=own and p.work_id=wid and p.task_id=cursor_id and not t.archived and p.planned_start<=last_day and p.planned_end>=first_day;
  else
   cursor_kind:=1;
   select milestone_date into cursor_day from public.pro_work_schedule_milestones where owner_id=own and work_id=wid and id=cursor_id and not archived and milestone_date between first_day and last_day;
  end if;
  if not found then raise exception 'Timeline cursor changed; reload' using errcode='40001';end if;
 end if;
 select count(*) into planned_count from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id where p.owner_id=own and p.work_id=wid and not t.archived and p.planned_start<=last_day and p.planned_end>=first_day;
 select count(*) into milestone_count from public.pro_work_schedule_milestones where owner_id=own and work_id=wid and not archived and milestone_date between first_day and last_day;
 select count(*) into unscheduled_count from public.pro_work_tasks t left join public.pro_work_schedule_plans p on p.owner_id=t.owner_id and p.work_id=t.work_id and p.task_id=t.id where t.owner_id=own and t.work_id=wid and not t.archived and p.planned_start is null;
 select coalesce(jsonb_agg(entry order by source_day,kind,id),'[]'::jsonb) into items from(
  select * from(
   select p.planned_start source_day,0 kind,t.id,jsonb_build_object('kind','task','id',t.id,'item',public.pro_work_timeline_item_json(t),
    'visibleStart',to_char(greatest(p.planned_start,first_day),'YYYY-MM-DD'),'visibleEnd',to_char(least(p.planned_end,last_day),'YYYY-MM-DD'),'clippedStart',p.planned_start<first_day,'clippedEnd',p.planned_end>last_day) entry
   from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id
   where p.owner_id=own and p.work_id=wid and not t.archived and p.planned_start<=last_day and p.planned_end>=first_day
   union all
   select m.milestone_date,1,m.id,jsonb_build_object('kind','milestone','id',m.id,'milestone',public.pro_work_milestone_json(m),
    'visibleStart',to_char(m.milestone_date,'YYYY-MM-DD'),'visibleEnd',to_char(m.milestone_date,'YYYY-MM-DD'),'clippedStart',false,'clippedEnd',false)
   from public.pro_work_schedule_milestones m where m.owner_id=own and m.work_id=wid and not m.archived and m.milestone_date between first_day and last_day
  ) entries where p_after is null or(source_day,kind,id)>(cursor_day,cursor_kind,cursor_id) order by source_day,kind,id limit 21
 ) limited;
 if jsonb_array_length(items)>20 then next_cursor:=(items->19->>'kind')||':'||(items->19->>'id');items:=items-20;end if;
 select coalesce(jsonb_agg(public.pro_work_schedule_phase_json(p::public.pro_work_schedule_phases) order by p.position,p.id),'[]'::jsonb) into phases from(select * from public.pro_work_schedule_phases where owner_id=own and work_id=wid and not archived order by position,id limit 50)p;
 return jsonb_build_object('workId',wid,'revision',rev,'snapshotToken',snapshot_token,'window',jsonb_build_object('from',p_from,'to',p_to,'days',last_day-first_day+1),'phases',phases,'items',items,'nextCursor',next_cursor,'counts',jsonb_build_object('plannedTasks',planned_count,'milestones',milestone_count,'unscheduledTasks',unscheduled_count));
end $$;
revoke all on function public.pro_work_timeline_item_json(public.pro_work_tasks),public.pro_work_timeline_read(uuid,text,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.pro_work_timeline_item_json(public.pro_work_tasks),public.pro_work_timeline_read(uuid,text,uuid,text,text,text,integer,text) to service_role;
commit;
