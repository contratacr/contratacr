-- LOCAL PRO ONLY. Explicit private opportunity -> unscheduled private work.
-- No appointments, quotes, acceptance, payments, delivery or commercial-stage changes.
begin;
create table if not exists public.pro_manual_lead_works(
 owner_id uuid not null references profiles(id) on delete cascade,
 action_id uuid not null,lead_kind text not null default 'manual' check(lead_kind='manual'),lead_id uuid not null,
 source_lead_revision integer not null check(source_lead_revision>0),source_client_id text not null,source_snapshot jsonb not null,
 work_id uuid not null,work_id_text text generated always as(work_id::text)stored,
 input jsonb not null,result jsonb not null,actor_name text not null,created_at timestamptz not null default now(),
 primary key(owner_id,action_id),unique(owner_id,lead_id),unique(owner_id,work_id),
 foreign key(owner_id,lead_kind,lead_id)references pro_lead_center_records(owner_id,kind,id)on delete cascade,
 foreign key(owner_id,work_id_text)references pro_work(user_id,id)deferrable initially deferred
);
create or replace function public.pro_manual_lead_work_authorize(p_actor uuid,p_action uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$declare r pro_manual_lead_works;begin
 perform pro_request_pipeline_owner(p_actor);select * into r from pro_manual_lead_works where owner_id=p_actor and action_id=p_action;if not found then raise exception 'Conversion unavailable' using errcode='42501';end if;
 if not exists(select 1 from pro_lead_center_records where owner_id=p_actor and kind='manual' and id=r.lead_id)or not exists(select 1 from pro_work where user_id=p_actor and id=r.work_id_text and "clientId"=r.source_client_id and "bookingClientId"is null)then raise exception 'Conversion ownership unavailable' using errcode='42501';end if;end $$;
create or replace function public.pro_manual_lead_work_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$declare r pro_manual_lead_works;begin
 perform pro_request_pipeline_owner(p_actor);select * into r from pro_manual_lead_works where owner_id=p_actor and action_id=p_action;if not found then return jsonb_build_object('receipt',null);end if;perform pro_manual_lead_work_authorize(p_actor,p_action);return jsonb_build_object('receipt',jsonb_build_object('input',r.input,'result',r.result));end $$;
create or replace function public.pro_manual_lead_work_mapping_read(p_actor uuid,p_lead uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$declare r pro_manual_lead_works;begin
 perform pro_request_pipeline_owner(p_actor);if not exists(select 1 from pro_lead_center_records where owner_id=p_actor and kind='manual' and id=p_lead)then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
 select * into r from pro_manual_lead_works where owner_id=p_actor and lead_id=p_lead;if not found then return jsonb_build_object('mapping',null);end if;perform pro_manual_lead_work_authorize(p_actor,r.action_id);return jsonb_build_object('mapping',r.result);end $$;
create or replace function public.pro_manual_lead_work_context(p_actor uuid,p_lead uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$declare l pro_lead_center_records;c pro_clients;m jsonb;begin
 perform pro_request_pipeline_owner(p_actor);select * into l from pro_lead_center_records where owner_id=p_actor and kind='manual' and id=p_lead;if not found then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
 m:=pro_manual_lead_work_mapping_read(p_actor,p_lead)->'mapping';select * into c from pro_clients where user_id=p_actor and id=l.client_id;
 if not found then raise exception 'Private customer unavailable' using errcode='42501';end if;
 if m='null'::jsonb and(l.archived or c.archived)then raise exception 'Restore the opportunity and customer before converting' using errcode='40001';end if;
 return jsonb_build_object('source',jsonb_build_object('leadId',l.id,'leadRevision',l.revision,'clientId',l.client_id),'client',jsonb_build_object('id',c.id,'name',c.name,'archived',c.archived),'service',l.title,'mapping',m);end $$;
create or replace function public.pro_manual_lead_work_convert(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$declare aid uuid;lid uuid;wid uuid;rev integer;l pro_lead_center_records;c pro_clients;r pro_manual_lead_works;v integer;w jsonb;answer jsonb;begin
 perform pro_request_pipeline_owner(p_actor);
 if jsonb_typeof(p_input)is distinct from'object'or not(p_input?&array['action','actionId','leadId','leadRevision','workId'])or exists(select 1 from jsonb_object_keys(p_input)k where k<>all(array['action','actionId','leadId','leadRevision','workId']))or p_input->>'action'is distinct from'convert'or jsonb_typeof(p_input->'actionId')is distinct from'string'or jsonb_typeof(p_input->'leadId')is distinct from'string'or jsonb_typeof(p_input->'workId')is distinct from'string'or jsonb_typeof(p_input->'leadRevision')is distinct from'number'or not coalesce(p_input->>'leadRevision'~'^[0-9]{1,10}$',false)or(p_input->>'leadRevision')::numeric not between 1 and 2147483647 then raise exception 'Invalid conversion' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'leadId')::uuid;wid:=(p_input->>'workId')::uuid;rev:=(p_input->>'leadRevision')::integer;
 -- Reentrant old core/customer owner lock precedes catalogue/source rows.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));perform pg_advisory_xact_lock(hashtextextended('pro-manual-lead-work-action:'||p_actor::text||':'||aid::text,0));perform pg_advisory_xact_lock(hashtextextended('pro-request-pipeline-catalog:'||p_actor::text,0));perform pro_request_pipeline_owner(p_actor);
 select * into r from pro_manual_lead_works where owner_id=p_actor and action_id=aid;if found then perform pro_manual_lead_work_authorize(p_actor,aid);if r.input is distinct from p_input then raise exception 'Conversion action reused' using errcode='22023';end if;return r.result;end if;
 select * into l from pro_lead_center_records where owner_id=p_actor and kind='manual'and id=lid for update;if not found then raise exception 'Opportunity unavailable' using errcode='42501';end if;
 if exists(select 1 from pro_manual_lead_works where owner_id=p_actor and lead_id=lid)then raise exception 'Opportunity already converted' using errcode='40001';end if;
 if l.archived or l.revision<>rev then raise exception 'Opportunity changed' using errcode='40001';end if;
 if exists(select 1 from pro_work where user_id=p_actor and id=wid::text)then raise exception 'Work identity already exists' using errcode='40001';end if;
 select * into c from pro_clients where user_id=p_actor and id=l.client_id for update;if not found or c.archived then raise exception 'Choose an active private customer' using errcode='40001';end if;perform pro_request_pipeline_owner(p_actor);
 select revision into v from pro_workspace_core where user_id=p_actor for update;if coalesce(v,0)>=2147483647 then raise exception 'Workspace revision exhausted' using errcode='40001';end if;
 w:=jsonb_build_object('id',wid,'client',c.name,'service',l.title,'stage','new','start','','end','','clientId',c.id,'cancelled',false);
 perform pro_patch_core(p_actor,'work',w,coalesce(v,0));perform pro_request_pipeline_owner(p_actor);
 answer:=jsonb_build_object('action','convert','link',jsonb_build_object('leadId',lid,'sourceLeadRevision',rev,'sourceClientId',c.id,'workId',wid,'createdAt',now()),'work',w);
 insert into pro_manual_lead_works(owner_id,action_id,lead_id,source_lead_revision,source_client_id,source_snapshot,work_id,input,result,actor_name)values(p_actor,aid,lid,rev,c.id,pro_lead_center_manual_json(l),wid,p_input,answer,pro_team_name(p_actor));perform pro_manual_lead_work_authorize(p_actor,aid);return answer;end $$;
create or replace function public.pro_manual_lead_work_guard()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if exists(select 1 from pro_manual_lead_works where owner_id=old.user_id and work_id_text=old.id)and(new.user_id is distinct from old.user_id or new.id is distinct from old.id or new."clientId"is distinct from old."clientId"or new."bookingClientId"is distinct from old."bookingClientId")then raise exception 'Converted work identity is immutable' using errcode='23514';end if;return new;end $$;
drop trigger if exists pro_manual_lead_work_guard on public.pro_work;
create trigger pro_manual_lead_work_guard before update on public.pro_work for each row execute function pro_manual_lead_work_guard();
create or replace function public.pro_manual_lead_work_immutable()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin raise exception 'Immutable opportunity conversion'using errcode='23514';end $$;
drop trigger if exists pro_manual_lead_work_immutable on public.pro_manual_lead_works;
create trigger pro_manual_lead_work_immutable before update on public.pro_manual_lead_works for each row execute function pro_manual_lead_work_immutable();
alter table public.pro_manual_lead_works enable row level security;
revoke all on public.pro_manual_lead_works from public,anon,authenticated;grant all on public.pro_manual_lead_works to service_role;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname like'pro_manual_lead_work_%'loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
commit;
notify pgrst,'reload schema';
