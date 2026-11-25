-- ContrataCR Pro row 79 fix: plan templates attach to an appointment request that has never been archived. Such a request has no
-- pro_lead_center_records row (lead log resolves it from pro_appointment_requests); both plan functions now do the same.
begin;

create or replace function public.pro_lead_plan_read(p_owner uuid,p_lead uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_lead_center_records;
begin
 perform public.pro_request_pipeline_owner(p_owner);
 select * into l from public.pro_lead_center_records where owner_id=p_owner and kind in('manual','request') and id=p_lead order by kind limit 1;
 if not found then
  -- An appointment request has no lead-center row until it is archived: it is the request itself.
  if not exists(select 1 from public.pro_appointment_requests q where q.owner_id=p_owner and q.id=p_lead) then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
  l.kind:='request';l.id:=p_lead;l.archived:=false;
 end if;
 return jsonb_build_object('leadId',p_lead,'archived',l.archived,'converted',case when l.kind='request' then exists(select 1 from public.pro_appointment_requests q where q.owner_id=p_owner and q.id=p_lead and q.work_id is not null) else exists(select 1 from public.pro_manual_lead_works w where w.owner_id=p_owner and w.lead_id=p_lead) end,
  'items',coalesce((select jsonb_agg(public.pro_lead_plan_json(p) order by p.created_at,p.id) from public.pro_lead_plan_templates p where p.owner_id=p_owner and p.lead_id=p_lead and p.status<>'removed'),'[]'::jsonb));
end $$;

create or replace function public.pro_lead_plan_mutate(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;lid uuid;tid uuid;k text;d date;rev integer;l public.pro_lead_center_records;pr public.pro_lead_plan_templates;nm text;cnt integer;cal boolean;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid plan action' using errcode='22023';end if;
 perform public.pro_request_pipeline_owner(p_owner);
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if act='attach' then
  if keys is distinct from array['action','actionId','calendar','kind','leadId','startDate','templateId'] then raise exception 'Unexpected plan fields' using errcode='22023';end if;
  if jsonb_typeof(p_input->'calendar') is distinct from 'boolean' or p_input->>'kind' not in('tasks','schedule') or jsonb_typeof(p_input->'startDate') is distinct from 'string' or (p_input->>'startDate')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid plan fields' using errcode='22023';end if;
  begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'leadId')::uuid;tid:=(p_input->>'templateId')::uuid;d:=(p_input->>'startDate')::date;exception when others then raise exception 'Invalid plan fields' using errcode='22023';end;
  if d not between date'1900-01-01' and date'2100-12-31' then raise exception 'Invalid plan fields' using errcode='22023';end if;
  cal:=(p_input->>'calendar')::boolean;k:=p_input->>'kind';
 elsif act='remove' then
  if keys is distinct from array['action','actionId','id','leadId','revision'] or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) then raise exception 'Unexpected plan fields' using errcode='22023';end if;
  begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'leadId')::uuid;tid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid plan fields' using errcode='22023';end;
  rev:=(p_input->>'revision')::integer;
 else raise exception 'Invalid plan action' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-lead-plan:'||p_owner::text||':'||lid::text,0));
 select * into l from public.pro_lead_center_records where owner_id=p_owner and kind in('manual','request') and id=lid order by kind limit 1 for update;
 if not found then
  -- An appointment request has no lead-center row until it is archived: it is the request itself.
  if not exists(select 1 from public.pro_appointment_requests q where q.owner_id=p_owner and q.id=lid) then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
  l.kind:='request';l.id:=lid;l.archived:=false;
 end if;
 if act='attach' then
  select * into pr from public.pro_lead_plan_templates where owner_id=p_owner and action_id=aid;
  if found then if pr.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return public.pro_lead_plan_json(pr);end if;
  if l.archived or exists(select 1 from public.pro_manual_lead_works w where w.owner_id=p_owner and w.lead_id=lid) or l.kind='request' and exists(select 1 from public.pro_appointment_requests q where q.owner_id=p_owner and q.id=lid and q.work_id is not null) then raise exception 'Opportunity is closed' using errcode='40001';end if;
  if k='tasks' then select name into nm from public.pro_task_templates where owner_id=p_owner and id=tid and not archived;
  else select name into nm from public.pro_schedule_templates where owner_id=p_owner and id=tid and not archived;end if;
  if nm is null then raise exception 'Template unavailable' using errcode='40001';end if;
  select count(*) into cnt from public.pro_lead_plan_templates where owner_id=p_owner and lead_id=lid and status='pending';
  if cnt>=10 then raise exception 'Too many pending plans' using errcode='54000';end if;
  if exists(select 1 from public.pro_lead_plan_templates where owner_id=p_owner and lead_id=lid and kind=k and template_id=tid and status='pending') then raise exception 'Plan already pending' using errcode='40001';end if;
  insert into public.pro_lead_plan_templates(owner_id,action_id,input,lead_kind,lead_id,kind,template_id,template_name,start_date,calendar) values(p_owner,aid,p_input,l.kind,lid,k,tid,nm,d,cal) returning * into pr;
  return public.pro_lead_plan_json(pr);
 end if;
 select * into pr from public.pro_lead_plan_templates where owner_id=p_owner and lead_id=lid and id=tid;
 if not found then raise exception 'Plan unavailable' using errcode='P0002';end if;
 if pr.status='removed' and pr.revision=rev+1 and pr.input->>'removeAction'=aid::text then return public.pro_lead_plan_json(pr);end if;
 if pr.status<>'pending' or pr.revision<>rev then raise exception 'Plan changed' using errcode='40001';end if;
 update public.pro_lead_plan_templates set status='removed',revision=revision+1,updated_at=clock_timestamp(),input=input||jsonb_build_object('removeAction',aid) where owner_id=p_owner and id=tid returning * into pr;
 return public.pro_lead_plan_json(pr);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_lead_plan_read','pro_lead_plan_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
