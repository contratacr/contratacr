-- LOCAL PRO ONLY. Versions in the company library (Empresa › Archivos; parity register row 30).
-- Reuses the model of file-versions-local.sql for pro_company_files, never exposed to customers:
--  * A family groups library files; its id is its first file (the root). A file without versions is an
--    implicit family of one (v1). The family row is created on the first add_version.
--  * pro_company_file_versions is append-only (v1, v2, …). add_version attaches a freshly uploaded
--    library file (same upload route, normalization and hash checks); restore appends a NEW entry that
--    points at an older entry's file. Nothing is deleted or rewritten. The family points at the current file.
--  * The library lists only the CURRENT file of each family, so open, download and «Usar en trabajo»
--    act on the current version (a copy to a job stays a private work file, as before). The file that
--    becomes current inherits the folder and favourite of the previous one; moving the current file
--    moves every member, so older versions stay downloadable from the same folder.
--  * Pattern: closed RLS + revoke, security invoker RPCs for service_role only, eligibility
--    pro_appointment_enabled (library) and pro_private_work_tools_enabled, family revision CAS
--    (40001 -> 409), idempotent receipts per actionId (other payload -> 22023), immutable versions,
--    members and receipts, Costa Rica day (dayCr). Limit: 100 versions per family (54000 -> 429).
-- Lock order: action advisory -> 'pro-company-files:<owner>' advisory (the library writer's key) -> family.
-- Supersedes pro_company_files_read from company-files-local.sql (same signature and output; it only
-- leaves out the non-current versions). Reapplicable; new objects otherwise.
begin;
create table if not exists public.pro_company_file_families(
 owner_id uuid not null references public.profiles(id) on delete cascade,root_id uuid not null,current_version integer not null check(current_version between 1 and 100),
 current_file_id uuid not null,revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,root_id),
 foreign key(owner_id,root_id) references public.pro_company_files(owner_id,id) on delete cascade,
 foreign key(owner_id,current_file_id) references public.pro_company_files(owner_id,id) on delete cascade
);
create table if not exists public.pro_company_file_family_members(
 owner_id uuid not null,file_id uuid not null,root_id uuid not null,primary key(owner_id,file_id),
 foreign key(owner_id,root_id) references public.pro_company_file_families(owner_id,root_id) on delete cascade,
 foreign key(owner_id,file_id) references public.pro_company_files(owner_id,id) on delete cascade
);
create index if not exists pro_company_file_members_root on public.pro_company_file_family_members(owner_id,root_id);
create table if not exists public.pro_company_file_versions(
 owner_id uuid not null,root_id uuid not null,version integer not null check(version between 1 and 100),file_id uuid not null,
 kind text not null check(kind in('original','upload','restore')),restored_from integer check(restored_from is null or restored_from between 1 and 100),
 note text check(note is null or length(btrim(note)) between 1 and 500),created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,root_id,version),
 foreign key(owner_id,root_id) references public.pro_company_file_families(owner_id,root_id) on delete cascade,
 foreign key(owner_id,file_id) references public.pro_company_files(owner_id,id) on delete cascade,
 check((kind='restore')=(restored_from is not null) and (restored_from is null or restored_from<version))
);
create table if not exists public.pro_company_file_version_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

create or replace function public.pro_cfv_enabled(p_actor uuid) returns boolean
language sql volatile security invoker set search_path=public,pg_temp as $$
 select coalesce(public.pro_appointment_enabled(p_actor),false) and coalesce(public.pro_private_work_tools_enabled(p_actor),false) $$;
-- A member that is not the current file of its family is never listed.
create or replace function public.pro_cfv_hidden(p_owner uuid,p_file uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.pro_company_file_family_members m join public.pro_company_file_families f on f.owner_id=m.owner_id and f.root_id=m.root_id
  where m.owner_id=p_owner and m.file_id=p_file and f.current_file_id<>p_file) $$;
