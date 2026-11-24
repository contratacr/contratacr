-- Pro row 16 (2026-11-23): edit and delete task-center comments.
-- The author (or the account owner) may edit the text of a comment or delete it. Nothing is erased: every
-- previous text is kept in an append-only revision table, and a deleted comment stays as a tombstone (the body is
-- hidden from the reading function, the revisions keep it for the owner's records). Mentions and in-app notices
-- are never re-sent by an edit.
begin;

alter table public.pro_task_center_comments add column if not exists edited_at timestamptz,add column if not exists deleted_at timestamptz,add column if not exists deleted_by uuid;

create table if not exists public.pro_task_center_comment_revisions(
 owner_id uuid not null,comment_id uuid not null,rev integer not null check(rev>=1),
 kind text not null check(kind in('edit','delete')),previous_body text not null,changed_by uuid not null,changed_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,comment_id,rev),foreign key(owner_id,comment_id) references public.pro_task_center_comments(owner_id,id) on delete cascade);

create or replace function public.pro_task_center_revisions_immutable() returns trigger language plpgsql as $$
begin raise exception 'Comment revisions are append-only' using errcode='22023';end $$;
drop trigger if exists pro_task_center_revisions_immutable on public.pro_task_center_comment_revisions;
create trigger pro_task_center_revisions_immutable before update or delete on public.pro_task_center_comment_revisions for each row execute function public.pro_task_center_revisions_immutable();

-- Comments stay undeletable; they may only change body/edited_at/deleted_* from inside the change function (transaction-local flag).
create or replace function public.pro_task_center_comments_immutable() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and coalesce(current_setting('pro.comment_change',true),'')='1'
  and new.owner_id=old.owner_id and new.work_id=old.work_id and new.task_id=old.task_id and new.id=old.id and new.author_id=old.author_id
  and new.author_name=old.author_name and new.mentions=old.mentions and new.created_at=old.created_at then return new;end if;
 raise exception 'Task comments are append-only' using errcode='22023';
end $$;

do $$ declare c text;
begin
 for c in select conname from pg_constraint where conrelid='public.pro_ops_actions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%task_comment%' loop
  execute format('alter table public.pro_ops_actions drop constraint %I',c);
 end loop;
 alter table public.pro_ops_actions add constraint pro_ops_actions_kind_check check(kind in('estimate_schedule','task_view','clock_in','clock_settings','timesheet','notify_channels','crew','custom_role',
  'notify_schedule','notify_digest','task_comment','task_file_link','task_comment_change'));
end $$;

create or replace function public.pro_task_center_detail_read(p_owner uuid,p_person uuid,p_work text,p_task uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if public.pro_role_of(p_person,p_owner) is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and t.id=p_task and not t.archived) then raise exception 'Task not found' using errcode='22023';end if;
 return jsonb_build_object('workId',p_work,'taskId',p_task,
  'people',public.pro_ops_people(p_owner),
  'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'authorName',c.author_name,'body',case when c.deleted_at is null then c.body else '' end,'mentions',case when c.deleted_at is null then c.mentions else '[]'::jsonb end,'at',c.created_at,
    'edited',c.edited_at is not null,'deleted',c.deleted_at is not null,'canManage',c.deleted_at is null and (c.author_id=p_person or p_person=p_owner)) order by c.created_at desc,c.id desc)
   from (select * from public.pro_task_center_comments where owner_id=p_owner and task_id=p_task order by created_at desc,id desc limit 30) c),'[]'::jsonb),
  'files',coalesce((select jsonb_agg(jsonb_build_object('fileId',f.id,'name',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'linkedByName',l.linked_by_name,'linkedAt',l.linked_at) order by l.linked_at desc,f.id)
   from public.pro_task_center_file_links l join public.pro_work_files f on f.owner_id=l.owner_id and f.work_id=l.work_id and f.id=l.file_id where l.owner_id=p_owner and l.task_id=p_task and l.unlinked_at is null),'[]'::jsonb),
  'available',coalesce((select jsonb_agg(jsonb_build_object('fileId',a.id,'name',a.name,'mimeType',a.mime_type,'sizeBytes',a.size_bytes) order by a.created_at desc,a.id)
   from (select f.* from public.pro_work_files f where f.owner_id=p_owner and f.work_id=p_work and f.ready
    and not exists(select 1 from public.pro_task_center_file_links l where l.owner_id=p_owner and l.task_id=p_task and l.file_id=f.id and l.unlinked_at is null)
    order by f.created_at desc,f.id limit 20) a),'[]'::jsonb));
end $$;

create or replace function public.pro_task_center_comment_change(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;tid uuid;hash text:=md5(coalesce(p_input::text,''));replay jsonb;act text;c public.pro_task_center_comments;n integer;answer jsonb;newbody text;
begin
 if public.pro_role_of(p_person,p_owner) is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 perform public.pro_role_require(p_person,p_owner,'work.write');
 act:=p_input->>'action';
 if act not in('edit','delete') or jsonb_typeof(p_input->'workId')<>'string'
  or pro_ops_keys(p_input) is distinct from case when act='edit' then array['action','actionId','commentId','taskId','text','workId'] else array['action','actionId','commentId','taskId','workId'] end
  or (act='edit' and (jsonb_typeof(p_input->'text')<>'string' or not public.pro_ops_text_ok(p_input->>'text',1,1000))) then raise exception 'Invalid comment' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;cid:=(p_input->>'commentId')::uuid;tid:=(p_input->>'taskId')::uuid;exception when others then raise exception 'Invalid comment' using errcode='22023';end;
 replay:=pro_ops_receipt(p_owner,p_person,aid,hash);if replay is not null then return replay;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-task-comment:'||p_owner::text||':'||cid::text,0));
 select * into c from public.pro_task_center_comments where owner_id=p_owner and id=cid and task_id=tid and work_id=p_input->>'workId' for update;
 if not found then raise exception 'Comment not found' using errcode='22023';end if;
 if not (c.author_id=p_person or p_person=p_owner) then raise exception 'Forbidden' using errcode='42501';end if;
 if c.deleted_at is not null then raise exception 'Comment changed' using errcode='40001';end if;
 select coalesce(max(rev),0)+1 into n from public.pro_task_center_comment_revisions where owner_id=p_owner and comment_id=cid;
 perform set_config('pro.comment_change','1',true);
 if act='edit' then
  newbody:=btrim(p_input->>'text');
  if newbody=c.body then raise exception 'Nothing to change' using errcode='22023';end if;
  insert into public.pro_task_center_comment_revisions(owner_id,comment_id,rev,kind,previous_body,changed_by) values(p_owner,cid,n,'edit',c.body,p_person);
  update public.pro_task_center_comments set body=newbody,edited_at=clock_timestamp() where owner_id=p_owner and id=cid;
 else
  insert into public.pro_task_center_comment_revisions(owner_id,comment_id,rev,kind,previous_body,changed_by) values(p_owner,cid,n,'delete',c.body,p_person);
  update public.pro_task_center_comments set deleted_at=clock_timestamp(),deleted_by=p_person where owner_id=p_owner and id=cid;
 end if;
 perform set_config('pro.comment_change','',true);
 answer:=jsonb_build_object('action',act,'commentId',cid,'taskId',tid);
 insert into public.pro_ops_actions(owner_id,person_id,action_id,kind,input_hash,result) values(p_owner,p_person,aid,'task_comment_change',hash,answer);
 return answer;
end $$;

do $$ declare t text;f record;
begin
 foreach t in array array['pro_task_center_comment_revisions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_task_center_revisions_immutable','pro_task_center_comment_change','pro_task_center_detail_read','pro_task_center_comments_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
