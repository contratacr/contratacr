-- LOCAL PRO ONLY. Round 4B (2026-11-13): task assignee from the Team and Gantt editing.
-- (1) pro_work_task_assignees: read-only options for the "Responsable" selector of a job task:
--     the job's team members (grants; only active contributors can be assigned, as enforced by
--     pro_team_task_assign), people of the owner's team on OTHER jobs without a grant on this
--     job (shown disabled: invite them from Team first) and the current real assignment of the
--     listed tasks. The legacy free-text `assignee` column is never changed here.
-- (2) pro_work_timeline_task_create: creates a job task and its planned period in ONE
--     transaction through the two existing writers (pro_work_tasks_mutate 'create' and
--     pro_work_schedule_mutate 'task_plan'). Idempotent: both inner action ids derive from the
--     caller's actionId, so a retry replays both receipts; the schedule revision is the CAS
--     (40001 → 409). No table is created; no notification is sent.
begin;
create or replace function public.pro_work_task_assignees(p_actor uuid,p_work text,p_tasks uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare members jsonb;others jsonb;assignments jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_tasks is null or cardinality(p_tasks)>20 or array_position(p_tasks,null) is not null then raise exception 'Invalid assignee query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('grantId',g.id,'name',g.member_name,'role',g.role,'active',g.active,
   'canAssign',g.active and g.role='contributor' and exists(select 1 from public.profiles p where p.id=g.member_user_id and not coalesce(p.is_disabled,false))) order by g.active desc,lower(g.member_name),g.id),'[]'::jsonb)
  into members from (select * from public.pro_team_grants where owner_id=p_actor and work_id=p_work order by active desc,lower(member_name),id limit 50) g;
 select coalesce(jsonb_agg(jsonb_build_object('name',o.member_name) order by lower(o.member_name)),'[]'::jsonb) into others from (
  select distinct on (g.member_user_id) g.member_user_id,g.member_name from public.pro_team_grants g
  where g.owner_id=p_actor and g.work_id<>p_work and g.active and length(btrim(g.member_name))>0
   and not exists(select 1 from public.pro_team_grants h where h.owner_id=p_actor and h.work_id=p_work and h.member_user_id=g.member_user_id)
  order by g.member_user_id,g.updated_at desc limit 20) o;
 select coalesce(jsonb_object_agg(t.id::text,public.pro_team_assignment_json(p_actor,t.id)) filter(where a.task_id is not null),'{}'::jsonb) into assignments
  from public.pro_work_tasks t left join public.pro_team_task_assignments a on a.owner_id=t.owner_id and a.task_id=t.id
  where t.owner_id=p_actor and t.work_id=p_work and t.id=any(p_tasks);
 return jsonb_build_object('workId',p_work,'members',members,'others',others,'assignments',assignments);
end $$;

create or replace function public.pro_work_timeline_task_create(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;tid uuid;wid text;task_answer jsonb;plan_answer jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid timeline task' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['action','actionId','phaseId','plannedEnd','plannedStart','revision','taskId','title','workId'] or p_input->>'action' is distinct from 'timeline_task_create'
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'taskId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string'
  or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'plannedStart') is distinct from 'string' or jsonb_typeof(p_input->'plannedEnd') is distinct from 'string'
  or jsonb_typeof(p_input->'phaseId') not in('string','null') or jsonb_typeof(p_input->'revision') is distinct from 'number' then raise exception 'Invalid timeline task fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;tid:=(p_input->>'taskId')::uuid;wid:=p_input->>'workId';
 task_answer:=public.pro_work_tasks_mutate(p_actor,jsonb_build_object('action','create','workId',wid,'taskId',tid,
  'actionId',overlay(overlay(md5('timeline-task:'||aid::text) placing '4' from 13) placing '8' from 17)::uuid,'revision',0,
  'title',p_input->>'title','details','','dueDate',null,'assignee',''));
 plan_answer:=public.pro_work_schedule_mutate(p_actor,jsonb_build_object('action','task_plan','workId',wid,'taskId',tid,
  'actionId',overlay(overlay(md5('timeline-plan:'||aid::text) placing '4' from 13) placing '8' from 17)::uuid,'revision',p_input->'revision',
  'phaseId',p_input->'phaseId','plannedStart',p_input->>'plannedStart','plannedEnd',p_input->>'plannedEnd','dependsOn','[]'::jsonb));
 return jsonb_build_object('action','timeline_task_create','workId',wid,'task',task_answer->'task','plan',plan_answer);
end $$;
revoke all on function public.pro_work_task_assignees(uuid,text,uuid[]),public.pro_work_timeline_task_create(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_work_task_assignees(uuid,text,uuid[]),public.pro_work_timeline_task_create(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
