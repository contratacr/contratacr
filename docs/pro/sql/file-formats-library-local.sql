-- LOCAL PRO ONLY. Ronda F2-D (2026-11-19): formats, organizer, library tags and shared folders.
-- Rows 28, 29, 31 and 33 of docs/pro/houzz-parity-register-local.md.
-- 1. Formats (row 28): job files (pro_work_files) and the company library (pro_company_files)
--    accept, besides JPG/PDF: Word/Excel/PowerPoint (OOXML, no macros), CSV, TXT, AutoCAD DWG/DXF
--    (download only), HEIC (kept when it cannot be converted to JPG) and short MP4/MOV videos, all
--    up to the same 20 MiB private limit (file-size-limits-local.sql). The server sniffs the bytes
--    (src/lib/pro/file-sniff.ts); the list below is the same as src/lib/pro/file-formats.ts. Every
--    bucket stays private (no public URL, no signed URL handed out): bytes only through the
--    reauthorized API. The CHECK constraints that hard-coded jpg/pdf are replaced by format-aware
--    ones (no row changes: every stored jpg/pdf already satisfies them).
-- 2. Quota (row 28): 2 GiB per account across job files and library (new uploads only), 500 files
--    per job (was 100) and 1000 library files (was 500).
-- 3. Organizer (row 29): permanent delete from the trash with confirmation (purge_file /
--    purge_folder). Only files never shared with the customer and without versions, comments or
--    other uses (any foreign key besides the organizer metadata) can be deleted; the route then
--    removes the stored bytes. The organizer history keeps the record. Nothing is purged
--    automatically after the 30 days.
-- 4. Shared folders (row 33): share_folder marks a job folder "Visible para el cliente"; the linked
--    customer (and the owner's "as client" preview) sees the ready, non-trashed files directly in
--    it, only while "Archivos y fotos" (show_files) is on. Downloads are reauthorized each time.
-- 5. Library tags (row 31): up to 6 tags per library file (presets template/manual/permit plus
--    custom), list and filter by tag. Private to the owner, like the library.
-- Patterns: RLS on, service_role-only, security invoker, idempotent actionId receipts, CAS 40001.
begin;
create or replace function public.pro_file_doc_ext(p_mime text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_mime when 'image/jpeg' then 'jpg' when 'application/pdf' then 'pdf'
  when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
  when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
  when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
  when 'text/csv' then 'csv' when 'text/plain' then 'txt' when 'image/vnd.dwg' then 'dwg' when 'image/vnd.dxf' then 'dxf'
  when 'image/heic' then 'heic' when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' end $$;

-- ===================================================================== 1. table checks
do $$declare r record;t regclass;begin
 foreach t in array array['public.pro_work_files','public.pro_company_files']::regclass[] loop
  for r in select c.conname from pg_constraint c where c.conrelid=t and c.contype='c' and (pg_get_constraintdef(c.oid) like '%application/pdf%' or c.conname like 'pro\_%\_doc\_%') loop
   execute format('alter table %s drop constraint %I',t,r.conname);
  end loop;
 end loop;
 alter table public.pro_work_files add constraint pro_work_files_doc_mime check(mime_type in('image/jpeg','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','text/plain','image/vnd.dwg','image/vnd.dxf','image/heic','video/mp4','video/quicktime'));
 alter table public.pro_work_files add constraint pro_work_files_doc_path check(object_path=owner_id::text||'/'||id::text||'.'||public.pro_file_doc_ext(mime_type));
 alter table public.pro_work_files add constraint pro_work_files_doc_name check(right(name,length(public.pro_file_doc_ext(mime_type))+1)='.'||public.pro_file_doc_ext(mime_type));
 alter table public.pro_company_files add constraint pro_company_files_doc_mime check(mime_type in('image/jpeg','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','text/plain','image/vnd.dwg','image/vnd.dxf','image/heic','video/mp4','video/quicktime'));
 alter table public.pro_company_files add constraint pro_company_files_doc_path check(object_path=owner_id::text||'/'||id::text||'.'||public.pro_file_doc_ext(mime_type));
 alter table public.pro_company_files add constraint pro_company_files_doc_name check(right(name,length(public.pro_file_doc_ext(mime_type))+1)='.'||public.pro_file_doc_ext(mime_type));
end $$;

-- ===================================================================== 2. quota
create or replace function public.pro_file_quota_used(p_owner uuid) returns bigint language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select sum(size_bytes)::bigint from public.pro_work_files where owner_id=p_owner),0)+coalesce((select sum(size_bytes)::bigint from public.pro_company_files where owner_id=p_owner),0) $$;
create or replace function public.pro_file_quota_check(p_owner uuid,p_bytes integer) returns void language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if public.pro_file_quota_used(p_owner)+coalesce(p_bytes,0)>2147483648 then raise exception 'Storage quota exceeded' using errcode='54000',hint='pro_file_quota';end if;
end $$;
create or replace function public.pro_file_quota_read(p_actor uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('usedBytes',public.pro_file_quota_used(p_actor),'limitBytes',2147483648);
end $$;

-- ===================================================================== writers (same bodies, format-aware)
create or replace function public.pro_work_file_reserve(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare fid uuid;wid text;keys text[];receipt public.pro_work_file_upload_actions;file public.pro_work_files;mime text;bytes integer;path text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid file' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys<>array['fileId','mimeType','name','rawSha256','sha256','sizeBytes','sourceName','workId']
 or jsonb_typeof(p_input->'fileId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string'
 or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'sourceName') is distinct from 'string'
 or jsonb_typeof(p_input->'mimeType') is distinct from 'string' or jsonb_typeof(p_input->'rawSha256') is distinct from 'string' or jsonb_typeof(p_input->'sha256') is distinct from 'string'
 or jsonb_typeof(p_input->'sizeBytes') is distinct from 'number' then raise exception 'Invalid file fields' using errcode='22023';end if;
 fid:=(p_input->>'fileId')::uuid;wid:=p_input->>'workId';mime:=p_input->>'mimeType';
 if length(wid) not between 1 and 160 or public.pro_file_doc_ext(mime) is null or not coalesce((p_input->>'rawSha256')~'^[a-f0-9]{64}$',false) or not coalesce((p_input->>'sha256')~'^[a-f0-9]{64}$',false)
 or not coalesce((p_input->>'sizeBytes')~'^[0-9]{1,8}$',false) then raise exception 'Invalid file metadata' using errcode='22023';end if;
 bytes:=(p_input->>'sizeBytes')::integer;if bytes<1 or bytes>20971520 or mime='image/jpeg' and bytes>20971520 or right(p_input->>'name',length(public.pro_file_doc_ext(mime))+1)<>'.'||public.pro_file_doc_ext(mime) then raise exception 'File too large' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-file-upload:'||p_actor::text||':'||fid::text,0));
 select * into receipt from public.pro_work_file_upload_actions where actor_id=p_actor and file_id=fid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Upload identity reused with different bytes or metadata' using errcode='22023';end if;
  select * into file from public.pro_work_files where id=fid and owner_id=p_actor and work_id=wid;
  return jsonb_build_object('file',coalesce(receipt.result->'file',public.pro_work_file_json(file)),'objectPath',file.object_path);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-files:'||p_actor::text||':'||wid,0));
 perform 1 from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if (select count(*) from public.pro_work_files where owner_id=p_actor and work_id=wid)>=500 then raise exception 'File limit reached' using errcode='54000';end if;
 perform public.pro_file_quota_check(p_actor,bytes);
 path:=p_actor::text||'/'||fid::text||'.'||public.pro_file_doc_ext(mime);
 insert into public.pro_work_files(id,owner_id,work_id,source_name,name,mime_type,raw_sha256,sha256,size_bytes,object_path)
 values(fid,p_actor,wid,p_input->>'sourceName',p_input->>'name',mime,p_input->>'rawSha256',p_input->>'sha256',bytes,path) returning * into file;
 insert into public.pro_work_file_upload_actions(actor_id,file_id,input) values(p_actor,fid,p_input);
 return jsonb_build_object('file',public.pro_work_file_json(file),'objectPath',path);
end $$;

create or replace function public.pro_company_files_mutate(p_actor uuid,p_input jsonb,p_input_hash text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;fid uuid;parent uuid;rev integer;keys text[];expected text[];r pro_company_file_actions;f pro_company_files;folder pro_company_folders;before_json jsonb;answer jsonb;ancestors jsonb;max_depth integer;target uuid;wid text;snapshot jsonb;reserved jsonb;bytes integer;mime text;canonical_name text;
begin
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or not coalesce(p_input_hash~'^[a-f0-9]{64}$',false) or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid operation' using errcode='22023';end if;
 act:=p_input->>'action';aid:=(p_input->>'actionId')::uuid;
 case act
 when 'folder_save' then expected:=array['action','actionId','favorite','folderId','name','parentId','revision'];
 when 'folder_archive','folder_restore' then expected:=array['action','actionId','folderId','revision'];
 when 'file_update' then expected:=array['action','actionId','favorite','fileId','folderId','name','revision'];
 when 'file_archive','file_restore' then expected:=array['action','actionId','fileId','revision'];
 when 'upload' then expected:=array['action','actionId','fileId','folderId','mimeType','name','rawSha256','sha256','sizeBytes','sourceName'];
 when 'copy' then expected:=array['action','actionId','fileId','revision','targetFileId','workId'];
 else raise exception 'Invalid action' using errcode='22023';end case;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;if keys is distinct from expected then raise exception 'Invalid action fields' using errcode='22023';end if;
 if act<>'upload' and(jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric not between 0 and 2147483647) then raise exception 'Invalid revision' using errcode='22023';end if;
 if act<>'upload' then rev:=(p_input->>'revision')::integer;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-company-file-action:'||p_actor::text||':'||aid::text,0));
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from pro_company_file_actions where actor_id=p_actor and action_id=aid;
 if found then if r.input is distinct from p_input or r.input_hash<>p_input_hash then raise exception 'Operation identity reused' using errcode='22023';end if;return pro_company_action_state(p_actor,aid);end if;
 if act='copy' then if jsonb_typeof(p_input->'targetFileId') is distinct from 'string' or jsonb_typeof(p_input->'fileId') is distinct from 'string' then raise exception 'Invalid copy identity' using errcode='22023';end if;target:=(p_input->>'targetFileId')::uuid;perform pg_advisory_xact_lock(hashtextextended('pro-work-file-upload:'||p_actor::text||':'||target::text,0));end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-company-files:'||p_actor::text,0));
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if act like 'folder_%' then
  if jsonb_typeof(p_input->'folderId') is distinct from 'string' then raise exception 'Invalid folder identity' using errcode='22023';end if;fid:=(p_input->>'folderId')::uuid;
  select * into folder from pro_company_folders where owner_id=p_actor and id=fid for update;
  if found then if rev<>folder.revision or rev=0 then raise exception 'Folder changed' using errcode='40001';end if;before_json:=pro_company_folder_json(folder);
  elsif act<>'folder_save' or rev<>0 then raise exception 'Folder missing' using errcode='42501';end if;
  if rev>=2147483647 then raise exception 'Revision exhausted' using errcode='40001';end if;
  if act='folder_save' then
   if folder.archived or jsonb_typeof(p_input->'name') is distinct from 'string' or length(btrim(p_input->>'name')) not between 1 and 80 or(p_input->>'name')~'[[:cntrl:]/\\]' or jsonb_typeof(p_input->'favorite') is distinct from 'boolean' or jsonb_typeof(p_input->'parentId') is null or jsonb_typeof(p_input->'parentId') not in('string','null') then raise exception 'Invalid folder' using errcode='22023';end if;
   parent:=(p_input->>'parentId')::uuid;ancestors:=pro_company_ancestors(p_actor,parent);
   if fid=parent or exists(select 1 from jsonb_array_elements(ancestors)x where x->>'id'=fid::text) then raise exception 'Folder cycle' using errcode='40001';end if;
   with recursive subtree(id,depth) as(select fid,1 union all select d.id,s.depth+1 from pro_company_folders d join subtree s on d.parent_id=s.id where d.owner_id=p_actor)select max(depth) into max_depth from subtree;
   if jsonb_array_length(ancestors)+max_depth>5 then raise exception 'Folder depth exceeds five' using errcode='40001';end if;
   if rev=0 and(select count(*) from pro_company_folders where owner_id=p_actor)>=100 then raise exception 'Folder capacity exceeded' using errcode='40001';end if;
   insert into pro_company_folders(owner_id,id,parent_id,name,revision,favorite) values(p_actor,fid,parent,btrim(p_input->>'name'),rev+1,(p_input->>'favorite')::boolean) on conflict(owner_id,id) do update set parent_id=excluded.parent_id,name=excluded.name,revision=excluded.revision,favorite=excluded.favorite returning * into folder;
  else
   if folder.archived=(act='folder_archive') then raise exception 'Folder status changed' using errcode='40001';end if;
   if act='folder_archive' and(exists(select 1 from pro_company_folders where owner_id=p_actor and parent_id=fid) or exists(select 1 from pro_company_files where owner_id=p_actor and folder_id=fid)) then raise exception 'Move the folder contents before archiving' using errcode='40001';end if;
   perform pro_company_ancestors(p_actor,folder.parent_id);update pro_company_folders set archived=(act='folder_archive'),revision=revision+1 where owner_id=p_actor and id=fid returning * into folder;
  end if;answer:=jsonb_build_object('action',act,'folder',pro_company_folder_json(folder));
 elsif act='upload' then
  if jsonb_typeof(p_input->'fileId') is distinct from 'string' or jsonb_typeof(p_input->'folderId') is null or jsonb_typeof(p_input->'folderId') not in('null','string') or jsonb_typeof(p_input->'sourceName') is distinct from 'string' or length(p_input->>'sourceName') not between 1 and 160 or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'sizeBytes') is distinct from 'number' or not coalesce((p_input->>'sizeBytes')~'^[0-9]{1,8}$',false) or not coalesce((p_input->>'sha256')~'^[a-f0-9]{64}$',false) or not coalesce((p_input->>'rawSha256')~'^[a-f0-9]{64}$',false) or jsonb_typeof(p_input->'mimeType') is distinct from 'string' or public.pro_file_doc_ext(p_input->>'mimeType') is null then raise exception 'Invalid file reservation' using errcode='22023';end if;
  fid:=(p_input->>'fileId')::uuid;parent:=(p_input->>'folderId')::uuid;perform pro_company_ancestors(p_actor,parent);
  if exists(select 1 from pro_company_files where owner_id=p_actor and id=fid) then raise exception 'File identity already used' using errcode='40001';end if;
  if(select count(*) from pro_company_files where owner_id=p_actor)>=1000 then raise exception 'File capacity exceeded' using errcode='40001';end if;
  perform public.pro_file_quota_check(p_actor,(p_input->>'sizeBytes')::integer);
  mime:=p_input->>'mimeType';bytes:=(p_input->>'sizeBytes')::integer;canonical_name:=p_input->>'name';
  if bytes not between 1 and 20971520 or mime='image/jpeg' and bytes>20971520 or length(canonical_name) not between 1 and 160 or canonical_name~'[[:cntrl:]/\\]' or right(canonical_name,length(public.pro_file_doc_ext(mime))+1)<>'.'||public.pro_file_doc_ext(mime) then raise exception 'Invalid canonical file' using errcode='22023';end if;
  insert into pro_company_files(owner_id,id,folder_id,name,mime_type,size_bytes,sha256,object_path) values(p_actor,fid,parent,canonical_name,mime,bytes,p_input->>'sha256',p_actor::text||'/'||fid::text||'.'||public.pro_file_doc_ext(mime)) returning * into f;
 elsif act='copy' then
  fid:=(p_input->>'fileId')::uuid;wid:=p_input->>'workId';if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(wid) not between 1 and 160 then raise exception 'Invalid work' using errcode='22023';end if;
  select * into f from pro_company_files where owner_id=p_actor and id=fid and ready and not archived for share;if not found then raise exception 'Source unavailable' using errcode='42501';end if;if f.revision<>rev then raise exception 'Source changed' using errcode='40001';end if;perform pro_company_ancestors(p_actor,f.folder_id);
  perform pg_advisory_xact_lock(hashtextextended('pro-work-files:'||p_actor::text||':'||wid,0));
  perform 1 from pro_work where user_id=p_actor and id=wid for update;if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(select 1 from pro_work where user_id=p_actor and id=wid and coalesce(cancelled,false)) then raise exception 'Work cancelled' using errcode='40001';end if;
  if exists(select 1 from pro_work_files where id=target) or exists(select 1 from pro_work_file_upload_actions where actor_id=p_actor and file_id=target) then raise exception 'Target identity used' using errcode='40001';end if;
  if(select count(*) from pro_work_files where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Work files capacity exceeded' using errcode='40001';end if;
  snapshot:=pro_company_file_json(f);reserved:=pro_work_file_reserve(p_actor,jsonb_build_object('fileId',target,'workId',wid,'sourceName',f.name,'name',f.name,'mimeType',f.mime_type,'rawSha256',f.sha256,'sha256',f.sha256,'sizeBytes',f.size_bytes));
 else
  fid:=(p_input->>'fileId')::uuid;select * into f from pro_company_files where owner_id=p_actor and id=fid and ready for update;if not found then raise exception 'File missing' using errcode='42501';end if;if rev<>f.revision then raise exception 'File changed' using errcode='40001';end if;if rev>=2147483647 then raise exception 'Revision exhausted' using errcode='40001';end if;before_json:=pro_company_file_json(f);
  if act='file_update' then
   if f.archived then raise exception 'File archived' using errcode='40001';end if;
   if jsonb_typeof(p_input->'folderId') is null or jsonb_typeof(p_input->'folderId') not in('null','string') or jsonb_typeof(p_input->'favorite') is distinct from 'boolean' or jsonb_typeof(p_input->'name') is distinct from 'string' then raise exception 'Invalid file metadata' using errcode='22023';end if;
   parent:=(p_input->>'folderId')::uuid;perform pro_company_ancestors(p_actor,parent);canonical_name:=p_input->>'name';if length(canonical_name) not between 1 and 160 or canonical_name~'[[:cntrl:]/\\]' or right(canonical_name,length(public.pro_file_doc_ext(f.mime_type))+1)<>'.'||public.pro_file_doc_ext(f.mime_type) then raise exception 'Invalid file name' using errcode='22023';end if;
   update pro_company_files set name=canonical_name,folder_id=parent,favorite=(p_input->>'favorite')::boolean,revision=revision+1 where owner_id=p_actor and id=fid returning * into f;
  else
   if f.archived=(act='file_archive') then raise exception 'File status changed' using errcode='40001';end if;perform pro_company_ancestors(p_actor,f.folder_id);update pro_company_files set archived=(act='file_archive'),revision=revision+1 where owner_id=p_actor and id=fid returning * into f;
  end if;answer:=jsonb_build_object('action',act,'file',pro_company_file_json(f));
 end if;
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into pro_company_file_actions(actor_id,action_id,input,input_hash,result,before_state,after_state) values(p_actor,aid,p_input,p_input_hash,answer,before_json,case when answer is null then null else answer end);
 if act='copy' then insert into pro_company_file_copies(owner_id,action_id,source_file_id,source_revision,source_snapshot,source_path,work_id,target_file_id) values(p_actor,aid,fid,f.revision,snapshot,f.object_path,wid,target);end if;
 return pro_company_action_state(p_actor,aid);
end $$;

-- ===================================================================== 3/4. organizer
alter table public.pro_work_file_folders add column if not exists client_visible boolean not null default false;
-- True when another record (version, comment, selection, takeoff, punch list, subcontractor access,
-- any future foreign key) uses the file. The organizer metadata and the upload receipt do not count.
create or replace function public.pro_wfo_file_in_use(p_file uuid) returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r record;hit boolean;col name;
begin
 for r in select c.conrelid::regclass rel,c.conkey,c.confkey,c.conrelid from pg_constraint c
  where c.contype='f' and c.confrelid='public.pro_work_files'::regclass and c.conrelid not in('public.pro_work_file_meta'::regclass,'public.pro_work_file_upload_actions'::regclass) loop
  select a.attname into col from unnest(r.conkey,r.confkey) k(own,ref) join pg_attribute fa on fa.attrelid='public.pro_work_files'::regclass and fa.attnum=k.ref and fa.attname='id' join pg_attribute a on a.attrelid=r.conrelid and a.attnum=k.own;
  if col is null then continue;end if;
  execute format('select exists(select 1 from %s where %I=$1)',r.rel,col) using p_file into hit;
  if hit then return true;end if;
 end loop;
 return false;
end $$;
create or replace function public.pro_wfo_folder_json(f public.pro_work_file_folders) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',f.id,'parentId',f.parent_id,'name',f.name,'revision',f.revision,'trashedAt',f.trashed_at,'clientVisible',f.client_visible,
  'restoreUntil',case when f.trashed_at is not null then ((f.trashed_at at time zone 'America/Costa_Rica')::date+30)::text end,
  'items',(select count(*) from public.pro_work_file_meta m where m.owner_id=f.owner_id and m.folder_id=f.id and m.trashed_at is null)+(select count(*) from public.pro_work_file_folders c where c.owner_id=f.owner_id and c.parent_id=f.id and c.trashed_at is null))
$$;

create or replace function public.pro_work_file_organizer_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;wid text:=p_input->>'workId';keys text[];hash text:=md5(p_input::text);prior public.pro_work_file_organizer_actions;
 fo public.pro_work_file_folders;m public.pro_work_file_meta;w public.pro_work_files;target uuid;sid uuid;rev integer;nm text;before_json jsonb;after_json jsonb;answer jsonb;subj text;had_meta boolean;ext text;paths jsonb:='[]'::jsonb;sub uuid[];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid file action' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act is null or not(
   act='create_folder' and keys=array['action','actionId','folderId','name','parentId','workId']
   or act in('rename_folder','rename_file') and keys=array['action','actionId','name','revision','subjectId','workId']
   or act in('move_folder','move_file') and keys=array['action','actionId','revision','subjectId','targetId','workId']
   or act in('trash_folder','restore_folder','trash_file','restore_file') and keys=array['action','actionId','revision','subjectId','workId']
   or act='favorite_file' and keys=array['action','actionId','on','revision','subjectId','workId']
   or act in('purge_file','purge_folder') and keys=array['action','actionId','revision','subjectId','workId']
   or act='share_folder' and keys=array['action','actionId','on','revision','subjectId','workId']) then raise exception 'Invalid file action' using errcode='22023';end if;
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
   elsif act='share_folder' then
    -- Row 33: the linked customer sees the files directly inside a shared folder (show_files on).
    if fo.trashed_at is not null then raise exception 'Restore before sharing' using errcode='22023';end if;
    if jsonb_typeof(p_input->'on') is distinct from 'boolean' then raise exception 'Invalid file action' using errcode='22023';end if;
    update public.pro_work_file_folders set client_visible=(p_input->>'on')::boolean,revision=revision+1 where owner_id=p_actor and id=sid returning * into fo;
   elsif act='purge_folder' then
    -- Permanent delete from the trash: only when every file inside can be deleted (never shared, no versions/comments/uses).
    if fo.trashed_at is null then raise exception 'Not in trash' using errcode='40001';end if;
    with recursive down as(select id,1 h from public.pro_work_file_folders where owner_id=p_actor and id=sid union all select f.id,down.h+1 from public.pro_work_file_folders f join down on f.owner_id=p_actor and f.parent_id=down.id where down.h<8) select array_agg(id) into sub from down;
    if exists(select 1 from public.pro_work_file_meta mm join public.pro_work_files ww on ww.owner_id=mm.owner_id and ww.id=mm.file_id where mm.owner_id=p_actor and mm.folder_id=any(sub) and (ww.revision<>1 or public.pro_wfo_file_in_use(ww.id))) then raise exception 'File in use' using errcode='22023',hint='pro_file_in_use';end if;
    select coalesce(jsonb_agg(ww.object_path order by ww.id),'[]'::jsonb) into paths from public.pro_work_file_meta mm join public.pro_work_files ww on ww.owner_id=mm.owner_id and ww.id=mm.file_id where mm.owner_id=p_actor and mm.folder_id=any(sub);
    delete from public.pro_work_files ww using public.pro_work_file_meta mm where mm.owner_id=p_actor and mm.file_id=ww.id and ww.owner_id=p_actor and mm.folder_id=any(sub);
    delete from public.pro_work_file_folders d using (with recursive down as(select id,1 h from public.pro_work_file_folders where owner_id=p_actor and id=sid union all select f.id,down.h+1 from public.pro_work_file_folders f join down on f.owner_id=p_actor and f.parent_id=down.id where down.h<8) select id,h from down) x where d.owner_id=p_actor and d.id=x.id and x.h>1;
    delete from public.pro_work_file_folders where owner_id=p_actor and id=sid;
   else
    if fo.trashed_at is null then raise exception 'Not in trash' using errcode='40001';end if;
    -- Restored into the root when its parent is still in the trash.
    update public.pro_work_file_folders set trashed_at=null,parent_id=case when parent_id is not null and public.pro_wfo_folder_trashed(p_actor,parent_id) then null else parent_id end,revision=revision+1 where owner_id=p_actor and id=sid returning * into fo;
   end if;
  end if;
  after_json:=case when act='purge_folder' then jsonb_build_object('id',sid,'name',fo.name,'purged',true,'files',jsonb_array_length(paths)) else public.pro_wfo_folder_json(fo) end;answer:=jsonb_build_object('action',act,'folder',after_json,'objectPaths',paths);
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
   ext:='.'||public.pro_file_doc_ext(w.mime_type);
   if length(nm) not between length(ext)+1 and 160 or nm ~ '[[:cntrl:]/]' or position(chr(92) in nm)>0 or lower(right(nm,length(ext)))<>ext then raise exception 'Invalid name' using errcode='22023';end if;
   nm:=left(nm,length(nm)-length(ext))||ext;
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
  elsif act='purge_file' then
   if m.trashed_at is null then raise exception 'Not in trash' using errcode='40001';end if;
   if w.revision<>1 or public.pro_wfo_file_in_use(w.id) then raise exception 'File in use' using errcode='22023',hint='pro_file_in_use';end if;
   paths:=jsonb_build_array(w.object_path);
   delete from public.pro_work_files where owner_id=p_actor and id=sid;
  else
   if m.trashed_at is null then raise exception 'Not in trash' using errcode='40001';end if;
   update public.pro_work_file_meta set trashed_at=null,folder_id=case when folder_id is not null and public.pro_wfo_folder_trashed(p_actor,folder_id) then null else folder_id end where owner_id=p_actor and file_id=sid returning * into m;
  end if;
  after_json:=case when act='purge_file' then jsonb_build_object('id',sid,'name',coalesce(m.display_name,w.name),'purged',true) else public.pro_wfo_file_json(w,m) end;answer:=jsonb_build_object('action',act,'file',after_json,'objectPaths',paths);
 end if;
 insert into public.pro_work_file_organizer_history(owner_id,action_id,action,subject,subject_id,before_row,after_row) values(p_actor,aid,act,subj,sid,before_json,after_json);
 insert into public.pro_work_file_organizer_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;

-- Customer side of shared folders. Same link as pro_work_files_client_read (the appointment of
-- this customer account linked to the job) plus the "Archivos y fotos" switch.
create or replace function public.pro_work_file_folders_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;folders jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id into owner,wid from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 if not public.pro_wfv_client_files_visible(owner,wid) then return jsonb_build_object('folders','[]'::jsonb);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'files',coalesce((
   select jsonb_agg(jsonb_build_object('id',w.id,'name',coalesce(m.display_name,w.name),'mimeType',w.mime_type,'sizeBytes',w.size_bytes,'sha256',w.sha256,'createdAt',w.created_at) order by lower(coalesce(m.display_name,w.name)),w.id)
   from public.pro_work_file_meta m join public.pro_work_files w on w.owner_id=m.owner_id and w.id=m.file_id
   where m.owner_id=owner and m.folder_id=f.id and m.trashed_at is null and w.ready),'[]'::jsonb)) order by lower(f.name),f.id),'[]'::jsonb) into folders
 from public.pro_work_file_folders f where f.owner_id=owner and f.work_id=wid and f.client_visible and not public.pro_wfo_folder_trashed(owner,f.id);
 return jsonb_build_object('folders',folders);
