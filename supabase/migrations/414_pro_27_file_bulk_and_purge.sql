-- ContrataCR Pro, rows 29 (and the library side of 31): bulk file operations and permanent delete with receipts.
--  * Bulk (1..50 files per call) for the job files (move, favorite, trash, restore, permanent delete) and for the company
--    library (move, favorite, archive, restore, add/remove tags, permanent delete). They only WRAP the existing writers
--    (pro_work_file_organizer_mutate, pro_company_files_mutate, pro_company_file_tags_mutate): each item runs in its own
--    sub-transaction with an inner actionId derived from the batch id, the item and the action, so a replay of the same
--    batch returns the stored receipts and one failing item never blocks the others (per-item result).
--  * Permanent delete from the company library follows the strict rule of the job files: only a file that sits in the
--    trash/archive and was NEVER used or shared. Checked one by one (no foreign-key guessing): copied into a job, used
--    in a daily log, used in a proposal, with several versions, with annotations or notes. Bytes are removed by the route
--    from the paths returned here; the receipt keeps name, size and a SHA-256 prefix, never the bytes.
--  * Explicit owner action "purge what expired": trash entries and archived files older than 30 days (America/Costa_Rica)
--    in one job or in the library. Nothing runs by itself (no cron). Preview first, confirmation in the UI, receipt after.
--  * The trash record of a folder keeps its history: the foreign key to the folder is dropped (a purged folder row is
--    deleted) and the guard now also allows the purge stamp. Reapplicable: create if not exists / or replace.
-- PRO_ENABLED stays false in production. Writers are service_role only; the routes decide owner-only for purge.
begin;

-- The trash record of a purged folder must outlive the folder row.
do $$declare c record;begin
 if to_regclass('public.pro_company_trash') is not null then
  for c in select conname from pg_constraint where conrelid='public.pro_company_trash'::regclass and contype='f' and confrelid='public.pro_company_folders'::regclass loop
   execute format('alter table public.pro_company_trash drop constraint %I',c.conname);
  end loop;
  alter table public.pro_company_trash add column if not exists purged_at timestamptz;
  alter table public.pro_company_trash add column if not exists purged_files integer;
 end if;
end $$;
create or replace function public.pro_company_trash_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Trash records are kept' using errcode='23514';end if;
 if tg_table_name='pro_company_trash_actions' then raise exception 'Trash receipts are immutable' using errcode='23514';end if;
 if (to_jsonb(old)->>'restored_at') is not null or (to_jsonb(old)->>'purged_at') is not null
  or (to_jsonb(new)-array['restored_at','restored_to_root','purged_at','purged_files','files','folders']) is distinct from (to_jsonb(old)-array['restored_at','restored_to_root','purged_at','purged_files','files','folders'])
 then raise exception 'Trash record immutable' using errcode='23514';end if;
 return new;
end $$;
-- Read: entries already purged are not offered for restore.
create or replace function public.pro_company_trash_read(p_actor uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(public.pro_company_trash_json(t) order by t.trashed_at desc,t.id) from (select * from public.pro_company_trash where owner_id=p_actor and restored_at is null and purged_at is null order by trashed_at desc,id limit 100) t),'[]'::jsonb));
end $$;

create table if not exists public.pro_file_purge_receipts(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{32}$'),
 scope text not null check(scope in('company','work')),work_id text,mode text not null check(mode in('file','entry','expired')),
 purged_files integer not null default 0 check(purged_files>=0),purged_folders integer not null default 0 check(purged_folders>=0),
 kept_files integer not null default 0 check(kept_files>=0),bytes_freed bigint not null default 0 check(bytes_freed>=0),
 items jsonb not null default '[]'::jsonb,object_paths jsonb not null default '[]'::jsonb,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id));
create index if not exists pro_file_purge_receipts_recent on public.pro_file_purge_receipts(owner_id,scope,at desc);
create or replace function public.pro_file_purge_receipt_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Purge receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_file_purge_receipt_guard on public.pro_file_purge_receipts;
create trigger pro_file_purge_receipt_guard before update or delete on public.pro_file_purge_receipts for each row when (pg_trigger_depth()=0) execute function public.pro_file_purge_receipt_guard();

