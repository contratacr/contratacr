-- LOCAL PRO ONLY. Ronda F2-C (2026-11-19), operations (Houzz Pro parity rows 13, 15, 17, 20, 22, 24).
-- Pro tables do not exist on test/production: this module lives only in docs/pro/sql and the local manifest.
--  * Estimate -> schedule (row 13 + "cotizacion a cronograma"): proposal read of the job's quotes (sections
--    become phases, lines become tasks, default duration 1 day or the quantity when the unit is days) and an
--    apply that creates the phases, tasks, planned periods and finish-to-start links THROUGH the existing
--    writers (pro_work_tasks_mutate, pro_work_schedule_mutate, pro_schedule_mutate link_set), in one
--    transaction, schedule revision CAS (40001), derived child identities and an idempotent receipt.
--  * Saved views of the global task center (row 15): per person, CAS head revision, at most 20.
--  * Time clock (row 22): clock in = the existing person timer (pro_work_timer_mutate start) plus optional
--    task and optional location (off by default; only when the company turns it on). Weekly timesheet per
--    person over the existing hours ledger (pro_time_report_rows: timers, manual entries, ledger) without
--    internal cost, and an append-only approve/reopen decision tied to a digest of the week's rows.
--  * Notification channels (row 24): WhatsApp toggle per event stored beside the existing in-app/email
--    preferences (saved together through pro_notifications_mutate 'settings'). Nothing is sent.
--  * Daily log crew (row 20): crew present from the team (owner + active company members) with hours per
--    person; the entry's crew summary is written through the existing journal writer.
--  * Custom roles (row 17): a copy of a base role that can only REMOVE capabilities. pro_role_require
--    intersects the base role with the custom role assigned to the member (never grants more).
-- Patterns: RLS on, service_role only, security invoker, fixed search_path, CAS 40001, idempotent receipts,
-- append-only history. Nothing is sent, no third party is called.
begin;
create or replace function public.pro_ops_uuid(p_seed text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',(get_byte(decode(substr(h,17,2),'hex'),0)%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid
 from(select md5(p_seed) h) x
$$;
create or replace function public.pro_ops_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Operations history is immutable' using errcode='23514';end $$;
create or replace function public.pro_ops_keys(p_input jsonb) returns text[] language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(array_agg(k order by k),array[]::text[]) from jsonb_object_keys(case when jsonb_typeof(p_input)='object' then p_input else '{}'::jsonb end) k
$$;
create or replace function public.pro_ops_text_ok(p_value text,p_min integer,p_max integer) returns boolean language sql immutable security invoker set search_path=public,pg_temp as $$
 select p_value is not null and length(btrim(p_value)) between p_min and p_max and p_value !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f]'
$$;
-- Generic receipts of this module (one per owner, person and action id).
create table if not exists public.pro_ops_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,person_id uuid not null,action_id uuid not null,
 kind text not null check(kind in('estimate_schedule','task_view','clock_in','clock_settings','timesheet','notify_channels','crew','custom_role')),
 input_hash text not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,person_id,action_id));

-- People of the company: the owner and the active members (keys match pro_time_report_rows person keys).
create or replace function public.pro_ops_people(p_owner uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_array(jsonb_build_object('key','person:'||p_owner::text,'personId',p_owner,'name',coalesce(nullif(btrim(public.pro_team_name(p_owner)),''),'Propietario'),'role','owner'))
  ||coalesce((select jsonb_agg(jsonb_build_object('key','person:'||m.member_user_id::text,'personId',m.member_user_id,'name',left(coalesce(nullif(btrim(m.member_name),''),nullif(btrim(public.pro_team_name(m.member_user_id)),''),nullif(m.member_email,''),'Integrante'),160),'role',m.role) order by lower(m.member_name),m.id)
   from public.pro_company_members m where m.owner_id=p_owner and m.active),'[]'::jsonb)
$$;
create or replace function public.pro_ops_receipt(p_owner uuid,p_person uuid,p_action uuid,p_hash text) returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare r public.pro_ops_actions;
begin
 perform pg_advisory_xact_lock(hashtextextended('pro-ops-action:'||p_owner::text||':'||p_person::text||':'||p_action::text,0));
 select * into r from public.pro_ops_actions where owner_id=p_owner and person_id=p_person and action_id=p_action;
 if not found then return null;end if;
 if r.input_hash<>p_hash then raise exception 'Action id reused' using errcode='22023';end if;
 return r.result||jsonb_build_object('replayed',true);
end $$;

-- ===================== 1. Estimate -> schedule =====================
create or replace function public.pro_estimate_schedule_days(p_unit text,p_qty_milli bigint) returns integer language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when lower(btrim(coalesce(p_unit,''))) in('d','dia','dias','día','días','day','days','jornada','jornadas') then greatest(1,least(365,ceil(coalesce(p_qty_milli,1000)/1000.0)::integer)) else 1 end
$$;
create or replace function public.pro_estimate_schedule_source(p_owner uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;head integer;
begin
 perform public.pro_work_schedule_owner(p_owner,p_work);
 select * into w from public.pro_work where user_id=p_owner and id=p_work;
 select revision into head from public.pro_work_schedule_heads where owner_id=p_owner and work_id=p_work;
 return jsonb_build_object('workId',p_work,'revision',coalesce(head,0),'today',(clock_timestamp() at time zone 'America/Costa_Rica')::date,
  'existingTasks',(select count(*) from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and not t.archived),
  'existingPhases',(select count(*) from public.pro_work_schedule_phases p where p.owner_id=p_owner and p.work_id=p_work and not p.archived),
  'estimates',coalesce((select jsonb_agg(e.doc order by e.created_at desc,e.id) from(
   select d.id,d.created_at,jsonb_build_object('id',d.id,'title',d.title,'revision',d.revision,'updatedAt',d.updated_at,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('lineId',i.content->>'id','title',left(btrim(split_part(i.content->>'description',E'\n',1)),160),'group',nullif(btrim(coalesce(i.content->>'group','')),''),
      'unit',coalesce(i.content->>'unit',''),'qtyMilli',coalesce((i.content->>'qtyMilli')::bigint,1000),'days',public.pro_estimate_schedule_days(i.content->>'unit',(i.content->>'qtyMilli')::bigint)) order by i.position)
     from public.pro_private_estimate_items i where i.owner_id=p_owner and i.estimate_id=d.id and length(btrim(split_part(coalesce(i.content->>'description',''),E'\n',1)))>0),'[]'::jsonb)) doc
   from public.pro_project_estimate_rows(p_owner,w) r join public.pro_private_estimates d on d.owner_id=p_owner and d.id=r.estimate_id
   where r.relation='project' and not d.archived order by d.created_at desc limit 20) e),'[]'::jsonb));
