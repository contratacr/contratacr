-- LOCAL PRO ONLY. Round 8 (2026-11-15): attachments in the job messages (Round 7C) between the
-- professional and the linked customer. Photos (JPG; PNG/WebP are converted to JPG by the server)
-- and PDF up to 20 MiB, in the private bucket `pro-work-message-files` (never public; every
-- download is reauthorized here and served by the API). Same visibility rule as the messages: only
-- the two sides of the thread (pro_work_message_side). The message and its file are written in one
-- transaction, idempotent by actionId (= message id = file id); both are immutable.
begin;
create table if not exists public.pro_work_message_files(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,message_id uuid not null,request_id uuid not null,side text not null check(side in('pro','client')),
 name text not null check(length(name) between 1 and 160 and name !~ '[[:cntrl:]/]' and position(chr(92) in name)=0),
 mime_type text not null check(mime_type in('image/jpeg','application/pdf')),
 size_bytes integer not null check(size_bytes between 1 and 20971520),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 object_path text not null unique,created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),
 foreign key(owner_id,message_id) references public.pro_work_messages(owner_id,id),
 check(right(name,4)=case when mime_type='application/pdf' then '.pdf' else '.jpg' end),
 check(object_path=owner_id::text||'/'||request_id::text||'/'||id::text||case when mime_type='application/pdf' then '.pdf' else '.jpg' end));
create index if not exists pro_work_message_files_request on public.pro_work_message_files(request_id,created_at);

create or replace function public.pro_work_message_file_json(f public.pro_work_message_files) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',f.id,'messageId',f.message_id,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'createdAt',f.created_at)
$$;
-- Object path the server must upload to before calling pro_work_message_attach (side checked).
create or replace function public.pro_work_message_file_path(p_actor uuid,p_request uuid,p_file uuid,p_mime text) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;
begin
 if public.pro_work_message_side(p_actor,p_request) is null then raise exception 'Forbidden' using errcode='42501';end if;
 if p_mime not in('image/jpeg','application/pdf') or p_file is null then raise exception 'Invalid file' using errcode='22023';end if;
 select * into r from public.pro_appointment_requests where id=p_request;
 return r.owner_id::text||'/'||p_request::text||'/'||p_file::text||case when p_mime='application/pdf' then '.pdf' else '.jpg' end;
end $$;
create or replace function public.pro_work_message_attach(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];rid uuid;aid uuid;me text;r public.pro_appointment_requests;f public.pro_work_message_files;posted jsonb;bytes integer;mime text;nm text;body_text text;
begin
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['actionId','body','mimeType','name','requestId','sha256','sizeBytes'] then raise exception 'Invalid attachment' using errcode='22023';end if;
 begin rid:=(p_input->>'requestId')::uuid;aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid attachment' using errcode='22023';end;
 me:=public.pro_work_message_side(p_actor,rid);if me is null then raise exception 'Forbidden' using errcode='42501';end if;
 mime:=p_input->>'mimeType';nm:=p_input->>'name';
 if mime not in('image/jpeg','application/pdf') or jsonb_typeof(p_input->'sizeBytes') is distinct from 'number' or not coalesce((p_input->>'sizeBytes')~'^[0-9]{1,8}$',false)
  or not coalesce((p_input->>'sha256')~'^[a-f0-9]{64}$',false) or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'body') is distinct from 'string' then raise exception 'Invalid attachment' using errcode='22023';end if;
 bytes:=(p_input->>'sizeBytes')::integer;if bytes<1 or bytes>20971520 then raise exception 'File too large' using errcode='22023';end if;
 select * into r from public.pro_appointment_requests where id=rid;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-message:'||p_actor::text||':'||aid::text,0));
 select * into f from public.pro_work_message_files where owner_id=r.owner_id and id=aid;
 if found then
  if f.sha256<>p_input->>'sha256' or f.request_id<>rid or f.name<>nm then raise exception 'Action id reused' using errcode='22023';end if;
  return jsonb_build_object('message',(select public.pro_work_message_json(m) from public.pro_work_messages m where m.owner_id=r.owner_id and m.id=aid),'file',public.pro_work_message_file_json(f),'replayed',true);
 end if;
 body_text:=coalesce(nullif(btrim(p_input->>'body'),''),nm);
 -- The message goes through the existing writer (side, rate limit, read marker, receipt).
 posted:=public.pro_work_messages_mutate(p_actor,jsonb_build_object('action','post','actionId',aid,'body',body_text,'requestId',rid));
 insert into public.pro_work_message_files(owner_id,id,message_id,request_id,side,name,mime_type,size_bytes,sha256,object_path)
  values(r.owner_id,aid,aid,rid,me,nm,mime,bytes,p_input->>'sha256',public.pro_work_message_file_path(p_actor,rid,aid,mime)) returning * into f;
 return jsonb_build_object('message',posted->'message','file',public.pro_work_message_file_json(f));
end $$;
create or replace function public.pro_work_message_files_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if public.pro_work_message_side(p_actor,p_request) is null then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('requestId',p_request,'files',coalesce((select jsonb_agg(public.pro_work_message_file_json(f) order by f.created_at,f.id) from public.pro_work_message_files f where f.request_id=p_request),'[]'::jsonb));
end $$;
create or replace function public.pro_work_message_file_download(p_actor uuid,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f public.pro_work_message_files;
begin
 select * into f from public.pro_work_message_files where id=p_file;
 if not found or public.pro_work_message_side(p_actor,f.request_id) is null then return null;end if;
 return jsonb_build_object('objectPath',f.object_path,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);
end $$;
create or replace function public.pro_work_message_files_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Message attachments are immutable' using errcode='23514';end $$;
do $$declare f record;begin
 alter table public.pro_work_message_files enable row level security;
 revoke all on public.pro_work_message_files from public,anon,authenticated;grant select,insert,update,delete on public.pro_work_message_files to service_role;
 drop trigger if exists pro_work_message_files_immutable on public.pro_work_message_files;
 create trigger pro_work_message_files_immutable before update or delete on public.pro_work_message_files for each row when (pg_trigger_depth()=0) execute function public.pro_work_message_files_immutable();
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_work_message_file_json','pro_work_message_file_path','pro_work_message_attach','pro_work_message_files_read','pro_work_message_file_download','pro_work_message_files_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-work-message-files','pro-work-message-files',false,20971520,array['image/jpeg','application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  if not exists(select 1 from storage.buckets where id='pro-work-message-files' and not public and file_size_limit=20971520) then raise exception 'Message files bucket configuration';end if;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