create or replace function public.pro_file_purge_receipt_json(r public.pro_file_purge_receipts) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.action_id,'scope',r.scope,'workId',r.work_id,'mode',r.mode,'purgedFiles',r.purged_files,'purgedFolders',r.purged_folders,'keptFiles',r.kept_files,'bytesFreed',r.bytes_freed,'items',r.items,'at',r.at)
$$;
-- Today in Costa Rica (one place for the 30-day rule).
create or replace function public.pro_file_cr_today() returns date language sql stable security invoker set search_path=public,pg_temp as $$
 select (clock_timestamp() at time zone 'America/Costa_Rica')::date $$;

-- ===================================================================== company library: "never used" check
create or replace function public.pro_company_file_in_use(p_owner uuid,p_file uuid) returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare hit boolean;t text;
begin
 if to_regclass('public.pro_company_file_copies') is not null then
  select exists(select 1 from public.pro_company_file_copies where owner_id=p_owner and source_file_id=p_file) into hit;if hit then return true;end if;
 end if;
 if to_regclass('public.pro_company_file_family_members') is not null then
  select exists(select 1 from public.pro_company_file_family_members m where m.owner_id=p_owner and m.root_id in(select root_id from public.pro_company_file_family_members where owner_id=p_owner and file_id=p_file) group by m.root_id having count(*)>1) into hit;if hit then return true;end if;
 end if;
 -- Optional modules: looked up at run time so this migration applies in any order.
 foreach t in array array['pro_company_daily_log_file_actions','pro_daily_log_duplicate_files'] loop
  if to_regclass('public.'||t) is not null then execute format('select exists(select 1 from public.%I where source_file_id=$1)',t) using p_file into hit;if hit then return true;end if;end if;
 end loop;
 if to_regclass('public.pro_estimate_proposal_images') is not null then
  select exists(select 1 from public.pro_estimate_proposal_images where owner_id=p_owner and source='company' and file_id=p_file) into hit;if hit then return true;end if;
 end if;
 if to_regclass('public.pro_file_annotations') is not null then
  execute 'select exists(select 1 from public.pro_file_annotations where owner_id=$1 and scope=''company'' and file_id=$2)' using p_owner,p_file into hit;if hit then return true;end if;
 end if;
 return false;
end $$;

-- Deletes the given library files when they are archived and were never used. Returns the report; never raises for "in use".
create or replace function public.pro_company_purge_files(p_owner uuid,p_files uuid[]) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare f public.pro_company_files;ok uuid[]:='{}';items jsonb:='[]'::jsonb;paths jsonb:='[]'::jsonb;kept integer:=0;bytes bigint:=0;
begin
 for f in select * from public.pro_company_files where owner_id=p_owner and id=any(p_files) and ready and archived order by id for update loop
  if public.pro_company_file_in_use(p_owner,f.id) then kept:=kept+1;continue;end if;
  ok:=array_append(ok,f.id);bytes:=bytes+f.size_bytes;paths:=paths||jsonb_build_array(f.object_path);
  if jsonb_array_length(items)<50 then items:=items||jsonb_build_array(jsonb_build_object('name',f.name,'sizeBytes',f.size_bytes,'sha256',left(f.sha256,12)));end if;
 end loop;
 if cardinality(ok)>0 then delete from public.pro_company_files where owner_id=p_owner and id=any(ok);end if;
 return jsonb_build_object('purged',cardinality(ok),'kept',kept+(cardinality(p_files)-cardinality(ok)-kept),'bytes',bytes,'items',items,'paths',paths);
end $$;