end $$;
create table if not exists public.pro_estimate_schedule_runs(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,work_id text not null,estimate_id uuid not null,estimate_revision integer not null,
 start_date date not null,end_date date not null,phase_ids uuid[] not null,task_ids uuid[] not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade);
create or replace function public.pro_estimate_schedule_apply(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;wid text;eid uuid;erev integer;rev integer;head integer;start_day date;cursor_day date;prior_end date;hash text:=md5(coalesce(p_input::text,''));replay jsonb;
 w public.pro_work;d public.pro_private_estimates;ph jsonb;tk jsonb;pi integer:=0;ti integer:=0;total integer:=0;base_pos integer;v_phase uuid;v_task uuid;prev_task uuid;
 v_days integer;v_lag integer;t_start date;t_end date;phase_ids uuid[]:=array[]::uuid[];task_ids uuid[]:=array[]::uuid[];answer jsonb;rule_rev integer;
begin
 if pro_ops_keys(p_input) is distinct from array['action','actionId','estimateId','estimateRevision','phases','revision','startDate','workId'] or p_input->>'action'<>'apply'
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'phases') is distinct from 'array' or jsonb_typeof(p_input->'revision') is distinct from 'number' or jsonb_typeof(p_input->'estimateRevision') is distinct from 'number'
  or not coalesce(p_input->>'startDate'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or not coalesce(p_input->>'estimateRevision'~'^[0-9]{1,10}$',false) then raise exception 'Invalid schedule proposal' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;eid:=(p_input->>'estimateId')::uuid;start_day:=(p_input->>'startDate')::date;exception when others then raise exception 'Invalid schedule proposal' using errcode='22023';end;
 wid:=p_input->>'workId';rev:=(p_input->>'revision')::integer;erev:=(p_input->>'estimateRevision')::integer;
 if start_day not between date'2000-01-01' and date'2099-12-31' or jsonb_array_length(p_input->'phases') not between 1 and 30 then raise exception 'Invalid schedule proposal' using errcode='22023';end if;
 for ph in select value from jsonb_array_elements(p_input->'phases') loop
  if jsonb_typeof(ph)<>'object' or pro_ops_keys(ph) is distinct from array['tasks','title'] or jsonb_typeof(ph->'title') is distinct from 'string' or not pro_ops_text_ok(ph->>'title',1,160) or jsonb_typeof(ph->'tasks') is distinct from 'array' or jsonb_array_length(ph->'tasks') not between 1 and 100 then raise exception 'Invalid phase' using errcode='22023';end if;
  for tk in select value from jsonb_array_elements(ph->'tasks') loop
   if jsonb_typeof(tk)<>'object' or pro_ops_keys(tk) is distinct from array['days','lagDays','lineId','title'] or jsonb_typeof(tk->'title') is distinct from 'string' or not pro_ops_text_ok(tk->>'title',1,160)
    or jsonb_typeof(tk->'lineId') not in('string','null') or length(coalesce(tk->>'lineId',''))>80 or jsonb_typeof(tk->'days') is distinct from 'number' or not coalesce(tk->>'days'~'^[0-9]{1,3}$',false) or (tk->>'days')::integer not between 1 and 365
    or jsonb_typeof(tk->'lagDays') is distinct from 'number' or not coalesce(tk->>'lagDays'~'^[0-9]{1,2}$',false) or (tk->>'lagDays')::integer not between 0 and 60 then raise exception 'Invalid task' using errcode='22023';end if;
   total:=total+1;
  end loop;
 end loop;
 if total>200 then raise exception 'Too many tasks' using errcode='22023';end if;
 perform public.pro_work_schedule_owner(p_owner,wid);
 replay:=pro_ops_receipt(p_owner,p_owner,aid,hash);if replay is not null then return replay;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_owner::text||':'||wid,0));
 select * into w from public.pro_work where user_id=p_owner and id=wid for share;
 if coalesce(w.cancelled,false) then raise exception 'Work cancelled' using errcode='40001';end if;
 select * into d from public.pro_private_estimates where owner_id=p_owner and id=eid for share;
 if not found or d.archived or not exists(select 1 from public.pro_project_estimate_rows(p_owner,w) r where r.estimate_id=eid and r.relation='project') then raise exception 'Estimate unavailable' using errcode='P0002';end if;
 if d.revision<>erev then raise exception 'Estimate changed' using errcode='40001';end if;
 select coalesce(revision,0) into head from public.pro_work_schedule_heads where owner_id=p_owner and work_id=wid;head:=coalesce(head,0);
 if head<>rev then raise exception 'Schedule changed' using errcode='40001';end if;
 select coalesce(max(position)+1,0) into base_pos from public.pro_work_schedule_phases where owner_id=p_owner and work_id=wid;
 if base_pos+jsonb_array_length(p_input->'phases')-1>999 then raise exception 'Too many phases' using errcode='54000';end if;
 cursor_day:=start_day;prior_end:=null;prev_task:=null;
 for ph in select value from jsonb_array_elements(p_input->'phases') loop
  pi:=pi+1;v_phase:=pro_ops_uuid(aid::text||':phase:'||pi);phase_ids:=phase_ids||v_phase;
  perform public.pro_work_schedule_mutate(p_owner,jsonb_build_object('action','phase_save','actionId',pro_ops_uuid(aid::text||':phase-action:'||pi),'workId',wid,'revision',head,'phaseId',v_phase,'title',btrim(ph->>'title'),'position',base_pos+pi-1));head:=head+1;
  for tk in select value from jsonb_array_elements(ph->'tasks') loop
   ti:=ti+1;v_task:=pro_ops_uuid(aid::text||':task:'||ti);task_ids:=task_ids||v_task;v_days:=(tk->>'days')::integer;v_lag:=case when prev_task is null then 0 else (tk->>'lagDays')::integer end;
   t_start:=case when prior_end is null then start_day else prior_end+1+v_lag end;t_end:=t_start+v_days-1;
   if t_end>date'2100-12-31' then raise exception 'Schedule too long' using errcode='22023';end if;
   perform public.pro_work_tasks_mutate(p_owner,jsonb_build_object('action','create','actionId',pro_ops_uuid(aid::text||':task-action:'||ti),'workId',wid,'taskId',v_task,'revision',0,'title',btrim(tk->>'title'),'details','','assignee','','dueDate',null));
   perform public.pro_work_schedule_mutate(p_owner,jsonb_build_object('action','task_plan','actionId',pro_ops_uuid(aid::text||':plan-action:'||ti),'workId',wid,'revision',head,'taskId',v_task,'phaseId',v_phase,'plannedStart',t_start,'plannedEnd',t_end,
    'dependsOn',case when prev_task is null then '[]'::jsonb else jsonb_build_array(prev_task) end));head:=head+1;
   if prev_task is not null and v_lag>0 then
    select revision into rule_rev from public.pro_schedule_link_rules where owner_id=p_owner and work_id=wid and pro_schedule_link_rules.task_id=v_task and predecessor_id=prev_task;
    perform public.pro_schedule_mutate(p_owner,jsonb_build_object('action','link_set','actionId',pro_ops_uuid(aid::text||':link-action:'||ti),'workId',wid,'revision',coalesce(rule_rev,0),'taskId',v_task,'predecessorId',prev_task,'kind','fs','lagDays',v_lag));
   end if;
   prior_end:=t_end;prev_task:=v_task;
  end loop;
 end loop;
 insert into public.pro_estimate_schedule_runs(owner_id,action_id,work_id,estimate_id,estimate_revision,start_date,end_date,phase_ids,task_ids) values(p_owner,aid,wid,eid,erev,start_day,prior_end,phase_ids,task_ids);
 answer:=jsonb_build_object('action','apply','workId',wid,'estimateId',eid,'revision',head,'startDate',start_day,'endDate',prior_end,'phaseIds',to_jsonb(phase_ids),'taskIds',to_jsonb(task_ids));
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_owner,aid,'estimate_schedule',hash,answer);
 return answer;
