-- LOCAL PRO ONLY. Round 7C (2026-11-13): one Daily Log («Bitácora») per job.
-- «Avances» (pro_work_updates) and «Resumen del día» (pro_daily_logs) become ONE list of entries:
-- the daily log row is the entry (date, notes, photos, optional weather) and gains a crew/hours
-- summary and a «Visible al cliente» switch. The customer sees only visible entries.
-- Migration: every existing avance gets exactly one daily log entry (same date in Costa Rica, title
-- and text; visible when it had been shared with the customer); every daily log already shared
-- with a customer becomes visible. Nothing is deleted: pro_work_updates and its immutable history
-- and published versions stay as they were (link: pro_daily_logs.source_update_id). A trigger keeps
-- new avances (old API) mirrored once. Patterns: RLS, service_role-only, security invoker, CAS
-- (40001), idempotent actionId receipts (pro_daily_log_actions), immutable history.
begin;
alter table public.pro_daily_logs add column if not exists client_visible boolean not null default false;
alter table public.pro_daily_logs add column if not exists crew_count smallint;
alter table public.pro_daily_logs add column if not exists crew_minutes integer;
alter table public.pro_daily_logs add column if not exists source_update_id uuid;
do $$begin
 if not exists(select 1 from pg_constraint where conname='pro_daily_logs_crew_check') then
  alter table public.pro_daily_logs add constraint pro_daily_logs_crew_check check((crew_count is null or crew_count between 0 and 500) and (crew_minutes is null or crew_minutes between 0 and 600000));end if;
end $$;
create unique index if not exists pro_daily_logs_source_update_idx on public.pro_daily_logs(owner_id,source_update_id) where source_update_id is not null;

-- Deterministic entry id for an avance (UUID v4 layout from md5).
create or replace function public.pro_work_journal_entry_id(p_update uuid) returns uuid language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',(('x'||substr(h,17,1))::bit(4)::int%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select md5('pro-work-journal:'||p_update::text) h) x
$$;

-- Copies one avance into the daily log once (no-op when already copied or the job is gone).
create or replace function public.pro_work_journal_copy_update(p_owner uuid,p_update uuid) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare u public.pro_work_updates;lid uuid;day date;snap jsonb;name text;l public.pro_daily_logs;
begin
 select * into u from public.pro_work_updates where owner_id=p_owner and id=p_update;
 if not found then return null;end if;
 if exists(select 1 from public.pro_daily_logs where owner_id=p_owner and source_update_id=p_update) then return null;end if;
 lid:=public.pro_work_journal_entry_id(p_update);day:=(u.created_at at time zone 'America/Costa_Rica')::date;
 snap:=jsonb_build_object('date',to_char(day,'YYYY-MM-DD'),'tasks','[]'::jsonb,'plan','[]'::jsonb,'minutes',null,'fingerprint',md5('pro-work-journal:'||p_update::text));
 name:=coalesce(nullif(public.pro_team_name(p_owner),''),'Pro');
 insert into public.pro_daily_logs(owner_id,work_id,id,log_date,title,summary,sections,weather,snapshot,revision,created_by,created_by_name,created_at,updated_at,client_visible,source_update_id)
 values(p_owner,u.work_id,lid,day,left(btrim(u.title),160),left(u.text,2000),'{"plan":false,"tasks":false,"time":false,"weather":false}'::jsonb,null,snap,1,p_owner,left(name,160),u.created_at,u.updated_at,u.published_revision is not null,p_update)
 on conflict do nothing returning * into l;
 if l.id is null then return null;end if;
 insert into public.pro_daily_log_history(owner_id,work_id,log_id,action_id,actor_id,actor_name,action,before_log,after_log,at)
 values(p_owner,u.work_id,lid,public.pro_work_journal_entry_id(lid),p_owner,left(name,160),'create',null,public.pro_daily_log_json(l)||jsonb_build_object('migratedFromUpdate',p_update),u.created_at);
 return lid;
end $$;

