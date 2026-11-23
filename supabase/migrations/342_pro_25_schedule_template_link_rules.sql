-- Row 79 (schedule templates): link rules (finish->start / start->start with lag) are saved in templates, survive template
-- edits and are copied to the job when the template is applied. All in the same transaction as the existing writers
-- (thin wrappers call the existing functions; nothing already applied is rewritten).
create table if not exists public.pro_schedule_template_link_rules(
 owner_id uuid not null,template_id uuid not null,task_id uuid not null,predecessor_id uuid not null,
 kind text not null default 'fs' check(kind in('fs','ss')),lag_days integer not null default 0 check(lag_days between -60 and 365),
 primary key(owner_id,template_id,task_id,predecessor_id),
 foreign key(owner_id,template_id,task_id,predecessor_id) references public.pro_schedule_template_dependencies(owner_id,template_id,task_id,predecessor_id) on delete cascade);
alter table public.pro_schedule_template_link_rules enable row level security;
revoke all on public.pro_schedule_template_link_rules from public,anon,authenticated;
grant select,insert,update,delete on public.pro_schedule_template_link_rules to service_role;

create or replace function public.pro_schedule_template_detail(p_template public.pro_schedule_templates) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.pro_schedule_template_summary(p_template)||jsonb_build_object(
 'phases',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'position',position) order by position,id) from pro_schedule_template_phases where owner_id=p_template.owner_id and template_id=p_template.id),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'details',t.details,'assignee',t.assignee,'dueOffset',t.due_offset,'phaseId',t.phase_id,'startOffset',t.start_offset,'endOffset',t.end_offset,'dependsOn',coalesce((select jsonb_agg(d.predecessor_id order by d.predecessor_id) from pro_schedule_template_dependencies d where d.owner_id=t.owner_id and d.template_id=t.template_id and d.task_id=t.id),'[]'::jsonb)) order by t.position) from pro_schedule_template_tasks t where t.owner_id=p_template.owner_id and t.template_id=p_template.id),'[]'::jsonb),
 'milestones',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'offset',offset_days,'notes',notes) order by position) from pro_schedule_template_milestones where owner_id=p_template.owner_id and template_id=p_template.id),'[]'::jsonb))
 ||coalesce((select jsonb_build_object('rules',jsonb_agg(jsonb_build_object('taskId',r.task_id,'predecessorId',r.predecessor_id,'kind',r.kind,'lagDays',r.lag_days) order by r.task_id,r.predecessor_id)) from public.pro_schedule_template_link_rules r where r.owner_id=p_template.owner_id and r.template_id=p_template.id having count(*)>0),'{}'::jsonb);
$$;