create or replace function public.pro_cfv_root(p_owner uuid,p_file uuid) returns uuid
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select m.root_id from public.pro_company_file_family_members m where m.owner_id=p_owner and m.file_id=p_file),p_file) $$;
create or replace function public.pro_cfv_state(p_owner uuid,p_root uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with fam as(select * from public.pro_company_file_families where owner_id=p_owner and root_id=p_root),
 rows as(
  select v.version,v.kind,v.restored_from,v.note,v.created_at version_at,f.id,f.name,f.mime_type,f.size_bytes,f.sha256,f.created_at file_at from public.pro_company_file_versions v join public.pro_company_files f on f.owner_id=v.owner_id and f.id=v.file_id
   where v.owner_id=p_owner and v.root_id=p_root
  union all
  select 1,'original',null,null,f.created_at,f.id,f.name,f.mime_type,f.size_bytes,f.sha256,f.created_at from public.pro_company_files f where f.owner_id=p_owner and f.id=p_root and not exists(select 1 from fam)
 )
 select jsonb_build_object('rootId',p_root,'revision',coalesce((select revision from fam),0),
  'currentVersion',coalesce((select current_version from fam),1),'currentFileId',coalesce((select current_file_id from fam),p_root),
  'versions',coalesce((select jsonb_agg(jsonb_build_object('version',r.version,'kind',r.kind,'restoredFrom',r.restored_from,'note',r.note,'createdAt',r.version_at,
     'dayCr',to_char(r.version_at at time zone 'America/Costa_Rica','YYYY-MM-DD'),'current',r.version=coalesce((select current_version from fam),1),
     'file',jsonb_build_object('id',r.id,'name',r.name,'mimeType',r.mime_type,'sizeBytes',r.size_bytes,'sha256',r.sha256,'createdAt',r.file_at)) order by r.version desc) from rows r),'[]'::jsonb)) $$;

create or replace function public.pro_company_file_versions_read(p_actor uuid,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare root uuid;
begin
 if not public.pro_cfv_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_file is null then raise exception 'Invalid file' using errcode='22023';end if;
 if not exists(select 1 from public.pro_company_files where owner_id=p_actor and id=p_file and ready) then return null;end if;
 root:=public.pro_cfv_root(p_actor,p_file);
 return public.pro_cfv_state(p_actor,root);
end $$;
-- Badges for one page of the list (≤ 20 files).
create or replace function public.pro_company_file_versions_index(p_actor uuid,p_files uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_cfv_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_files is null or cardinality(p_files)>20 then raise exception 'Invalid files' using errcode='22023';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('fileId',m.file_id,'rootId',f.root_id,'currentVersion',f.current_version,
   'versionCount',(select count(*)::integer from public.pro_company_file_versions v where v.owner_id=f.owner_id and v.root_id=f.root_id)) order by m.file_id)
  from public.pro_company_file_family_members m join public.pro_company_file_families f on f.owner_id=m.owner_id and f.root_id=m.root_id
  where m.owner_id=p_actor and m.file_id=any(p_files) and f.current_file_id=m.file_id),'[]'::jsonb);
end $$;

create or replace function public.pro_company_file_versions_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;fid uuid;nid uuid;rev integer;v_note text;v_version integer;receipt public.pro_company_file_version_actions;
 root uuid;fam public.pro_company_file_families;cur public.pro_company_files;nf public.pro_company_files;target public.pro_company_file_versions;next_version integer;result jsonb;
