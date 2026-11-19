-- LOCAL PRO ONLY. Registro de paridad, fila 30: «@menciones del equipo» en los comentarios
-- privados ('team') de un archivo del trabajo, con un buzón interno aislado. NO sends/outbox:
-- no e-mail, push, notifications or notification_push_outbox rows (pro_notifications and its
-- event CHECK are untouched).
-- Builds on file-versions-local.sql WITHOUT altering it: the comment itself is created by the
-- established writer pro_work_file_versions_mutate (same receipts, limits, locks and checks),
-- called from pro_work_file_comment_with_mentions in the SAME transaction, which then records
-- the explicit mentions. A comment never exists half-mentioned.
-- Model
--  * Only the job owner writes the team thread (file-versions-local.sql), so recipients are the
--    active collaborators of THAT job (pro_team_grants: owner_id, work_id, active), captured
--    with their grant id and generation (source_invite_id). Revoking access (or a new
--    invitation generation) hides the notice; nothing is deleted.
--  * 1..10 recipients per comment, each named in the body as "@"+name (case-insensitive), no
--    duplicates, never the author. Mentions and receipts are immutable; editing the comment
--    later does not add, remove or resend mentions.
--  * The member has NO access to job files: a notice stores only job service, file name,
--    version number, author name, an excerpt (<= 280) and the date. No file id, object path,
--    URL or bytes are ever returned to the member. A notice is hidden while its comment is
--    archived or the owner loses Pro tools, and disappears with the file (cascade).
-- Pattern: closed RLS + revoke, security invoker RPCs for service_role only, owner eligibility
-- pro_private_work_tools_enabled, idempotent receipts per actionId (same id + other payload ->
-- 22023), target changes -> 40001, Costa Rica dates (dayCr). Reapplicable; only new objects.
-- Lock order: mention action advisory -> (writer) wfv action advisory -> 'pro-work-files:<owner>:<work>'
-- -> family -> grant rows.
begin;
create table if not exists public.pro_work_file_comment_mentions(
 owner_id uuid not null,work_id text not null,comment_id uuid not null,recipient_id uuid not null,
 name text not null check(length(name) between 1 and 160),recipient_grant_id uuid not null,recipient_source_invite_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),primary key(comment_id,recipient_id),
 foreign key(owner_id,comment_id) references public.pro_work_file_comments(owner_id,id) on delete cascade
);
create index if not exists pro_work_file_comment_mentions_owner on public.pro_work_file_comment_mentions(owner_id,comment_id);
create table if not exists public.pro_work_file_mention_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 owner_id uuid not null,comment_id uuid not null,input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(actor_id,action_id),foreign key(owner_id,comment_id) references public.pro_work_file_comments(owner_id,id) on delete cascade
);
create table if not exists public.pro_work_file_mention_notices(
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null,owner_id uuid not null,work_id text not null,
 comment_id uuid not null,actor_id uuid not null,actor_name text not null check(length(actor_name)<=160),
 recipient_grant_id uuid not null,recipient_source_invite_id uuid not null,
 service text not null check(length(service)<=160),file_name text not null check(length(file_name) between 1 and 160),
 version_no smallint check(version_no between 1 and 100),excerpt text not null check(length(excerpt) between 1 and 280),
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 unique(comment_id,recipient_id),
 foreign key(owner_id,comment_id) references public.pro_work_file_comments(owner_id,id) on delete cascade,
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_work_file_mention_notices_page on public.pro_work_file_mention_notices(recipient_id,created_at desc,id desc);
create table if not exists public.pro_work_file_mention_notice_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 notice_id uuid not null references public.pro_work_file_mention_notices(id) on delete cascade,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

-- ===================================================================== helpers
-- Display name of a collaborator: the captured grant name, else the profile name ('' = not mentionable).
create or replace function public.pro_wfm_member_name(p_grant public.pro_team_grants) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(nullif(left(btrim(p_grant.member_name),160),''),nullif(public.pro_team_name(p_grant.member_user_id),''),'');
$$;
-- Active, enabled collaborators of one job (never the actor), ordered by name.
create or replace function public.pro_work_file_mention_targets(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('userId',x.member_user_id,'grantId',x.id,'sourceInviteId',x.source_invite_id,'name',x.name) order by lower(x.name),x.member_user_id),'[]'::jsonb) into items from(
  select g.member_user_id,g.id,g.source_invite_id,public.pro_wfm_member_name(g) name from public.pro_team_grants g join public.profiles p on p.id=g.member_user_id
  where g.owner_id=p_actor and g.work_id=p_work and g.active and not coalesce(p.is_disabled,false) and g.member_user_id<>p_actor and public.pro_wfm_member_name(g)<>''
  order by lower(public.pro_wfm_member_name(g)),g.member_user_id limit 100) x;
 return jsonb_build_object('workId',p_work,'items',items);