-- Folders (archived, empty) that can go. Returns the number deleted.
create or replace function public.pro_company_purge_empty_folders(p_owner uuid,p_folders uuid[]) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer:=0;m integer;
begin
 for i in 1..8 loop
  delete from public.pro_company_folders d where d.owner_id=p_owner and d.id=any(p_folders) and d.archived
   and not exists(select 1 from public.pro_company_files x where x.owner_id=p_owner and x.folder_id=d.id)
   and not exists(select 1 from public.pro_company_folders c where c.owner_id=p_owner and c.parent_id=d.id);
  get diagnostics m=row_count;n:=n+m;exit when m=0;
 end loop;
 return n;
end $$;

-- Archive date of a loose archived file or folder: its last archive receipt (the library keeps no timestamp column).
create or replace function public.pro_company_archived_on(p_owner uuid,p_kind text,p_id uuid) returns date language sql stable security invoker set search_path=public,pg_temp as $$
 select (max(a.at) at time zone 'America/Costa_Rica')::date from public.pro_company_file_actions a
  where a.actor_id=p_owner and a.input->>'action'=case when p_kind='file' then 'file_archive' else 'folder_archive' end and a.input->>case when p_kind='file' then 'fileId' else 'folderId' end=p_id::text
$$;

-- What "purge what expired" would touch (read only, shown before the owner confirms).
create or replace function public.pro_file_purge_preview(p_actor uuid,p_scope text,p_work text default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare files integer:=0;eligible integer:=0;bytes bigint:=0;folders integer:=0;today date:=public.pro_file_cr_today();
begin
 if p_scope not in('company','work') or p_scope='work' and (p_work is null or length(p_work) not between 1 and 160) then raise exception 'Invalid purge query' using errcode='22023';end if;
 if p_scope='work' then
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
  if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
  with recursive exp(id) as(select f.id from public.pro_work_file_folders f where f.owner_id=p_actor and f.work_id=p_work and f.trashed_at is not null and (f.trashed_at at time zone 'America/Costa_Rica')::date+30<today
   union select c.id from public.pro_work_file_folders c join exp on c.parent_id=exp.id where c.owner_id=p_actor),
  cand as(select w.id,w.size_bytes,w.revision from public.pro_work_files w join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id
   where w.owner_id=p_actor and w.work_id=p_work and w.ready and ((m.trashed_at is not null and (m.trashed_at at time zone 'America/Costa_Rica')::date+30<today) or m.folder_id in(select id from exp)))
  select count(*),count(*) filter(where revision=1 and not public.pro_wfo_file_in_use(id)),coalesce(sum(size_bytes) filter(where revision=1 and not public.pro_wfo_file_in_use(id)),0) into files,eligible,bytes from cand;
  select count(*) into folders from public.pro_work_file_folders f where f.owner_id=p_actor and f.work_id=p_work and f.trashed_at is not null and (f.trashed_at at time zone 'America/Costa_Rica')::date+30<today;
 else
  if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
  with cand as(select f.id,f.size_bytes from public.pro_company_files f where f.owner_id=p_actor and f.ready and f.archived and (
    f.id in(select unnest(t.files) from public.pro_company_trash t where t.owner_id=p_actor and t.restored_at is null and t.purged_at is null and t.restore_until<today)
    or public.pro_company_archived_on(p_actor,'file',f.id)+30<today))
  select count(*),count(*) filter(where not public.pro_company_file_in_use(p_actor,id)),coalesce(sum(size_bytes) filter(where not public.pro_company_file_in_use(p_actor,id)),0) into files,eligible,bytes from cand;
  select count(*) into folders from public.pro_company_trash t where t.owner_id=p_actor and t.restored_at is null and t.purged_at is null and t.restore_until<today;
 end if;
 return jsonb_build_object('scope',p_scope,'workId',p_work,'expiredFiles',files,'deletableFiles',eligible,'keptFiles',files-eligible,'bytes',bytes,'expiredFolders',folders,'today',today::text);
end $$;

-- ===================================================================== explicit purge (library): one trash entry or everything expired
create or replace function public.pro_company_purge(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;hash text:=md5(p_input::text);prior public.pro_file_purge_receipts;keys text[];t public.pro_company_trash;today date:=public.pro_file_cr_today();
 fls uuid[]:='{}';flds uuid[]:='{}';rep jsonb;nfolders integer:=0;rec public.pro_file_purge_receipts;extra uuid[];left_f uuid[];left_d uuid[];
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid purge' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if not(act='purge_entry' and keys=array['action','actionId','trashId'] or act='purge_expired' and keys=array['action','actionId','confirm']) then raise exception 'Invalid purge' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid purge' using errcode='22023';end;
 if act='purge_expired' and p_input->'confirm' is distinct from 'true'::jsonb then raise exception 'Confirmation required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro_company_files:'||p_actor::text,0));
 select * into prior from public.pro_file_purge_receipts where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return jsonb_build_object('receipt',public.pro_file_purge_receipt_json(prior),'objectPaths',prior.object_paths,'replayed',true);end if;
 if act='purge_entry' then
  begin select * into t from public.pro_company_trash where owner_id=p_actor and id=(p_input->>'trashId')::uuid for update;exception when others then raise exception 'Invalid purge' using errcode='22023';end;
  if not found then raise exception 'Trash entry unavailable' using errcode='42501';end if;
  if t.restored_at is not null or t.purged_at is not null then raise exception 'Trash entry closed' using errcode='40001';end if;
  fls:=t.files;flds:=t.folders;
 else
  select coalesce(array_agg(x),'{}') into fls from(select unnest(t2.files) x from public.pro_company_trash t2 where t2.owner_id=p_actor and t2.restored_at is null and t2.purged_at is null and t2.restore_until<today) q;
  select coalesce(array_agg(x),'{}') into flds from(select unnest(t2.folders) x from public.pro_company_trash t2 where t2.owner_id=p_actor and t2.restored_at is null and t2.purged_at is null and t2.restore_until<today) q;
  select coalesce(array_agg(f.id),'{}') into extra from public.pro_company_files f where f.owner_id=p_actor and f.ready and f.archived and not f.id=any(fls) and public.pro_company_archived_on(p_actor,'file',f.id)+30<today;
  fls:=fls||extra;
  select coalesce(array_agg(f.id),'{}') into extra from public.pro_company_folders f where f.owner_id=p_actor and f.archived and not f.id=any(flds) and public.pro_company_archived_on(p_actor,'folder',f.id)+30<today;
  flds:=flds||extra;
 end if;
 rep:=public.pro_company_purge_files(p_actor,fls);
 nfolders:=public.pro_company_purge_empty_folders(p_actor,flds);
 -- Close the trash entries that are now empty; the others keep what could not be deleted (in use).
 for t in select * from public.pro_company_trash where owner_id=p_actor and restored_at is null and purged_at is null and (act='purge_expired' and restore_until<today or act='purge_entry' and id=(p_input->>'trashId')::uuid) loop
  select coalesce(array_agg(f.id),'{}') into left_f from public.pro_company_files f where f.owner_id=p_actor and f.id=any(t.files);
  select coalesce(array_agg(d.id),'{}') into left_d from public.pro_company_folders d where d.owner_id=p_actor and d.id=any(t.folders);
  update public.pro_company_trash set files=left_f,folders=left_d,purged_at=case when cardinality(left_f)=0 and cardinality(left_d)=0 then clock_timestamp() end,purged_files=coalesce(purged_files,0)+(cardinality(t.files)-cardinality(left_f)) where owner_id=p_actor and id=t.id;
 end loop;
 insert into public.pro_file_purge_receipts(owner_id,action_id,input_hash,scope,mode,purged_files,purged_folders,kept_files,bytes_freed,items,object_paths)
  values(p_actor,aid,hash,'company',case when act='purge_entry' then 'entry' else 'expired' end,(rep->>'purged')::integer,nfolders,(rep->>'kept')::integer,(rep->>'bytes')::bigint,rep->'items',rep->'paths') returning * into rec;
 return jsonb_build_object('receipt',public.pro_file_purge_receipt_json(rec),'objectPaths',rec.object_paths);
