-- Row 78 (task templates): tags and "add to an existing template" from a task selection.
-- Tags live in their own table; the summary shows them ONLY when a template has some (existing readers/receipts unchanged).
begin;
create table if not exists public.pro_task_template_tags(
 owner_id uuid not null,template_id uuid not null,tag text not null check(length(tag) between 1 and 30 and tag=btrim(tag) and tag !~ '[[:cntrl:]]'),
 primary key(owner_id,template_id,tag),
 foreign key(owner_id,template_id) references public.pro_task_templates(owner_id,id) on delete cascade
);
create unique index if not exists pro_task_template_tags_lower on public.pro_task_template_tags(owner_id,template_id,lower(tag));
alter table public.pro_task_template_tags enable row level security;
revoke all on public.pro_task_template_tags from public,anon,authenticated;
grant select,insert,update,delete on public.pro_task_template_tags to service_role;

create or replace function public.pro_task_template_summary(p_template public.pro_task_templates) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_template.id,'name',p_template.name,'notes',p_template.notes,'revision',p_template.revision,'archived',p_template.archived,'count',(select count(*) from public.pro_task_template_rows where owner_id=p_template.owner_id and template_id=p_template.id))
 ||coalesce((select jsonb_build_object('tags',jsonb_agg(g.tag order by lower(g.tag))) from public.pro_task_template_tags g where g.owner_id=p_template.owner_id and g.template_id=p_template.id having count(*)>0),'{}'::jsonb);
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
 if p_after is not null and not exists(select 1 from public.pro_task_templates where owner_id=p_actor and id=p_after and archived=want_archived and(needle='' or position(needle in lower(name))>0 or position(needle in lower(notes))>0 or exists(select 1 from public.pro_task_template_tags g where g.owner_id=p_actor and g.template_id=id and position(needle in lower(g.tag))>0))) then raise exception 'Template cursor changed' using errcode='22023';end if;
 select coalesce(jsonb_agg(public.pro_task_template_summary(x::public.pro_task_templates) order by x.id),'[]'::jsonb) into items from(select * from public.pro_task_templates where owner_id=p_actor and archived=want_archived and(needle='' or position(needle in lower(name))>0 or position(needle in lower(notes))>0 or exists(select 1 from public.pro_task_template_tags g where g.owner_id=p_actor and g.template_id=id and position(needle in lower(g.tag))>0)) and(p_after is null or id>p_after) order by id limit 21)x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_task_template_extend(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;template_key uuid;rev integer;keys text[];t public.pro_task_templates;receipt public.pro_task_template_actions;ref jsonb;task public.pro_work_tasks;work public.pro_work;
 source_work text;source_day date;offset_days integer;row_id uuid;seen uuid[]:=array[]::uuid[];opt text;include_details boolean:=false;include_manual boolean:=false;include_dates boolean:=true;
 before_json jsonb;answer jsonb;existing integer;position_index integer;tag_value jsonb;tag_text text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid task template' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if act='append' then
  if not keys @> array['action','actionId','revision','selected','templateId'] or not keys <@ array['action','actionId','includeDetails','includeDueDates','includeManual','revision','selected','templateId'] or jsonb_typeof(p_input->'selected') is distinct from 'array' or jsonb_array_length(p_input->'selected') not between 1 and 100 then raise exception 'Invalid template selection' using errcode='22023';end if;
  foreach opt in array array['includeDetails','includeManual','includeDueDates'] loop if p_input ? opt and jsonb_typeof(p_input->opt) is distinct from 'boolean' then raise exception 'Invalid copy option' using errcode='22023';end if;end loop;
  include_details:=coalesce((p_input->>'includeDetails')::boolean,false);include_manual:=coalesce((p_input->>'includeManual')::boolean,false);include_dates:=coalesce((p_input->>'includeDueDates')::boolean,true);
 elsif act='tags' then
  if keys is distinct from array['action','actionId','revision','tags','templateId'] or jsonb_typeof(p_input->'tags') is distinct from 'array' or jsonb_array_length(p_input->'tags')>8 then raise exception 'Invalid template tags' using errcode='22023';end if;
 else raise exception 'Invalid template operation' using errcode='22023';end if;
 if jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'templateId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) or (p_input->>'revision')::integer<1 then raise exception 'Invalid template identity' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;template_key:=(p_input->>'templateId')::uuid;rev:=(p_input->>'revision')::integer;
 perform pg_advisory_xact_lock(hashtextextended('pro-task-template-action:'||p_actor::text||':'||aid::text,0));
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into receipt from public.pro_task_template_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Template action identity reused' using errcode='22023';end if;return receipt.result;end if;
 if act='append' then
  for ref in select value from jsonb_array_elements(p_input->'selected') loop
   select array_agg(key order by key) into keys from jsonb_object_keys(ref)key;
   if keys is distinct from array['revision','taskId','workId'] or jsonb_typeof(ref->'workId') is distinct from 'string' or length(ref->>'workId') not between 1 and 160 or jsonb_typeof(ref->'taskId') is distinct from 'string' or jsonb_typeof(ref->'revision') is distinct from 'number' or not coalesce((ref->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid selected task' using errcode='22023';end if;
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
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if t.revision<>rev or t.archived then raise exception 'Template changed' using errcode='40001';end if;
 before_json:=public.pro_task_template_detail(t);
 if act='append' then
  select count(*) into existing from public.pro_task_template_rows where owner_id=p_actor and template_id=template_key;
  if existing+jsonb_array_length(p_input->'selected')>100 then raise exception 'Template would exceed 100 tasks' using errcode='22023';end if;
  position_index:=existing;
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
   insert into public.pro_task_template_rows(owner_id,template_id,id,position,title,details,assignee,due_offset) values(p_actor,template_key,gen_random_uuid(),position_index,btrim(task.title),case when include_details then btrim(task.details) else '' end,case when include_manual then btrim(task.assignee) else '' end,offset_days);
   position_index:=position_index+1;
  end loop;
 else
  delete from public.pro_task_template_tags where owner_id=p_actor and template_id=template_key;
  for tag_value in select value from jsonb_array_elements(p_input->'tags') loop
   if jsonb_typeof(tag_value) is distinct from 'string' then raise exception 'Invalid tag' using errcode='22023';end if;
   tag_text:=btrim(tag_value#>>'{}');
   if length(tag_text) not between 1 and 30 or tag_text ~ '[[:cntrl:]]' then raise exception 'Invalid tag' using errcode='22023';end if;
   if exists(select 1 from public.pro_task_template_tags where owner_id=p_actor and template_id=template_key and lower(tag)=lower(tag_text)) then raise exception 'Repeated tag' using errcode='22023';end if;
   insert into public.pro_task_template_tags(owner_id,template_id,tag) values(p_actor,template_key,tag_text);
  end loop;
 end if;
 update public.pro_task_templates set revision=revision+1 where owner_id=p_actor and id=template_key returning * into t;
 answer:=jsonb_build_object('action',act,'template',public.pro_task_template_summary(t));
 if act='append' then answer:=answer||jsonb_build_object('added',jsonb_array_length(p_input->'selected'));end if;
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into public.pro_task_template_actions(actor_id,action_id,template_id,input,result,before_state,after_state) values(p_actor,aid,template_key,p_input,answer,before_json,public.pro_task_template_detail(t));
 return answer;
end $$;
revoke all on function public.pro_task_template_summary(public.pro_task_templates),public.pro_task_templates_read(uuid,text,text,uuid,uuid),public.pro_task_template_extend(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_task_template_summary(public.pro_task_templates),public.pro_task_templates_read(uuid,text,text,uuid,uuid),public.pro_task_template_extend(uuid,jsonb) to service_role;
commit;
