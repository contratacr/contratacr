-- Pro row 16 (2026-11-23): comments with explicit mentions and links to EXISTING job files, written from the
-- owner's global task center. Comments are append-only; links are soft (unlink keeps the history). The linked file
-- is not copied: it stays the job file (same bytes, same permissions); the task only references it.
begin;

create table if not exists public.pro_task_center_comments(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,task_id uuid not null,id uuid not null,
 author_id uuid not null,author_name text not null check(length(author_name) between 1 and 160),
 body text not null check(length(btrim(body)) between 1 and 1000),
 mentions jsonb not null default '[]'::jsonb check(jsonb_typeof(mentions)='array' and jsonb_array_length(mentions)<=5),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade);
create index if not exists pro_task_center_comments_page on public.pro_task_center_comments(owner_id,task_id,created_at desc,id desc);

create table if not exists public.pro_task_center_file_links(
 owner_id uuid not null,work_id text not null,task_id uuid not null,file_id uuid not null,
 linked_by uuid not null,linked_by_name text not null check(length(linked_by_name) between 1 and 160),linked_at timestamptz not null default clock_timestamp(),
 unlinked_at timestamptz,unlinked_by uuid,
 primary key(owner_id,task_id,file_id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,work_id,file_id) references public.pro_work_files(owner_id,work_id,id) on delete cascade,
 check((unlinked_at is null)=(unlinked_by is null)));

create or replace function public.pro_task_center_comments_immutable() returns trigger language plpgsql as $$
begin raise exception 'Task comments are append-only' using errcode='22023';end $$;
drop trigger if exists pro_task_center_comments_immutable on public.pro_task_center_comments;
create trigger pro_task_center_comments_immutable before update or delete on public.pro_task_center_comments for each row execute function public.pro_task_center_comments_immutable();

create or replace function public.pro_task_center_person_name(p_owner uuid,p_person uuid) returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select x->>'name' from jsonb_array_elements(public.pro_ops_people(p_owner)) x where x->>'personId'=p_person::text limit 1),'Integrante')
$$;

create or replace function public.pro_task_center_detail_read(p_owner uuid,p_person uuid,p_work text,p_task uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if public.pro_role_of(p_person,p_owner) is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and t.id=p_task and not t.archived) then raise exception 'Task not found' using errcode='22023';end if;
 return jsonb_build_object('workId',p_work,'taskId',p_task,
  'people',public.pro_ops_people(p_owner),
  'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'authorName',c.author_name,'body',c.body,'mentions',c.mentions,'at',c.created_at) order by c.created_at desc,c.id desc)
   from (select * from public.pro_task_center_comments where owner_id=p_owner and task_id=p_task order by created_at desc,id desc limit 30) c),'[]'::jsonb),
  'files',coalesce((select jsonb_agg(jsonb_build_object('fileId',f.id,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'linkedByName',l.linked_by_name,'linkedAt',l.linked_at) order by l.linked_at desc,f.id)
   from public.pro_task_center_file_links l join public.pro_work_files f on f.owner_id=l.owner_id and f.work_id=l.work_id and f.id=l.file_id where l.owner_id=p_owner and l.task_id=p_task and l.unlinked_at is null),'[]'::jsonb),
  'available',coalesce((select jsonb_agg(jsonb_build_object('fileId',a.id,'name',a.name,'mimeType',a.mime_type,'sizeBytes',a.size_bytes) order by a.created_at desc,a.id)
   from (select f.* from public.pro_work_files f where f.owner_id=p_owner and f.work_id=p_work and f.ready
    and not exists(select 1 from public.pro_task_center_file_links l where l.owner_id=p_owner and l.task_id=p_task and l.file_id=f.id and l.unlinked_at is null)
    order by f.created_at desc,f.id limit 20) a),'[]'::jsonb));
end $$;

