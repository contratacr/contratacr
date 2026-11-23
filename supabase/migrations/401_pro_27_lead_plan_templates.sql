-- ContrataCR Pro, rows 78 and 79: apply a task template and/or a schedule template to an OPPORTUNITY (manual lead) that
-- is not a job yet. PRO_ENABLED stays false; nothing is sent.
-- A job does not exist yet, so the plan is stored as a PENDING plan of the opportunity (template + start date + whether
-- to respect the work calendar). The moment the opportunity is converted into a job (pro_manual_lead_works insert, which
-- both the manual and the commercial conversions perform) the pending plans are materialized in the SAME transaction
-- through the existing template writers (history, receipts and CAS intact; ids derived from the pending row, so a retry
-- cannot duplicate). A template that was archived/changed so that it no longer applies marks that plan "skipped" with
-- the reason; it never blocks the conversion. Only manual opportunities exist as leads that can become jobs here.
begin;

create table if not exists public.pro_lead_plan_templates(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 action_id uuid not null,
 input jsonb not null,
 lead_kind text not null default 'manual' check(lead_kind='manual'),
 lead_id uuid not null,
 kind text not null check(kind in('tasks','schedule')),
 template_id uuid not null,
 template_name text not null check(length(btrim(template_name)) between 1 and 80),
 start_date date not null check(start_date between date'1900-01-01' and date'2100-12-31'),
 calendar boolean not null default false,
 status text not null default 'pending' check(status in('pending','applied','skipped','removed')),
 note text not null default '' check(length(note)<=300),
 work_id text,
 result jsonb,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),unique(owner_id,action_id),
 foreign key(owner_id,lead_kind,lead_id) references public.pro_lead_center_records(owner_id,kind,id) on delete cascade);
create unique index if not exists pro_lead_plan_pending_once on public.pro_lead_plan_templates(owner_id,lead_id,kind,template_id) where status='pending';
create index if not exists pro_lead_plan_by_lead on public.pro_lead_plan_templates(owner_id,lead_id,created_at,id);

create or replace function public.pro_lead_plan_json(p public.pro_lead_plan_templates) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p.id,'kind',p.kind,'templateId',p.template_id,'templateName',p.template_name,'startDate',to_char(p.start_date,'YYYY-MM-DD'),'calendar',p.calendar,
  'status',p.status,'note',p.note,'workId',p.work_id,'revision',p.revision,
  'available',case when p.kind='tasks' then exists(select 1 from public.pro_task_templates t where t.owner_id=p.owner_id and t.id=p.template_id and not t.archived)
   else exists(select 1 from public.pro_schedule_templates t where t.owner_id=p.owner_id and t.id=p.template_id and not t.archived) end)
$$;