begin
 if not public.pro_cfv_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid version' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from (case act when 'add_version' then array['action','actionId','fileId','newFileId','note','revision'] when 'restore' then array['action','actionId','fileId','note','revision','version'] end) then raise exception 'Invalid version fields' using errcode='22023';end if;
 aid:=public.pro_wfv_uuid(p_input->'actionId');fid:=public.pro_wfv_uuid(p_input->'fileId');rev:=public.pro_wfv_int(p_input->'revision',0,2147483646);v_note:=public.pro_wfv_text(p_input->'note',500,false);
 if act='add_version' then nid:=public.pro_wfv_uuid(p_input->'newFileId');else v_version:=public.pro_wfv_int(p_input->'version',1,100);end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-company-file-version-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_company_file_version_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-company-files:'||p_actor::text,0));
 if not public.pro_cfv_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.pro_company_files where owner_id=p_actor and id=fid and ready) then raise exception 'File unavailable' using errcode='42501';end if;
 root:=public.pro_cfv_root(p_actor,fid);
 select * into fam from public.pro_company_file_families where owner_id=p_actor and root_id=root for update;
 if coalesce(fam.revision,0)<>rev then raise exception 'Versions changed' using errcode='40001';end if;
 select * into cur from public.pro_company_files where owner_id=p_actor and id=coalesce(fam.current_file_id,root) for update;
 if not found or not cur.ready then raise exception 'File unavailable' using errcode='42501';end if;
 if cur.archived then raise exception 'Restore the file before changing its versions' using errcode='22023';end if;
 if act='add_version' then
  select * into nf from public.pro_company_files where owner_id=p_actor and id=nid for update;
  if not found or not nf.ready then raise exception 'Upload the new version first' using errcode='22023';end if;
  if nf.id=cur.id or nf.archived or exists(select 1 from public.pro_company_file_family_members where owner_id=p_actor and file_id=nid)
   or exists(select 1 from public.pro_company_file_families where owner_id=p_actor and root_id=nid) then raise exception 'That file cannot become a version' using errcode='22023';end if;
 end if;
 if fam.root_id is null then
  insert into public.pro_company_file_families(owner_id,root_id,current_version,current_file_id) values(p_actor,root,1,root) returning * into fam;
  insert into public.pro_company_file_family_members(owner_id,file_id,root_id) values(p_actor,root,root);
  insert into public.pro_company_file_versions(owner_id,root_id,version,file_id,kind,created_at) values(p_actor,root,1,root,'original',cur.created_at);
 end if;
 select coalesce(max(version),0)+1 into next_version from public.pro_company_file_versions where owner_id=p_actor and root_id=root;
 if next_version>100 then raise exception 'Version limit' using errcode='54000';end if;
 if act='add_version' then
  insert into public.pro_company_file_family_members(owner_id,file_id,root_id) values(p_actor,nid,root);
  insert into public.pro_company_file_versions(owner_id,root_id,version,file_id,kind,note) values(p_actor,root,next_version,nid,'upload',v_note);
 else
  select * into target from public.pro_company_file_versions where owner_id=p_actor and root_id=root and version=v_version;
  if not found then raise exception 'Unknown version' using errcode='22023';end if;
  if target.file_id=cur.id then raise exception 'That version is already current' using errcode='22023';end if;
  select * into nf from public.pro_company_files where owner_id=p_actor and id=target.file_id for update;
  if not found or not nf.ready then raise exception 'Version unavailable' using errcode='22023';end if;
  insert into public.pro_company_file_versions(owner_id,root_id,version,file_id,kind,restored_from,note) values(p_actor,root,next_version,target.file_id,'restore',v_version,v_note);
 end if;
 -- The file that becomes current keeps the place, favourite and active state of the family.
 if nf.folder_id is distinct from cur.folder_id or nf.favorite<>cur.favorite or nf.archived then
  update public.pro_company_files set folder_id=cur.folder_id,favorite=cur.favorite,archived=false,revision=revision+1 where owner_id=p_actor and id=nf.id;
 end if;
 update public.pro_company_file_families set current_version=next_version,current_file_id=nf.id,revision=revision+1,updated_at=now() where owner_id=p_actor and root_id=root returning * into fam;
 result:=jsonb_build_object('action',act,'family',public.pro_cfv_state(p_actor,root),
  'file',(select public.pro_company_file_json(f) from public.pro_company_files f where f.owner_id=p_actor and f.id=nf.id));
 insert into public.pro_company_file_version_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Moving the current file moves every member of its family (each member gets its next revision).
create or replace function public.pro_cfv_follow_folder() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.folder_id is distinct from old.folder_id and exists(select 1 from public.pro_company_file_families f where f.owner_id=new.owner_id and f.current_file_id=new.id) then
  update public.pro_company_files c set folder_id=new.folder_id,revision=c.revision+1
   where c.owner_id=new.owner_id and c.id<>new.id and c.folder_id is distinct from new.folder_id
    and c.id in(select m.file_id from public.pro_company_file_family_members m where m.owner_id=new.owner_id and m.root_id=(select f.root_id from public.pro_company_file_families f where f.owner_id=new.owner_id and f.current_file_id=new.id));
 end if;
 return null;
end $$;
drop trigger if exists pro_cfv_follow_folder on public.pro_company_files;
create trigger pro_cfv_follow_folder after update of folder_id on public.pro_company_files for each row execute function public.pro_cfv_follow_folder();
create or replace function public.pro_cfv_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Company file versions are immutable' using errcode='23514';end $$;
drop trigger if exists pro_cfv_versions_immutable on public.pro_company_file_versions;
create trigger pro_cfv_versions_immutable before update on public.pro_company_file_versions for each row execute function public.pro_cfv_immutable();
drop trigger if exists pro_cfv_members_immutable on public.pro_company_file_family_members;
create trigger pro_cfv_members_immutable before update on public.pro_company_file_family_members for each row execute function public.pro_cfv_immutable();
drop trigger if exists pro_cfv_actions_immutable on public.pro_company_file_version_actions;
create trigger pro_cfv_actions_immutable before update on public.pro_company_file_version_actions for each row execute function public.pro_cfv_immutable();
create or replace function public.pro_cfv_family_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.owner_id<>old.owner_id or new.root_id<>old.root_id or new.created_at<>old.created_at or new.revision<>old.revision+1 or new.current_version<=old.current_version then raise exception 'Families only move forward' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_cfv_family_guard on public.pro_company_file_families;
create trigger pro_cfv_family_guard before update on public.pro_company_file_families for each row execute function public.pro_cfv_family_guard();