end $$;
create or replace function public.pro_work_file_folder_client_download(p_actor uuid,p_request uuid,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;w public.pro_work_files;m public.pro_work_file_meta;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id into owner,wid from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found or not public.pro_wfv_client_files_visible(owner,wid) then return null;end if;
 select * into w from public.pro_work_files where owner_id=owner and work_id=wid and id=p_file and ready;if not found then return null;end if;
 select * into m from public.pro_work_file_meta where owner_id=owner and file_id=p_file and trashed_at is null;if not found or m.folder_id is null then return null;end if;
 if not exists(select 1 from public.pro_work_file_folders f where f.owner_id=owner and f.id=m.folder_id and f.client_visible) or public.pro_wfo_folder_trashed(owner,m.folder_id) then return null;end if;
 return jsonb_build_object('objectPath',w.object_path,'name',w.name,'displayName',coalesce(m.display_name,w.name),'mimeType',w.mime_type,'sizeBytes',w.size_bytes,'sha256',w.sha256);
end $$;

-- ===================================================================== 5. library tags
create table if not exists public.pro_company_file_tags(
 owner_id uuid not null,file_id uuid not null,
 tag text not null check(length(tag) between 1 and 30 and tag=btrim(tag) and tag=lower(tag) and tag !~ '[[:cntrl:]/,]' and position(chr(92) in tag)=0),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,file_id,tag),foreign key(owner_id,file_id) references public.pro_company_files(owner_id,id) on delete cascade);