-- One-time migration of existing rows of both modules (a marker keeps a reinstall from changing
-- anything; later rows are kept in step by the two triggers below).
create table if not exists public.pro_work_journal_migrations(step text primary key,at timestamptz not null default now());
alter table public.pro_work_journal_migrations enable row level security;
revoke all on public.pro_work_journal_migrations from public,anon,authenticated;
grant select,insert on public.pro_work_journal_migrations to service_role;
do $$declare u record;begin
 if exists(select 1 from public.pro_work_journal_migrations where step='updates-and-daily-logs-v1') then return;end if;
 for u in select owner_id,id from public.pro_work_updates order by created_at,id loop perform public.pro_work_journal_copy_update(u.owner_id,u.id);end loop;
 update public.pro_daily_logs l set client_visible=true where not l.client_visible and exists(select 1 from public.pro_daily_log_audiences a where a.owner_id=l.owner_id and a.work_id=l.work_id and a.log_id=l.id and a.kind='client');
 insert into public.pro_work_journal_migrations(step) values('updates-and-daily-logs-v1');
end $$;
-- Snapshot shape of the daily log reader ({date,tasks,plan,minutes,fingerprint}); repairs entries copied
-- by an earlier draft of this module that used a «time» key (idempotent, no-op once repaired).
update public.pro_daily_logs set snapshot=(snapshot-'time')||jsonb_build_object('minutes',null) where source_update_id is not null and snapshot ? 'time';
-- A daily log shared with a customer through the existing publication is visible to that customer.
create or replace function public.pro_work_journal_publication_visible() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin if new.kind='client' then update public.pro_daily_logs set client_visible=true where owner_id=new.owner_id and work_id=new.work_id and id=new.log_id and not client_visible;end if;return new;end $$;
drop trigger if exists pro_work_journal_publication_visible on public.pro_daily_log_audiences;
create trigger pro_work_journal_publication_visible after insert on public.pro_daily_log_audiences for each row execute function public.pro_work_journal_publication_visible();

create or replace function public.pro_work_journal_mirror() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin perform public.pro_work_journal_copy_update(new.owner_id,new.id);
 -- Shared again (published revision advanced): the entry shows what the customer was given. A private
 -- edit (no new publication) never reaches the visible entry.
 if tg_op='UPDATE' and new.published_revision is not null and new.published_revision is distinct from old.published_revision then
  update public.pro_daily_logs set client_visible=true,title=left(btrim(new.title),160),summary=left(new.text,2000),revision=revision+1,updated_at=now() where owner_id=new.owner_id and source_update_id=new.id;
 end if;
 return new;end $$;
drop trigger if exists pro_work_journal_mirror on public.pro_work_updates;
create trigger pro_work_journal_mirror after insert or update on public.pro_work_updates for each row execute function public.pro_work_journal_mirror();

-- Owner: journal fields of the job's entries (visible, crew, origin) to show beside each entry.
create or replace function public.pro_work_journal_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 return jsonb_build_object('workId',p_work,'entries',coalesce((select jsonb_object_agg(l.id::text,jsonb_build_object('clientVisible',l.client_visible,'crewCount',l.crew_count,'crewMinutes',l.crew_minutes,'fromUpdate',l.source_update_id is not null,'revision',l.revision)) from public.pro_daily_logs l where l.owner_id=p_actor and l.work_id=p_work),'{}'::jsonb),
  'visibleCount',(select count(*) from public.pro_daily_logs where owner_id=p_actor and work_id=p_work and client_visible and not archived),
  'migratedUpdates',(select count(*) from public.pro_daily_logs where owner_id=p_actor and work_id=p_work and source_update_id is not null));
end $$;

