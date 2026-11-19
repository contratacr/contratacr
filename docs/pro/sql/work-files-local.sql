-- LOCAL PRO ONLY. Immutable private files, interrupted-upload recovery and explicit sharing.
-- New bucket only; no delivery bucket/table writes, notifications, messages or outbox.
begin;
create table if not exists public.pro_work_files(
 id uuid primary key,owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,
 source_name text not null check(length(source_name) between 1 and 160 and source_name !~ '[[:cntrl:]/]' and position(chr(92) in source_name)=0),
 name text not null check(length(name) between 1 and 160 and name !~ '[[:cntrl:]/]' and position(chr(92) in name)=0),
 mime_type text not null check(mime_type in('image/jpeg','application/pdf')),
 raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 size_bytes integer not null check(size_bytes>0 and size_bytes<=20971520),object_path text not null unique,
 revision integer not null default 1 check(revision in(1,2)),ready boolean not null default false,created_at timestamptz not null default now(),
 -- Captured recipient identity is not a blocking profile FK: deleting the
 -- customer account must not delete or block the provider's immutable file.
 published_at timestamptz,client_user_id uuid,recipient_name text,service text,
 unique(owner_id,work_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 check(mime_type<>'image/jpeg' or size_bytes<=20971520),
 check(object_path=owner_id::text||'/'||id::text||case when mime_type='application/pdf' then '.pdf' else '.jpg' end),
 check(right(name,4)=case when mime_type='application/pdf' then '.pdf' else '.jpg' end),
 check((revision=1 and published_at is null and client_user_id is null and recipient_name is null and service is null)
 or (revision=2 and ready and published_at is not null and client_user_id is not null and recipient_name is not null and service is not null and length(recipient_name) between 1 and 160 and length(service) between 1 and 160))
);
create index if not exists pro_work_files_owner_page on public.pro_work_files(owner_id,work_id,created_at desc,id desc);
create index if not exists pro_work_files_shared_page on public.pro_work_files(client_user_id,owner_id,work_id,created_at desc,id desc) where ready and revision=2;
create table if not exists public.pro_work_file_upload_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,file_id uuid not null references public.pro_work_files(id) on delete cascade,
 input jsonb not null,result jsonb,at timestamptz not null default now(),primary key(actor_id,file_id)
);
create table if not exists public.pro_work_file_publish_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
create or replace function public.pro_work_file_json(p_file public.pro_work_files) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_file.id,'workId',p_file.work_id,'name',p_file.name,'mimeType',p_file.mime_type,'sizeBytes',p_file.size_bytes,
 'sha256',p_file.sha256,'revision',p_file.revision,'ready',p_file.ready,'createdAt',p_file.created_at,'publishedAt',p_file.published_at);
$$;
create or replace function public.pro_work_files_read(p_actor uuid,p_work text,p_after uuid default null,p_file uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare file public.pro_work_files;cursor_time timestamptz;cursor_id uuid;items jsonb;recipient uuid;recipient_name text;can_share boolean:=false;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_after is not null and p_file is not null then raise exception 'Invalid file query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select r.client_user_id,r.client_name into recipient,recipient_name from public.pro_appointment_requests r
 join public.pro_work w on w.user_id=r.owner_id and w.id=r.work_id join public.profiles c on c.id=r.client_user_id
 where r.owner_id=p_actor and r.work_id=p_work and r.status in('confirmed','completed') and not coalesce(w.cancelled,false) and not coalesce(c.is_disabled,false);
 can_share:=found;
 if p_file is not null then
  select * into file from public.pro_work_files where owner_id=p_actor and work_id=p_work and id=p_file;
  if not found then return null;end if;
  return jsonb_build_object('file',public.pro_work_file_json(file),'canShare',can_share,'recipientId',recipient,'recipientName',recipient_name);
 end if;
 if p_after is not null then
  select created_at into cursor_time from public.pro_work_files where owner_id=p_actor and work_id=p_work and id=p_after;
  if not found then raise exception 'Invalid file cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(public.pro_work_file_json(f::public.pro_work_files) order by f.created_at desc,f.id desc),'[]'::jsonb) into items from (
  select * from public.pro_work_files where owner_id=p_actor and work_id=p_work and (p_after is null or (created_at,id)<(cursor_time,p_after)) order by created_at desc,id desc limit 21
 ) f;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('workId',p_work,'items',items,'nextCursor',cursor_id,'canShare',can_share,'recipientId',recipient,'recipientName',recipient_name);
