-- Pro row 79 (batch F): apply a SCHEDULE template with an assignee mapping in ONE transaction.
-- The existing schedule template writer (pro_schedule_templates_mutate_rules, action apply) creates phases, tasks,
-- dependencies, link rules and milestones; then the existing task writer (pro_work_tasks_mutate, action update)
-- sets each mapped «Responsable» on the tasks it just created (task history kept). Its own receipt makes the call
-- replay-safe (same actionId + same input returns the stored answer; same actionId + other input is rejected).
-- Same pattern as pro_task_template_apply_mapped (row 78, Round 10). service_role only, owner keyed, immutable receipts.
begin;
create table if not exists public.pro_schedule_template_map_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
drop trigger if exists pro_schedule_template_map_actions_immutable on public.pro_schedule_template_map_actions;
create trigger pro_schedule_template_map_actions_immutable before update or delete on public.pro_schedule_template_map_actions
 for each row when (pg_trigger_depth()=0) execute function public.pro_round10_immutable();
alter table public.pro_schedule_template_map_actions enable row level security;
revoke all on public.pro_schedule_template_map_actions from public,anon,authenticated;
grant all on public.pro_schedule_template_map_actions to service_role;

create or replace function public.pro_schedule_template_apply_mapped(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.pro_schedule_template_map_actions;inner_input jsonb;inner_result jsonb;map jsonb;k text;tid uuid;t public.pro_work_tasks;mapped integer:=0;answer jsonb;target text;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is distinct from 'apply' or jsonb_typeof(p_input->'assigneeMap') is distinct from 'object' then
  raise exception 'Invalid mapped application' using errcode='22023';end if;
 map:=p_input->'assigneeMap';
 if (select count(*) from jsonb_object_keys(map))>20 then raise exception 'Too many assignees' using errcode='22023';end if;
 for k in select key from jsonb_each(map) loop
  if length(k) not between 1 and 160 or jsonb_typeof(map->k) is distinct from 'string' or length(btrim(map->>k))>160 then
   raise exception 'Invalid assignee mapping' using errcode='22023';end if;
 end loop;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-schedule-template-map:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_schedule_template_map_actions where owner_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 inner_input:=p_input-'assigneeMap';
 inner_result:=public.pro_schedule_templates_mutate_rules(p_actor,inner_input);
 for tid in select value::uuid from jsonb_array_elements_text(p_input->'taskIds') loop
  select * into t from public.pro_work_tasks where owner_id=p_actor and id=tid;
  if t.id is null then continue;end if;
  if btrim(t.assignee)<>'' and map ? btrim(t.assignee) then
   target:=btrim(map->>btrim(t.assignee));
   if target is distinct from btrim(t.assignee) then
    perform public.pro_work_tasks_mutate(p_actor,jsonb_build_object('action','update',
     'actionId',public.pro_lead_import_uuid('pro-schedule-template-map:'||aid::text||':'||tid::text),
     'workId',t.work_id,'taskId',t.id,'revision',t.revision,'title',t.title,'details',t.details,'assignee',target,
     'dueDate',case when t.due_date is null then null else to_char(t.due_date,'YYYY-MM-DD') end));
    mapped:=mapped+1;
   end if;
  end if;
 end loop;
 answer:=jsonb_build_object('action','apply_mapped','applied',inner_result,'mapped',mapped);
 insert into public.pro_schedule_template_map_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,answer);
 return answer;
end $$;
revoke all on function public.pro_schedule_template_apply_mapped(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_schedule_template_apply_mapped(uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
