-- LOCAL PRO ONLY. Explicit task mentions and an isolated internal inbox. NO sends/outbox.
begin;
create unique index if not exists pro_team_task_comments_scope_id on public.pro_team_task_comments(owner_id,work_id,task_id,id);
create table if not exists public.pro_team_task_mentions(
 comment_id uuid not null references public.pro_team_task_comments(id) on delete cascade,recipient_id uuid not null,
 owner_id uuid not null,work_id text not null,task_id uuid not null,name text not null check(length(name)<=160),
 recipient_grant_id uuid,recipient_source_invite_id uuid,primary key(comment_id,recipient_id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade,
 check((recipient_grant_id is null)=(recipient_source_invite_id is null)),
 foreign key(owner_id,work_id,task_id,comment_id) references public.pro_team_task_comments(owner_id,work_id,task_id,id) on delete cascade
);
create table if not exists public.pro_team_task_mention_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 comment_id uuid not null references public.pro_team_task_comments(id) on delete cascade,input jsonb not null,result jsonb not null,
 primary key(actor_id,action_id)
);
create table if not exists public.pro_team_task_notices(
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null,owner_id uuid not null,work_id text not null,task_id uuid not null,
 comment_id uuid not null references public.pro_team_task_comments(id) on delete cascade,actor_id uuid not null,actor_name text not null check(length(actor_name)<=160),
 recipient_grant_id uuid,recipient_source_invite_id uuid,open_grant_id uuid not null,
 task_title text not null check(length(task_title) between 1 and 160),service text not null check(length(service)<=160),created_at timestamptz not null default now(),read_at timestamptz,
 unique(comment_id,recipient_id),foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade,
 check((recipient_grant_id is null)=(recipient_source_invite_id is null)),
 foreign key(owner_id,work_id,task_id,comment_id) references public.pro_team_task_comments(owner_id,work_id,task_id,id) on delete cascade
);
create index if not exists pro_team_task_notices_page on public.pro_team_task_notices(recipient_id,created_at desc,id desc);
create table if not exists public.pro_team_task_notice_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,notice_id uuid not null references public.pro_team_task_notices(id) on delete cascade,input jsonb not null,result jsonb not null,
 primary key(actor_id,action_id)
);
create or replace function public.pro_team_task_comment_json(p_comment public.pro_team_task_comments) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_comment.id,'actorId',p_comment.actor_id,'actorName',p_comment.actor_name,'text',p_comment.text,'at',p_comment.at,'mentions',coalesce((select jsonb_agg(jsonb_build_object('userId',m.recipient_id,'name',m.name) order by m.recipient_id) from public.pro_team_task_mentions m where m.comment_id=p_comment.id),'[]'::jsonb));
$$;
create or replace function public.pro_team_task_mention_targets(p_actor uuid,p_grant uuid,p_task uuid,p_after uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;items jsonb;cursor_id uuid;
begin
 g:=public.pro_team_task_discussion_context(p_actor,p_grant,p_task,true);
 if p_after is not null and not (
  p_after=g.owner_id and p_after<>p_actor and exists(select 1 from public.profiles where id=p_after and not coalesce(is_disabled,false))
  or exists(select 1 from public.pro_team_grants mg join public.profiles p on p.id=mg.member_user_id where mg.owner_id=g.owner_id and mg.work_id=g.work_id and mg.active and p.id=p_after and p.id<>p_actor and not coalesce(p.is_disabled,false))
 ) then raise exception 'Invalid mention target cursor' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('userId',x.user_id,'grantId',x.grant_id,'sourceInviteId',x.source_id,'name',x.name) order by x.user_id),'[]'::jsonb) into items from(
 select * from(
 select p.id user_id,null::uuid grant_id,null::uuid source_id,public.pro_team_name(p.id) name from public.profiles p where p.id=g.owner_id and not coalesce(p.is_disabled,false) and p.id<>p_actor
 union all select p.id,mg.id,mg.source_invite_id,mg.member_name from public.pro_team_grants mg join public.profiles p on p.id=mg.member_user_id where mg.owner_id=g.owner_id and mg.work_id=g.work_id and mg.active and not coalesce(p.is_disabled,false) and p.id<>p_actor
 ) targets where p_after is null or user_id>p_after order by user_id limit 21)x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'userId')::uuid;items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_team_task_comment_with_mentions(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;target public.pro_team_grants;r public.pro_team_task_mention_actions;oldr public.pro_team_task_comment_actions;c public.pro_team_task_comments;t public.pro_work_tasks;aid uuid;tid uuid;gid uuid;m jsonb;uid uuid;mgid uuid;source uuid;nm text;answer jsonb;seen uuid[]:=array[]::uuid[];keys text[];
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid comment' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if keys is distinct from array['action','actionId','grantId','mentions','taskId','text'] and keys is distinct from array['action','actionId','grantId','taskId','text'] then raise exception 'Invalid mention comment fields' using errcode='22023';end if;
 if p_input ? 'mentions' and (jsonb_typeof(p_input->'mentions') is distinct from 'array' or jsonb_array_length(p_input->'mentions')>5) then raise exception 'Invalid mentions' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;tid:=(p_input->>'taskId')::uuid;gid:=(p_input->>'grantId')::uuid;
 if aid is null or tid is null or gid is null then raise exception 'Invalid comment identity' using errcode='22023';end if;
 g:=public.pro_team_task_discussion_context(p_actor,gid,tid,true);
 perform pg_advisory_xact_lock(hashtextextended('pro-team-task-comment:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||g.owner_id::text||':'||g.work_id,0));
 perform 1 from public.pro_team_grants where id=gid for update;
 perform 1 from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and id=tid for update;
 g:=public.pro_team_task_discussion_context(p_actor,gid,tid,true);
 -- Calling the established writer checks current author/generation before receipt.
 select * into oldr from public.pro_team_task_comment_actions where actor_id=p_actor and action_id=aid;
 select * into r from public.pro_team_task_mention_actions where actor_id=p_actor and action_id=aid;
 if found then
  perform public.pro_team_task_comment_write(p_actor,p_input-'mentions');
  if r.input is distinct from p_input then raise exception 'Comment identity reused' using errcode='22023';end if;return r.result;
 end if;
 if oldr.action_id is not null and p_input ? 'mentions' then raise exception 'Legacy comment identity reused' using errcode='22023';end if;
 answer:=public.pro_team_task_comment_write(p_actor,p_input-'mentions');
 if oldr.action_id is not null then return answer;end if;
 select * into c from public.pro_team_task_comments where id=aid;
 select * into t from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and id=tid;
 for m in select value from jsonb_array_elements(coalesce(p_input->'mentions','[]'::jsonb)) loop
  select array_agg(key order by key) into keys from jsonb_object_keys(m)key;
  if keys is distinct from array['grantId','sourceInviteId','userId'] then raise exception 'Invalid mention target' using errcode='22023';end if;
  uid:=(m->>'userId')::uuid;mgid:=(m->>'grantId')::uuid;source:=(m->>'sourceInviteId')::uuid;
  if uid is null or uid=p_actor or uid=any(seen) then raise exception 'Invalid mention identity' using errcode='22023';end if;seen:=array_append(seen,uid);
  if uid=g.owner_id then
   if mgid is not null or source is not null then raise exception 'Mention target changed' using errcode='40001';end if;nm:=public.pro_team_name(uid);
  else
   select * into target from public.pro_team_grants where id=mgid and owner_id=g.owner_id and work_id=g.work_id and member_user_id=uid for update;
   if not found or not target.active or target.source_invite_id is distinct from source then raise exception 'Mention target changed' using errcode='40001';end if;nm:=target.member_name;
  end if;
  if not exists(select 1 from public.profiles where id=uid and not coalesce(is_disabled,false)) then raise exception 'Mention target changed' using errcode='40001';end if;
  insert into public.pro_team_task_mentions(comment_id,recipient_id,owner_id,work_id,task_id,name,recipient_grant_id,recipient_source_invite_id) values(aid,uid,g.owner_id,g.work_id,tid,nm,mgid,source);
  insert into public.pro_team_task_notices(recipient_id,owner_id,work_id,task_id,comment_id,actor_id,actor_name,recipient_grant_id,recipient_source_invite_id,open_grant_id,task_title,service)
  select uid,g.owner_id,g.work_id,tid,aid,p_actor,c.actor_name,mgid,source,coalesce(mgid,gid),t.title,w.service from public.pro_work w where w.user_id=g.owner_id and w.id=g.work_id;
 end loop;
 -- Recheck author and every captured recipient after all target locks/checks.
 g:=public.pro_team_task_discussion_context(p_actor,gid,tid,true);
 if exists(select 1 from unnest(seen) recipient where not exists(select 1 from public.profiles p where p.id=recipient and not coalesce(p.is_disabled,false))) then raise exception 'Mention target changed' using errcode='40001';end if;
 answer:=jsonb_build_object('comment',public.pro_team_task_comment_json(c));
 insert into public.pro_team_task_mention_actions(actor_id,action_id,comment_id,input,result) values(p_actor,aid,aid,p_input,answer);return answer;
end $$;
create or replace function public.pro_team_task_mention_comment_proof(p_actor uuid,p_grant uuid,p_task uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare answer jsonb;r public.pro_team_task_mention_actions;
begin
 answer:=public.pro_team_task_comment_proof(p_actor,p_grant,p_task,p_action);if answer is null then return null;end if;
 select * into r from public.pro_team_task_mention_actions where actor_id=p_actor and action_id=p_action;
 if found then return r.result;end if;return answer;
end $$;
create or replace function public.pro_team_task_notice_allowed(p_actor uuid,p_notice public.pro_team_task_notices) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select p_notice.recipient_id=p_actor and exists(select 1 from public.profiles p where p.id=p_actor and not coalesce(p.is_disabled,false)) and coalesce(public.pro_appointment_enabled(p_notice.owner_id),false)
 and exists(select 1 from public.pro_work_tasks t where t.owner_id=p_notice.owner_id and t.work_id=p_notice.work_id and t.id=p_notice.task_id and not t.archived)
 and (p_actor=p_notice.owner_id or exists(select 1 from public.pro_team_grants g where g.id=p_notice.recipient_grant_id and g.owner_id=p_notice.owner_id and g.work_id=p_notice.work_id and g.member_user_id=p_actor and g.active and g.source_invite_id=p_notice.recipient_source_invite_id));
$$;
create or replace function public.pro_team_task_notice_json(p_notice public.pro_team_task_notices) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_notice.id,'ownerId',p_notice.owner_id,'workId',p_notice.work_id,'taskId',p_notice.task_id,'commentId',p_notice.comment_id,'actorId',p_notice.actor_id,'actorName',p_notice.actor_name,'taskTitle',p_notice.task_title,'service',p_notice.service,'createdAt',p_notice.created_at,'readAt',p_notice.read_at);
$$;
create or replace function public.pro_team_task_notice_inbox(p_actor uuid,p_status text default 'all',p_after uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor_id uuid;cursor_at timestamptz;unread_count bigint;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status is null or p_status not in('all','unread') then raise exception 'Invalid inbox status' using errcode='22023';end if;
 if p_after is not null then select created_at into cursor_at from public.pro_team_task_notices n where n.id=p_after and public.pro_team_task_notice_allowed(p_actor,n) and(p_status='all' or n.read_at is null);if not found then raise exception 'Invalid notice cursor' using errcode='22023';end if;end if;
 select count(*) into unread_count from public.pro_team_task_notices n where n.recipient_id=p_actor and n.read_at is null and public.pro_team_task_notice_allowed(p_actor,n);
 select coalesce(jsonb_agg(public.pro_team_task_notice_json(n::public.pro_team_task_notices) order by n.created_at desc,n.id desc),'[]'::jsonb) into items from(
 select * from public.pro_team_task_notices n where n.recipient_id=p_actor and public.pro_team_task_notice_allowed(p_actor,n) and(p_status='all' or n.read_at is null) and(p_after is null or(n.created_at,n.id)<(cursor_at,p_after)) order by n.created_at desc,n.id desc limit 21)n;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor_id,'unreadCount',unread_count);
end $$;
create or replace function public.pro_team_task_notice_open(p_actor uuid,p_notice uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare n public.pro_team_task_notices;
begin
 select * into n from public.pro_team_task_notices where id=p_notice;
 if not found or not public.pro_team_task_notice_allowed(p_actor,n) then raise exception 'Notice unavailable' using errcode='42501';end if;
 perform public.pro_team_task_discussion_context(p_actor,n.open_grant_id,n.task_id,false);
 return jsonb_build_object('grantId',n.open_grant_id,'taskId',n.task_id);
end $$;
create or replace function public.pro_team_task_notice_mark_read(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare n public.pro_team_task_notices;r public.pro_team_task_notice_actions;aid uuid;nid uuid;answer jsonb;keys text[];
begin
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if keys is distinct from array['action','actionId','noticeId'] or p_input->>'action' is distinct from 'mark_read' then raise exception 'Invalid notice action' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;nid:=(p_input->>'noticeId')::uuid;if aid is null or nid is null then raise exception 'Invalid notice identity' using errcode='22023';end if;
 select * into n from public.pro_team_task_notices where id=nid;
 if not found or not public.pro_team_task_notice_allowed(p_actor,n) then raise exception 'Notice unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-team-task-notice:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||n.owner_id::text||':'||n.work_id,0));
 if n.recipient_grant_id is not null then perform 1 from public.pro_team_grants where id=n.recipient_grant_id for update;end if;
 select * into n from public.pro_team_task_notices where id=nid for update;
 if not public.pro_team_task_notice_allowed(p_actor,n) then raise exception 'Notice unavailable' using errcode='42501';end if;
 select * into r from public.pro_team_task_notice_actions where actor_id=p_actor and action_id=aid;
 if found then if r.input is distinct from p_input then raise exception 'Notice action reused' using errcode='22023';end if;return r.result;end if;
 if n.read_at is null then update public.pro_team_task_notices set read_at=now() where id=nid returning * into n;end if;
 answer:=jsonb_build_object('noticeId',n.id,'readAt',n.read_at);insert into public.pro_team_task_notice_actions(actor_id,action_id,notice_id,input,result) values(p_actor,aid,nid,p_input,answer);return answer;
end $$;
create or replace function public.pro_team_task_notice_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare n public.pro_team_task_notices;r public.pro_team_task_notice_actions;
begin
 select * into r from public.pro_team_task_notice_actions where actor_id=p_actor and action_id=p_action;if not found then return null;end if;
 select * into n from public.pro_team_task_notices where id=r.notice_id;
 if not found or not public.pro_team_task_notice_allowed(p_actor,n) then raise exception 'Notice unavailable' using errcode='42501';end if;return r.result;
end $$;
create or replace function public.pro_team_task_notice_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin if (to_jsonb(new)-'read_at') is distinct from(to_jsonb(old)-'read_at') or old.read_at is not null or new.read_at is null then raise exception 'Notice content is immutable' using errcode='23514';end if;return new;end $$;
drop trigger if exists pro_team_task_mentions_immutable on public.pro_team_task_mentions;
create trigger pro_team_task_mentions_immutable before update on public.pro_team_task_mentions for each row execute function public.pro_team_append_only();
drop trigger if exists pro_team_task_mention_actions_immutable on public.pro_team_task_mention_actions;
create trigger pro_team_task_mention_actions_immutable before update on public.pro_team_task_mention_actions for each row execute function public.pro_team_append_only();
drop trigger if exists pro_team_task_notice_actions_immutable on public.pro_team_task_notice_actions;
create trigger pro_team_task_notice_actions_immutable before update on public.pro_team_task_notice_actions for each row execute function public.pro_team_append_only();
drop trigger if exists pro_team_task_notices_immutable on public.pro_team_task_notices;
create trigger pro_team_task_notices_immutable before update on public.pro_team_task_notices for each row execute function public.pro_team_task_notice_immutable();
alter table public.pro_team_task_mentions enable row level security;alter table public.pro_team_task_mention_actions enable row level security;alter table public.pro_team_task_notices enable row level security;alter table public.pro_team_task_notice_actions enable row level security;
revoke all on public.pro_team_task_mentions,public.pro_team_task_mention_actions,public.pro_team_task_notices,public.pro_team_task_notice_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_team_task_mentions,public.pro_team_task_mention_actions,public.pro_team_task_notices,public.pro_team_task_notice_actions to service_role;
revoke all on function public.pro_team_task_mention_targets(uuid,uuid,uuid,uuid),public.pro_team_task_comment_with_mentions(uuid,jsonb),public.pro_team_task_mention_comment_proof(uuid,uuid,uuid,uuid),public.pro_team_task_notice_allowed(uuid,public.pro_team_task_notices),public.pro_team_task_notice_json(public.pro_team_task_notices),public.pro_team_task_notice_inbox(uuid,text,uuid),public.pro_team_task_notice_open(uuid,uuid),public.pro_team_task_notice_mark_read(uuid,jsonb),public.pro_team_task_notice_action_read(uuid,uuid),public.pro_team_task_notice_immutable() from public,anon,authenticated;
grant execute on function public.pro_team_task_mention_targets(uuid,uuid,uuid,uuid),public.pro_team_task_comment_with_mentions(uuid,jsonb),public.pro_team_task_mention_comment_proof(uuid,uuid,uuid,uuid),public.pro_team_task_notice_allowed(uuid,public.pro_team_task_notices),public.pro_team_task_notice_json(public.pro_team_task_notices),public.pro_team_task_notice_inbox(uuid,text,uuid),public.pro_team_task_notice_open(uuid,uuid),public.pro_team_task_notice_mark_read(uuid,jsonb),public.pro_team_task_notice_action_read(uuid,uuid) to service_role;
commit;