end $$;

-- ===================== 2. Saved task-center views =====================
create table if not exists public.pro_task_center_view_heads(owner_id uuid not null references public.profiles(id) on delete cascade,person_id uuid not null,revision integer not null check(revision>0),primary key(owner_id,person_id));
create table if not exists public.pro_task_center_views(
 owner_id uuid not null,person_id uuid not null,id uuid not null,name text not null check(length(btrim(name)) between 1 and 60),filters jsonb not null check(jsonb_typeof(filters)='object'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,person_id,id),
 foreign key(owner_id,person_id) references public.pro_task_center_view_heads(owner_id,person_id) on delete cascade);
create or replace function public.pro_task_view_filters_ok(p jsonb) returns boolean language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_typeof(p)='object' and pro_ops_keys(p)=array['assignee','job','q','status','timing']
  and p->>'status' in('open','done','all') and p->>'timing' in('all','overdue','today','upcoming')
  and jsonb_typeof(p->'q')='string' and length(p->>'q')<=100 and jsonb_typeof(p->'job')='string' and length(p->>'job')<=160 and jsonb_typeof(p->'assignee')='string' and length(p->>'assignee')<=161
  and (p->>'q')||(p->>'job')||(p->>'assignee') !~ '[\u0001-\u001f]'
$$;
create or replace function public.pro_task_views_read(p_owner uuid,p_person uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_work_timer_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('revision',coalesce((select revision from public.pro_task_center_view_heads where owner_id=p_owner and person_id=p_person),0),'capacity',20,
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'filters',v.filters) order by lower(v.name),v.id) from public.pro_task_center_views v where v.owner_id=p_owner and v.person_id=p_person),'[]'::jsonb));
end $$;
create or replace function public.pro_task_views_mutate(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;vid uuid;rev integer;cur integer;hash text:=md5(coalesce(p_input::text,''));replay jsonb;answer jsonb;
begin
 if not public.pro_work_timer_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if not(act='save' and pro_ops_keys(p_input)=array['action','actionId','filters','name','revision','viewId'] or act='delete' and pro_ops_keys(p_input)=array['action','actionId','revision','viewId'])
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) then raise exception 'Invalid view' using errcode='22023';end if;
 if act='save' and (jsonb_typeof(p_input->'name') is distinct from 'string' or not pro_ops_text_ok(p_input->>'name',1,60) or not pro_task_view_filters_ok(p_input->'filters')) then raise exception 'Invalid view' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;vid:=(p_input->>'viewId')::uuid;exception when others then raise exception 'Invalid view' using errcode='22023';end;
 rev:=(p_input->>'revision')::integer;
 replay:=pro_ops_receipt(p_owner,p_person,aid,hash);if replay is not null then return replay;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-task-views:'||p_owner::text||':'||p_person::text,0));
 select revision into cur from public.pro_task_center_view_heads where owner_id=p_owner and person_id=p_person for update;cur:=coalesce(cur,0);
 if cur<>rev then raise exception 'Views changed' using errcode='40001';end if;
 insert into public.pro_task_center_view_heads values(p_owner,p_person,cur+1) on conflict(owner_id,person_id) do update set revision=excluded.revision;
 if act='save' then
  if exists(select 1 from public.pro_task_center_views where owner_id=p_owner and person_id=p_person and id<>vid and lower(btrim(name))=lower(btrim(p_input->>'name'))) then raise exception 'Duplicate view name' using errcode='23505';end if;
  if not exists(select 1 from public.pro_task_center_views where owner_id=p_owner and person_id=p_person and id=vid) and (select count(*) from public.pro_task_center_views where owner_id=p_owner and person_id=p_person)>=20 then raise exception 'Too many views' using errcode='54000';end if;
  insert into public.pro_task_center_views(owner_id,person_id,id,name,filters) values(p_owner,p_person,vid,btrim(p_input->>'name'),p_input->'filters')
   on conflict(owner_id,person_id,id) do update set name=excluded.name,filters=excluded.filters,updated_at=clock_timestamp();
 else
  delete from public.pro_task_center_views where owner_id=p_owner and person_id=p_person and id=vid;
  if not found then raise exception 'View unavailable' using errcode='P0002';end if;
 end if;
 answer:=jsonb_build_object('action',act,'viewId',vid,'revision',cur+1);
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_person,aid,'task_view',hash,answer);
 return answer;
end $$;

-- ===================== 3. Time clock and weekly timesheets =====================
create table if not exists public.pro_time_clock_settings(owner_id uuid primary key references public.profiles(id) on delete cascade,gps_enabled boolean not null default false,revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp());
create table if not exists public.pro_time_clock_details(
 owner_id uuid not null,timer_id uuid not null,task_id uuid,gps jsonb check(gps is null or jsonb_typeof(gps)='object'),at timestamptz not null default clock_timestamp(),primary key(owner_id,timer_id),
 foreign key(owner_id,timer_id) references public.pro_work_timers(owner_id,id) on delete cascade);