end $$;

-- ===================================================================== explicit purge (one job)
create or replace function public.pro_work_files_purge_expired(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;wid text:=p_input->>'workId';hash text:=md5(p_input::text);prior public.pro_file_purge_receipts;keys text[];today date:=public.pro_file_cr_today();
 w public.pro_work_files;ok uuid[]:='{}';paths jsonb:='[]'::jsonb;items jsonb:='[]'::jsonb;kept integer:=0;bytes bigint:=0;exp uuid[];nfolders integer:=0;m integer;rec public.pro_file_purge_receipts;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid purge' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['action','actionId','confirm','workId'] or p_input->>'action'<>'purge_expired' or p_input->'confirm' is distinct from 'true'::jsonb or wid is null or length(wid) not between 1 and 160 then raise exception 'Invalid purge' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid purge' using errcode='22023';end;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-wfo:'||p_actor::text||':'||wid,0));
 select * into prior from public.pro_file_purge_receipts where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return jsonb_build_object('receipt',public.pro_file_purge_receipt_json(prior),'objectPaths',prior.object_paths,'replayed',true);end if;
 select coalesce(array_agg(id),'{}') into exp from(with recursive e(id) as(select f.id from public.pro_work_file_folders f where f.owner_id=p_actor and f.work_id=wid and f.trashed_at is not null and (f.trashed_at at time zone 'America/Costa_Rica')::date+30<today
   union select c.id from public.pro_work_file_folders c join e on c.parent_id=e.id where c.owner_id=p_actor) select id from e) q;
 for w in select x.* from public.pro_work_files x join public.pro_work_file_meta mm on mm.owner_id=x.owner_id and mm.file_id=x.id
  where x.owner_id=p_actor and x.work_id=wid and x.ready and ((mm.trashed_at is not null and (mm.trashed_at at time zone 'America/Costa_Rica')::date+30<today) or mm.folder_id=any(exp)) order by x.id for update of x loop
  if w.revision<>1 or public.pro_wfo_file_in_use(w.id) then kept:=kept+1;continue;end if;
  ok:=array_append(ok,w.id);bytes:=bytes+w.size_bytes;paths:=paths||jsonb_build_array(w.object_path);
  if jsonb_array_length(items)<50 then items:=items||jsonb_build_array(jsonb_build_object('name',w.name,'sizeBytes',w.size_bytes,'sha256',left(w.sha256,12)));end if;
 end loop;
 if cardinality(ok)>0 then delete from public.pro_work_files where owner_id=p_actor and id=any(ok);end if;
 -- Expired trashed folders that are now empty go too (deepest first); the rest stay in the trash.
 for i in 1..8 loop
  delete from public.pro_work_file_folders d where d.owner_id=p_actor and d.work_id=wid and d.id=any(exp) and d.trashed_at is not null
   and not exists(select 1 from public.pro_work_file_meta x where x.owner_id=p_actor and x.folder_id=d.id)
   and not exists(select 1 from public.pro_work_file_folders c where c.owner_id=p_actor and c.parent_id=d.id);
  get diagnostics m=row_count;nfolders:=nfolders+m;exit when m=0;
 end loop;
 insert into public.pro_file_purge_receipts(owner_id,action_id,input_hash,scope,work_id,mode,purged_files,purged_folders,kept_files,bytes_freed,items,object_paths)
  values(p_actor,aid,hash,'work',wid,'expired',cardinality(ok),nfolders,kept,bytes,items,paths) returning * into rec;
 return jsonb_build_object('receipt',public.pro_file_purge_receipt_json(rec),'objectPaths',rec.object_paths);
end $$;

create or replace function public.pro_file_purge_receipts_read(p_actor uuid,p_scope text,p_work text default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if p_scope not in('company','work') then raise exception 'Invalid purge query' using errcode='22023';end if;
 if not coalesce(case when p_scope='work' then public.pro_private_work_tools_enabled(p_actor) else public.pro_appointment_enabled(p_actor) end,false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(public.pro_file_purge_receipt_json(r) order by r.at desc,r.action_id) from(select * from public.pro_file_purge_receipts where owner_id=p_actor and scope=p_scope and work_id is not distinct from case when p_scope='work' then p_work end and mode in('entry','expired') order by at desc,action_id limit 10) r),'[]'::jsonb));