create or replace function public.pro_task_center_comment_add(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;tid uuid;hash text:=md5(coalesce(p_input::text,''));replay jsonb;m jsonb;ids uuid[]:=array[]::uuid[];mid uuid;mentioned jsonb:='[]'::jsonb;author text;answer jsonb;people jsonb;nm text;
begin
 if public.pro_role_of(p_person,p_owner) is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 perform public.pro_role_require(p_person,p_owner,'work.write');
 if pro_ops_keys(p_input) is distinct from array['actionId','mentions','taskId','text','workId'] or jsonb_typeof(p_input->'mentions')<>'array' or jsonb_array_length(p_input->'mentions')>5
  or jsonb_typeof(p_input->'text')<>'string' or not public.pro_ops_text_ok(p_input->>'text',1,1000) or jsonb_typeof(p_input->'workId')<>'string' then raise exception 'Invalid comment' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;tid:=(p_input->>'taskId')::uuid;exception when others then raise exception 'Invalid comment' using errcode='22023';end;
 replay:=pro_ops_receipt(p_owner,p_person,aid,hash);if replay is not null then return replay;end if;
 if not exists(select 1 from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_input->>'workId' and t.id=tid and not t.archived) then raise exception 'Task not found' using errcode='22023';end if;
 people:=public.pro_ops_people(p_owner);
 for m in select * from jsonb_array_elements(p_input->'mentions') loop
  begin mid:=(m#>>'{}')::uuid;exception when others then raise exception 'Invalid mention' using errcode='22023';end;
  if mid=any(ids) then raise exception 'Invalid mention' using errcode='22023';end if;
  select x->>'name' into nm from jsonb_array_elements(people) x where x->>'personId'=mid::text;
  if nm is null then raise exception 'Invalid mention' using errcode='22023';end if;
  ids:=ids||mid;mentioned:=mentioned||jsonb_build_array(jsonb_build_object('personId',mid,'name',nm));
 end loop;
 author:=public.pro_task_center_person_name(p_owner,p_person);cid:=pro_ops_uuid(aid::text||':comment');
 insert into public.pro_task_center_comments(owner_id,work_id,task_id,id,author_id,author_name,body,mentions) values(p_owner,p_input->>'workId',tid,cid,p_person,author,btrim(p_input->>'text'),mentioned);
 -- In-app notice for each mentioned person other than the author. It uses the existing "task" event, so the person's own preferences apply to display.
 for mid in select unnest(ids) loop
  if mid<>p_person then
   insert into public.pro_notifications(owner_id,person_id,event,source_key,title,body,link)
    values(p_owner,mid,'task_assigned','mention:'||cid::text,left(author||' lo mencionó en una tarea',200),left(btrim(p_input->>'text'),400),jsonb_build_object('tab','pro_agenda','cita',p_input->>'workId','vistaTrabajo','tasks'))
    on conflict do nothing;
  end if;
 end loop;
 answer:=jsonb_build_object('comment',jsonb_build_object('id',cid,'authorName',author,'body',btrim(p_input->>'text'),'mentions',mentioned,'at',clock_timestamp()));
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_person,aid,'task_comment',hash,answer);
 return answer;
end $$;

create or replace function public.pro_task_center_file_link(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;tid uuid;fid uuid;hash text:=md5(coalesce(p_input::text,''));replay jsonb;answer jsonb;act text;n integer;
begin
 if public.pro_role_of(p_person,p_owner) is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 perform public.pro_role_require(p_person,p_owner,'work.write');
 if pro_ops_keys(p_input) is distinct from array['action','actionId','fileId','taskId','workId'] or p_input->>'action' not in('link','unlink') or jsonb_typeof(p_input->'workId')<>'string' then raise exception 'Invalid link' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;tid:=(p_input->>'taskId')::uuid;fid:=(p_input->>'fileId')::uuid;exception when others then raise exception 'Invalid link' using errcode='22023';end;
 act:=p_input->>'action';
 replay:=pro_ops_receipt(p_owner,p_person,aid,hash);if replay is not null then return replay;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-task-links:'||p_owner::text||':'||tid::text,0));
 if not exists(select 1 from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_input->>'workId' and t.id=tid and not t.archived) then raise exception 'Task not found' using errcode='22023';end if;
 if act='link' then
  if not exists(select 1 from public.pro_work_files f where f.owner_id=p_owner and f.work_id=p_input->>'workId' and f.id=fid and f.ready) then raise exception 'File not available' using errcode='22023';end if;
  select count(*) into n from public.pro_task_center_file_links where owner_id=p_owner and task_id=tid and unlinked_at is null;
  if n>=20 then raise exception 'Too many files' using errcode='54000';end if;
  insert into public.pro_task_center_file_links(owner_id,work_id,task_id,file_id,linked_by,linked_by_name) values(p_owner,p_input->>'workId',tid,fid,p_person,public.pro_task_center_person_name(p_owner,p_person))
   on conflict(owner_id,task_id,file_id) do update set unlinked_at=null,unlinked_by=null,linked_by=excluded.linked_by,linked_by_name=excluded.linked_by_name,linked_at=clock_timestamp() where public.pro_task_center_file_links.unlinked_at is not null;
 else
  update public.pro_task_center_file_links set unlinked_at=clock_timestamp(),unlinked_by=p_person where owner_id=p_owner and task_id=tid and file_id=fid and unlinked_at is null;
  if not found then raise exception 'Link changed' using errcode='40001';end if;
 end if;
 answer=jsonb_build_object('action',act,'taskId',tid,'fileId',fid);
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_person,aid,'task_file_link',hash,answer);
 return answer;
end $$;

do $$ declare t text;f record;
begin
 foreach t in array array['pro_task_center_comments','pro_task_center_file_links'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_task_center_comments_immutable','pro_task_center_person_name','pro_task_center_detail_read','pro_task_center_comment_add','pro_task_center_file_link') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
