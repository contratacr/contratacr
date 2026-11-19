-- LOCAL PRO ONLY. Round 8 (2026-11-15): organizer for the files of a job (Archivos del trabajo).
-- Folders and subfolders (depth ≤ 5), move, rename (display name, same extension), favorites,
-- trash with restore and search. The uploaded file rows (pro_work_files) and their bytes are never
-- changed or deleted: the organizer keeps its own metadata (pro_work_file_meta) and folders.
-- Trash: a trashed file or folder (with everything inside) leaves the normal views and can be
-- restored; the trash shows «se puede restaurar hasta» = trashed_at + 30 days (retention note).
-- Nothing is purged automatically in this local suite (data is never lost; a purge job would need
-- authorization). Sharing with the customer and versions keep their own rules: what was already
-- shared stays shared (immutable publication); a trashed file cannot be shared again from the UI.
-- Patterns: RLS on, service_role-only, CAS 40001, idempotent actionId, immutable history.
begin;
create table if not exists public.pro_work_file_folders(
 owner_id uuid not null,id uuid not null,work_id text not null,parent_id uuid,
 name text not null check(length(btrim(name)) between 1 and 80 and name=btrim(name) and name !~ '[[:cntrl:]/]' and position(chr(92) in name)=0),
 trashed_at timestamptz,revision integer not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,parent_id) references public.pro_work_file_folders(owner_id,id),
 check(parent_id is distinct from id));
create index if not exists pro_work_file_folders_parent on public.pro_work_file_folders(owner_id,work_id,parent_id);
create table if not exists public.pro_work_file_meta(
 owner_id uuid not null,file_id uuid not null,work_id text not null,folder_id uuid,
 display_name text check(display_name is null or (length(display_name) between 1 and 160 and display_name !~ '[[:cntrl:]/]' and position(chr(92) in display_name)=0)),
 favorite boolean not null default false,trashed_at timestamptz,revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,file_id),
 foreign key(owner_id,work_id,file_id) references public.pro_work_files(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,folder_id) references public.pro_work_file_folders(owner_id,id));
create table if not exists public.pro_work_file_organizer_history(
 owner_id uuid not null,action_id uuid not null,action text not null,subject text not null check(subject in('file','folder')),subject_id uuid not null,
 before_row jsonb,after_row jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_work_file_organizer_actions(
 owner_id uuid not null,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));

-- True when the folder or one of its ancestors is in the trash.
create or replace function public.pro_wfo_folder_trashed(p_owner uuid,p_folder uuid) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 with recursive up as(select id,parent_id,trashed_at,1 depth from public.pro_work_file_folders where owner_id=p_owner and id=p_folder
  union all select f.id,f.parent_id,f.trashed_at,up.depth+1 from public.pro_work_file_folders f join up on f.owner_id=p_owner and f.id=up.parent_id where up.depth<8)
 select coalesce(bool_or(trashed_at is not null),false) from up
$$;
create or replace function public.pro_wfo_folder_depth(p_owner uuid,p_folder uuid) returns integer language sql stable security invoker set search_path=public,pg_temp as $$
 with recursive up as(select id,parent_id,1 depth from public.pro_work_file_folders where owner_id=p_owner and id=p_folder
  union all select f.id,f.parent_id,up.depth+1 from public.pro_work_file_folders f join up on f.owner_id=p_owner and f.id=up.parent_id where up.depth<8)
 select coalesce(max(depth),0) from up
$$;
create or replace function public.pro_wfo_subtree_height(p_owner uuid,p_folder uuid) returns integer language sql stable security invoker set search_path=public,pg_temp as $$
 with recursive down as(select id,1 h from public.pro_work_file_folders where owner_id=p_owner and id=p_folder
  union all select f.id,down.h+1 from public.pro_work_file_folders f join down on f.owner_id=p_owner and f.parent_id=down.id where down.h<8)
 select coalesce(max(h),0) from down
$$;
create or replace function public.pro_wfo_folder_json(f public.pro_work_file_folders) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',f.id,'parentId',f.parent_id,'name',f.name,'revision',f.revision,'trashedAt',f.trashed_at,
  'restoreUntil',case when f.trashed_at is not null then ((f.trashed_at at time zone 'America/Costa_Rica')::date+30)::text end,
  'items',(select count(*) from public.pro_work_file_meta m where m.owner_id=f.owner_id and m.folder_id=f.id and m.trashed_at is null)+(select count(*) from public.pro_work_file_folders c where c.owner_id=f.owner_id and c.parent_id=f.id and c.trashed_at is null))