-- Sets ALL link rules of a template in one step (CAS on the template revision, idempotent receipt).
create or replace function public.pro_schedule_template_rules_set(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;template_key uuid;rev integer;t public.pro_schedule_templates;receipt public.pro_schedule_template_actions;e jsonb;rk text[];before_json jsonb;answer jsonb;tid uuid;pid uuid;seen text[]:=array[]::text[];lag integer;kind text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid schedule template' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if p_input->>'action' is distinct from 'rules' or keys is distinct from array['action','actionId','revision','rules','templateId'] or jsonb_typeof(p_input->'rules') is distinct from 'array' or jsonb_array_length(p_input->'rules')>500 then raise exception 'Invalid template rules' using errcode='22023';end if;
 if jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'templateId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) or (p_input->>'revision')::integer<1 then raise exception 'Invalid template identity' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;template_key:=(p_input->>'templateId')::uuid;rev:=(p_input->>'revision')::integer;
 perform pg_advisory_xact_lock(hashtextextended('pro-schedule-template-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_schedule_template_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Template action identity reused' using errcode='22023';end if;return receipt.result;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-schedule-template-definition:'||p_actor::text||':'||template_key::text,0));
 select * into t from public.pro_schedule_templates where owner_id=p_actor and id=template_key for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if t.revision<>rev or t.archived then raise exception 'Template changed' using errcode='40001';end if;
 before_json:=public.pro_schedule_template_detail(t);
 delete from public.pro_schedule_template_link_rules where owner_id=p_actor and template_id=template_key;
 for e in select value from jsonb_array_elements(p_input->'rules') loop
  select array_agg(key order by key) into rk from jsonb_object_keys(e)key;
  if rk is distinct from array['kind','lagDays','predecessorId','taskId'] or jsonb_typeof(e->'taskId') is distinct from 'string' or jsonb_typeof(e->'predecessorId') is distinct from 'string' or jsonb_typeof(e->'kind') is distinct from 'string' or jsonb_typeof(e->'lagDays') is distinct from 'number' or not coalesce((e->>'lagDays')~'^-?[0-9]{1,3}$',false) then raise exception 'Invalid rule' using errcode='22023';end if;
  tid:=(e->>'taskId')::uuid;pid:=(e->>'predecessorId')::uuid;kind:=e->>'kind';lag:=(e->>'lagDays')::integer;
  if kind not in('fs','ss') or lag not between -60 and 365 then raise exception 'Invalid rule' using errcode='22023';end if;
  if (tid::text||':'||pid::text)=any(seen) then raise exception 'Repeated rule' using errcode='22023';end if;seen:=array_append(seen,tid::text||':'||pid::text);
  if not exists(select 1 from public.pro_schedule_template_dependencies d where d.owner_id=p_actor and d.template_id=template_key and d.task_id=tid and d.predecessor_id=pid) then raise exception 'Rule without dependency' using errcode='22023';end if;
  insert into public.pro_schedule_template_link_rules(owner_id,template_id,task_id,predecessor_id,kind,lag_days) values(p_actor,template_key,tid,pid,kind,lag);
 end loop;
 update public.pro_schedule_templates set revision=revision+1 where owner_id=p_actor and id=template_key returning * into t;
 answer:=jsonb_build_object('action','rules','template',public.pro_schedule_template_summary(t));
 insert into public.pro_schedule_template_actions(actor_id,action_id,template_id,input,result,before_state,after_state) values(p_actor,aid,template_key,p_input,answer,before_json,public.pro_schedule_template_detail(t));
 return answer;
end $$;

-- Wrapper of the existing writer: keeps template rules across 'save' (which rewrites tasks and dependencies) and copies them to
-- the job on 'apply', atomically with the original operation.
create or replace function public.pro_schedule_templates_mutate_rules(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;template_key uuid;saved jsonb:='[]'::jsonb;answer jsonb;wid text;ids jsonb;r record;tasks jsonb;tpl public.pro_schedule_templates;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then return public.pro_schedule_templates_mutate(p_actor,p_input);end if;
 act:=p_input->>'action';
 if act='save' and jsonb_typeof(p_input->'templateId')='string' and (p_input->>'templateId')~'^[0-9a-fA-F-]{36}$' then
  template_key:=(p_input->>'templateId')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object('t',task_id,'p',predecessor_id,'k',kind,'l',lag_days)),'[]'::jsonb) into saved from public.pro_schedule_template_link_rules where owner_id=p_actor and template_id=template_key;
 end if;
 answer:=public.pro_schedule_templates_mutate(p_actor,p_input);
 if act='save' and jsonb_array_length(saved)>0 then
  insert into public.pro_schedule_template_link_rules(owner_id,template_id,task_id,predecessor_id,kind,lag_days)
   select p_actor,template_key,(e->>'t')::uuid,(e->>'p')::uuid,e->>'k',(e->>'l')::integer from jsonb_array_elements(saved) e
   where exists(select 1 from public.pro_schedule_template_dependencies d where d.owner_id=p_actor and d.template_id=template_key and d.task_id=(e->>'t')::uuid and d.predecessor_id=(e->>'p')::uuid)
   on conflict do nothing;
 elsif act='apply' and answer->>'action'='apply' then
  template_key:=(answer->>'templateId')::uuid;wid:=answer->>'workId';ids:=answer->'taskIds';
  select * into tpl from public.pro_schedule_templates where owner_id=p_actor and id=template_key;
  tasks:=coalesce((select jsonb_agg(v.value->>'id' order by v.ord) from jsonb_array_elements(public.pro_schedule_template_detail(tpl)->'tasks') with ordinality v(value,ord)),'[]'::jsonb);
  for r in select lr.task_id,lr.predecessor_id,lr.kind,lr.lag_days from public.pro_schedule_template_link_rules lr where lr.owner_id=p_actor and lr.template_id=template_key loop
   insert into public.pro_schedule_link_rules(owner_id,work_id,task_id,predecessor_id,kind,lag_days)
    select p_actor,wid,(ids->>(a.ord-1)::integer)::uuid,(ids->>(b.ord-1)::integer)::uuid,r.kind,r.lag_days
    from jsonb_array_elements_text(tasks) with ordinality a(v,ord),jsonb_array_elements_text(tasks) with ordinality b(v,ord)
    where a.v=r.task_id::text and b.v=r.predecessor_id::text
    on conflict do nothing;
  end loop;
 end if;
 return answer;
end $$;
revoke all on function public.pro_schedule_template_detail(public.pro_schedule_templates),public.pro_schedule_template_rules_set(uuid,jsonb),public.pro_schedule_templates_mutate_rules(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_schedule_template_detail(public.pro_schedule_templates),public.pro_schedule_template_rules_set(uuid,jsonb),public.pro_schedule_templates_mutate_rules(uuid,jsonb) to service_role;