end $$;
create or replace function public.pro_work_files_client_read(p_actor uuid,p_request uuid,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;cursor_time timestamptz;cursor_id uuid;items jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id into owner,wid from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 if p_after is not null then
  select created_at into cursor_time from public.pro_work_files where id=p_after and owner_id=owner and work_id=wid and ready and revision=2 and client_user_id=p_actor;
  if not found then raise exception 'Invalid shared file cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(x.content order by x.created_at desc,x.id desc),'[]'::jsonb) into items from (
  select f.created_at,f.id,jsonb_build_object('id',f.id,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256,'publishedAt',f.published_at,'service',f.service) as content
  from public.pro_work_files f where f.owner_id=owner and f.work_id=wid and f.ready and f.revision=2 and f.client_user_id=p_actor
  and (p_after is null or (f.created_at,f.id)<(cursor_time,p_after)) order by f.created_at desc,f.id desc limit 21
 ) x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_work_file_download(p_actor uuid,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare file public.pro_work_files;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into file from public.pro_work_files where id=p_file and ready;
 if not found then return null;end if;
 if file.owner_id=p_actor then
  if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 elsif file.revision<>2 or file.client_user_id is distinct from p_actor or not exists(select 1 from public.pro_appointment_requests where owner_id=file.owner_id and work_id=file.work_id and client_user_id=p_actor) then return null;
 end if;
 return jsonb_build_object('objectPath',file.object_path,'name',file.name,'mimeType',file.mime_type,'sizeBytes',file.size_bytes,'sha256',file.sha256);
end $$;
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
 if length(wid) not between 1 and 160 or mime not in('image/jpeg','application/pdf') or not coalesce((p_input->>'rawSha256')~'^[a-f0-9]{64}$',false) or not coalesce((p_input->>'sha256')~'^[a-f0-9]{64}$',false)
 or not coalesce((p_input->>'sizeBytes')~'^[0-9]{1,8}$',false) then raise exception 'Invalid file metadata' using errcode='22023';end if;
 bytes:=(p_input->>'sizeBytes')::integer;if bytes<1 or bytes>20971520 or mime='image/jpeg' and bytes>20971520 then raise exception 'File too large' using errcode='22023';end if;
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
 if (select count(*) from public.pro_work_files where owner_id=p_actor and work_id=wid)>=100 then raise exception 'File limit reached' using errcode='54000';end if;
 path:=p_actor::text||'/'||fid::text||case when mime='application/pdf' then '.pdf' else '.jpg' end;
 insert into public.pro_work_files(id,owner_id,work_id,source_name,name,mime_type,raw_sha256,sha256,size_bytes,object_path)
 values(fid,p_actor,wid,p_input->>'sourceName',p_input->>'name',mime,p_input->>'rawSha256',p_input->>'sha256',bytes,path) returning * into file;
 insert into public.pro_work_file_upload_actions(actor_id,file_id,input) values(p_actor,fid,p_input);
 return jsonb_build_object('file',public.pro_work_file_json(file),'objectPath',path);
end $$;
create or replace function public.pro_work_file_ready(p_actor uuid,p_file uuid,p_sha256 text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare receipt public.pro_work_file_upload_actions;file public.pro_work_files;ack_result jsonb;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-file-upload:'||p_actor::text||':'||p_file::text,0));
 select * into receipt from public.pro_work_file_upload_actions where actor_id=p_actor and file_id=p_file for update;
 if not found then raise exception 'Upload not reserved' using errcode='42501';end if;
 select * into file from public.pro_work_files where id=p_file and owner_id=p_actor for update;
 if not found or file.sha256 is distinct from p_sha256 then raise exception 'Upload content changed' using errcode='22023';end if;
 if receipt.result is not null then return receipt.result;end if;
 if file.revision<>1 then raise exception 'Upload state changed' using errcode='40001';end if;
 update public.pro_work_files set ready=true where id=p_file returning * into file;
 ack_result:=jsonb_build_object('file',public.pro_work_file_json(file));
 update public.pro_work_file_upload_actions set result=ack_result where actor_id=p_actor and file_id=p_file;
 return ack_result;
end $$;
create or replace function public.pro_work_file_publish(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare fid uuid;wid text;aid uuid;recipient uuid;keys text[];receipt public.pro_work_file_publish_actions;file public.pro_work_files;w public.pro_work;r public.pro_appointment_requests;result jsonb;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid publication' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys<>array['action','actionId','fileId','recipientId','revision','workId'] or p_input->>'action' is distinct from 'publish'
 or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'fileId') is distinct from 'string' or jsonb_typeof(p_input->'recipientId') is distinct from 'string'
 or jsonb_typeof(p_input->'workId') is distinct from 'string' or p_input->'revision' is distinct from '1'::jsonb then raise exception 'Invalid publication fields' using errcode='22023';end if;
 fid:=(p_input->>'fileId')::uuid;wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;recipient:=(p_input->>'recipientId')::uuid;
 if length(wid) not between 1 and 160 or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-file-publish:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_file_publish_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Publication identity changed' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-files:'||p_actor::text||':'||wid,0));
 -- Match appointment actions: linked request before work, never the reverse.
 select * into r from public.pro_appointment_requests where owner_id=p_actor and work_id=wid for share;
 if not found then raise exception 'No linked customer' using errcode='42501';end if;
 select * into w from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select * into file from public.pro_work_files where id=fid and owner_id=p_actor and work_id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if file.revision<>1 then raise exception 'File changed' using errcode='40001';end if;
 if not file.ready then raise exception 'Upload is not ready' using errcode='22023';end if;
 if r.client_user_id<>recipient then raise exception 'Recipient changed' using errcode='40001';end if;
 if coalesce(w.cancelled,false) or r.status not in('confirmed','completed') or not exists(select 1 from public.profiles where id=recipient and not coalesce(is_disabled,false)) then raise exception 'Customer unavailable' using errcode='42501';end if;
 update public.pro_work_files set revision=2,published_at=now(),client_user_id=r.client_user_id,recipient_name=r.client_name,service=w.service where id=fid returning * into file;
 result:=jsonb_build_object('file',public.pro_work_file_json(file));
 insert into public.pro_work_file_publish_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);return result;