create table if not exists public.pro_timesheet_decisions(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,person_key text not null check(length(person_key) between 1 and 200),week_start date not null check(extract(isodow from week_start)=1),
 decision text not null check(decision in('approved','reopened')),minutes integer not null check(minutes between 0 and 100000),entry_count integer not null check(entry_count between 0 and 10000),digest text not null check(digest~'^[a-f0-9]{32}$'),
 note text not null default '' check(length(note)<=300),decided_by uuid not null,decided_by_name text not null default '' check(length(decided_by_name)<=160),at timestamptz not null default clock_timestamp(),primary key(owner_id,id));
create index if not exists pro_timesheet_decisions_last on public.pro_timesheet_decisions(owner_id,person_key,week_start,at desc);
create or replace function public.pro_time_clock_in(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;tid uuid;gps jsonb;enabled boolean;result jsonb;
begin
 if pro_ops_keys(p_input) is distinct from array['action','actionId','activityId','billable','gps','note','taskId','workId'] or p_input->>'action'<>'clock_in' or jsonb_typeof(p_input->'taskId') not in('string','null') or jsonb_typeof(p_input->'gps') not in('object','null') then raise exception 'Invalid clock in' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;tid:=nullif(p_input->>'taskId','')::uuid;exception when others then raise exception 'Invalid clock in' using errcode='22023';end;
 gps:=case when jsonb_typeof(p_input->'gps')='object' then p_input->'gps' end;
 if gps is not null then
  if pro_ops_keys(gps) is distinct from array['accuracy','lat','lng'] or jsonb_typeof(gps->'lat')<>'number' or jsonb_typeof(gps->'lng')<>'number' or jsonb_typeof(gps->'accuracy')<>'number'
   or (gps->>'lat')::numeric not between -90 and 90 or (gps->>'lng')::numeric not between -180 and 180 or (gps->>'accuracy')::numeric not between 0 and 100000 then raise exception 'Invalid location' using errcode='22023';end if;
  select gps_enabled into enabled from public.pro_time_clock_settings where owner_id=p_owner;
  if not coalesce(enabled,false) then raise exception 'Location is off' using errcode='22023';end if;
  gps:=jsonb_build_object('lat',round((gps->>'lat')::numeric,5),'lng',round((gps->>'lng')::numeric,5),'accuracy',round((gps->>'accuracy')::numeric));
 end if;
 if tid is not null and not exists(select 1 from public.pro_work_tasks where owner_id=p_owner and work_id=p_input->>'workId' and id=tid and not archived) then raise exception 'Task unavailable' using errcode='40001';end if;
 result:=public.pro_work_timer_mutate(p_owner,p_person,jsonb_build_object('action','start','actionId',aid,'workId',p_input->'workId','activityId',p_input->'activityId','billable',p_input->'billable','note',p_input->'note'));
 if tid is not null or gps is not null then insert into public.pro_time_clock_details(owner_id,timer_id,task_id,gps) values(p_owner,aid,tid,gps) on conflict do nothing;end if;
 return result||jsonb_build_object('taskId',tid,'location',gps is not null);
end $$;
create or replace function public.pro_time_clock_settings_save(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare cur integer;answer jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) or public.pro_role_of(p_person,p_owner) is distinct from 'admin' then raise exception 'Forbidden' using errcode='42501';end if;
 if pro_ops_keys(p_input) is distinct from array['action','gpsEnabled','revision'] or p_input->>'action'<>'settings' or jsonb_typeof(p_input->'gpsEnabled')<>'boolean' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) then raise exception 'Invalid settings' using errcode='22023';end if;
 select revision into cur from public.pro_time_clock_settings where owner_id=p_owner for update;cur:=coalesce(cur,0);
 if cur<>(p_input->>'revision')::integer then raise exception 'Settings changed' using errcode='40001';end if;
 insert into public.pro_time_clock_settings(owner_id,gps_enabled,revision) values(p_owner,(p_input->>'gpsEnabled')::boolean,cur+1)
  on conflict(owner_id) do update set gps_enabled=excluded.gps_enabled,revision=excluded.revision,updated_at=clock_timestamp();
 return jsonb_build_object('gpsEnabled',(p_input->>'gpsEnabled')::boolean,'revision',cur+1);
end $$;
-- Clock-in options of one job for one person: whether location is on and the job's open tasks.
create or replace function public.pro_time_clock_options(p_owner uuid,p_person uuid,p_work text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_work_timer_person_ok(p_owner,p_person) or not exists(select 1 from public.pro_work where user_id=p_owner and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('workId',p_work,'gpsEnabled',coalesce((select gps_enabled from public.pro_time_clock_settings where owner_id=p_owner),false),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title) order by x.s nulls last,lower(x.title),x.id) from(
   select t.id,t.title,p.planned_start s from public.pro_work_tasks t left join public.pro_work_schedule_plans p on p.owner_id=t.owner_id and p.work_id=t.work_id and p.task_id=t.id
   where t.owner_id=p_owner and t.work_id=p_work and not t.archived and t.status='open' order by p.planned_start nulls last,lower(t.title),t.id limit 200) x),'[]'::jsonb));
end $$;
-- Rows of one week for every person (owner: all; Administrator/Manager: all; others: only their own key).
create or replace function public.pro_timesheet_rows(p_owner uuid,p_week date) returns table(id uuid,person_key text,person_name text,recorded_on date,work_id text,work_title text,activity_name text,minutes integer,billable boolean,source text,note text,task_title text)
language sql stable security invoker set search_path=public,pg_temp as $$
 select r.id,r.person_key,r.person_name,r.recorded_on,r.work_id,r.work_title,r.activity_name,r.minutes,r.billable,r.source,r.note,
  (select t.title from public.pro_work_timers x join public.pro_time_clock_details c on c.owner_id=x.owner_id and c.timer_id=x.id join public.pro_work_tasks t on t.owner_id=c.owner_id and t.id=c.task_id where x.owner_id=p_owner and x.time_entry_id=r.id limit 1)
 from public.pro_time_report_rows(p_owner,p_week,p_week+6) r