create index if not exists pro_company_file_tags_tag on public.pro_company_file_tags(owner_id,tag);
create table if not exists public.pro_company_file_tag_actions(
 owner_id uuid not null,action_id uuid not null,input_hash text not null,before_tags jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id));
create or replace function public.pro_company_file_tags_of(p_owner uuid,p_file uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(tag order by tag),'[]'::jsonb) from public.pro_company_file_tags where owner_id=p_owner and file_id=p_file $$;
create or replace function public.pro_company_file_tags_read(p_actor uuid,p_tag text default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare want text:=nullif(lower(btrim(coalesce(p_tag,''))),'');
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if length(want)>30 then raise exception 'Invalid tag' using errcode='22023';end if;
 return jsonb_build_object(
  'tags',coalesce((select jsonb_agg(jsonb_build_object('tag',x.tag,'count',x.n) order by x.tag) from(select t.tag,count(*) n from public.pro_company_file_tags t join public.pro_company_files f on f.owner_id=t.owner_id and f.id=t.file_id where t.owner_id=p_actor and f.ready and not f.archived and not public.pro_cfv_hidden(p_actor,f.id) group by t.tag) x),'[]'::jsonb),
  'fileTags',coalesce((select jsonb_object_agg(x.file_id::text,x.tags) from(select file_id,jsonb_agg(tag order by tag) tags from public.pro_company_file_tags where owner_id=p_actor group by file_id) x),'{}'::jsonb),
  'files',case when want is null then '[]'::jsonb else coalesce((select jsonb_agg(public.pro_company_file_json(f) order by lower(f.name),f.id) from public.pro_company_files f join public.pro_company_file_tags t on t.owner_id=f.owner_id and t.file_id=f.id and t.tag=want where f.owner_id=p_actor and f.ready and not f.archived and not public.pro_cfv_hidden(p_actor,f.id)),'[]'::jsonb) end,
  'tag',want);
end $$;
create or replace function public.pro_company_file_tags_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;fid uuid;hash text:=md5(p_input::text);prior public.pro_company_file_tag_actions;want text[];before_tags jsonb;answer jsonb;t text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid tags' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['action','actionId','fileId','tags'] or p_input->>'action' is distinct from 'set_tags' or jsonb_typeof(p_input->'tags') is distinct from 'array' or jsonb_array_length(p_input->'tags')>6 then raise exception 'Invalid tags' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;fid:=(p_input->>'fileId')::uuid;exception when others then raise exception 'Invalid tags' using errcode='22023';end;
 if exists(select 1 from jsonb_array_elements(p_input->'tags') e where jsonb_typeof(e) is distinct from 'string') then raise exception 'Invalid tags' using errcode='22023';end if;
 select coalesce(array_agg(distinct lower(btrim(e))),'{}') into want from jsonb_array_elements_text(p_input->'tags') e;
 foreach t in array want loop if length(t) not between 1 and 30 or t ~ '[[:cntrl:]/,]' or position(chr(92) in t)>0 then raise exception 'Invalid tag' using errcode='22023';end if;end loop;
 perform pg_advisory_xact_lock(hashtextextended('pro-company-file-tags:'||p_actor::text,0));
 select * into prior from public.pro_company_file_tag_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if not exists(select 1 from public.pro_company_files where owner_id=p_actor and id=fid and ready and not archived) then raise exception 'File unavailable' using errcode='40001';end if;
 before_tags:=public.pro_company_file_tags_of(p_actor,fid);
 delete from public.pro_company_file_tags where owner_id=p_actor and file_id=fid and not tag=any(want);
 insert into public.pro_company_file_tags(owner_id,file_id,tag) select p_actor,fid,x from unnest(want) x on conflict do nothing;
 answer:=jsonb_build_object('fileId',fid,'tags',public.pro_company_file_tags_of(p_actor,fid));
 insert into public.pro_company_file_tag_actions(owner_id,action_id,input_hash,before_tags,result) values(p_actor,aid,hash,before_tags,answer);
 return answer;
end $$;
create or replace function public.pro_company_file_tag_actions_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Tag receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_company_file_tag_actions_immutable on public.pro_company_file_tag_actions;
create trigger pro_company_file_tag_actions_immutable before update or delete on public.pro_company_file_tag_actions for each row when (pg_trigger_depth()=0) execute function public.pro_company_file_tag_actions_immutable();

-- ===================================================================== grants and buckets
do $$declare t text;f record;begin
 foreach t in array array['pro_company_file_tags','pro_company_file_tag_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_file_doc_ext','pro_file_quota_used','pro_file_quota_check','pro_file_quota_read','pro_work_file_reserve','pro_company_files_mutate','pro_wfo_file_in_use','pro_wfo_folder_json','pro_work_file_organizer_mutate','pro_work_file_folders_client_read','pro_work_file_folder_client_download','pro_company_file_tags_of','pro_company_file_tags_read','pro_company_file_tags_mutate','pro_company_file_tag_actions_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
 if to_regclass('storage.buckets') is not null then
  update storage.buckets set allowed_mime_types=array['image/jpeg','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','text/plain','image/vnd.dwg','image/vnd.dxf','image/heic','video/mp4','video/quicktime'] where id in('pro-work-files','pro-company-files');
  if exists(select 1 from storage.buckets where id in('pro-work-files','pro-company-files') and (public or file_size_limit is distinct from 20971520 or cardinality(allowed_mime_types)<>12)) then raise exception 'File buckets must stay private with 20 MiB and the document formats';end if;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