end $$;
create or replace function public.pro_wfm_mentions_json(p_comment uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('userId',m.recipient_id,'name',m.name) order by lower(m.name),m.recipient_id),'[]'::jsonb) from public.pro_work_file_comment_mentions m where m.comment_id=p_comment;
$$;

-- ===================================================================== write
-- Input: the exact comment_create of pro_work_file_versions_mutate (thread 'team') + mentions[1..10]
-- of {userId,grantId,sourceInviteId} taken from pro_work_file_mention_targets.
create or replace function public.pro_work_file_comment_with_mentions(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;wid text;keys text[];r public.pro_work_file_mention_actions;answer jsonb;c public.pro_work_file_comments;
 m jsonb;uid uuid;gid uuid;source uuid;target public.pro_team_grants;nm text;seen uuid[]:=array[]::uuid[];names text[]:=array[]::text[];
 service text;file_name text;vno integer;excerpt text;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 keys:=public.pro_wfv_keys(p_input);
 if jsonb_typeof(p_input) is distinct from 'object' or keys is distinct from array['action','actionId','body','commentId','fileId','mentions','thread','versionNo','workId']
  or p_input->>'action' is distinct from 'comment_create' or jsonb_typeof(p_input->'thread') is distinct from 'string' or p_input->>'thread' is distinct from 'team' then raise exception 'Invalid mention comment fields' using errcode='22023';end if;
 if jsonb_typeof(p_input->'mentions') is distinct from 'array' or jsonb_array_length(p_input->'mentions') not between 1 and 10 then raise exception 'Invalid mentions' using errcode='22023';end if;
 aid:=public.pro_wfv_uuid(p_input->'actionId');cid:=public.pro_wfv_uuid(p_input->'commentId');
 if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 wid:=p_input->>'workId';
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-wfm-action:'||p_actor::text||':'||aid::text,0));
 select * into r from public.pro_work_file_mention_actions where actor_id=p_actor and action_id=aid;
 if found then
  if r.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return r.result;
 end if;
 -- The same actionId already created a comment WITHOUT mentions: never attach mentions afterwards.
 if exists(select 1 from public.pro_work_file_version_actions where actor_id=p_actor and action_id=aid) then raise exception 'Comment identity reused' using errcode='22023';end if;
 answer:=public.pro_work_file_versions_mutate(p_actor,p_input-'mentions');
 select * into c from public.pro_work_file_comments where owner_id=p_actor and id=cid;
 if not found or c.thread<>'team' or c.author_kind<>'owner' or c.author_id<>p_actor or c.work_id<>wid then raise exception 'Comment unavailable' using errcode='42501';end if;
 for m in select value from jsonb_array_elements(p_input->'mentions') loop
  if public.pro_wfv_keys(m) is distinct from array['grantId','sourceInviteId','userId'] then raise exception 'Invalid mention target' using errcode='22023';end if;
  uid:=public.pro_wfv_uuid(m->'userId');gid:=public.pro_wfv_uuid(m->'grantId');source:=public.pro_wfv_uuid(m->'sourceInviteId');
  if uid=p_actor or uid=any(seen) then raise exception 'Invalid mention identity' using errcode='22023';end if;seen:=array_append(seen,uid);
  select * into target from public.pro_team_grants where id=gid for update;
  if not found or target.owner_id<>p_actor or target.work_id<>wid or target.member_user_id<>uid or not target.active or target.source_invite_id<>source
   or not exists(select 1 from public.profiles where id=uid and not coalesce(is_disabled,false)) then raise exception 'Mention target changed' using errcode='40001';end if;
  nm:=public.pro_wfm_member_name(target);
  if nm='' then raise exception 'Mention target changed' using errcode='40001';end if;
  if position(lower('@'||nm) in lower(c.body))=0 then raise exception 'Mention is not in the comment' using errcode='22023';end if;
  names:=array_append(names,nm);
  insert into public.pro_work_file_comment_mentions(owner_id,work_id,comment_id,recipient_id,name,recipient_grant_id,recipient_source_invite_id) values(p_actor,wid,cid,uid,nm,gid,source);
 end loop;
 -- Snapshot for the member: job service, file name of the commented (or current) version, excerpt.
 select left(coalesce(w.service,''),160) into service from public.pro_work w where w.user_id=p_actor and w.id=wid;
 vno:=c.version_no;
 select f.name into file_name from public.pro_work_file_families fam join public.pro_work_file_versions v on v.owner_id=fam.owner_id and v.family_id=fam.id and v.version_no=coalesce(vno,fam.current_version)
  join public.pro_work_files f on f.owner_id=v.owner_id and f.id=v.file_id where fam.owner_id=p_actor and fam.id=c.family_id;
 if file_name is null then select f.name into file_name from public.pro_work_files f where f.owner_id=p_actor and f.id=c.family_id;end if;
 excerpt:=case when length(c.body)>280 then left(c.body,279)||'…' else c.body end;
 insert into public.pro_work_file_mention_notices(recipient_id,owner_id,work_id,comment_id,actor_id,actor_name,recipient_grant_id,recipient_source_invite_id,service,file_name,version_no,excerpt)
  select mm.recipient_id,p_actor,wid,cid,p_actor,c.author_name,mm.recipient_grant_id,mm.recipient_source_invite_id,coalesce(service,''),file_name,vno,excerpt
  from public.pro_work_file_comment_mentions mm where mm.comment_id=cid;
 result:=jsonb_build_object('comment',answer->'comment','mentions',public.pro_wfm_mentions_json(cid));
 insert into public.pro_work_file_mention_actions(actor_id,action_id,owner_id,comment_id,input,result) values(p_actor,aid,p_actor,cid,p_input,result);
 return result;
end $$;

-- ===================================================================== owner reads
-- Recorded mentions of up to 20 comments of this owner/job (for chips in the team thread).
create or replace function public.pro_work_file_comment_mentions_read(p_actor uuid,p_work text,p_comments uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_comments is null or cardinality(p_comments) not between 1 and 20 or array_position(p_comments,null) is not null then raise exception 'Invalid comment list' using errcode='22023';end if;
 return jsonb_build_object('workId',p_work,'items',coalesce((select jsonb_agg(jsonb_build_object('commentId',c.id,'mentions',public.pro_wfm_mentions_json(c.id)) order by c.id)
  from public.pro_work_file_comments c where c.owner_id=p_actor and c.work_id=p_work and c.thread='team' and c.id=any(p_comments)
  and exists(select 1 from public.pro_work_file_comment_mentions m where m.comment_id=c.id)),'[]'::jsonb));
end $$;

-- ===================================================================== member inbox
create or replace function public.pro_work_file_mention_notice_allowed(p_actor uuid,p_notice public.pro_work_file_mention_notices) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select p_notice.recipient_id=p_actor and exists(select 1 from public.profiles p where p.id=p_actor and not coalesce(p.is_disabled,false))
 and coalesce(public.pro_private_work_tools_enabled(p_notice.owner_id),false)
 and exists(select 1 from public.pro_work_file_comments c where c.owner_id=p_notice.owner_id and c.id=p_notice.comment_id and c.thread='team' and c.archived_at is null)
 and exists(select 1 from public.pro_team_grants g where g.id=p_notice.recipient_grant_id and g.owner_id=p_notice.owner_id and g.work_id=p_notice.work_id
  and g.member_user_id=p_actor and g.active and g.source_invite_id=p_notice.recipient_source_invite_id);
$$;
-- Never returns owner/job/file identifiers: the member has no file access.
create or replace function public.pro_work_file_mention_notice_json(p_notice public.pro_work_file_mention_notices) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_notice.id,'service',p_notice.service,'fileName',p_notice.file_name,'versionNo',p_notice.version_no,'authorName',p_notice.actor_name,
  'excerpt',p_notice.excerpt,'createdAt',p_notice.created_at,'dayCr',public.pro_wfv_day(p_notice.created_at),'readAt',p_notice.read_at);
$$;
create or replace function public.pro_work_file_mention_inbox(p_actor uuid,p_status text default 'unread',p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor_id uuid;cursor_at timestamptz;unread_count bigint;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status is null or p_status not in('all','unread') then raise exception 'Invalid inbox status' using errcode='22023';end if;
 if p_after is not null then
  select created_at into cursor_at from public.pro_work_file_mention_notices n where n.id=p_after and public.pro_work_file_mention_notice_allowed(p_actor,n) and(p_status='all' or n.read_at is null);
  if not found then raise exception 'Invalid notice cursor' using errcode='22023';end if;
 end if;
 select count(*) into unread_count from public.pro_work_file_mention_notices n where n.recipient_id=p_actor and n.read_at is null and public.pro_work_file_mention_notice_allowed(p_actor,n);
 select coalesce(jsonb_agg(public.pro_work_file_mention_notice_json(n::public.pro_work_file_mention_notices) order by n.created_at desc,n.id desc),'[]'::jsonb) into items from(
  select * from public.pro_work_file_mention_notices n where n.recipient_id=p_actor and public.pro_work_file_mention_notice_allowed(p_actor,n) and(p_status='all' or n.read_at is null)
  and(p_after is null or(n.created_at,n.id)<(cursor_at,p_after)) order by n.created_at desc,n.id desc limit 21) n;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor_id,'unreadCount',unread_count);
end $$;
create or replace function public.pro_work_file_mention_notice_mark_read(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n public.pro_work_file_mention_notices;r public.pro_work_file_mention_notice_actions;aid uuid;nid uuid;answer jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or public.pro_wfv_keys(p_input) is distinct from array['action','actionId','noticeId'] or p_input->>'action' is distinct from 'mark_read' then raise exception 'Invalid notice action' using errcode='22023';end if;
 aid:=public.pro_wfv_uuid(p_input->'actionId');nid:=public.pro_wfv_uuid(p_input->'noticeId');
 perform pg_advisory_xact_lock(hashtextextended('pro-wfm-notice:'||p_actor::text||':'||aid::text,0));
 select * into r from public.pro_work_file_mention_notice_actions where actor_id=p_actor and action_id=aid;
 if found then
  if r.input is distinct from p_input then raise exception 'Notice action reused' using errcode='22023';end if;
  select * into n from public.pro_work_file_mention_notices where id=r.notice_id;
  if not found or not public.pro_work_file_mention_notice_allowed(p_actor,n) then raise exception 'Notice unavailable' using errcode='42501';end if;
  return r.result;
 end if;
 select * into n from public.pro_work_file_mention_notices where id=nid;
 if not found then raise exception 'Notice unavailable' using errcode='42501';end if;
 perform 1 from public.pro_team_grants where id=n.recipient_grant_id for share;
 select * into n from public.pro_work_file_mention_notices where id=nid for update;
 if not public.pro_work_file_mention_notice_allowed(p_actor,n) then raise exception 'Notice unavailable' using errcode='42501';end if;
 if n.read_at is null then update public.pro_work_file_mention_notices set read_at=clock_timestamp() where id=nid returning * into n;end if;
 answer:=jsonb_build_object('noticeId',n.id,'readAt',n.read_at);
 insert into public.pro_work_file_mention_notice_actions(actor_id,action_id,notice_id,input,result) values(p_actor,aid,nid,p_input,answer);
 return answer;
end $$;

-- ===================================================================== immutability
create or replace function public.pro_wfm_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'File mentions and receipts are immutable' using errcode='23514';end $$;
create or replace function public.pro_wfm_notice_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (to_jsonb(new)-'read_at') is distinct from (to_jsonb(old)-'read_at') or old.read_at is not null or new.read_at is null then raise exception 'Notice content is immutable' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_wfm_mentions_immutable on public.pro_work_file_comment_mentions;
create trigger pro_wfm_mentions_immutable before update on public.pro_work_file_comment_mentions for each row execute function public.pro_wfm_immutable();
drop trigger if exists pro_wfm_actions_immutable on public.pro_work_file_mention_actions;
create trigger pro_wfm_actions_immutable before update on public.pro_work_file_mention_actions for each row execute function public.pro_wfm_immutable();
drop trigger if exists pro_wfm_notice_actions_immutable on public.pro_work_file_mention_notice_actions;
create trigger pro_wfm_notice_actions_immutable before update on public.pro_work_file_mention_notice_actions for each row execute function public.pro_wfm_immutable();
drop trigger if exists pro_wfm_notice_guard on public.pro_work_file_mention_notices;
create trigger pro_wfm_notice_guard before update on public.pro_work_file_mention_notices for each row execute function public.pro_wfm_notice_guard();

alter table public.pro_work_file_comment_mentions enable row level security;
alter table public.pro_work_file_mention_actions enable row level security;
alter table public.pro_work_file_mention_notices enable row level security;
alter table public.pro_work_file_mention_notice_actions enable row level security;
revoke all on public.pro_work_file_comment_mentions,public.pro_work_file_mention_actions,public.pro_work_file_mention_notices,public.pro_work_file_mention_notice_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_file_comment_mentions,public.pro_work_file_mention_actions,public.pro_work_file_mention_notices,public.pro_work_file_mention_notice_actions to service_role;
revoke all on function public.pro_wfm_member_name(public.pro_team_grants),public.pro_work_file_mention_targets(uuid,text),public.pro_wfm_mentions_json(uuid),
 public.pro_work_file_comment_with_mentions(uuid,jsonb),public.pro_work_file_comment_mentions_read(uuid,text,uuid[]),
 public.pro_work_file_mention_notice_allowed(uuid,public.pro_work_file_mention_notices),public.pro_work_file_mention_notice_json(public.pro_work_file_mention_notices),
 public.pro_work_file_mention_inbox(uuid,text,uuid),public.pro_work_file_mention_notice_mark_read(uuid,jsonb),public.pro_wfm_immutable(),public.pro_wfm_notice_guard() from public,anon,authenticated;
grant execute on function public.pro_wfm_member_name(public.pro_team_grants),public.pro_work_file_mention_targets(uuid,text),public.pro_wfm_mentions_json(uuid),
 public.pro_work_file_comment_with_mentions(uuid,jsonb),public.pro_work_file_comment_mentions_read(uuid,text,uuid[]),
 public.pro_work_file_mention_notice_allowed(uuid,public.pro_work_file_mention_notices),public.pro_work_file_mention_notice_json(public.pro_work_file_mention_notices),
 public.pro_work_file_mention_inbox(uuid,text,uuid),public.pro_work_file_mention_notice_mark_read(uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