$$;
create or replace function public.pro_timesheet_digest(p_owner uuid,p_week date,p_person_key text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('digest',md5(coalesce(string_agg(r.id::text||':'||r.minutes||':'||r.recorded_on,',' order by r.id),'')),'minutes',coalesce(sum(r.minutes),0),'count',count(*))
 from public.pro_timesheet_rows(p_owner,p_week) r where r.person_key=p_person_key
$$;
create or replace function public.pro_timesheet_read(p_owner uuid,p_person uuid,p_week date) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare role_name text:=public.pro_role_of(p_person,p_owner);everyone boolean;own_key text:='person:'||p_person::text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) or role_name is null then raise exception 'Forbidden' using errcode='42501';end if;
 if p_week is null or extract(isodow from p_week)<>1 or p_week not between date'2000-01-03' and date'2099-12-28' then raise exception 'Invalid week' using errcode='22023';end if;
 everyone:=role_name in('admin','manager');
 return jsonb_build_object('weekStart',p_week,'weekEnd',p_week+6,'canApprove',everyone,'canConfigure',role_name='admin','personKey',own_key,
  'gpsEnabled',coalesce((select gps_enabled from public.pro_time_clock_settings where owner_id=p_owner),false),'settingsRevision',coalesce((select revision from public.pro_time_clock_settings where owner_id=p_owner),0),
  'people',coalesce((select jsonb_agg(p.doc order by p.name,p.key) from(
   select k.key,k.name,jsonb_build_object('personKey',k.key,'personName',k.name,
    'days',(select jsonb_agg(coalesce((select sum(r.minutes) from public.pro_timesheet_rows(p_owner,p_week) r where r.person_key=k.key and r.recorded_on=p_week+g),0) order by g) from generate_series(0,6) g),
    'totalMinutes',(public.pro_timesheet_digest(p_owner,p_week,k.key)->>'minutes')::integer,
    'billableMinutes',coalesce((select sum(r.minutes) from public.pro_timesheet_rows(p_owner,p_week) r where r.person_key=k.key and r.billable),0),
    'digest',public.pro_timesheet_digest(p_owner,p_week,k.key)->>'digest',
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.recorded_on,'workId',r.work_id,'workTitle',r.work_title,'activityName',r.activity_name,'taskTitle',r.task_title,'minutes',r.minutes,'billable',r.billable,'source',r.source,'note',r.note) order by r.recorded_on,r.work_title,r.id) from public.pro_timesheet_rows(p_owner,p_week) r where r.person_key=k.key),'[]'::jsonb),
    'decision',(select jsonb_build_object('decision',x.decision,'at',x.at,'by',x.decided_by_name,'minutes',x.minutes,'note',x.note,'stale',x.digest<>(public.pro_timesheet_digest(p_owner,p_week,k.key)->>'digest')) from public.pro_timesheet_decisions x where x.owner_id=p_owner and x.person_key=k.key and x.week_start=p_week order by x.at desc,x.id desc limit 1)) doc
   from(select distinct r.person_key key,first_value(r.person_name) over(partition by r.person_key order by r.recorded_on desc) name from public.pro_timesheet_rows(p_owner,p_week) r
        union select e->>'key',e->>'name' from jsonb_array_elements(public.pro_ops_people(p_owner)) e) k
   where (everyone or k.key=own_key) and k.key is not null) p where p.doc is not null),'[]'::jsonb),
  'open',coalesce((select jsonb_agg(jsonb_build_object('personKey','person:'||x.person_id::text,'personName',x.person_name,'workTitle',w.service,'status',x.status,'startedAt',x.started_at,
     'taskTitle',(select t.title from public.pro_work_tasks t where t.owner_id=c.owner_id and t.id=c.task_id),'location',c.gps is not null) order by x.started_at)
   from public.pro_work_timers x join public.pro_work w on w.user_id=x.owner_id and w.id=x.work_id left join public.pro_time_clock_details c on c.owner_id=x.owner_id and c.timer_id=x.id
   where x.owner_id=p_owner and x.status in('running','stopped') and (everyone or x.person_id=p_person)),'[]'::jsonb));
end $$;
create or replace function public.pro_timesheet_decide(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;wk date;pkey text;hash text:=md5(coalesce(p_input::text,''));replay jsonb;cur jsonb;last public.pro_timesheet_decisions;answer jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) or public.pro_role_of(p_person,p_owner) not in('admin','manager') then raise exception 'Forbidden' using errcode='42501';end if;
 if pro_ops_keys(p_input) is distinct from array['action','actionId','digest','note','personKey','weekStart'] or p_input->>'action' not in('approve','reopen') or jsonb_typeof(p_input->'personKey')<>'string' or jsonb_typeof(p_input->'note')<>'string' or length(p_input->>'note')>300
  or not coalesce(p_input->>'digest'~'^[a-f0-9]{32}$',false) or not coalesce(p_input->>'weekStart'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid decision' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;wk:=(p_input->>'weekStart')::date;exception when others then raise exception 'Invalid decision' using errcode='22023';end;
 if extract(isodow from wk)<>1 then raise exception 'Invalid week' using errcode='22023';end if;
 pkey:=p_input->>'personKey';
 if length(pkey) not between 1 and 200 or not(pkey='owner' or pkey ~ '^(person|grant|name):') then raise exception 'Invalid person' using errcode='22023';end if;
 replay:=pro_ops_receipt(p_owner,p_person,aid,hash);if replay is not null then return replay;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-timesheet:'||p_owner::text||':'||pkey||':'||wk::text,0));
 cur:=public.pro_timesheet_digest(p_owner,wk,pkey);
 if cur->>'digest'<>p_input->>'digest' then raise exception 'Week changed' using errcode='40001';end if;
 select * into last from public.pro_timesheet_decisions where owner_id=p_owner and person_key=pkey and week_start=wk order by at desc,id desc limit 1;
 if p_input->>'action'='approve' and found and last.decision='approved' and last.digest=cur->>'digest' then raise exception 'Already approved' using errcode='40001';end if;
 if p_input->>'action'='reopen' and (not found or last.decision<>'approved') then raise exception 'Not approved' using errcode='40001';end if;
 if p_input->>'action'='approve' and (cur->>'count')::integer=0 then raise exception 'Empty week' using errcode='22023';end if;
 insert into public.pro_timesheet_decisions(owner_id,id,person_key,week_start,decision,minutes,entry_count,digest,note,decided_by,decided_by_name)
  values(p_owner,aid,pkey,wk,case when p_input->>'action'='approve' then 'approved' else 'reopened' end,(cur->>'minutes')::integer,(cur->>'count')::integer,cur->>'digest',btrim(p_input->>'note'),p_person,
   left(coalesce((select nullif(btrim(member_name),'') from public.pro_company_members where owner_id=p_owner and member_user_id=p_person and active),nullif(btrim(public.pro_team_name(p_person)),''),'Propietario'),160));
 answer:=jsonb_build_object('action',p_input->>'action','personKey',pkey,'weekStart',wk,'minutes',(cur->>'minutes')::integer,'digest',cur->>'digest');
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_person,aid,'timesheet',hash,answer);
 return answer;