$$;
create or replace function public.pro_wfo_file_json(p_file public.pro_work_files,m public.pro_work_file_meta) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.pro_work_file_json(p_file)||jsonb_build_object('originalName',p_file.name,'name',coalesce(m.display_name,p_file.name),'folderId',m.folder_id,'favorite',coalesce(m.favorite,false),
  'trashedAt',m.trashed_at,'restoreUntil',case when m.trashed_at is not null then ((m.trashed_at at time zone 'America/Costa_Rica')::date+30)::text end,'metaRevision',coalesce(m.revision,0))
$$;

create or replace function public.pro_work_file_organizer_read(p_actor uuid,p_work text,p_view text,p_folder uuid default null,p_q text default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare q text:=lower(btrim(coalesce(p_q,'')));crumbs jsonb;folders jsonb;files jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_view not in('folder','favorites','trash','search') or length(q)>80 then raise exception 'Invalid file query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 if p_folder is not null and not exists(select 1 from public.pro_work_file_folders where owner_id=p_actor and work_id=p_work and id=p_folder) then return null;end if;
 if p_view='folder' then
  if p_folder is not null and public.pro_wfo_folder_trashed(p_actor,p_folder) then return null;end if;
  with recursive up as(select id,parent_id,name,1 depth from public.pro_work_file_folders where owner_id=p_actor and id=p_folder
   union all select f.id,f.parent_id,f.name,up.depth+1 from public.pro_work_file_folders f join up on f.owner_id=p_actor and f.id=up.parent_id where up.depth<8)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by depth desc),'[]'::jsonb) into crumbs from up;
  select coalesce(jsonb_agg(public.pro_wfo_folder_json(f) order by lower(f.name),f.id),'[]'::jsonb) into folders from public.pro_work_file_folders f where f.owner_id=p_actor and f.work_id=p_work and f.parent_id is not distinct from p_folder and f.trashed_at is null;
  select coalesce(jsonb_agg(public.pro_wfo_file_json(w,m) order by w.created_at desc,w.id),'[]'::jsonb) into files from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id
   where w.owner_id=p_actor and w.work_id=p_work and w.ready and m.trashed_at is null and m.folder_id is not distinct from p_folder;
 elsif p_view='trash' then
  crumbs:='[]'::jsonb;
  -- Top-level trashed items only (contents of a trashed folder come back with it).
  select coalesce(jsonb_agg(public.pro_wfo_folder_json(f) order by f.trashed_at desc,f.id),'[]'::jsonb) into folders from public.pro_work_file_folders f where f.owner_id=p_actor and f.work_id=p_work and f.trashed_at is not null and (f.parent_id is null or not public.pro_wfo_folder_trashed(p_actor,f.parent_id));
  select coalesce(jsonb_agg(public.pro_wfo_file_json(w,m) order by m.trashed_at desc,w.id),'[]'::jsonb) into files from public.pro_work_files w join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id
   where w.owner_id=p_actor and w.work_id=p_work and w.ready and m.trashed_at is not null and (m.folder_id is null or not public.pro_wfo_folder_trashed(p_actor,m.folder_id));
 else
  crumbs:='[]'::jsonb;folders:='[]'::jsonb;
  select coalesce(jsonb_agg(public.pro_wfo_file_json(w,m) order by w.created_at desc,w.id),'[]'::jsonb) into files from public.pro_work_files w left join public.pro_work_file_meta m on m.owner_id=w.owner_id and m.file_id=w.id
   where w.owner_id=p_actor and w.work_id=p_work and w.ready and m.trashed_at is null and (m.folder_id is null or not public.pro_wfo_folder_trashed(p_actor,m.folder_id))
    and (p_view<>'favorites' or coalesce(m.favorite,false)) and (q='' or strpos(lower(coalesce(m.display_name,w.name)),q)>0 or strpos(lower(w.name),q)>0);
  if p_view='search' and q<>'' then
   select coalesce(jsonb_agg(public.pro_wfo_folder_json(f) order by lower(f.name),f.id),'[]'::jsonb) into folders from public.pro_work_file_folders f where f.owner_id=p_actor and f.work_id=p_work and f.trashed_at is null and not public.pro_wfo_folder_trashed(p_actor,f.id) and strpos(lower(f.name),q)>0;
  end if;
 end if;
 return jsonb_build_object('workId',p_work,'view',p_view,'folderId',p_folder,'breadcrumb',crumbs,'folders',folders,'files',files,
  'allFolders',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'parentId',f.parent_id,'name',f.name) order by lower(f.name),f.id) from public.pro_work_file_folders f where f.owner_id=p_actor and f.work_id=p_work and f.trashed_at is null and not public.pro_wfo_folder_trashed(p_actor,f.id)),'[]'::jsonb),
  'trashCount',(select count(*) from public.pro_work_file_meta m where m.owner_id=p_actor and m.work_id=p_work and m.trashed_at is not null)+(select count(*) from public.pro_work_file_folders f where f.owner_id=p_actor and f.work_id=p_work and f.trashed_at is not null));
