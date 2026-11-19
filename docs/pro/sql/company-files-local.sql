-- LOCAL PRO ONLY. Private owner library. No team grants, sends or public sharing.
-- Existing work-file tables/functions are consumed, never replaced or altered.
begin;
create table if not exists public.pro_company_folders(owner_id uuid not null references profiles(id) on delete cascade,id uuid not null,parent_id uuid,name text not null check(length(btrim(name)) between 1 and 80 and name!~'[[:cntrl:]/\\]'),revision integer not null check(revision>0),archived boolean not null default false,favorite boolean not null default false,primary key(owner_id,id),foreign key(owner_id,parent_id) references public.pro_company_folders(owner_id,id),check(parent_id is distinct from id));
create table if not exists public.pro_company_files(owner_id uuid not null references profiles(id) on delete cascade,id uuid not null,folder_id uuid,name text not null check(length(name) between 1 and 160),mime_type text not null check(mime_type in('image/jpeg','application/pdf')),size_bytes integer not null check(size_bytes between 1 and 20971520),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),object_path text not null unique,revision integer not null default 1 check(revision>0),ready boolean not null default false,archived boolean not null default false,favorite boolean not null default false,created_at timestamptz not null default now(),primary key(owner_id,id),foreign key(owner_id,folder_id) references public.pro_company_folders(owner_id,id),check(mime_type<>'image/jpeg' or size_bytes<=20971520),check(object_path=owner_id::text||'/'||id::text||case when mime_type='application/pdf' then '.pdf' else '.jpg' end));
create table if not exists public.pro_company_file_actions(actor_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),result jsonb,before_state jsonb,after_state jsonb,at timestamptz not null default now(),primary key(actor_id,action_id));
create table if not exists public.pro_company_file_copies(owner_id uuid not null,action_id uuid not null,source_file_id uuid not null,source_revision integer not null check(source_revision>0),source_snapshot jsonb not null,source_path text not null,work_id text not null,target_file_id uuid not null unique,primary key(owner_id,action_id),foreign key(owner_id,action_id) references pro_company_file_actions(actor_id,action_id) on delete cascade,foreign key(owner_id,source_file_id) references pro_company_files(owner_id,id) on delete cascade,foreign key(owner_id,work_id) references pro_work(user_id,id) on delete cascade);
create index if not exists pro_company_folders_page on pro_company_folders(owner_id,parent_id,archived,id);
create index if not exists pro_company_files_page on pro_company_files(owner_id,folder_id,archived,id) where ready;
create or replace function public.pro_company_folder_json(p_folder public.pro_company_folders) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$select jsonb_build_object('id',p_folder.id,'parentId',p_folder.parent_id,'name',p_folder.name,'revision',p_folder.revision,'archived',p_folder.archived,'favorite',p_folder.favorite)$$;
create or replace function public.pro_company_file_json(p_file public.pro_company_files) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$select jsonb_build_object('id',p_file.id,'folderId',p_file.folder_id,'name',p_file.name,'mimeType',p_file.mime_type,'sizeBytes',p_file.size_bytes,'sha256',p_file.sha256,'revision',p_file.revision,'ready',p_file.ready,'archived',p_file.archived,'favorite',p_file.favorite,'createdAt',p_file.created_at)$$;
create or replace function public.pro_company_ancestors(p_actor uuid,p_folder uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb:='[]'::jsonb;f pro_company_folders;n integer:=0;seen uuid[]:='{}';begin
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 while p_folder is not null loop
  if p_folder=any(seen) or n>=5 then raise exception 'Folder tree invalid' using errcode='40001';end if;
  select * into f from pro_company_folders where owner_id=p_actor and id=p_folder and not archived;if not found then raise exception 'Folder unavailable' using errcode='40001';end if;
  result:=jsonb_build_array(pro_company_folder_json(f))||result;seen:=array_append(seen,p_folder);p_folder:=f.parent_id;n:=n+1;
 end loop;return result;
end $$;
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
  union all select 'file',d.id,pro_company_file_json(d) from pro_company_files d where d.owner_id=p_actor and d.ready and d.archived=want and(p_scope='all' or d.folder_id is not distinct from p_folder) and(p_type='all' or p_type='image' and d.mime_type='image/jpeg' or p_type='pdf' and d.mime_type='application/pdf') and(not p_starred or d.favorite) and(needle='' or position(needle in lower(d.name))>0)
 ),eligible as(select *,case kind when 'folder' then 0 else 1 end sort from candidates),paged as(select * from eligible where p_after is null or(sort,id)>(case cursor_kind when 'folder' then 0 else 1 end,cursor_id) order by sort,id limit 21)
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,kind,data) order by sort,id),'[]'::jsonb) into items from paged;
 if p_after is not null then
  if cursor_kind='folder' then
   if not exists(select 1 from pro_company_folders d where d.owner_id=p_actor and d.id=cursor_id and d.archived=want and(p_scope='all' or d.parent_id is not distinct from p_folder) and p_type='all' and(not p_starred or d.favorite) and(needle='' or position(needle in lower(d.name))>0)) then raise exception 'Cursor changed' using errcode='40001';end if;
  elsif not exists(select 1 from pro_company_files d where d.owner_id=p_actor and d.id=cursor_id and d.ready and d.archived=want and(p_scope='all' or d.folder_id is not distinct from p_folder) and(p_type='all' or p_type='image' and d.mime_type='image/jpeg' or p_type='pdf' and d.mime_type='application/pdf') and(not p_starred or d.favorite) and(needle='' or position(needle in lower(d.name))>0)) then raise exception 'Cursor changed' using errcode='40001';end if;
 end if;
 if jsonb_array_length(items)>20 then next_cursor:=items->19->>'kind';next_cursor:=next_cursor||':'||(items->19->next_cursor->>'id');items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',next_cursor,'ancestors',ancestors);