end $$;

-- ===================== 4. Notification channels (WhatsApp stored, never sent) =====================
create table if not exists public.pro_notification_channel_prefs(
 owner_id uuid not null references public.profiles(id) on delete cascade,person_id uuid not null references public.profiles(id) on delete cascade,
 whatsapp jsonb not null default '{}'::jsonb check(jsonb_typeof(whatsapp)='object'),revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,person_id));
create or replace function public.pro_notification_channels_read(p_owner uuid,p_person uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare c public.pro_notification_channel_prefs;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into c from public.pro_notification_channel_prefs where owner_id=p_owner and person_id=p_person;
 return jsonb_build_object('revision',coalesce(c.revision,0),'delivery','stored_not_sent',
  'whatsapp',(select jsonb_object_agg(e,coalesce((c.whatsapp->>e)::boolean,false)) from unnest(public.pro_notification_events()) e));
end $$;
create or replace function public.pro_notification_channels_save(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;hash text:=md5(coalesce(p_input::text,''));replay jsonb;e text;base jsonb:='{}'::jsonb;wa jsonb:='{}'::jsonb;cur integer;settings jsonb;answer jsonb;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if pro_ops_keys(p_input) is distinct from array['actionId','channelRevision','dueSoonDays','overdueGraceDays','prefs','revision'] or jsonb_typeof(p_input->'prefs')<>'object' or not coalesce(p_input->>'channelRevision'~'^[0-9]{1,9}$',false) then raise exception 'Invalid channels' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid channels' using errcode='22023';end;
 for e in select jsonb_object_keys(p_input->'prefs') loop
  if not e=any(public.pro_notification_events()) or pro_ops_keys(p_input->'prefs'->e) is distinct from array['email','inApp','whatsapp'] or jsonb_typeof(p_input->'prefs'->e->'whatsapp')<>'boolean' then raise exception 'Invalid preference' using errcode='22023';end if;
  base:=base||jsonb_build_object(e,jsonb_build_object('inApp',p_input->'prefs'->e->'inApp','email',p_input->'prefs'->e->'email'));wa:=wa||jsonb_build_object(e,p_input->'prefs'->e->'whatsapp');
 end loop;
 replay:=pro_ops_receipt(p_owner,p_person,aid,hash);if replay is not null then return replay;end if;
 select revision into cur from public.pro_notification_channel_prefs where owner_id=p_owner and person_id=p_person for update;cur:=coalesce(cur,0);
 if cur<>(p_input->>'channelRevision')::integer then raise exception 'Channels changed' using errcode='40001';end if;
 -- In-app and email go through the existing settings writer (same validation, CAS and history).
 settings:=public.pro_notifications_mutate(p_owner,p_person,jsonb_build_object('action','settings','actionId',pro_ops_uuid(aid::text||':settings'),'revision',p_input->'revision','dueSoonDays',p_input->'dueSoonDays','overdueGraceDays',p_input->'overdueGraceDays','prefs',base));
 insert into public.pro_notification_channel_prefs(owner_id,person_id,whatsapp,revision) values(p_owner,p_person,wa,cur+1)
  on conflict(owner_id,person_id) do update set whatsapp=excluded.whatsapp,revision=excluded.revision,updated_at=clock_timestamp();
 answer:=jsonb_build_object('settings',settings->'settings','channels',public.pro_notification_channels_read(p_owner,p_person));
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_person,aid,'notify_channels',hash,answer);
 return answer;
end $$;

-- ===================== 5. Daily log crew from the team =====================
create table if not exists public.pro_daily_log_crew(
 owner_id uuid not null,work_id text not null,log_id uuid not null,person_key text not null check(person_key~'^person:[0-9a-f-]{36}$'),person_name text not null check(length(person_name) between 1 and 160),
 minutes integer check(minutes is null or minutes between 0 and 1440),position integer not null check(position between 0 and 99),primary key(owner_id,work_id,log_id,person_key),
 foreign key(owner_id,work_id,log_id) references public.pro_daily_logs(owner_id,work_id,id) on delete cascade);
create or replace function public.pro_daily_log_crew_read(p_owner uuid,p_work text,p_log uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_daily_logs;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into l from public.pro_daily_logs where owner_id=p_owner and work_id=p_work and id=p_log;
 if not found then raise exception 'Entry unavailable' using errcode='P0002';end if;
 return jsonb_build_object('logId',l.id,'workId',l.work_id,'revision',l.revision,'clientVisible',l.client_visible,'crewCount',l.crew_count,'crewMinutes',l.crew_minutes,'people',public.pro_ops_people(p_owner),
  'crew',coalesce((select jsonb_agg(jsonb_build_object('personKey',c.person_key,'personName',c.person_name,'minutes',c.minutes) order by c.position) from public.pro_daily_log_crew c where c.owner_id=p_owner and c.work_id=p_work and c.log_id=p_log),'[]'::jsonb));
end $$;
create or replace function public.pro_daily_log_crew_save(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;lid uuid;wid text;hash text:=md5(coalesce(p_input::text,''));replay jsonb;l public.pro_daily_logs;c jsonb;people jsonb:=public.pro_ops_people(p_owner);n integer:=0;total integer:=0;any_minutes boolean:=false;written jsonb;answer jsonb;who text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if pro_ops_keys(p_input) is distinct from array['actionId','crew','logId','revision','workId'] or jsonb_typeof(p_input->'crew')<>'array' or jsonb_array_length(p_input->'crew')>50 or jsonb_typeof(p_input->'workId')<>'string' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) then raise exception 'Invalid crew' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'logId')::uuid;exception when others then raise exception 'Invalid crew' using errcode='22023';end;
 wid:=p_input->>'workId';
 for c in select value from jsonb_array_elements(p_input->'crew') loop
  if jsonb_typeof(c)<>'object' or pro_ops_keys(c) is distinct from array['minutes','personKey'] or jsonb_typeof(c->'personKey')<>'string' or jsonb_typeof(c->'minutes') not in('number','null') or (c->>'minutes') is not null and not coalesce(c->>'minutes'~'^[0-9]{1,4}$',false) or coalesce((c->>'minutes')::integer,0)>1440 then raise exception 'Invalid crew' using errcode='22023';end if;
  if not exists(select 1 from jsonb_array_elements(people) p where p->>'key'=c->>'personKey') then raise exception 'Person unavailable' using errcode='40001';end if;
 end loop;
 if (select count(distinct value->>'personKey') from jsonb_array_elements(p_input->'crew'))<>jsonb_array_length(p_input->'crew') then raise exception 'Duplicate person' using errcode='22023';end if;
 replay:=pro_ops_receipt(p_owner,p_owner,aid,hash);if replay is not null then return replay;end if;
 select * into l from public.pro_daily_logs where owner_id=p_owner and work_id=wid and id=lid for update;
 if not found then raise exception 'Entry unavailable' using errcode='P0002';end if;
 if l.revision<>(p_input->>'revision')::integer then raise exception 'Entry changed' using errcode='40001';end if;
 delete from public.pro_daily_log_crew where owner_id=p_owner and work_id=wid and log_id=lid;
 for c in select value from jsonb_array_elements(p_input->'crew') loop
  select p->>'name' into who from jsonb_array_elements(people) p where p->>'key'=c->>'personKey';
  insert into public.pro_daily_log_crew values(p_owner,wid,lid,c->>'personKey',left(who,160),(c->>'minutes')::integer,n);n:=n+1;
  if c->>'minutes' is not null then any_minutes:=true;total:=total+(c->>'minutes')::integer;end if;
 end loop;
 -- The entry's crew summary goes through the existing journal writer (history, receipt, revision).
 written:=public.pro_work_journal_mutate(p_owner,jsonb_build_object('action','journal_set','actionId',pro_ops_uuid(aid::text||':journal'),'workId',wid,'logId',lid,'revision',l.revision,'clientVisible',l.client_visible,
  'crewCount',case when n=0 then null else n end,'crewMinutes',case when any_minutes then total end));
 answer:=jsonb_build_object('logId',lid,'workId',wid,'revision',(written->>'revision')::integer,'crewCount',written->'crewCount','crewMinutes',written->'crewMinutes');
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_owner,aid,'crew',hash,answer);
 return answer;
