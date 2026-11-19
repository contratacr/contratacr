-- LOCAL PRO ONLY. Task-scoped team discussion; isolated private storage, no sends.
begin;
create table if not exists public.pro_team_task_comments(
 id uuid primary key,owner_id uuid not null,work_id text not null,task_id uuid not null,
 actor_id uuid not null,actor_name text not null check(length(actor_name)<=160),text text not null check(length(btrim(text)) between 1 and 1000),at timestamptz not null default now(),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade
);
create index if not exists pro_team_task_comments_page on public.pro_team_task_comments(owner_id,work_id,task_id,at desc,id desc);
create table if not exists public.pro_team_task_comment_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,owner_id uuid not null,work_id text not null,task_id uuid not null,
 grant_id uuid not null,source_invite_id uuid not null,input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade
);
create table if not exists public.pro_team_task_files(
 id uuid primary key,owner_id uuid not null,work_id text not null,task_id uuid not null,
 actor_id uuid not null,actor_name text not null check(length(actor_name)<=160),grant_id uuid not null,source_invite_id uuid not null,
 source_name text not null check(length(source_name) between 1 and 160 and source_name !~ '[[:cntrl:]/]' and position(chr(92) in source_name)=0),
 name text not null check(length(name) between 1 and 160 and name !~ '[[:cntrl:]/]' and position(chr(92) in name)=0),
 mime_type text not null check(mime_type in('image/jpeg','application/pdf')),raw_sha256 text not null check(raw_sha256~'^[a-f0-9]{64}$'),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 size_bytes integer not null check(size_bytes between 1 and 20971520),object_path text not null unique,ready boolean not null default false,created_at timestamptz not null default now(),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade,
 check(mime_type<>'image/jpeg' or size_bytes<=20971520),
 check(object_path=owner_id::text||'/'||id::text||case when mime_type='application/pdf' then '.pdf' else '.jpg' end),
 check(right(name,4)=case when mime_type='application/pdf' then '.pdf' else '.jpg' end)
);
create index if not exists pro_team_task_files_page on public.pro_team_task_files(owner_id,work_id,task_id,created_at desc,id desc);
create table if not exists public.pro_team_task_file_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,file_id uuid not null references public.pro_team_task_files(id) on delete cascade,input jsonb not null,result jsonb,at timestamptz not null default now(),primary key(actor_id,file_id)
);
create or replace function public.pro_team_task_comment_json(p_comment public.pro_team_task_comments) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_comment.id,'actorId',p_comment.actor_id,'actorName',p_comment.actor_name,'text',p_comment.text,'at',p_comment.at);
$$;
create or replace function public.pro_team_task_file_json(p_file public.pro_team_task_files) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_file.id,'taskId',p_file.task_id,'name',p_file.name,'mimeType',p_file.mime_type,'sizeBytes',p_file.size_bytes,'sha256',p_file.sha256,'ready',p_file.ready,'actorId',p_file.actor_id,'actorName',p_file.actor_name,'createdAt',p_file.created_at);
$$;
create or replace function public.pro_team_task_discussion_context(p_actor uuid,p_grant uuid,p_task uuid,p_write boolean default false) returns public.pro_team_grants language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;
begin
 g:=public.pro_team_context(p_actor,p_grant,p_write);
 if not exists(select 1 from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and id=p_task and not archived) then raise exception 'Task unavailable' using errcode='42501';end if;
 return g;