end $$;

-- ===================================================================== bulk: library
-- Item error codes: conflict (changed since it was read), forbidden, in_use (never deleted when used), invalid, error.
create or replace function public.pro_file_bulk_error(p_state text,p_hint text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_state='40001' then 'conflict' when p_state='42501' then 'forbidden' when p_hint='pro_file_in_use' then 'in_use' when p_state in('22023','23514','22P02') then 'invalid' else 'error' end $$;
create or replace function public.pro_company_files_bulk(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';bid uuid;keys text[];it jsonb;i integer:=0;fid uuid;rev integer;aid uuid;f public.pro_company_files;inner_in jsonb;res jsonb;out jsonb:='[]'::jsonb;ok integer:=0;bad integer:=0;
 target uuid;fav boolean;want text[];cur text[];paths jsonb:='[]'::jsonb;ids uuid[];rep jsonb;purge_ids uuid[]:='{}';purge_revs jsonb:='{}'::jsonb;tg text;state text;hint text;code text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 50 then raise exception 'Invalid bulk' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if not(act in('archive','restore','purge') and keys=array['action','batchId','items']
  or act='move' and keys=array['action','batchId','folderId','items']
  or act='favorite' and keys=array['action','batchId','items','on']
  or act in('tags_add','tags_remove') and keys=array['action','batchId','items','tags']) then raise exception 'Invalid bulk' using errcode='22023';end if;
 begin bid:=(p_input->>'batchId')::uuid;target:=nullif(p_input->>'folderId','')::uuid;exception when others then raise exception 'Invalid bulk' using errcode='22023';end;
 if act='favorite' then if jsonb_typeof(p_input->'on') is distinct from 'boolean' then raise exception 'Invalid bulk' using errcode='22023';end if;fav:=(p_input->>'on')::boolean;end if;
 if act in('tags_add','tags_remove') then
  if jsonb_typeof(p_input->'tags') is distinct from 'array' or jsonb_array_length(p_input->'tags') not between 1 and 6 or exists(select 1 from jsonb_array_elements(p_input->'tags') e where jsonb_typeof(e) is distinct from 'string') then raise exception 'Invalid bulk' using errcode='22023';end if;
  select coalesce(array_agg(distinct lower(btrim(e))),'{}') into want from jsonb_array_elements_text(p_input->'tags') e;
 end if;
 if (select count(distinct x->>'fileId') from jsonb_array_elements(p_input->'items') x)<>jsonb_array_length(p_input->'items') then raise exception 'Invalid bulk' using errcode='22023';end if;
 for it in select * from jsonb_array_elements(p_input->'items') loop
  i:=i+1;
  begin
   if jsonb_typeof(it) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(it) k) is distinct from array['fileId','revision'] then raise exception 'Invalid bulk' using errcode='22023';end if;
   fid:=(it->>'fileId')::uuid;rev:=(it->>'revision')::integer;
   aid:=md5('pro-company-bulk:'||bid::text||':'||i::text||':'||fid::text||':'||act)::uuid;
   if act='purge' then purge_ids:=array_append(purge_ids,fid);purge_revs:=purge_revs||jsonb_build_object(fid::text,rev);
   elsif act in('tags_add','tags_remove') then
    select coalesce(array_agg(tag order by tag),'{}') into cur from public.pro_company_file_tags where owner_id=p_actor and file_id=fid;
    if act='tags_add' then select coalesce(array_agg(distinct x order by x),'{}') into cur from unnest(cur||want) x;else select coalesce(array_agg(x order by x),'{}') into cur from unnest(cur) x where not x=any(want);end if;
    if cardinality(cur)>6 then raise exception 'Too many tags' using errcode='22023';end if;
    inner_in:=jsonb_build_object('action','set_tags','actionId',aid,'fileId',fid,'tags',to_jsonb(cur));
    res:=public.pro_company_file_tags_mutate(p_actor,inner_in);out:=out||jsonb_build_array(jsonb_build_object('fileId',fid,'ok',true,'replayed',coalesce((res->>'replayed')::boolean,false)));ok:=ok+1;
   else
    select * into f from public.pro_company_files where owner_id=p_actor and id=fid and ready;
    if not found then raise exception 'File unavailable' using errcode='42501';end if;
    if act in('archive','restore') then inner_in:=jsonb_build_object('action',case when act='archive' then 'file_archive' else 'file_restore' end,'actionId',aid,'fileId',fid,'revision',rev);
    else inner_in:=jsonb_build_object('action','file_update','actionId',aid,'fileId',fid,'revision',rev,'folderId',case when act='move' then to_jsonb(target) else to_jsonb(f.folder_id) end,'name',f.name,'favorite',case when act='favorite' then fav else f.favorite end);end if;
    res:=public.pro_company_files_mutate(p_actor,inner_in,encode(sha256(convert_to(inner_in::text,'UTF8')),'hex'));
    out:=out||jsonb_build_array(jsonb_build_object('fileId',fid,'ok',true,'replayed',false));ok:=ok+1;
   end if;
  exception when others then
   get stacked diagnostics state=returned_sqlstate,hint=pg_exception_hint;
   code:=public.pro_file_bulk_error(state,hint);
   out:=out||jsonb_build_array(jsonb_build_object('fileId',it->>'fileId','ok',false,'error',code));bad:=bad+1;
  end;
 end loop;
 if act='purge' and cardinality(purge_ids)>0 then
  -- One receipt for the batch (idempotent on the batch id); each file keeps its own revision check.
  perform pg_advisory_xact_lock(hashtextextended('pro_company_files:'||p_actor::text,0));
  if exists(select 1 from public.pro_file_purge_receipts where owner_id=p_actor and action_id=bid) then
   select object_paths into paths from public.pro_file_purge_receipts where owner_id=p_actor and action_id=bid;
   out:=(select coalesce(jsonb_agg(jsonb_build_object('fileId',x,'ok',true,'replayed',true)),'[]'::jsonb) from unnest(purge_ids) x);ok:=cardinality(purge_ids);bad:=0;
   return jsonb_build_object('action',act,'ok',ok,'failed',bad,'items',out,'objectPaths',paths,'replayed',true);
  end if;
  -- Revision check per file before deleting (the owner saw that version in the list).
  select coalesce(array_agg(x),'{}') into ids from unnest(purge_ids) x where exists(select 1 from public.pro_company_files f2 where f2.owner_id=p_actor and f2.id=x and f2.ready and f2.archived and f2.revision=(purge_revs->>(x::text))::integer);
  rep:=public.pro_company_purge_files(p_actor,ids);
  out:=(select coalesce(jsonb_agg(jsonb_build_object('fileId',x,'ok',exists(select 1 from public.pro_company_files f3 where f3.owner_id=p_actor and f3.id=x) is false and x=any(ids),'error',case when x<>all(ids) then (case when exists(select 1 from public.pro_company_files f4 where f4.owner_id=p_actor and f4.id=x and f4.archived) then 'conflict' else 'invalid' end) when exists(select 1 from public.pro_company_files f5 where f5.owner_id=p_actor and f5.id=x) then 'in_use' end)),'[]'::jsonb) from unnest(purge_ids) x);
  select count(*) filter(where (e->>'ok')::boolean),count(*) filter(where not (e->>'ok')::boolean) into ok,bad from jsonb_array_elements(out) e;
  insert into public.pro_file_purge_receipts(owner_id,action_id,input_hash,scope,mode,purged_files,purged_folders,kept_files,bytes_freed,items,object_paths)
   values(p_actor,bid,md5(p_input::text),'company','file',(rep->>'purged')::integer,0,bad,(rep->>'bytes')::bigint,rep->'items',rep->'paths');
  paths:=rep->'paths';
 end if;
 return jsonb_build_object('action',act,'ok',ok,'failed',bad,'items',out,'objectPaths',paths);
end $$;

-- ===================================================================== bulk: job files
create or replace function public.pro_work_files_bulk(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';bid uuid;wid text:=p_input->>'workId';keys text[];it jsonb;i integer:=0;fid uuid;rev integer;aid uuid;inner_in jsonb;res jsonb;out jsonb:='[]'::jsonb;ok integer:=0;bad integer:=0;
 target uuid;fav boolean;paths jsonb:='[]'::jsonb;state text;hint text;code text;op text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 50 or wid is null or length(wid) not between 1 and 160 then raise exception 'Invalid bulk' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if not(act in('trash','restore','purge') and keys=array['action','batchId','items','workId']
  or act='move' and keys=array['action','batchId','folderId','items','workId']
  or act='favorite' and keys=array['action','batchId','items','on','workId']) then raise exception 'Invalid bulk' using errcode='22023';end if;
 begin bid:=(p_input->>'batchId')::uuid;target:=nullif(p_input->>'folderId','')::uuid;exception when others then raise exception 'Invalid bulk' using errcode='22023';end;
 if act='favorite' then if jsonb_typeof(p_input->'on') is distinct from 'boolean' then raise exception 'Invalid bulk' using errcode='22023';end if;fav:=(p_input->>'on')::boolean;end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 if (select count(distinct x->>'fileId') from jsonb_array_elements(p_input->'items') x)<>jsonb_array_length(p_input->'items') then raise exception 'Invalid bulk' using errcode='22023';end if;
 op:=case act when 'trash' then 'trash_file' when 'restore' then 'restore_file' when 'purge' then 'purge_file' when 'move' then 'move_file' else 'favorite_file' end;
 for it in select * from jsonb_array_elements(p_input->'items') loop
  i:=i+1;
  begin
   if jsonb_typeof(it) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(it) k) is distinct from array['fileId','revision'] then raise exception 'Invalid bulk' using errcode='22023';end if;
   fid:=(it->>'fileId')::uuid;rev:=(it->>'revision')::integer;aid:=md5('pro-work-bulk:'||bid::text||':'||i::text||':'||fid::text||':'||act)::uuid;
   inner_in:=jsonb_build_object('action',op,'actionId',aid,'workId',wid,'subjectId',fid,'revision',rev)
    ||case when act='move' then jsonb_build_object('targetId',target) when act='favorite' then jsonb_build_object('on',fav) else '{}'::jsonb end;
   res:=public.pro_work_file_organizer_mutate(p_actor,inner_in);
   if act='purge' then paths:=paths||coalesce(res->'objectPaths','[]'::jsonb);end if;
   out:=out||jsonb_build_array(jsonb_build_object('fileId',fid,'ok',true,'replayed',coalesce((res->>'replayed')::boolean,false)));ok:=ok+1;
  exception when others then
   get stacked diagnostics state=returned_sqlstate,hint=pg_exception_hint;
   code:=public.pro_file_bulk_error(state,hint);
   out:=out||jsonb_build_array(jsonb_build_object('fileId',it->>'fileId','ok',false,'error',code));bad:=bad+1;
  end;
 end loop;
 return jsonb_build_object('action',act,'ok',ok,'failed',bad,'items',out,'objectPaths',paths);
end $$;

-- ===================================================================== grants
do $$declare t text;f record;begin
 foreach t in array array['pro_file_purge_receipts'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_company_trash_guard','pro_company_trash_read','pro_file_purge_receipt_guard','pro_file_purge_receipt_json','pro_file_cr_today','pro_company_file_in_use','pro_company_purge_files','pro_company_purge_empty_folders','pro_company_archived_on','pro_file_purge_preview','pro_company_purge','pro_work_files_purge_expired','pro_file_purge_receipts_read','pro_file_bulk_error','pro_company_files_bulk','pro_work_files_bulk') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