-- Library listing: same as company-files-local.sql plus pro_cfv_hidden (non-current versions are not listed).
create or replace function public.pro_company_files_read(p_actor uuid,p_scope text default 'folder',p_folder uuid default null,p_status text default 'active',p_query text default '',p_type text default 'all',p_starred boolean default false,p_after text default null,p_file uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f pro_company_files;items jsonb;ancestors jsonb:='[]'::jsonb;cursor_kind text;cursor_id uuid;next_cursor text;want boolean;needle text;
begin
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_file is not null then select * into f from pro_company_files where owner_id=p_actor and id=p_file and ready;if not found then return null;end if;return jsonb_build_object('file',pro_company_file_json(f),'ancestors',pro_company_ancestors(p_actor,f.folder_id));end if;
 if p_scope is null or p_scope not in('folder','all') or p_scope='all' and p_folder is not null or p_status is null or p_status not in('active','archived') or p_query is null or length(p_query)>100 or p_type is null or p_type not in('all','image','pdf') or p_starred is null then raise exception 'Invalid library query' using errcode='22023';end if;
 if p_scope='folder' then ancestors:=pro_company_ancestors(p_actor,p_folder);end if;want:=p_status='archived';needle:=lower(btrim(p_query));
 if p_after is not null then if not p_after~'^(folder|file):[a-f0-9-]{36}$' then raise exception 'Invalid cursor' using errcode='22023';end if;cursor_kind:=split_part(p_after,':',1);cursor_id:=split_part(p_after,':',2)::uuid;end if;
 -- Both branches have a single current-owner predicate before keyset filtering.
 with candidates as(
  select 'folder'::text kind,d.id,pro_company_folder_json(d) data from pro_company_folders d where d.owner_id=p_actor and d.archived=want and(p_scope='all' or d.parent_id is not distinct from p_folder) and p_type='all' and(not p_starred or d.favorite) and(needle='' or position(needle in lower(d.name))>0)
  union all select 'file',d.id,pro_company_file_json(d) from pro_company_files d where d.owner_id=p_actor and d.ready and d.archived=want and not public.pro_cfv_hidden(p_actor,d.id) and(p_scope='all' or d.folder_id is not distinct from p_folder) and(p_type='all' or p_type='image' and d.mime_type='image/jpeg' or p_type='pdf' and d.mime_type='application/pdf') and(not p_starred or d.favorite) and(needle='' or position(needle in lower(d.name))>0)
 ),eligible as(select *,case kind when 'folder' then 0 else 1 end sort from candidates),paged as(select * from eligible where p_after is null or(sort,id)>(case cursor_kind when 'folder' then 0 else 1 end,cursor_id) order by sort,id limit 21)
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,kind,data) order by sort,id),'[]'::jsonb) into items from paged;
 if p_after is not null then
  if cursor_kind='folder' then
   if not exists(select 1 from pro_company_folders d where d.owner_id=p_actor and d.id=cursor_id and d.archived=want and(p_scope='all' or d.parent_id is not distinct from p_folder) and p_type='all' and(not p_starred or d.favorite) and(needle='' or position(needle in lower(d.name))>0)) then raise exception 'Cursor changed' using errcode='40001';end if;
  elsif not exists(select 1 from pro_company_files d where d.owner_id=p_actor and d.id=cursor_id and d.ready and d.archived=want and not public.pro_cfv_hidden(p_actor,d.id) and(p_scope='all' or d.folder_id is not distinct from p_folder) and(p_type='all' or p_type='image' and d.mime_type='image/jpeg' or p_type='pdf' and d.mime_type='application/pdf') and(not p_starred or d.favorite) and(needle='' or position(needle in lower(d.name))>0)) then raise exception 'Cursor changed' using errcode='40001';end if;
 end if;
 if jsonb_array_length(items)>20 then next_cursor:=items->19->>'kind';next_cursor:=next_cursor||':'||(items->19->next_cursor->>'id');items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',next_cursor,'ancestors',ancestors);
end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_company_file_families','pro_company_file_family_members','pro_company_file_versions','pro_company_file_version_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro\_cfv\_%' or p.proname in('pro_company_file_versions_read','pro_company_file_versions_index','pro_company_file_versions_mutate','pro_company_files_read')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname not in('pro_cfv_immutable','pro_cfv_family_guard','pro_cfv_follow_folder') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