end $$;
create or replace function public.pro_work_file_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (to_jsonb(new)-array['ready','revision','published_at','client_user_id','recipient_name','service']) is distinct from (to_jsonb(old)-array['ready','revision','published_at','client_user_id','recipient_name','service']) then raise exception 'File content metadata is immutable' using errcode='23514';end if;
 if old.revision=2 and new is distinct from old or old.ready and not new.ready then raise exception 'Shared file is immutable' using errcode='23514';end if;
 if new.revision=old.revision then
  if (to_jsonb(new)-'ready') is distinct from (to_jsonb(old)-'ready') then raise exception 'Invalid upload transition' using errcode='23514';end if;
 elsif old.revision<>1 or new.revision<>2 or not old.ready or not new.ready then raise exception 'Invalid file sharing transition' using errcode='23514';end if;
 return new;
end $$;
create or replace function public.pro_work_file_upload_receipt_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.result is not null or new.result is null or (to_jsonb(new)-'result') is distinct from (to_jsonb(old)-'result') then raise exception 'Upload receipt is immutable after confirmation' using errcode='23514';end if;return new;
end $$;
create or replace function public.pro_work_file_publish_receipt_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Publication receipt is immutable' using errcode='23514';end $$;
drop trigger if exists pro_work_file_immutable on public.pro_work_files;
create trigger pro_work_file_immutable before update on public.pro_work_files for each row execute function public.pro_work_file_immutable();
drop trigger if exists pro_work_file_upload_receipt_immutable on public.pro_work_file_upload_actions;
create trigger pro_work_file_upload_receipt_immutable before update on public.pro_work_file_upload_actions for each row execute function public.pro_work_file_upload_receipt_immutable();
drop trigger if exists pro_work_file_publish_receipt_immutable on public.pro_work_file_publish_actions;
create trigger pro_work_file_publish_receipt_immutable before update on public.pro_work_file_publish_actions for each row execute function public.pro_work_file_publish_receipt_immutable();
alter table public.pro_work_files enable row level security;alter table public.pro_work_file_upload_actions enable row level security;alter table public.pro_work_file_publish_actions enable row level security;
revoke all on public.pro_work_files,public.pro_work_file_upload_actions,public.pro_work_file_publish_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_files,public.pro_work_file_upload_actions,public.pro_work_file_publish_actions to service_role;
revoke all on function public.pro_work_file_json(public.pro_work_files),public.pro_work_files_read(uuid,text,uuid,uuid),public.pro_work_files_client_read(uuid,uuid,uuid),public.pro_work_file_download(uuid,uuid),public.pro_work_file_reserve(uuid,jsonb),public.pro_work_file_ready(uuid,uuid,text),public.pro_work_file_publish(uuid,jsonb),public.pro_work_file_immutable(),public.pro_work_file_upload_receipt_immutable(),public.pro_work_file_publish_receipt_immutable() from public,anon,authenticated;
grant execute on function public.pro_work_file_json(public.pro_work_files),public.pro_work_files_read(uuid,text,uuid,uuid),public.pro_work_files_client_read(uuid,uuid,uuid),public.pro_work_file_download(uuid,uuid),public.pro_work_file_reserve(uuid,jsonb),public.pro_work_file_ready(uuid,uuid,text),public.pro_work_file_publish(uuid,jsonb) to service_role;
do $$begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-work-files','pro-work-files',false,20971520,array['image/jpeg','application/pdf']) on conflict(id) do update set file_size_limit=excluded.file_size_limit;
  if not exists(select 1 from storage.buckets where id='pro-work-files' and not public and file_size_limit=20971520 and allowed_mime_types @> array['image/jpeg','application/pdf'] /* Ronda F2-D: file-formats-library-local.sql widens the list */) then raise exception 'Work files bucket configuration must match the private contract';end if;
 end if;
 if to_regclass('storage.objects') is not null then
  execute 'drop policy if exists pro_work_files_no_direct on storage.objects';
  execute 'create policy pro_work_files_no_direct on storage.objects as restrictive for all to anon,authenticated using (bucket_id <> ''pro-work-files'') with check (bucket_id <> ''pro-work-files'')';
 end if;
end $$;
commit;