create or replace function public.pro_lead_plan_read(p_owner uuid,p_lead uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_lead_center_records;
begin
 perform public.pro_request_pipeline_owner(p_owner);
 select * into l from public.pro_lead_center_records where owner_id=p_owner and kind='manual' and id=p_lead;
 if not found then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
 return jsonb_build_object('leadId',p_lead,'archived',l.archived,'converted',exists(select 1 from public.pro_manual_lead_works w where w.owner_id=p_owner and w.lead_id=p_lead),
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
 select * into l from public.pro_lead_center_records where owner_id=p_owner and kind='manual' and id=lid for update;
 if not found then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
 if act='attach' then
  select * into pr from public.pro_lead_plan_templates where owner_id=p_owner and action_id=aid;
  if found then if pr.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return public.pro_lead_plan_json(pr);end if;
  if l.archived or exists(select 1 from public.pro_manual_lead_works w where w.owner_id=p_owner and w.lead_id=lid) then raise exception 'Opportunity is closed' using errcode='40001';end if;
  if k='tasks' then select name into nm from public.pro_task_templates where owner_id=p_owner and id=tid and not archived;
  else select name into nm from public.pro_schedule_templates where owner_id=p_owner and id=tid and not archived;end if;
  if nm is null then raise exception 'Template unavailable' using errcode='40001';end if;
  select count(*) into cnt from public.pro_lead_plan_templates where owner_id=p_owner and lead_id=lid and status='pending';
  if cnt>=10 then raise exception 'Too many pending plans' using errcode='54000';end if;
  if exists(select 1 from public.pro_lead_plan_templates where owner_id=p_owner and lead_id=lid and kind=k and template_id=tid and status='pending') then raise exception 'Plan already pending' using errcode='40001';end if;
  insert into public.pro_lead_plan_templates(owner_id,action_id,input,lead_id,kind,template_id,template_name,start_date,calendar) values(p_owner,aid,p_input,lid,k,tid,nm,d,cal) returning * into pr;
  return public.pro_lead_plan_json(pr);
 end if;
 select * into pr from public.pro_lead_plan_templates where owner_id=p_owner and lead_id=lid and id=tid;
 if not found then raise exception 'Plan unavailable' using errcode='P0002';end if;
 if pr.status='removed' and pr.revision=rev+1 and pr.input->>'removeAction'=aid::text then return public.pro_lead_plan_json(pr);end if;
 if pr.status<>'pending' or pr.revision<>rev then raise exception 'Plan changed' using errcode='40001';end if;
 update public.pro_lead_plan_templates set status='removed',revision=revision+1,updated_at=clock_timestamp(),input=input||jsonb_build_object('removeAction',aid) where owner_id=p_owner and id=tid returning * into pr;
 return public.pro_lead_plan_json(pr);
end $$;

-- Applies one pending plan to the new job. Called inside a sub-block: any failure rolls back only that plan.
create or replace function public.pro_lead_plan_apply_one(p_owner uuid,p_row public.pro_lead_plan_templates,p_work text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare today date:=(now() at time zone 'America/Costa_Rica')::date;start_day date;start_text text;pv jsonb;n integer;m integer;p integer;rev integer;head integer;ids uuid[];acts uuid[];res jsonb;seed text;ph uuid[];pha uuid[];ms uuid[];msa uuid[];pla uuid[];moved integer:=0;ch jsonb;
begin
 start_day:=greatest(p_row.start_date,today);start_text:=to_char(start_day,'YYYY-MM-DD');seed:='leadplan:'||p_row.id::text;
 if p_row.kind='tasks' then
  select revision into rev from public.pro_task_templates where owner_id=p_owner and id=p_row.template_id and not archived;
  if rev is null then raise exception 'Template archived or removed' using errcode='40001';end if;
  pv:=public.pro_task_template_preview(p_owner,p_row.template_id,p_work,start_text);n:=jsonb_array_length(pv->'rows');
  if n=0 then raise exception 'Template has no tasks' using errcode='40001';end if;
  select array_agg(public.pro_lead_import_uuid(seed||':task:'||g) order by g),array_agg(public.pro_lead_import_uuid(seed||':taskact:'||g) order by g) into ids,acts from generate_series(1,n) g;
  res:=public.pro_task_templates_mutate(p_owner,jsonb_build_object('action','apply','actionId',public.pro_lead_import_uuid(seed||':apply'),'templateId',p_row.template_id,'revision',rev,'workId',p_work,'startDate',start_text,'newTaskIds',to_jsonb(ids),'taskActionIds',to_jsonb(acts)));
  if p_row.calendar then moved:=public.pro_tasks_calendarize_due(p_owner,p_work,ids,seed);end if;
  return jsonb_build_object('taskCount',n,'movedToWorkingDay',moved);
 end if;
 select revision into rev from public.pro_schedule_templates where owner_id=p_owner and id=p_row.template_id and not archived;
 if rev is null then raise exception 'Template archived or removed' using errcode='40001';end if;
 pv:=public.pro_schedule_template_preview(p_owner,p_row.template_id,p_work,start_text);head:=(pv->>'revision')::integer;
 n:=jsonb_array_length(pv->'tasks');m:=jsonb_array_length(pv->'milestones');p:=jsonb_array_length(pv->'phases');
 select coalesce(array_agg(public.pro_lead_import_uuid(seed||':phase:'||g) order by g),'{}'::uuid[]),coalesce(array_agg(public.pro_lead_import_uuid(seed||':phaseact:'||g) order by g),'{}'::uuid[]) into ph,pha from generate_series(1,p) g;
 select coalesce(array_agg(public.pro_lead_import_uuid(seed||':task:'||g) order by g),'{}'::uuid[]),coalesce(array_agg(public.pro_lead_import_uuid(seed||':taskact:'||g) order by g),'{}'::uuid[]),coalesce(array_agg(public.pro_lead_import_uuid(seed||':planact:'||g) order by g),'{}'::uuid[]) into ids,acts,pla from generate_series(1,n) g;
 select coalesce(array_agg(public.pro_lead_import_uuid(seed||':ms:'||g) order by g),'{}'::uuid[]),coalesce(array_agg(public.pro_lead_import_uuid(seed||':msact:'||g) order by g),'{}'::uuid[]) into ms,msa from generate_series(1,m) g;
 res:=public.pro_schedule_templates_mutate_rules(p_owner,jsonb_build_object('action','apply','actionId',public.pro_lead_import_uuid(seed||':apply'),'templateId',p_row.template_id,'revision',rev,'workId',p_work,'workRevision',head,'startDate',start_text,
  'phaseIds',to_jsonb(ph),'phaseActionIds',to_jsonb(pha),'taskIds',to_jsonb(ids),'taskActionIds',to_jsonb(acts),'planActionIds',to_jsonb(pla),'milestoneIds',to_jsonb(ms),'milestoneActionIds',to_jsonb(msa)));
 if p_row.calendar then
  perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_owner::text||':'||p_work,0));
  select coalesce(revision,0) into head from public.pro_work_schedule_heads where owner_id=p_owner and work_id=p_work;head:=coalesce(head,0);
  ch:=public.pro_schedule_calendarize_compute(p_owner,p_work,ids);
  if jsonb_array_length(ch)>0 then perform public.pro_schedule_changes_write(p_owner,p_work,public.pro_lead_import_uuid(seed||':calendarize'),jsonb_build_object('action','calendarize','leadPlan',p_row.id),ch,head);moved:=jsonb_array_length(ch);end if;
 end if;
 return jsonb_build_object('taskCount',n,'phaseCount',p,'milestoneCount',m,'movedToWorkingDay',moved);
end $$;

create or replace function public.pro_lead_plan_materialize(p_owner uuid,p_lead uuid,p_work text) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.pro_lead_plan_templates;res jsonb;n integer:=0;
begin
 for r in select * from public.pro_lead_plan_templates where owner_id=p_owner and lead_id=p_lead and status='pending' order by created_at,id loop
  begin
   res:=public.pro_lead_plan_apply_one(p_owner,r,p_work);
   update public.pro_lead_plan_templates set status='applied',work_id=p_work,result=res,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_owner and id=r.id;n:=n+1;
  exception when others then
   update public.pro_lead_plan_templates set status='skipped',work_id=p_work,note=left(sqlerrm,300),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_owner and id=r.id;
  end;
 end loop;
 return n;
end $$;

create or replace function public.pro_lead_plan_on_convert() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.pro_lead_plan_templates where owner_id=new.owner_id and lead_id=new.lead_id and status='pending') then
  perform public.pro_lead_plan_materialize(new.owner_id,new.lead_id,new.work_id_text);
 end if;
 return null;
end $$;
drop trigger if exists pro_lead_plan_on_convert on public.pro_manual_lead_works;
create trigger pro_lead_plan_on_convert after insert on public.pro_manual_lead_works for each row execute function public.pro_lead_plan_on_convert();

create or replace function public.pro_lead_plan_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.owner_id<>old.owner_id or new.id<>old.id or new.action_id<>old.action_id or new.lead_id<>old.lead_id or new.kind<>old.kind or new.template_id<>old.template_id or new.start_date<>old.start_date or new.calendar<>old.calendar then raise exception 'Immutable plan fields' using errcode='23514';end if;
 if old.status<>'pending' then raise exception 'A closed plan cannot change' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_lead_plan_guard on public.pro_lead_plan_templates;
create trigger pro_lead_plan_guard before update on public.pro_lead_plan_templates for each row execute function public.pro_lead_plan_guard();

alter table public.pro_lead_plan_templates enable row level security;
revoke all on public.pro_lead_plan_templates from public,anon,authenticated;grant all on public.pro_lead_plan_templates to service_role;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_lead\_plan\_%' and p.proname<>'pro_lead_plan_on_convert' and p.proname<>'pro_lead_plan_guard'
 loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;
commit;
notify pgrst,'reload schema';