end $$;
create or replace function public.pro_team_task_discussion_read(p_actor uuid,p_grant uuid,p_task uuid,p_kind text,p_after uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;t public.pro_work_tasks;items jsonb;cursor_at timestamptz;cursor_id uuid;
begin
 g:=public.pro_team_task_discussion_context(p_actor,p_grant,p_task,false);
 select * into t from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and id=p_task;
 if p_kind='comments' then
  if p_after is not null then select at into cursor_at from public.pro_team_task_comments where owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and id=p_after;if not found then raise exception 'Invalid comment cursor' using errcode='22023';end if;end if;
  select coalesce(jsonb_agg(public.pro_team_task_comment_json(c::public.pro_team_task_comments) order by c.at desc,c.id desc),'[]'::jsonb) into items from(select * from public.pro_team_task_comments where owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and (p_after is null or (at,id)<(cursor_at,p_after)) order by at desc,id desc limit 21)c;
 elsif p_kind='files' then
  if p_after is not null then select created_at into cursor_at from public.pro_team_task_files where owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and id=p_after and ready;if not found then raise exception 'Invalid file cursor' using errcode='22023';end if;end if;
  select coalesce(jsonb_agg(public.pro_team_task_file_json(f::public.pro_team_task_files) order by f.created_at desc,f.id desc),'[]'::jsonb) into items from(select * from public.pro_team_task_files where owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and ready and (p_after is null or(created_at,id)<(cursor_at,p_after)) order by created_at desc,id desc limit 21)f;
 else raise exception 'Invalid discussion view' using errcode='22023';end if;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('grant',public.pro_team_shared_grant_json(g,p_actor),'task',public.pro_team_task_json(t),'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_team_task_comment_write(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;r public.pro_team_task_comment_actions;c public.pro_team_task_comments;gid uuid;tid uuid;aid uuid;keys text[];body text;answer jsonb;
begin
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if keys is distinct from array['action','actionId','grantId','taskId','text'] or p_input->>'action' is distinct from 'comment' or jsonb_typeof(p_input->'text') is distinct from 'string' then raise exception 'Invalid task comment' using errcode='22023';end if;
 gid:=(p_input->>'grantId')::uuid;tid:=(p_input->>'taskId')::uuid;aid:=(p_input->>'actionId')::uuid;body:=btrim(p_input->>'text');
 if gid is null or tid is null or aid is null or length(body) not between 1 and 1000 then raise exception 'Invalid comment identity' using errcode='22023';end if;
 g:=public.pro_team_task_discussion_context(p_actor,gid,tid,true);
 perform pg_advisory_xact_lock(hashtextextended('pro-team-task-comment:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||g.owner_id::text||':'||g.work_id,0));
 perform 1 from public.pro_team_grants where id=gid for update;
 perform 1 from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and id=tid for update;
 g:=public.pro_team_task_discussion_context(p_actor,gid,tid,true);
 select * into r from public.pro_team_task_comment_actions where actor_id=p_actor and action_id=aid;
 if found then
  if r.input is distinct from p_input then raise exception 'Comment identity reused' using errcode='22023';end if;
  if p_actor<>g.owner_id and r.source_invite_id<>g.source_invite_id then raise exception 'Access changed' using errcode='42501';end if;
  return r.result;
 end if;
 insert into public.pro_team_task_comments(id,owner_id,work_id,task_id,actor_id,actor_name,text) values(aid,g.owner_id,g.work_id,tid,p_actor,public.pro_team_name(p_actor),body) returning * into c;
 answer:=jsonb_build_object('comment',public.pro_team_task_comment_json(c));
 insert into public.pro_team_task_comment_actions(actor_id,action_id,owner_id,work_id,task_id,grant_id,source_invite_id,input,result) values(p_actor,aid,g.owner_id,g.work_id,tid,gid,g.source_invite_id,p_input,answer);return answer;
end $$;
create or replace function public.pro_team_task_comment_proof(p_actor uuid,p_grant uuid,p_task uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;r public.pro_team_task_comment_actions;
begin
 g:=public.pro_team_task_discussion_context(p_actor,p_grant,p_task,true);
 select * into r from public.pro_team_task_comment_actions where actor_id=p_actor and action_id=p_action and owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and grant_id=p_grant;
 if not found then return null;end if;
 if p_actor<>g.owner_id and r.source_invite_id<>g.source_invite_id then raise exception 'Access changed' using errcode='42501';end if;return r.result;
end $$;
create or replace function public.pro_team_task_file_read(p_actor uuid,p_grant uuid,p_task uuid,p_file uuid,p_proof boolean default false,p_binary boolean default false) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;f public.pro_team_task_files;
begin
 g:=public.pro_team_task_discussion_context(p_actor,p_grant,p_task,p_proof);
 select * into f from public.pro_team_task_files where id=p_file and owner_id=g.owner_id and work_id=g.work_id and task_id=p_task;
 if not found then return null;end if;
 if p_proof and (f.actor_id<>p_actor or f.grant_id<>p_grant or p_actor<>g.owner_id and f.source_invite_id<>g.source_invite_id) then raise exception 'Access changed' using errcode='42501';end if;
 if not p_proof and not f.ready then return null;end if;
 if p_binary then
  if not f.ready then return null;end if;
  return jsonb_build_object('objectPath',f.object_path,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);
 end if;return jsonb_build_object('file',public.pro_team_task_file_json(f));
end $$;
create or replace function public.pro_team_task_file_reserve(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;f public.pro_team_task_files;r public.pro_team_task_file_actions;gid uuid;tid uuid;fid uuid;keys text[];size integer;mime text;path text;
begin
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if keys is distinct from array['fileId','grantId','mimeType','name','rawSha256','sha256','sizeBytes','sourceName','taskId'] then raise exception 'Invalid upload fields' using errcode='22023';end if;
 gid:=(p_input->>'grantId')::uuid;tid:=(p_input->>'taskId')::uuid;fid:=(p_input->>'fileId')::uuid;mime:=p_input->>'mimeType';
 if gid is null or tid is null or fid is null or mime not in('image/jpeg','application/pdf') or jsonb_typeof(p_input->'sizeBytes') is distinct from 'number' or not coalesce((p_input->>'sizeBytes')~'^[0-9]{1,8}$',false) or not coalesce((p_input->>'rawSha256')~'^[a-f0-9]{64}$',false) or not coalesce((p_input->>'sha256')~'^[a-f0-9]{64}$',false) then raise exception 'Invalid upload metadata' using errcode='22023';end if;
 size:=(p_input->>'sizeBytes')::integer;if size not between 1 and 20971520 or mime='image/jpeg' and size>20971520 then raise exception 'Invalid upload size' using errcode='22023';end if;
 if jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'sourceName') is distinct from 'string' then raise exception 'Invalid filename' using errcode='22023';end if;
 g:=public.pro_team_task_discussion_context(p_actor,gid,tid,true);
 perform pg_advisory_xact_lock(hashtextextended('pro-team-task-file:'||fid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||g.owner_id::text||':'||g.work_id,0));
 perform 1 from public.pro_team_grants where id=gid for update;
 perform 1 from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and id=tid for update;
 g:=public.pro_team_task_discussion_context(p_actor,gid,tid,true);
 select * into r from public.pro_team_task_file_actions where actor_id=p_actor and file_id=fid;
 if found then
  if r.input is distinct from p_input then raise exception 'Upload identity reused' using errcode='22023';end if;
  select * into f from public.pro_team_task_files where id=fid;
  if not found or f.owner_id<>g.owner_id or f.work_id<>g.work_id or f.task_id<>tid or f.grant_id<>gid or p_actor<>g.owner_id and f.source_invite_id<>g.source_invite_id then raise exception 'Access changed' using errcode='42501';end if;
  return jsonb_build_object('file',public.pro_team_task_file_json(f),'objectPath',f.object_path);
 end if;
 if exists(select 1 from public.pro_team_task_files where id=fid) then raise exception 'Upload identity unavailable' using errcode='42501';end if;
 if (select count(*) from public.pro_team_task_files where owner_id=g.owner_id and work_id=g.work_id and task_id=tid)>=100 then raise exception 'Task file limit reached' using errcode='54000';end if;
 path:=g.owner_id::text||'/'||fid::text||case when mime='application/pdf' then '.pdf' else '.jpg' end;
 insert into public.pro_team_task_files(id,owner_id,work_id,task_id,actor_id,actor_name,grant_id,source_invite_id,source_name,name,mime_type,raw_sha256,sha256,size_bytes,object_path)
 values(fid,g.owner_id,g.work_id,tid,p_actor,public.pro_team_name(p_actor),gid,g.source_invite_id,p_input->>'sourceName',p_input->>'name',mime,p_input->>'rawSha256',p_input->>'sha256',size,path) returning * into f;
 insert into public.pro_team_task_file_actions(actor_id,file_id,input) values(p_actor,fid,p_input);
 return jsonb_build_object('file',public.pro_team_task_file_json(f),'objectPath',f.object_path);
end $$;
create or replace function public.pro_team_task_file_ready(p_actor uuid,p_grant uuid,p_task uuid,p_file uuid,p_sha256 text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;f public.pro_team_task_files;r public.pro_team_task_file_actions;answer jsonb;
begin
 g:=public.pro_team_task_discussion_context(p_actor,p_grant,p_task,true);
 perform pg_advisory_xact_lock(hashtextextended('pro-team-task-file:'||p_file::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||g.owner_id::text||':'||g.work_id,0));
 perform 1 from public.pro_team_grants where id=p_grant for update;
 perform 1 from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and id=p_task for update;
 g:=public.pro_team_task_discussion_context(p_actor,p_grant,p_task,true);
 select * into f from public.pro_team_task_files where id=p_file and actor_id=p_actor and owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and grant_id=p_grant for update;
 if not found or p_actor<>g.owner_id and f.source_invite_id<>g.source_invite_id then raise exception 'Access changed' using errcode='42501';end if;
 if f.sha256 is distinct from p_sha256 then raise exception 'Upload hash changed' using errcode='22023';end if;
 select * into r from public.pro_team_task_file_actions where actor_id=p_actor and file_id=p_file for update;if not found then raise exception 'Upload not reserved' using errcode='42501';end if;
 if r.result is not null then return r.result;end if;
 update public.pro_team_task_files set ready=true where id=p_file returning * into f;
 answer:=jsonb_build_object('file',public.pro_team_task_file_json(f));update public.pro_team_task_file_actions set result=answer where actor_id=p_actor and file_id=p_file;return answer;
end $$;
create or replace function public.pro_team_task_file_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin if (to_jsonb(new)-'ready') is distinct from (to_jsonb(old)-'ready') or old.ready or not new.ready then raise exception 'Task files are immutable' using errcode='23514';end if;return new;end $$;
create or replace function public.pro_team_task_file_receipt_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin if old.result is not null or new.result is null or (to_jsonb(new)-'result') is distinct from (to_jsonb(old)-'result') then raise exception 'Upload receipts are immutable' using errcode='23514';end if;return new;end $$;
drop trigger if exists pro_team_task_comments_immutable on public.pro_team_task_comments;
create trigger pro_team_task_comments_immutable before update on public.pro_team_task_comments for each row execute function public.pro_team_append_only();
drop trigger if exists pro_team_task_comment_actions_immutable on public.pro_team_task_comment_actions;
create trigger pro_team_task_comment_actions_immutable before update on public.pro_team_task_comment_actions for each row execute function public.pro_team_append_only();
drop trigger if exists pro_team_task_files_immutable on public.pro_team_task_files;
create trigger pro_team_task_files_immutable before update on public.pro_team_task_files for each row execute function public.pro_team_task_file_immutable();
drop trigger if exists pro_team_task_file_actions_immutable on public.pro_team_task_file_actions;
create trigger pro_team_task_file_actions_immutable before update on public.pro_team_task_file_actions for each row execute function public.pro_team_task_file_receipt_immutable();
alter table public.pro_team_task_comments enable row level security;alter table public.pro_team_task_comment_actions enable row level security;alter table public.pro_team_task_files enable row level security;alter table public.pro_team_task_file_actions enable row level security;
revoke all on public.pro_team_task_comments,public.pro_team_task_comment_actions,public.pro_team_task_files,public.pro_team_task_file_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_team_task_comments,public.pro_team_task_comment_actions,public.pro_team_task_files,public.pro_team_task_file_actions to service_role;
revoke all on function public.pro_team_task_comment_json(public.pro_team_task_comments),public.pro_team_task_file_json(public.pro_team_task_files),public.pro_team_task_discussion_context(uuid,uuid,uuid,boolean),public.pro_team_task_discussion_read(uuid,uuid,uuid,text,uuid),public.pro_team_task_comment_write(uuid,jsonb),public.pro_team_task_comment_proof(uuid,uuid,uuid,uuid),public.pro_team_task_file_read(uuid,uuid,uuid,uuid,boolean,boolean),public.pro_team_task_file_reserve(uuid,jsonb),public.pro_team_task_file_ready(uuid,uuid,uuid,uuid,text),public.pro_team_task_file_immutable(),public.pro_team_task_file_receipt_immutable() from public,anon,authenticated;
grant execute on function public.pro_team_task_comment_json(public.pro_team_task_comments),public.pro_team_task_file_json(public.pro_team_task_files),public.pro_team_task_discussion_context(uuid,uuid,uuid,boolean),public.pro_team_task_discussion_read(uuid,uuid,uuid,text,uuid),public.pro_team_task_comment_write(uuid,jsonb),public.pro_team_task_comment_proof(uuid,uuid,uuid,uuid),public.pro_team_task_file_read(uuid,uuid,uuid,uuid,boolean,boolean),public.pro_team_task_file_reserve(uuid,jsonb),public.pro_team_task_file_ready(uuid,uuid,uuid,uuid,text) to service_role;
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-team-task-files','pro-team-task-files',false,20971520,array['image/jpeg','application/pdf']) on conflict(id) do update set file_size_limit=excluded.file_size_limit;
  if not exists(select 1 from storage.buckets where id='pro-team-task-files' and not public and file_size_limit=20971520 and cardinality(allowed_mime_types)=2 and allowed_mime_types @> array['image/jpeg','application/pdf']) then raise exception 'Team task file bucket configuration mismatch';end if;
 end if;
 if to_regclass('storage.objects') is not null then
  execute 'drop policy if exists pro_team_task_files_no_direct on storage.objects';
  execute 'create policy pro_team_task_files_no_direct on storage.objects as restrictive for all to anon,authenticated using(bucket_id <> ''pro-team-task-files'') with check(bucket_id <> ''pro-team-task-files'')';
 end if;
end $$;
commit;
