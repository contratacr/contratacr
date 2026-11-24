-- ContrataCR Pro row 79 (2026-11-23): the schedule/task template plans of an opportunity also work for an APPOINTMENT
-- REQUEST lead (kind 'request'). The request becomes a job when its work_id is set (confirm); at that moment the pending
-- plans are created in the job in the same transaction with the existing writers, with the "work calendar" option
-- (working days) exactly as for manual opportunities. A failing plan is marked skipped and never blocks the confirmation.
begin;

do $$ declare c text;
begin
 for c in select conname from pg_constraint where conrelid='public.pro_lead_plan_templates'::regclass and contype='c' and pg_get_constraintdef(oid) like '%lead_kind%' loop
  execute format('alter table public.pro_lead_plan_templates drop constraint %I',c);
 end loop;
 alter table public.pro_lead_plan_templates add constraint pro_lead_plan_templates_lead_kind_check check(lead_kind in('manual','request'));
end $$;

create or replace function public.pro_lead_plan_read(p_owner uuid,p_lead uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_lead_center_records;
begin
 perform public.pro_request_pipeline_owner(p_owner);
 select * into l from public.pro_lead_center_records where owner_id=p_owner and kind in('manual','request') and id=p_lead order by kind limit 1;
 if not found then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
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
 if not found then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
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

create or replace function public.pro_lead_plan_on_request_work() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.work_id is not null and old.work_id is null
  and exists(select 1 from public.pro_lead_plan_templates p where p.owner_id=new.owner_id and p.lead_id=new.id and p.lead_kind='request' and p.status='pending') then
  perform public.pro_lead_plan_materialize(new.owner_id,new.id,new.work_id);
 end if;
 return null;
end $$;
drop trigger if exists pro_lead_plan_on_request_work on public.pro_appointment_requests;
create trigger pro_lead_plan_on_request_work after update of work_id on public.pro_appointment_requests for each row execute function public.pro_lead_plan_on_request_work();

do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_lead_plan_read','pro_lead_plan_mutate','pro_lead_plan_on_request_work') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
