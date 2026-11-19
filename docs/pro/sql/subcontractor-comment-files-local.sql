-- LOCAL PRO ONLY. Round 9 (2026-11-15): attachments in subcontractor task comments (both sides), with
-- the Round 8 message-attachment pattern: photo (PNG/WebP → JPG by the server) or PDF ≤ 20 MiB in the
-- private bucket `pro-sub-comment-files` (never public, never signed URLs). The comment is written by
-- the EXISTING writers (owner: pro_sub_owner_mutate 'comment'; subcontractor: pro_sub_portal_mutate
-- 'comment') with id = actionId = file id, so rate limits, scope checks, events and receipts are the
-- same; the file row is written in the same transaction and both are immutable. Every list and download
-- re-checks the scope in SQL at that moment: the owner of the company, or the subcontractor whose access
-- is active, whose job link is active and to whom THAT task is still assigned. Revoking access, removing
-- the job or unassigning the task stops downloads immediately. RLS + service_role-only.
begin;
create table if not exists public.pro_subcontractor_comment_files(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,comment_id uuid not null,access_id uuid not null,task_id uuid not null,
 side text not null check(side in('pro','sub')),
 name text not null check(length(name) between 1 and 160 and name !~ '[[:cntrl:]/]' and position(chr(92) in name)=0),
 mime_type text not null check(mime_type in('image/jpeg','application/pdf')),
 size_bytes integer not null check(size_bytes between 1 and 20971520),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 object_path text not null unique,created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),foreign key(owner_id,comment_id) references public.pro_subcontractor_comments(owner_id,id),
 check(id=comment_id),
 check(right(name,4)=case when mime_type='application/pdf' then '.pdf' else '.jpg' end),
 check(object_path=owner_id::text||'/'||access_id::text||'/'||id::text||case when mime_type='application/pdf' then '.pdf' else '.jpg' end));
create index if not exists pro_subcontractor_comment_files_scope on public.pro_subcontractor_comment_files(owner_id,access_id,task_id,created_at);

-- Who may see/write files of (owner, access, task) right now: 'pro' (the owner) or 'sub' (the active
-- subcontractor with the task assigned in an active job link); otherwise null.
create or replace function public.pro_sub_comment_scope(p_actor uuid,p_owner uuid,p_access uuid,p_task uuid) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select case
  when not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then null
  when not exists(select 1 from public.pro_subcontractor_tasks st join public.pro_subcontractor_jobs j on j.owner_id=st.owner_id and j.access_id=st.access_id and j.work_id=st.work_id and j.active
    join public.pro_subcontractor_access a on a.owner_id=st.owner_id and a.id=st.access_id and a.status='active'
    join public.pro_work_tasks t on t.owner_id=st.owner_id and t.work_id=st.work_id and t.id=st.task_id and not t.archived
    where st.owner_id=p_owner and st.access_id=p_access and st.task_id=p_task and st.active) then null
  when p_actor=p_owner then 'pro'
  when exists(select 1 from public.pro_subcontractor_access a where a.owner_id=p_owner and a.id=p_access and a.member_user_id=p_actor and a.status='active') then 'sub'
  else null end
$$;
create or replace function public.pro_sub_comment_file_path(p_actor uuid,p_owner uuid,p_access uuid,p_task uuid,p_file uuid,p_mime text) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if public.pro_sub_comment_scope(p_actor,p_owner,p_access,p_task) is null then raise exception 'Forbidden' using errcode='42501';end if;
 if p_mime not in('image/jpeg','application/pdf') or p_file is null then raise exception 'Invalid file' using errcode='22023';end if;
 return p_owner::text||'/'||p_access::text||'/'||p_file::text||case when p_mime='application/pdf' then '.pdf' else '.jpg' end;