-- Owner write: «Visible al cliente» + crew/hours summary of one entry (CAS on the entry revision).
create or replace function public.pro_work_journal_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;l public.pro_daily_logs;before_json jsonb;answer jsonb;keys text[];receipt public.pro_daily_log_actions;crew_c integer;crew_m integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['action','actionId','clientVisible','crewCount','crewMinutes','logId','revision','workId'] or p_input->>'action'<>'journal_set' or jsonb_typeof(p_input->'clientVisible')<>'boolean' or jsonb_typeof(p_input->'revision')<>'number' or jsonb_typeof(p_input->'crewCount') not in('number','null') or jsonb_typeof(p_input->'crewMinutes') not in('number','null') then raise exception 'Invalid journal fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;crew_c:=(p_input->>'crewCount')::integer;crew_m:=(p_input->>'crewMinutes')::integer;exception when others then raise exception 'Invalid journal fields' using errcode='22023';end;
 if crew_c is not null and crew_c not between 0 and 500 or crew_m is not null and crew_m not between 0 and 600000 then raise exception 'Invalid crew summary' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-daily-log-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_daily_log_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 select * into l from public.pro_daily_logs where owner_id=p_actor and work_id=p_input->>'workId' and id=(p_input->>'logId')::uuid for update;
 if not found then raise exception 'Entry unavailable' using errcode='P0002';end if;
 if l.revision<>(p_input->>'revision')::integer then raise exception 'Entry changed' using errcode='40001';end if;
 if l.archived and (p_input->>'clientVisible')::boolean then raise exception 'Archived entries cannot be visible' using errcode='22023';end if;
 before_json:=public.pro_daily_log_json(l)||jsonb_build_object('clientVisible',l.client_visible,'crewCount',l.crew_count,'crewMinutes',l.crew_minutes);
 update public.pro_daily_logs set client_visible=(p_input->>'clientVisible')::boolean,crew_count=crew_c,crew_minutes=crew_m,revision=revision+1,updated_at=now() where owner_id=l.owner_id and work_id=l.work_id and id=l.id returning * into l;
 answer:=jsonb_build_object('logId',l.id,'workId',l.work_id,'revision',l.revision,'clientVisible',l.client_visible,'crewCount',l.crew_count,'crewMinutes',l.crew_minutes);
 insert into public.pro_daily_log_history(owner_id,work_id,log_id,action_id,actor_id,actor_name,action,before_log,after_log)
 values(l.owner_id,l.work_id,l.id,aid,p_actor,left(coalesce(public.pro_team_name(p_actor),''),160),'update',before_json,public.pro_daily_log_json(l)||jsonb_build_object('clientVisible',l.client_visible,'crewCount',l.crew_count,'crewMinutes',l.crew_minutes));
 insert into public.pro_daily_log_actions(actor_id,action_id,owner_id,work_id,input,result,before_state,after_state) values(p_actor,aid,l.owner_id,l.work_id,p_input,answer,before_json,answer);
 return answer;
end $$;

-- Customer of the job (linked request account): visible, non-archived entries only. Photos are
-- listed by id/name (JPEG ready files of that entry); notes and weather as written; crew summary.
create or replace function public.pro_client_journal_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null and status in('confirmed','completed');
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('workId',r.work_id,'items',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'date',to_char(l.log_date,'YYYY-MM-DD'),'title',l.title,'notes',l.summary,'weather',l.weather,'crewCount',l.crew_count,'crewMinutes',l.crew_minutes,'fromUpdate',l.source_update_id is not null,
   'photos',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.created_at,f.id) from public.pro_daily_log_files f where f.owner_id=l.owner_id and f.work_id=l.work_id and f.log_id=l.id and f.ready and f.mime_type='image/jpeg'),'[]'::jsonb))
   order by l.log_date desc,l.created_at desc,l.id) from (select * from public.pro_daily_logs d where d.owner_id=r.owner_id and d.work_id=r.work_id and d.client_visible and not d.archived
   -- formally shared versions are listed below with their conversation (pro_daily_logs_client_read)
   and not exists(select 1 from public.pro_daily_log_audiences au where au.owner_id=d.owner_id and au.work_id=d.work_id and au.log_id=d.id and au.kind='client' and au.recipient_id=p_actor and au.request_id=r.id)
   order by d.log_date desc,d.created_at desc limit 60) l),'[]'::jsonb));
end $$;
create or replace function public.pro_client_journal_photo(p_actor uuid,p_request uuid,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;f public.pro_daily_log_files;
begin
 select * into r from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null and status in('confirmed','completed');
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select f2.* into f from public.pro_daily_log_files f2 join public.pro_daily_logs l on l.owner_id=f2.owner_id and l.work_id=f2.work_id and l.id=f2.log_id
  where f2.id=p_file and f2.owner_id=r.owner_id and f2.work_id=r.work_id and l.client_visible and not l.archived and f2.ready and f2.mime_type='image/jpeg';
 if not found then return null;end if;
 return jsonb_build_object('objectPath',f.object_path,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_work_journal_publication_visible','pro_work_journal_entry_id','pro_work_journal_copy_update','pro_work_journal_mirror','pro_work_journal_read','pro_work_journal_mutate','pro_client_journal_read','pro_client_journal_photo') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