end $$;

-- ===================== 6. Custom roles (restrict only) =====================
create table if not exists public.pro_company_custom_roles(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,name text not null check(length(btrim(name)) between 1 and 40),base_role text not null check(base_role in('admin','manager','member','read_only')),
 capabilities text[] not null,archived boolean not null default false,revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,id));
create unique index if not exists pro_company_custom_roles_name on public.pro_company_custom_roles(owner_id,lower(btrim(name))) where not archived;
create table if not exists public.pro_company_member_custom_roles(owner_id uuid not null,member_id uuid not null,custom_role_id uuid not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,member_id),
 foreign key(owner_id,member_id) references public.pro_company_members(owner_id,id) on delete cascade,
 constraint pro_company_member_custom_roles_role_fkey foreign key(owner_id,custom_role_id) references public.pro_company_custom_roles(owner_id,id) on delete cascade);
-- Deleting the account removes its roles and their assignments (an archived role in use cannot be archived; see the writer).
alter table public.pro_company_member_custom_roles drop constraint if exists pro_company_member_custom_roles_owner_id_custom_role_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conname='pro_company_member_custom_roles_role_fkey') then
 alter table public.pro_company_member_custom_roles add constraint pro_company_member_custom_roles_role_fkey foreign key(owner_id,custom_role_id) references public.pro_company_custom_roles(owner_id,id) on delete cascade;end if;end $$;
create table if not exists public.pro_company_custom_role_history(owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,actor_id uuid not null,action text not null,before_state jsonb,after_state jsonb,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create or replace function public.pro_ops_capabilities() returns text[] language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage','inventory.write','listing.publish','price.write','menu.write']
$$;
-- Capabilities left by the member's custom role (null = no custom role: the base role decides alone).
create or replace function public.pro_ops_custom_caps(p_member uuid,p_owner uuid) returns text[] language sql stable security invoker set search_path=public,pg_temp as $$
 select c.capabilities from public.pro_company_members m join public.pro_company_member_custom_roles a on a.owner_id=m.owner_id and a.member_id=m.id
  join public.pro_company_custom_roles c on c.owner_id=a.owner_id and c.id=a.custom_role_id and not c.archived
 where m.owner_id=p_owner and m.member_user_id=p_member and m.active and p_member<>p_owner
$$;
-- The single role check: base role first, then the member's custom role can only take capabilities away.
create or replace function public.pro_role_require(p_actor uuid,p_owner uuid,p_capability text) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;caps text[];
begin
 if p_capability is null or not p_capability=any(public.pro_ops_capabilities()) then raise exception 'Unknown capability' using errcode='22023';end if;
 r:=public.pro_role_of(p_actor,p_owner);
 if r is null or not public.pro_role_allows(r,p_capability) then raise exception 'Role does not allow %',p_capability using errcode='42501';end if;
 caps:=public.pro_ops_custom_caps(p_actor,p_owner);
 if caps is not null and not p_capability=any(caps) then raise exception 'Custom role does not allow %',p_capability using errcode='42501';end if;
 return r;
end $$;
-- Same answer as pro-editions-team-gate-local.sql, with the capabilities narrowed by the custom role (the UI hides
-- data-pro-write controls from this list).
create or replace function public.pro_team_workspace_resolve(p_member uuid,p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;caps text[];
begin
 if p_member is null or p_owner is null or p_member=p_owner then return null;end if;
 r:=public.pro_role_of(p_member,p_owner);
 if r is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then return null;end if;
 caps:=public.pro_ops_custom_caps(p_member,p_owner);
 return jsonb_build_object('ownerId',p_owner,'ownerName',coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=p_owner),public.pro_team_name(p_owner)),
  'role',r,'capabilities',(select jsonb_agg(c) from unnest(public.pro_ops_capabilities()) c where public.pro_role_allows(r,c) and (caps is null or c=any(caps))));
end $$;
create or replace function public.pro_custom_roles_read(p_actor uuid,p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if public.pro_role_of(p_actor,p_owner) is null then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('capabilities',to_jsonb(public.pro_ops_capabilities()),
  'matrix',(select jsonb_object_agg(r,(select coalesce(jsonb_agg(c order by o),'[]'::jsonb) from unnest(public.pro_ops_capabilities()) with ordinality x(c,o) where public.pro_role_allows(r,c))) from unnest(array['admin','manager','member','read_only']) r),
  'canManage',public.pro_role_of(p_actor,p_owner)='admin',
  'roles',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'baseRole',c.base_role,'capabilities',to_jsonb(c.capabilities),'archived',c.archived,'revision',c.revision,
    'members',(select count(*) from public.pro_company_member_custom_roles a where a.owner_id=c.owner_id and a.custom_role_id=c.id)) order by c.archived,lower(c.name)) from public.pro_company_custom_roles c where c.owner_id=p_owner),'[]'::jsonb),
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('memberId',m.id,'memberName',coalesce(nullif(btrim(m.member_name),''),m.member_email),'role',m.role,'customRoleId',a.custom_role_id) order by lower(m.member_name),m.id)
   from public.pro_company_members m left join public.pro_company_member_custom_roles a on a.owner_id=m.owner_id and a.member_id=m.id where m.owner_id=p_owner and m.active),'[]'::jsonb));
