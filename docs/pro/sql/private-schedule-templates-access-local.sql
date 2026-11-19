-- LOCAL Pro only. Exactly3 owner eligibility call substitutions; graph/CAS/receipts untouched.
begin;
create or replace function public.pro_schedule_templates_read(p_actor uuid,p_status text default 'active',p_query text default '',p_after uuid default null,p_template uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare t public.pro_schedule_templates;items jsonb;cursor_id uuid;needle text;want boolean;
begin
 if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_template is not null then select * into t from pro_schedule_templates where owner_id=p_actor and id=p_template;if not found then return null;end if;return jsonb_build_object('template',pro_schedule_template_detail(t));end if;
 if p_status is null or p_status not in('active','archived') or p_query is null or length(p_query)>100 then raise exception 'Invalid query' using errcode='22023';end if;needle:=lower(btrim(p_query));want:=p_status='archived';
 if p_after is not null and not exists(select 1 from pro_schedule_templates where owner_id=p_actor and id=p_after and archived=want and(needle='' or position(needle in lower(name))>0 or position(needle in lower(notes))>0)) then raise exception 'Cursor changed' using errcode='40001';end if;
 select coalesce(jsonb_agg(pro_schedule_template_summary(x::public.pro_schedule_templates) order by x.id),'[]'::jsonb) into items from(select * from pro_schedule_templates where owner_id=p_actor and archived=want and(needle='' or position(needle in lower(name))>0 or position(needle in lower(notes))>0) and(p_after is null or id>p_after) order by id limit 21)x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_schedule_templates_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;template_key uuid;wid text;rev integer;head integer;expected_head integer;keys text[];allowed text[];t public.pro_schedule_templates;receipt public.pro_schedule_template_actions;definition jsonb;before_json jsonb;after_json jsonb;answer jsonb;preview jsonb;r jsonb;ref jsonb;task public.pro_work_tasks;plan public.pro_work_schedule_plans;phase public.pro_work_schedule_phases;milestone public.pro_work_schedule_milestones;day date;phases jsonb:='[]'::jsonb;tasks jsonb:='[]'::jsonb;milestones jsonb:='[]'::jsonb;deps jsonb;phase_map jsonb:='{}'::jsonb;task_map jsonb:='{}'::jsonb;selected_ids uuid[];new_phases uuid[];new_tasks uuid[];new_milestones uuid[];phase_actions uuid[];task_actions uuid[];plan_actions uuid[];milestone_actions uuid[];all_actions uuid[];child uuid;i integer;pos integer;includes_phases boolean;includes_deps boolean;includes_periods boolean;includes_details boolean;includes_manual boolean;includes_due boolean;includes_milestones boolean;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid operation' using errcode='22023';end if;act:=p_input->>'action';
 if act='save' then allowed:=array['action','actionId','milestones','name','notes','phases','revision','tasks','templateId'];
 elsif act='capture' then allowed:=array['action','actionId','anchorDate','includeDependencies','includeDetails','includeDueDates','includeManual','includeMilestones','includePeriods','includePhases','milestoneIds','name','notes','revision','selected','sourceRevision','sourceWorkId','templateId'];
 elsif act in('archive','restore') then allowed:=array['action','actionId','revision','templateId'];
 elsif act='apply' then allowed:=array['action','actionId','milestoneActionIds','milestoneIds','phaseActionIds','phaseIds','planActionIds','revision','startDate','taskActionIds','taskIds','templateId','workId','workRevision'];else raise exception 'Invalid action' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(p_input)k where not k=any(allowed)) or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'templateId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 0 and 2147483647 then raise exception 'Invalid identity' using errcode='22023';end if;
 if act in('save','archive','restore') and (select array_agg(key order by key) from jsonb_object_keys(p_input)key) is distinct from allowed then raise exception 'Missing fields' using errcode='22023';end if;
 if act='capture' and not p_input ?& array['action','actionId','anchorDate','milestoneIds','name','notes','revision','selected','sourceRevision','sourceWorkId','templateId'] then raise exception 'Missing capture fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;template_key:=(p_input->>'templateId')::uuid;rev:=(p_input->>'revision')::integer;
 if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-schedule-template-action:'||p_actor::text||':'||aid::text,0));
 if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into receipt from pro_schedule_template_actions where actor_id=p_actor and action_id=aid;if found then if receipt.input is distinct from p_input then raise exception 'Operation identity reused' using errcode='22023';end if;return receipt.result;end if;
 if act='apply' then
  for keys in select array_agg(key order by key) from jsonb_object_keys(p_input)key loop if keys is distinct from allowed then raise exception 'Invalid apply fields' using errcode='22023';end if;end loop;
  if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 or not coalesce((p_input->>'workRevision')~'^[0-9]{1,10}$',false) or (p_input->>'workRevision')::numeric not between 0 and 2147483646 then raise exception 'Invalid target' using errcode='22023';end if;
  wid:=p_input->>'workId';expected_head:=(p_input->>'workRevision')::integer;

  for r in select jsonb_build_object('key',k) from unnest(array['phaseIds','phaseActionIds','taskIds','taskActionIds','planActionIds','milestoneIds','milestoneActionIds'])k loop
   if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p_input->(r->>'key'))='array' then p_input->(r->>'key') else '[]'::jsonb end)x where jsonb_typeof(x) is distinct from 'string') or jsonb_typeof(p_input->(r->>'key')) is distinct from 'array' or jsonb_array_length(p_input->(r->>'key'))>100 or (select count(*)<>count(distinct value) from jsonb_array_elements_text(p_input->(r->>'key'))) then raise exception 'Invalid child identities' using errcode='22023';end if;
  end loop;
  select coalesce(array_agg(value::uuid order by ord),'{}'::uuid[]) into new_phases from jsonb_array_elements_text(p_input->'phaseIds')with ordinality x(value,ord);select coalesce(array_agg(value::uuid order by ord),'{}'::uuid[]) into new_tasks from jsonb_array_elements_text(p_input->'taskIds')with ordinality x(value,ord);select coalesce(array_agg(value::uuid order by ord),'{}'::uuid[]) into new_milestones from jsonb_array_elements_text(p_input->'milestoneIds')with ordinality x(value,ord);
  select coalesce(array_agg(value::uuid order by ord),'{}'::uuid[]) into phase_actions from jsonb_array_elements_text(p_input->'phaseActionIds')with ordinality x(value,ord);select coalesce(array_agg(value::uuid order by ord),'{}'::uuid[]) into task_actions from jsonb_array_elements_text(p_input->'taskActionIds')with ordinality x(value,ord);select coalesce(array_agg(value::uuid order by ord),'{}'::uuid[]) into plan_actions from jsonb_array_elements_text(p_input->'planActionIds')with ordinality x(value,ord);select coalesce(array_agg(value::uuid order by ord),'{}'::uuid[]) into milestone_actions from jsonb_array_elements_text(p_input->'milestoneActionIds')with ordinality x(value,ord);
  all_actions:=phase_actions||task_actions||plan_actions||milestone_actions;
  if cardinality(all_actions)<>(select count(distinct a) from unnest(all_actions)a) or aid=any(all_actions) then raise exception 'Repeated action identities' using errcode='22023';end if;
  -- Acquire child action namespaces BEFORE the work lock: old writers use this order.
  for child in select unnest(task_actions) order by 1 loop perform pg_advisory_xact_lock(hashtextextended('pro-work-task-action:'||p_actor::text||':'||child::text,0));end loop;
  for child in select unnest(phase_actions||plan_actions||milestone_actions) order by 1 loop perform pg_advisory_xact_lock(hashtextextended('pro-work-schedule-action:'||p_actor::text||':'||child::text,0));end loop;
 elsif act='capture' then
  if jsonb_typeof(p_input->'sourceWorkId') is distinct from 'string' or length(p_input->>'sourceWorkId') not between 1 and 160 or not coalesce((p_input->>'sourceRevision')~'^[0-9]{1,10}$',false) or(p_input->>'sourceRevision')::numeric not between 0 and 2147483647 or rev<>0 or jsonb_typeof(p_input->'selected') is distinct from 'array' or jsonb_array_length(p_input->'selected')>100 or jsonb_typeof(p_input->'milestoneIds') is distinct from 'array' or jsonb_array_length(p_input->'milestoneIds')>100 then raise exception 'Invalid source' using errcode='22023';end if;
  wid:=p_input->>'sourceWorkId';expected_head:=(p_input->>'sourceRevision')::integer;
 end if;
 if act in('capture','apply') then
  perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||wid,0));perform 1 from pro_work where user_id=p_actor and id=wid for share;if not found then raise exception 'Forbidden' using errcode='42501';end if;
  select revision into head from pro_work_schedule_heads where owner_id=p_actor and work_id=wid for update;head:=coalesce(head,0);if head<>expected_head then raise exception 'Plan changed' using errcode='40001';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-schedule-template-definition:'||p_actor::text||':'||template_key::text,0));
 select * into t from pro_schedule_templates where owner_id=p_actor and id=template_key for update;
 if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if found then
  if rev=0 or t.revision<>rev or act='capture' then raise exception 'Template changed' using errcode='40001';end if;before_json:=pro_schedule_template_detail(t);
  if t.archived and act not in('restore') or not t.archived and act='restore' then raise exception 'Template status changed' using errcode='40001';end if;
 elsif rev<>0 or act not in('save','capture') then raise exception 'Forbidden' using errcode='42501';end if;
 if act='apply' then
  preview:=pro_schedule_template_preview(p_actor,template_key,wid,p_input->>'startDate');definition:=pro_schedule_template_detail(t);
  if cardinality(new_phases)<>jsonb_array_length(preview->'phases') or cardinality(phase_actions)<>cardinality(new_phases) or cardinality(new_tasks)<>jsonb_array_length(preview->'tasks') or cardinality(task_actions)<>cardinality(new_tasks) or cardinality(plan_actions)<>cardinality(new_tasks) or cardinality(new_milestones)<>jsonb_array_length(preview->'milestones') or cardinality(milestone_actions)<>cardinality(new_milestones) then raise exception 'Definition changed' using errcode='40001';end if;
  if head::bigint+cardinality(new_phases)+cardinality(new_tasks)+cardinality(new_milestones)>2147483647 then raise exception 'Revision exhausted' using errcode='40001';end if;
  if exists(select 1 from pro_work_tasks where owner_id=p_actor and id=any(new_tasks)) or exists(select 1 from pro_work_schedule_phases where owner_id=p_actor and work_id=wid and id=any(new_phases)) or exists(select 1 from pro_work_schedule_milestones where owner_id=p_actor and work_id=wid and id=any(new_milestones)) or exists(select 1 from pro_work_task_actions where actor_id=p_actor and action_id=any(task_actions)) or exists(select 1 from pro_work_schedule_actions where actor_id=p_actor and action_id=any(phase_actions||plan_actions||milestone_actions)) then raise exception 'Child identity already used' using errcode='40001';end if;
  before_json:=jsonb_build_object('template',definition,'revision',head,'existingCount',preview->'existingCount','existingPhaseCount',preview->'existingPhaseCount','existingMilestoneCount',preview->'existingMilestoneCount');
  i:=0;for r in select value from jsonb_array_elements(preview->'phases') loop i:=i+1;phase_map:=phase_map||jsonb_build_object(r->>'id',new_phases[i]);end loop;
  i:=0;for r in select value from jsonb_array_elements(preview->'tasks') loop i:=i+1;task_map:=task_map||jsonb_build_object(r->>'id',new_tasks[i]);perform pro_work_tasks_mutate(p_actor,jsonb_build_object('action','create','actionId',task_actions[i],'workId',wid,'taskId',new_tasks[i],'revision',0,'title',r->'title','details',r->'details','assignee',r->'assignee','dueDate',r->'dueDate'));end loop;
  i:=0;for r in select value from jsonb_array_elements(preview->'phases') loop i:=i+1;perform pro_work_schedule_mutate(p_actor,jsonb_build_object('action','phase_save','actionId',phase_actions[i],'workId',wid,'revision',head,'phaseId',new_phases[i],'title',r->'title','position',r->'position'));head:=head+1;end loop;
  i:=0;for r in select value from jsonb_array_elements(preview->'tasks') loop i:=i+1;select coalesce(jsonb_agg(task_map->value),'[]'::jsonb) into deps from jsonb_array_elements_text(r->'dependsOn');perform pro_work_schedule_mutate(p_actor,jsonb_build_object('action','task_plan','actionId',plan_actions[i],'workId',wid,'revision',head,'taskId',new_tasks[i],'phaseId',phase_map->(r->>'phaseId'),'plannedStart',r->'plannedStart','plannedEnd',r->'plannedEnd','dependsOn',deps));head:=head+1;end loop;
  i:=0;for r in select value from jsonb_array_elements(preview->'milestones') loop i:=i+1;perform pro_work_milestones_mutate(p_actor,jsonb_build_object('action','milestone_save','actionId',milestone_actions[i],'workId',wid,'revision',head,'milestoneId',new_milestones[i],'title',r->'title','date',r->'date','notes',r->'notes'));head:=head+1;end loop;
  answer:=jsonb_build_object('action','apply','templateId',template_key,'templateRevision',t.revision,'workId',wid,'revision',head,'phaseIds',to_jsonb(new_phases),'taskIds',to_jsonb(new_tasks),'milestoneIds',to_jsonb(new_milestones));after_json:=answer;
 else
  if rev>=2147483647 then raise exception 'Revision exhausted' using errcode='40001';end if;
  if act in('save','capture') then
   if jsonb_typeof(p_input->'name') is distinct from 'string' or length(btrim(p_input->>'name')) not between 1 and 80 or jsonb_typeof(p_input->'notes') is distinct from 'string' or length(p_input->>'notes')>1000 then raise exception 'Invalid name' using errcode='22023';end if;
   if act='save' then definition:=jsonb_build_object('phases',p_input->'phases','tasks',p_input->'tasks','milestones',p_input->'milestones');else
    if not coalesce((p_input->>'anchorDate')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid anchor' using errcode='22023';end if;day:=(p_input->>'anchorDate')::date;if day not between date'1900-01-01' and date'2100-12-31' then raise exception 'Invalid anchor' using errcode='22023';end if;
    foreach wid in array array['includePhases','includeDependencies','includePeriods','includeDetails','includeManual','includeDueDates','includeMilestones'] loop if p_input?wid and jsonb_typeof(p_input->wid) is distinct from 'boolean' then raise exception 'Invalid capture flag' using errcode='22023';end if;end loop;wid:=p_input->>'sourceWorkId';
    includes_phases:=coalesce((p_input->>'includePhases')::boolean,true);includes_deps:=coalesce((p_input->>'includeDependencies')::boolean,true);includes_periods:=coalesce((p_input->>'includePeriods')::boolean,true);includes_details:=coalesce((p_input->>'includeDetails')::boolean,false);includes_manual:=coalesce((p_input->>'includeManual')::boolean,false);includes_due:=coalesce((p_input->>'includeDueDates')::boolean,false);includes_milestones:=coalesce((p_input->>'includeMilestones')::boolean,true);
    select coalesce(array_agg((value->>'taskId')::uuid),'{}'::uuid[]) into selected_ids from jsonb_array_elements(p_input->'selected');if cardinality(selected_ids)<>(select count(distinct x) from unnest(selected_ids)x) then raise exception 'Duplicate source task' using errcode='22023';end if;
    if includes_phases then for phase in select * from pro_work_schedule_phases where owner_id=p_actor and work_id=wid and not archived order by position,id loop phases:=phases||jsonb_build_array(jsonb_build_object('id',phase.id,'title',phase.title,'position',phase.position));end loop;end if;
    for ref in select value from jsonb_array_elements(p_input->'selected') loop
     if (select array_agg(key order by key) from jsonb_object_keys(ref)key) is distinct from array['revision','taskId'] or not coalesce((ref->>'revision')~'^[0-9]{1,10}$',false) then raise exception 'Invalid source reference' using errcode='22023';end if;
     select * into task from pro_work_tasks where owner_id=p_actor and work_id=wid and id=(ref->>'taskId')::uuid and not archived for share;if not found or task.revision::numeric<>(ref->>'revision')::numeric then raise exception 'Source task changed' using errcode='40001';end if;
     select * into plan from pro_work_schedule_plans where owner_id=p_actor and work_id=wid and task_id=task.id;
     if includes_phases and plan.phase_id is not null and not exists(select 1 from pro_work_schedule_phases where owner_id=p_actor and work_id=wid and id=plan.phase_id and not archived) then raise exception 'Source phase archived' using errcode='40001';end if;
     deps:='[]'::jsonb;if includes_deps then
      if exists(select 1 from pro_work_schedule_dependencies d left join pro_work_tasks x on x.owner_id=d.owner_id and x.work_id=d.work_id and x.id=d.predecessor_id where d.owner_id=p_actor and d.work_id=wid and d.task_id=task.id and(not d.predecessor_id=any(selected_ids) or x.id is null or x.archived)) then raise exception 'Include all available predecessors or disable dependency copying' using errcode='40001';end if;
      select coalesce(jsonb_agg(predecessor_id order by predecessor_id),'[]'::jsonb) into deps from pro_work_schedule_dependencies where owner_id=p_actor and work_id=wid and task_id=task.id;
     end if;
     tasks:=tasks||jsonb_build_array(jsonb_build_object('id',task.id,'title',task.title,'details',case when includes_details then task.details else '' end,'assignee',case when includes_manual then task.assignee else '' end,'dueOffset',case when includes_due then task.due_date-day else null end,'phaseId',case when includes_phases then plan.phase_id else null end,'startOffset',case when includes_periods then plan.planned_start-day else null end,'endOffset',case when includes_periods then plan.planned_end-day else null end,'dependsOn',deps));
    end loop;
    if includes_milestones then
     if (select count(*)<>count(distinct value) from jsonb_array_elements_text(p_input->'milestoneIds')) then raise exception 'Duplicate milestone' using errcode='22023';end if;
     for ref in select value from jsonb_array_elements(p_input->'milestoneIds') loop select * into milestone from pro_work_schedule_milestones where owner_id=p_actor and work_id=wid and id=(ref#>>'{}')::uuid and not archived;if not found then raise exception 'Milestone changed' using errcode='40001';end if;milestones:=milestones||jsonb_build_array(jsonb_build_object('id',milestone.id,'title',milestone.title,'offset',milestone.milestone_date-day,'notes',case when includes_details then milestone.notes else '' end));end loop;
    end if;
    definition:=jsonb_build_object('phases',phases,'tasks',tasks,'milestones',milestones);
   end if;
   perform pro_schedule_template_validate(definition);
   insert into pro_schedule_templates(owner_id,id,name,notes,revision) values(p_actor,template_key,btrim(p_input->>'name'),btrim(p_input->>'notes'),rev+1) on conflict(owner_id,id) do update set name=excluded.name,notes=excluded.notes,revision=excluded.revision returning * into t;
   delete from pro_schedule_template_dependencies where owner_id=p_actor and template_id=template_key;delete from pro_schedule_template_tasks where owner_id=p_actor and template_id=template_key;delete from pro_schedule_template_phases where owner_id=p_actor and template_id=template_key;delete from pro_schedule_template_milestones where owner_id=p_actor and template_id=template_key;
   for r in select value from jsonb_array_elements(definition->'phases') loop insert into pro_schedule_template_phases values(p_actor,template_key,(r->>'id')::uuid,btrim(r->>'title'),(r->>'position')::integer);end loop;
   pos:=0;for r in select value from jsonb_array_elements(definition->'tasks') loop insert into pro_schedule_template_tasks values(p_actor,template_key,(r->>'id')::uuid,pos,btrim(r->>'title'),btrim(r->>'details'),btrim(r->>'assignee'),(r->>'dueOffset')::integer,(r->>'phaseId')::uuid,(r->>'startOffset')::integer,(r->>'endOffset')::integer);pos:=pos+1;end loop;
   for r in select value from jsonb_array_elements(definition->'tasks') loop insert into pro_schedule_template_dependencies select p_actor,template_key,(r->>'id')::uuid,value::uuid from jsonb_array_elements_text(r->'dependsOn');end loop;
   pos:=0;for r in select value from jsonb_array_elements(definition->'milestones') loop insert into pro_schedule_template_milestones values(p_actor,template_key,(r->>'id')::uuid,pos,btrim(r->>'title'),(r->>'offset')::integer,btrim(r->>'notes'));pos:=pos+1;end loop;
  else update pro_schedule_templates set archived=(act='archive'),revision=revision+1 where owner_id=p_actor and id=template_key returning * into t;end if;
  answer:=jsonb_build_object('action',act,'template',pro_schedule_template_summary(t));after_json:=pro_schedule_template_detail(t);
 end if;
 if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into pro_schedule_template_actions(actor_id,action_id,template_id,input,result,before_state,after_state) values(p_actor,aid,template_key,p_input,answer,before_json,after_json);return answer;
end $$;
create or replace function public.pro_schedule_template_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_schedule_template_actions;begin if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;select * into r from pro_schedule_template_actions where actor_id=p_actor and action_id=p_action;if not found then return jsonb_build_object('receipt',null);end if;return jsonb_build_object('receipt',jsonb_build_object('input',r.input,'result',r.result));end $$;
revoke all on function public.pro_schedule_templates_read(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_schedule_templates_read(uuid,text,text,uuid,uuid) to service_role;
revoke all on function public.pro_schedule_templates_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_schedule_templates_mutate(uuid,jsonb) to service_role;
revoke all on function public.pro_schedule_template_action_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_schedule_template_action_read(uuid,uuid) to service_role;
commit;
notify pgrst, 'reload schema';