end $$;
create or replace function public.pro_company_file_download(p_actor uuid,p_file uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f pro_company_files;begin if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;select * into f from pro_company_files where owner_id=p_actor and id=p_file and ready;if not found then return null;end if;perform pro_company_ancestors(p_actor,f.folder_id);return jsonb_build_object('objectPath',f.object_path,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);end $$;
-- The reservation is private server state; public proof never exposes storage paths.
create or replace function public.pro_company_action_state(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r pro_company_file_actions;f pro_company_files;c pro_company_file_copies;target jsonb;begin
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from pro_company_file_actions where actor_id=p_actor and action_id=p_action;if not found then raise exception 'Reservation missing' using errcode='42501';end if;
 if r.result is not null then return jsonb_build_object('result',r.result);end if;
 if r.input->>'action'='upload' then select * into f from pro_company_files where owner_id=p_actor and id=(r.input->>'fileId')::uuid;if not found then raise exception 'Reservation missing' using errcode='42501';end if;return jsonb_build_object('result',null,'upload',jsonb_build_object('file',pro_company_file_json(f),'objectPath',f.object_path));
 elsif r.input->>'action'='copy' then
  select * into c from pro_company_file_copies where owner_id=p_actor and action_id=p_action;if not found then raise exception 'Reservation missing' using errcode='42501';end if;
  perform 1 from pro_work where user_id=p_actor and id=c.work_id;if not found then raise exception 'Forbidden' using errcode='42501';end if;
  select jsonb_build_object('objectPath',object_path,'file',pro_work_file_json(w)) into target from pro_work_files w where owner_id=p_actor and id=c.target_file_id and work_id=c.work_id;if target is null then raise exception 'Target missing' using errcode='42501';end if;
  return jsonb_build_object('result',null,'copy',jsonb_build_object('sourcePath',c.source_path,'source',c.source_snapshot,'target',target));
 else raise exception 'Invalid pending action' using errcode='22023';end if;
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
  if jsonb_typeof(p_input->'fileId') is distinct from 'string' or jsonb_typeof(p_input->'folderId') is null or jsonb_typeof(p_input->'folderId') not in('null','string') or jsonb_typeof(p_input->'sourceName') is distinct from 'string' or length(p_input->>'sourceName') not between 1 and 160 or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'sizeBytes') is distinct from 'number' or not coalesce((p_input->>'sizeBytes')~'^[0-9]{1,8}$',false) or not coalesce((p_input->>'sha256')~'^[a-f0-9]{64}$',false) or not coalesce((p_input->>'rawSha256')~'^[a-f0-9]{64}$',false) or jsonb_typeof(p_input->'mimeType') is distinct from 'string' or p_input->>'mimeType' not in('image/jpeg','application/pdf') then raise exception 'Invalid file reservation' using errcode='22023';end if;
  fid:=(p_input->>'fileId')::uuid;parent:=(p_input->>'folderId')::uuid;perform pro_company_ancestors(p_actor,parent);
  if exists(select 1 from pro_company_files where owner_id=p_actor and id=fid) then raise exception 'File identity already used' using errcode='40001';end if;
  if(select count(*) from pro_company_files where owner_id=p_actor)>=500 then raise exception 'File capacity exceeded' using errcode='40001';end if;
  mime:=p_input->>'mimeType';bytes:=(p_input->>'sizeBytes')::integer;canonical_name:=p_input->>'name';
  if bytes not between 1 and 20971520 or mime='image/jpeg' and bytes>20971520 or length(canonical_name) not between 1 and 160 or canonical_name~'[[:cntrl:]/\\]' or mime='application/pdf' and right(canonical_name,4)<>'.pdf' or mime='image/jpeg' and right(canonical_name,4)<>'.jpg' then raise exception 'Invalid canonical file' using errcode='22023';end if;
  insert into pro_company_files(owner_id,id,folder_id,name,mime_type,size_bytes,sha256,object_path) values(p_actor,fid,parent,canonical_name,mime,bytes,p_input->>'sha256',p_actor::text||'/'||fid::text||case when mime='application/pdf' then '.pdf' else '.jpg' end) returning * into f;
 elsif act='copy' then
  fid:=(p_input->>'fileId')::uuid;wid:=p_input->>'workId';if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(wid) not between 1 and 160 then raise exception 'Invalid work' using errcode='22023';end if;
  select * into f from pro_company_files where owner_id=p_actor and id=fid and ready and not archived for share;if not found then raise exception 'Source unavailable' using errcode='42501';end if;if f.revision<>rev then raise exception 'Source changed' using errcode='40001';end if;perform pro_company_ancestors(p_actor,f.folder_id);
  perform pg_advisory_xact_lock(hashtextextended('pro-work-files:'||p_actor::text||':'||wid,0));
  perform 1 from pro_work where user_id=p_actor and id=wid for update;if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(select 1 from pro_work where user_id=p_actor and id=wid and coalesce(cancelled,false)) then raise exception 'Work cancelled' using errcode='40001';end if;
  if exists(select 1 from pro_work_files where id=target) or exists(select 1 from pro_work_file_upload_actions where actor_id=p_actor and file_id=target) then raise exception 'Target identity used' using errcode='40001';end if;
  if(select count(*) from pro_work_files where owner_id=p_actor and work_id=wid)>=100 then raise exception 'Work files capacity exceeded' using errcode='40001';end if;
  snapshot:=pro_company_file_json(f);reserved:=pro_work_file_reserve(p_actor,jsonb_build_object('fileId',target,'workId',wid,'sourceName',f.name,'name',f.name,'mimeType',f.mime_type,'rawSha256',f.sha256,'sha256',f.sha256,'sizeBytes',f.size_bytes));
 else
  fid:=(p_input->>'fileId')::uuid;select * into f from pro_company_files where owner_id=p_actor and id=fid and ready for update;if not found then raise exception 'File missing' using errcode='42501';end if;if rev<>f.revision then raise exception 'File changed' using errcode='40001';end if;if rev>=2147483647 then raise exception 'Revision exhausted' using errcode='40001';end if;before_json:=pro_company_file_json(f);
  if act='file_update' then
   if f.archived then raise exception 'File archived' using errcode='40001';end if;
   if jsonb_typeof(p_input->'folderId') is null or jsonb_typeof(p_input->'folderId') not in('null','string') or jsonb_typeof(p_input->'favorite') is distinct from 'boolean' or jsonb_typeof(p_input->'name') is distinct from 'string' then raise exception 'Invalid file metadata' using errcode='22023';end if;
   parent:=(p_input->>'folderId')::uuid;perform pro_company_ancestors(p_actor,parent);canonical_name:=p_input->>'name';if length(canonical_name) not between 1 and 160 or canonical_name~'[[:cntrl:]/\\]' or f.mime_type='application/pdf' and right(canonical_name,4)<>'.pdf' or f.mime_type='image/jpeg' and right(canonical_name,4)<>'.jpg' then raise exception 'Invalid file name' using errcode='22023';end if;
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
create or replace function public.pro_company_file_ready(p_actor uuid,p_action uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r pro_company_file_actions;f pro_company_files;c pro_company_file_copies;answer jsonb;work_ack jsonb;begin
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-company-file-action:'||p_actor::text||':'||p_action::text,0));
 select * into r from pro_company_file_actions where actor_id=p_actor and action_id=p_action for update;if not found then raise exception 'Reservation missing' using errcode='42501';end if;
 if r.result is not null then return r.result;end if;
 if r.input->>'action'='copy' then select * into c from pro_company_file_copies where owner_id=p_actor and action_id=p_action;perform pg_advisory_xact_lock(hashtextextended('pro-work-file-upload:'||p_actor::text||':'||c.target_file_id::text,0));end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-company-files:'||p_actor::text,0));
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if r.input->>'action'='upload' then
  select * into f from pro_company_files where owner_id=p_actor and id=(r.input->>'fileId')::uuid for update;if not found then raise exception 'File missing' using errcode='42501';end if;perform pro_company_ancestors(p_actor,f.folder_id);
  update pro_company_files set ready=true where owner_id=p_actor and id=f.id returning * into f;answer:=jsonb_build_object('action','upload','file',pro_company_file_json(f));
 elsif r.input->>'action'='copy' then
  if not exists(select 1 from pro_work where user_id=p_actor and id=c.work_id) then raise exception 'Forbidden' using errcode='42501';end if;
  work_ack:=pro_work_file_ready(p_actor,c.target_file_id,c.source_snapshot->>'sha256');answer:=jsonb_build_object('action','copy','copy',jsonb_build_object('sourceFileId',c.source_file_id,'sourceRevision',c.source_revision,'workId',c.work_id,'file',work_ack->'file'));
 else raise exception 'Not a pending upload' using errcode='22023';end if;
 if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 update pro_company_file_actions set result=answer,after_state=answer where actor_id=p_actor and action_id=p_action;return answer;
end $$;
create or replace function public.pro_company_file_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r pro_company_file_actions;begin if not coalesce(pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;select * into r from pro_company_file_actions where actor_id=p_actor and action_id=p_action;if not found or r.result is null then return jsonb_build_object('receipt',null);end if;return jsonb_build_object('receipt',jsonb_build_object('inputHash',r.input_hash,'result',r.result));end $$;
create or replace function public.pro_company_file_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin
 if (to_jsonb(new)-array['folder_id','name','revision','ready','archived','favorite']) is distinct from(to_jsonb(old)-array['folder_id','name','revision','ready','archived','favorite']) then raise exception 'File bytes immutable' using errcode='23514';end if;
 if not old.ready then if not new.ready or(to_jsonb(new)-'ready') is distinct from(to_jsonb(old)-'ready') then raise exception 'Only readiness transition allowed' using errcode='23514';end if;
 elsif not new.ready or new.revision<>old.revision+1 then raise exception 'Metadata needs next revision' using errcode='23514';end if;return new;end $$;
create or replace function public.pro_company_file_action_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin if old.result is not null or new.result is null or(to_jsonb(new)-array['result','after_state']) is distinct from(to_jsonb(old)-array['result','after_state']) then raise exception 'Receipt immutable' using errcode='23514';end if;return new;end $$;
drop trigger if exists pro_company_file_immutable on pro_company_files;create trigger pro_company_file_immutable before update on pro_company_files for each row execute function pro_company_file_immutable();
drop trigger if exists pro_company_file_action_immutable on pro_company_file_actions;create trigger pro_company_file_action_immutable before update on pro_company_file_actions for each row execute function pro_company_file_action_immutable();
drop trigger if exists pro_company_file_copies_immutable on pro_company_file_copies;create trigger pro_company_file_copies_immutable before update on pro_company_file_copies for each row execute function pro_team_append_only();
do $$declare tab text;fn record;begin foreach tab in array array['pro_company_folders','pro_company_files','pro_company_file_actions','pro_company_file_copies'] loop execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant all on public.%I to service_role',tab);end loop;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_company_folder_json','pro_company_file_json','pro_company_ancestors','pro_company_files_read','pro_company_file_download','pro_company_action_state','pro_company_files_mutate','pro_company_file_ready','pro_company_file_action_read','pro_company_file_immutable','pro_company_file_action_immutable') loop execute format('revoke all on function %s from public,anon,authenticated',fn.signature);execute format('grant execute on function %s to service_role',fn.signature);end loop;
end $$;
do $$begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-company-files','pro-company-files',false,20971520,array['image/jpeg','application/pdf']) on conflict(id) do update set file_size_limit=excluded.file_size_limit;
  if not exists(select 1 from storage.buckets where id='pro-company-files' and not public and file_size_limit=20971520 and allowed_mime_types @> array['image/jpeg','application/pdf'] /* Ronda F2-D: file-formats-library-local.sql widens the list */) then raise exception 'Company bucket private configuration mismatch';end if;
 end if;
 if to_regclass('storage.objects') is not null then execute 'drop policy if exists pro_company_files_no_direct on storage.objects';execute 'create policy pro_company_files_no_direct on storage.objects as restrictive for all to anon,authenticated using(bucket_id <> ''pro-company-files'') with check(bucket_id <> ''pro-company-files'')';end if;
end $$;
commit;