end $$;

create or replace function public.pro_work_file_organizer_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;wid text:=p_input->>'workId';keys text[];hash text:=md5(p_input::text);prior public.pro_work_file_organizer_actions;
 fo public.pro_work_file_folders;m public.pro_work_file_meta;w public.pro_work_files;target uuid;sid uuid;rev integer;nm text;before_json jsonb;after_json jsonb;answer jsonb;subj text;had_meta boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid file action' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act is null or not(
   act='create_folder' and keys=array['action','actionId','folderId','name','parentId','workId']
   or act in('rename_folder','rename_file') and keys=array['action','actionId','name','revision','subjectId','workId']
   or act in('move_folder','move_file') and keys=array['action','actionId','revision','subjectId','targetId','workId']
   or act in('trash_folder','restore_folder','trash_file','restore_file') and keys=array['action','actionId','revision','subjectId','workId']
   or act='favorite_file' and keys=array['action','actionId','on','revision','subjectId','workId']) then raise exception 'Invalid file action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;sid:=nullif(p_input->>'subjectId','')::uuid;target:=nullif(coalesce(p_input->>'targetId',p_input->>'parentId'),'')::uuid;
  if p_input ? 'revision' then rev:=(p_input->>'revision')::integer;end if;exception when others then raise exception 'Invalid file action' using errcode='22023';end;
 if wid is null or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-wfo:'||p_actor::text||':'||wid,0));
 select * into prior from public.pro_work_file_organizer_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if target is not null and (not exists(select 1 from public.pro_work_file_folders where owner_id=p_actor and work_id=wid and id=target) or public.pro_wfo_folder_trashed(p_actor,target)) then raise exception 'Folder unavailable' using errcode='40001';end if;
 if act in('create_folder','rename_folder','rename_file') then
  if jsonb_typeof(p_input->'name') is distinct from 'string' then raise exception 'Invalid name' using errcode='22023';end if;nm:=btrim(p_input->>'name');
 end if;
 if act like '%_folder' then
  subj:='folder';
  if act='create_folder' then
   begin sid:=(p_input->>'folderId')::uuid;exception when others then raise exception 'Invalid file action' using errcode='22023';end;
   if length(nm) not between 1 and 80 or nm ~ '[[:cntrl:]/]' or position(chr(92) in nm)>0 then raise exception 'Invalid name' using errcode='22023';end if;
   if target is not null and public.pro_wfo_folder_depth(p_actor,target)>=5 then raise exception 'Folder too deep' using errcode='22023';end if;
   if (select count(*) from public.pro_work_file_folders where owner_id=p_actor and work_id=wid)>=200 then raise exception 'Folder limit' using errcode='54000';end if;
   insert into public.pro_work_file_folders(owner_id,id,work_id,parent_id,name) values(p_actor,sid,wid,target,nm) returning * into fo;
  else
   select * into fo from public.pro_work_file_folders where owner_id=p_actor and work_id=wid and id=sid for update;
   if not found then raise exception 'Forbidden' using errcode='42501';end if;
   if fo.revision<>rev then raise exception 'Folder changed' using errcode='40001';end if;
   before_json:=public.pro_wfo_folder_json(fo);
   if act='rename_folder' then
    if length(nm) not between 1 and 80 or nm ~ '[[:cntrl:]/]' or position(chr(92) in nm)>0 then raise exception 'Invalid name' using errcode='22023';end if;
    update public.pro_work_file_folders set name=nm,revision=revision+1 where owner_id=p_actor and id=sid returning * into fo;
   elsif act='move_folder' then
    if fo.trashed_at is not null then raise exception 'Restore before moving' using errcode='22023';end if;
    -- No cycles: the target cannot be the folder itself or one of its descendants.
    if target is not null and exists(with recursive down as(select id,1 h from public.pro_work_file_folders where owner_id=p_actor and id=sid union all select f.id,down.h+1 from public.pro_work_file_folders f join down on f.owner_id=p_actor and f.parent_id=down.id where down.h<8) select 1 from down where id=target) then raise exception 'Invalid move' using errcode='22023';end if;
    if coalesce(public.pro_wfo_folder_depth(p_actor,target),0)+public.pro_wfo_subtree_height(p_actor,sid)>5 then raise exception 'Folder too deep' using errcode='22023';end if;
    update public.pro_work_file_folders set parent_id=target,revision=revision+1 where owner_id=p_actor and id=sid returning * into fo;
   elsif act='trash_folder' then
    if fo.trashed_at is not null then raise exception 'Already in trash' using errcode='40001';end if;
    update public.pro_work_file_folders set trashed_at=clock_timestamp(),revision=revision+1 where owner_id=p_actor and id=sid returning * into fo;
   else
    if fo.trashed_at is null then raise exception 'Not in trash' using errcode='40001';end if;
    -- Restored into the root when its parent is still in the trash.
    update public.pro_work_file_folders set trashed_at=null,parent_id=case when parent_id is not null and public.pro_wfo_folder_trashed(p_actor,parent_id) then null else parent_id end,revision=revision+1 where owner_id=p_actor and id=sid returning * into fo;
   end if;
  end if;
  after_json:=public.pro_wfo_folder_json(fo);answer:=jsonb_build_object('action',act,'folder',after_json);
 else
  subj:='file';
  select * into w from public.pro_work_files where owner_id=p_actor and work_id=wid and id=sid and ready;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  select * into m from public.pro_work_file_meta where owner_id=p_actor and file_id=sid for update;
  had_meta:=found;
  if coalesce(m.revision,0)<>rev then raise exception 'File changed' using errcode='40001';end if;
  before_json:=public.pro_wfo_file_json(w,m);
  if not had_meta then insert into public.pro_work_file_meta(owner_id,file_id,work_id) values(p_actor,sid,wid) returning * into m;else update public.pro_work_file_meta set revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and file_id=sid returning * into m;end if;
  if act='rename_file' then
   if length(nm) not between 5 and 160 or nm ~ '[[:cntrl:]/]' or position(chr(92) in nm)>0 or lower(right(nm,4))<>right(w.name,4) then raise exception 'Invalid name' using errcode='22023';end if;
   nm:=left(nm,length(nm)-4)||right(w.name,4);
   update public.pro_work_file_meta set display_name=case when nm=w.name then null else nm end where owner_id=p_actor and file_id=sid returning * into m;
  elsif act='move_file' then
   if m.trashed_at is not null then raise exception 'Restore before moving' using errcode='22023';end if;
   update public.pro_work_file_meta set folder_id=target where owner_id=p_actor and file_id=sid returning * into m;
  elsif act='favorite_file' then
   if jsonb_typeof(p_input->'on') is distinct from 'boolean' then raise exception 'Invalid file action' using errcode='22023';end if;
   update public.pro_work_file_meta set favorite=(p_input->>'on')::boolean where owner_id=p_actor and file_id=sid returning * into m;
  elsif act='trash_file' then
   if m.trashed_at is not null then raise exception 'Already in trash' using errcode='40001';end if;
   update public.pro_work_file_meta set trashed_at=clock_timestamp() where owner_id=p_actor and file_id=sid returning * into m;
  else
   if m.trashed_at is null then raise exception 'Not in trash' using errcode='40001';end if;
   update public.pro_work_file_meta set trashed_at=null,folder_id=case when folder_id is not null and public.pro_wfo_folder_trashed(p_actor,folder_id) then null else folder_id end where owner_id=p_actor and file_id=sid returning * into m;
  end if;
  after_json:=public.pro_wfo_file_json(w,m);answer:=jsonb_build_object('action',act,'file',after_json);
 end if;
 insert into public.pro_work_file_organizer_history(owner_id,action_id,action,subject,subject_id,before_row,after_row) values(p_actor,aid,act,subj,sid,before_json,after_json);
 insert into public.pro_work_file_organizer_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;

create or replace function public.pro_wfo_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'File organizer history is immutable' using errcode='23514';end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_work_file_folders','pro_work_file_meta','pro_work_file_organizer_history','pro_work_file_organizer_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_work_file_organizer_history','pro_work_file_organizer_actions'] loop
  execute format('drop trigger if exists pro_wfo_immutable on public.%I',t);execute format('create trigger pro_wfo_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_wfo_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_wfo_folder_trashed','pro_wfo_folder_depth','pro_wfo_subtree_height','pro_wfo_folder_json','pro_wfo_file_json','pro_work_file_organizer_read','pro_work_file_organizer_mutate','pro_wfo_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