end $$;
create or replace function public.pro_sub_comment_file_json(f public.pro_subcontractor_comment_files) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',f.id,'commentId',f.comment_id,'taskId',f.task_id,'side',f.side,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'createdAt',f.created_at)
$$;
create or replace function public.pro_sub_comment_attach(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];own uuid;acc uuid;tid uuid;aid uuid;side text;f public.pro_subcontractor_comment_files;t public.pro_work_tasks;bytes integer;mime text;nm text;body_text text;posted jsonb;
begin
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['accessId','actionId','body','mimeType','name','ownerId','sha256','sizeBytes','taskId'] then raise exception 'Invalid attachment' using errcode='22023';end if;
 begin own:=(p_input->>'ownerId')::uuid;acc:=(p_input->>'accessId')::uuid;tid:=(p_input->>'taskId')::uuid;aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid attachment' using errcode='22023';end;
 mime:=p_input->>'mimeType';nm:=p_input->>'name';
 if mime not in('image/jpeg','application/pdf') or jsonb_typeof(p_input->'sizeBytes') is distinct from 'number' or not coalesce((p_input->>'sizeBytes')~'^[0-9]{1,8}$',false)
  or not coalesce((p_input->>'sha256')~'^[a-f0-9]{64}$',false) or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'body') is distinct from 'string' then raise exception 'Invalid attachment' using errcode='22023';end if;
 bytes:=(p_input->>'sizeBytes')::integer;if bytes<1 or bytes>20971520 then raise exception 'File too large' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-sub-comment-file:'||p_actor::text||':'||aid::text,0));
 select * into f from public.pro_subcontractor_comment_files where owner_id=own and id=aid;
 if found then
  if f.sha256<>p_input->>'sha256' or f.access_id<>acc or f.task_id<>tid or f.name<>nm then raise exception 'Action id reused' using errcode='22023';end if;
  return jsonb_build_object('file',public.pro_sub_comment_file_json(f),'replayed',true);
 end if;
 side:=public.pro_sub_comment_scope(p_actor,own,acc,tid);if side is null then raise exception 'Forbidden' using errcode='42501';end if;
 body_text:=left(coalesce(nullif(btrim(p_input->>'body'),''),nm),1000);
 if side='pro' then
  select * into t from public.pro_work_tasks where owner_id=own and id=tid;
  posted:=public.pro_sub_owner_mutate(p_actor,jsonb_build_object('action','comment','actionId',aid,'accessId',acc,'subjectId',tid::text,'workId',t.work_id,'body',body_text));
 else
  posted:=public.pro_sub_portal_mutate(p_actor,jsonb_build_object('action','comment','actionId',aid,'accessId',acc,'ownerId',own,'taskId',tid,'body',body_text));
 end if;
 if not exists(select 1 from public.pro_subcontractor_comments where owner_id=own and id=aid and author_id=p_actor) then raise exception 'Comment not written' using errcode='40001';end if;
 insert into public.pro_subcontractor_comment_files(owner_id,id,comment_id,access_id,task_id,side,name,mime_type,size_bytes,sha256,object_path)
  values(own,aid,aid,acc,tid,side,nm,mime,bytes,p_input->>'sha256',public.pro_sub_comment_file_path(p_actor,own,acc,tid,aid,mime)) returning * into f;
 return jsonb_build_object('file',public.pro_sub_comment_file_json(f));
end $$;
-- Files of one access the actor can see now (owner: all its tasks; sub: only tasks still assigned).
create or replace function public.pro_sub_comment_files_read(p_actor uuid,p_owner uuid,p_access uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 return jsonb_build_object('files',coalesce((select jsonb_agg(public.pro_sub_comment_file_json(f) order by f.created_at,f.id) from public.pro_subcontractor_comment_files f
  where f.owner_id=p_owner and f.access_id=p_access and public.pro_sub_comment_scope(p_actor,p_owner,p_access,f.task_id) is not null),'[]'::jsonb));
end $$;
create or replace function public.pro_sub_comment_file_download(p_actor uuid,p_owner uuid,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f public.pro_subcontractor_comment_files;
begin
 select * into f from public.pro_subcontractor_comment_files where owner_id=p_owner and id=p_file;
 if not found or public.pro_sub_comment_scope(p_actor,f.owner_id,f.access_id,f.task_id) is null then return null;end if;
 return jsonb_build_object('objectPath',f.object_path,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);
end $$;
create or replace function public.pro_sub_comment_files_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Comment attachments are immutable' using errcode='23514';end $$;
do $$declare f record;begin
 alter table public.pro_subcontractor_comment_files enable row level security;
 revoke all on public.pro_subcontractor_comment_files from public,anon,authenticated;grant select,insert,update,delete on public.pro_subcontractor_comment_files to service_role;
 drop trigger if exists pro_sub_comment_files_immutable on public.pro_subcontractor_comment_files;
 create trigger pro_sub_comment_files_immutable before update or delete on public.pro_subcontractor_comment_files for each row when (pg_trigger_depth()=0) execute function public.pro_sub_comment_files_immutable();
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_sub_comment_scope','pro_sub_comment_file_path','pro_sub_comment_file_json','pro_sub_comment_attach','pro_sub_comment_files_read','pro_sub_comment_file_download','pro_sub_comment_files_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-sub-comment-files','pro-sub-comment-files',false,20971520,array['image/jpeg','application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  if not exists(select 1 from storage.buckets where id='pro-sub-comment-files' and not public and file_size_limit=20971520) then raise exception 'Sub comment files bucket configuration';end if;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