end $$;
create or replace function public.pro_custom_roles_mutate(p_actor uuid,p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;rid uuid;mid uuid;hash text:=md5(coalesce(p_input::text,''));replay jsonb;caps text[];c public.pro_company_custom_roles;m public.pro_company_members;before_json jsonb;answer jsonb;
begin
 perform public.pro_role_require(p_actor,p_owner,'team.manage');
 if not(act='save' and pro_ops_keys(p_input)=array['action','actionId','baseRole','capabilities','name','revision','roleId']
  or act in('archive','restore') and pro_ops_keys(p_input)=array['action','actionId','revision','roleId']
  or act='assign' and pro_ops_keys(p_input)=array['action','actionId','memberId','roleId']) then raise exception 'Invalid custom role' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;rid:=nullif(p_input->>'roleId','')::uuid;mid:=nullif(p_input->>'memberId','')::uuid;exception when others then raise exception 'Invalid custom role' using errcode='22023';end;
 replay:=pro_ops_receipt(p_owner,p_actor,aid,hash);if replay is not null then return replay;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-custom-roles:'||p_owner::text,0));
 if act='assign' then
  select * into m from public.pro_company_members where owner_id=p_owner and id=mid and active;if not found then raise exception 'Member unavailable' using errcode='P0002';end if;
  before_json:=(select jsonb_build_object('customRoleId',custom_role_id) from public.pro_company_member_custom_roles where owner_id=p_owner and member_id=mid);
  if rid is null then delete from public.pro_company_member_custom_roles where owner_id=p_owner and member_id=mid;
  else
   select * into c from public.pro_company_custom_roles where owner_id=p_owner and id=rid;
   if not found or c.archived then raise exception 'Role unavailable' using errcode='40001';end if;
   insert into public.pro_company_member_custom_roles(owner_id,member_id,custom_role_id) values(p_owner,mid,rid) on conflict(owner_id,member_id) do update set custom_role_id=excluded.custom_role_id,at=clock_timestamp();
  end if;
  answer:=jsonb_build_object('action','assign','memberId',mid,'roleId',rid);
 else
  if jsonb_typeof(p_input->'revision')<>'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) or rid is null then raise exception 'Invalid custom role' using errcode='22023';end if;
  select * into c from public.pro_company_custom_roles where owner_id=p_owner and id=rid for update;
  if coalesce(c.revision,0)<>(p_input->>'revision')::integer then raise exception 'Role changed' using errcode='40001';end if;
  before_json:=case when c.id is null then null else to_jsonb(c) end;
  if act='save' then
   if jsonb_typeof(p_input->'name')<>'string' or not pro_ops_text_ok(p_input->>'name',1,40) or p_input->>'baseRole' not in('admin','manager','member','read_only') or jsonb_typeof(p_input->'capabilities')<>'array' then raise exception 'Invalid custom role' using errcode='22023';end if;
   select coalesce(array_agg(distinct value order by value),array[]::text[]) into caps from jsonb_array_elements_text(p_input->'capabilities');
   if cardinality(caps)<>jsonb_array_length(p_input->'capabilities') or exists(select 1 from unnest(caps) x where not public.pro_role_allows(p_input->>'baseRole',x)) or not 'read'=any(caps) then raise exception 'Capabilities exceed the base role' using errcode='22023';end if;
   if c.id is not null and c.archived then raise exception 'Role archived' using errcode='40001';end if;
   if c.id is null and (select count(*) from public.pro_company_custom_roles where owner_id=p_owner)>=20 then raise exception 'Too many roles' using errcode='54000';end if;
   insert into public.pro_company_custom_roles(owner_id,id,name,base_role,capabilities,revision) values(p_owner,rid,btrim(p_input->>'name'),p_input->>'baseRole',caps,coalesce(c.revision,0)+1)
    on conflict(owner_id,id) do update set name=excluded.name,base_role=excluded.base_role,capabilities=excluded.capabilities,revision=excluded.revision,updated_at=clock_timestamp() returning * into c;
  else
   if c.id is null then raise exception 'Role unavailable' using errcode='P0002';end if;
   if (act='archive')=c.archived then raise exception 'Role status changed' using errcode='40001';end if;
   if act='archive' and exists(select 1 from public.pro_company_member_custom_roles where owner_id=p_owner and custom_role_id=rid) then raise exception 'Role in use' using errcode='40001';end if;
   update public.pro_company_custom_roles set archived=(act='archive'),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_owner and id=rid returning * into c;
  end if;
  answer:=jsonb_build_object('action',act,'roleId',c.id,'revision',c.revision);
 end if;
 insert into public.pro_company_custom_role_history(owner_id,action_id,actor_id,action,before_state,after_state) values(p_owner,aid,p_actor,act,before_json,answer);
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_actor,aid,'custom_role',hash,answer);
 return answer;
end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_ops_actions','pro_estimate_schedule_runs','pro_timesheet_decisions','pro_company_custom_role_history','pro_time_clock_details'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_ops_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['pro_ops_actions','pro_estimate_schedule_runs','pro_task_center_view_heads','pro_task_center_views','pro_time_clock_settings','pro_time_clock_details','pro_timesheet_decisions',
  'pro_notification_channel_prefs','pro_daily_log_crew','pro_company_custom_roles','pro_company_member_custom_roles','pro_company_custom_role_history'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_ops_uuid','pro_ops_immutable','pro_ops_keys','pro_ops_text_ok','pro_ops_people','pro_ops_receipt','pro_ops_capabilities','pro_estimate_schedule_days','pro_estimate_schedule_source','pro_estimate_schedule_apply',
  'pro_task_view_filters_ok','pro_task_views_read','pro_task_views_mutate','pro_time_clock_in','pro_time_clock_options','pro_time_clock_settings_save','pro_timesheet_rows','pro_timesheet_digest','pro_timesheet_read','pro_timesheet_decide',
  'pro_notification_channels_read','pro_notification_channels_save','pro_daily_log_crew_read','pro_daily_log_crew_save','pro_role_require','pro_ops_custom_caps','pro_team_workspace_resolve','pro_custom_roles_read','pro_custom_roles_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
