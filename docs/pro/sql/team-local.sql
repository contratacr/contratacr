-- LOCAL PRO ONLY. Owner-scoped team access, manual invitation codes and real-actor audit.
-- Codes are SHA256 hashes supplied by the server; no raw code, email delivery or impersonation.
begin;
create table if not exists public.pro_team_invites(
 id uuid primary key,owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,
 recipient_email text not null check(length(recipient_email) between 3 and 254 and recipient_email=lower(btrim(recipient_email))),
 role text not null check(role in('viewer','contributor')),token_sha256 text not null unique check(token_sha256~'^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in('pending','accepted','revoked')),revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),expires_at timestamptz not null,accepted_by uuid,grant_id uuid,accept_action_id uuid,
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_team_invites_page on public.pro_team_invites(owner_id,work_id,id);
create table if not exists public.pro_team_grants(
 id uuid primary key,owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,
 -- Captured member identity must not block deletion of a collaborator account.
 member_user_id uuid not null,member_name text not null default '' check(length(member_name)<=160),
 role text not null check(role in('viewer','contributor')),active boolean not null default true,revision integer not null default 1 check(revision>0),
 source_invite_id uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,work_id,member_user_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_team_grants_member_page on public.pro_team_grants(member_user_id,id) where active;
create index if not exists pro_team_grants_owner_page on public.pro_team_grants(owner_id,work_id,id);
create table if not exists public.pro_team_comments(
 id uuid primary key,owner_id uuid not null,work_id text not null,actor_id uuid not null,actor_name text not null check(length(actor_name)<=160),
 text text not null check(length(btrim(text)) between 1 and 1000),at timestamptz not null default now(),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_team_comments_page on public.pro_team_comments(owner_id,work_id,at desc,id desc);
create table if not exists public.pro_team_events(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,work_id text not null,actor_id uuid not null,actor_name text not null check(length(actor_name)<=160),
 action_id uuid not null,action text not null check(action in('invite','accept','cancel_invite','set_role','revoke','comment','complete','reopen')),
 task_id uuid,title text,grant_id uuid,role text check(role in('viewer','contributor')),before_projected jsonb,after_projected jsonb,at timestamptz not null default now(),
 unique(actor_id,action_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_team_events_page on public.pro_team_events(owner_id,work_id,at desc,id desc);
create table if not exists public.pro_team_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,owner_id uuid not null,work_id text not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create or replace function public.pro_team_name(p_actor uuid) returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select left(btrim(full_name),160) from public.profiles where id=p_actor),'');
$$;
create or replace function public.pro_team_invite_json(p_invite public.pro_team_invites) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_invite.id,'ownerId',p_invite.owner_id,'workId',p_invite.work_id,'email',p_invite.recipient_email,'role',p_invite.role,
 'status',case when p_invite.status='pending' and p_invite.expires_at<=now() then 'expired' else p_invite.status end,
 'revision',p_invite.revision,'createdAt',p_invite.created_at,'expiresAt',p_invite.expires_at);
$$;
create or replace function public.pro_team_grant_json(p_grant public.pro_team_grants) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_grant.id,'ownerId',p_grant.owner_id,'workId',p_grant.work_id,'userId',p_grant.member_user_id,'displayName',p_grant.member_name,'role',p_grant.role,'active',p_grant.active,'revision',p_grant.revision);
$$;
create or replace function public.pro_team_shared_grant_json(p_grant public.pro_team_grants,p_actor uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_grant.id,'workId',p_grant.work_id,'role',p_grant.role,'revision',p_grant.revision,'ownerId',p_grant.owner_id,
 'ownerName',coalesce(nullif(left(btrim(p.business_name),160),''),public.pro_team_name(p_grant.owner_id)),
 'service',w.service,'stage',w.stage,'cancelled',coalesce(w.cancelled,false),'canContribute',p_actor=p_grant.owner_id or (p_grant.active and p_grant.role='contributor'))
 from public.pro_work w left join public.professionals p on p.profile_id=w.user_id where w.user_id=p_grant.owner_id and w.id=p_grant.work_id;
$$;
create or replace function public.pro_team_task_json(p_task public.pro_work_tasks) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_task.id,'title',p_task.title,'dueDate',case when p_task.due_date is null then null else to_char(p_task.due_date,'YYYY-MM-DD') end,'status',p_task.status,'revision',p_task.revision);
$$;
create or replace function public.pro_team_comment_json(p_comment public.pro_team_comments) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_comment.id,'actorId',p_comment.actor_id,'actorName',p_comment.actor_name,'text',p_comment.text,'at',p_comment.at);
$$;
create or replace function public.pro_team_context(p_actor uuid,p_grant uuid,p_write boolean default false) returns public.pro_team_grants
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into g from public.pro_team_grants where id=p_grant;
 if not found or not coalesce(public.pro_appointment_enabled(g.owner_id),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_actor<>g.owner_id and (g.member_user_id<>p_actor or not g.active or p_write and g.role<>'contributor') then raise exception 'Forbidden' using errcode='42501';end if;
 return g;
end $$;
create or replace function public.pro_team_owned_read(p_actor uuid,p_after text default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor_id text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_after is not null and (length(p_after) not between 1 and 160 or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_after)) then raise exception 'Invalid team work cursor' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'service',w.service,'stage',w.stage,'cancelled',coalesce(w.cancelled,false),'start',w.start) order by w.id),'[]'::jsonb) into items from (
  select id,service,stage,cancelled,start from public.pro_work where user_id=p_actor and (p_after is null or id>p_after) order by id limit 21
 ) w;
 if jsonb_array_length(items)>20 then cursor_id:=items->19->>'id';items:=items-20;end if;return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_team_owner_read(p_actor uuid,p_work text,p_kind text default 'members',p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor_id uuid;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_kind is null or p_kind not in('members','invites') then raise exception 'Invalid team view' using errcode='22023';end if;
 if p_kind='members' then
  if p_after is not null and not exists(select 1 from public.pro_team_grants where owner_id=p_actor and work_id=p_work and id=p_after) then raise exception 'Invalid member cursor' using errcode='22023';end if;
  select coalesce(jsonb_agg(public.pro_team_grant_json(g::public.pro_team_grants) order by g.id),'[]'::jsonb) into items from (select * from public.pro_team_grants where owner_id=p_actor and work_id=p_work and (p_after is null or id>p_after) order by id limit 21) g;
 else
  if p_after is not null and not exists(select 1 from public.pro_team_invites where owner_id=p_actor and work_id=p_work and id=p_after) then raise exception 'Invalid invitation cursor' using errcode='22023';end if;
  select coalesce(jsonb_agg(public.pro_team_invite_json(i::public.pro_team_invites) order by i.id),'[]'::jsonb) into items from (select * from public.pro_team_invites where owner_id=p_actor and work_id=p_work and (p_after is null or id>p_after) order by id limit 21) i;
 end if;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('workId',p_work,'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_team_shared_read(p_actor uuid,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor_id uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_after is not null and not exists(select 1 from public.pro_team_grants where id=p_after and member_user_id=p_actor and active and public.pro_appointment_enabled(owner_id)) then raise exception 'Invalid shared-work cursor' using errcode='22023';end if;
 select coalesce(jsonb_agg(public.pro_team_shared_grant_json(g::public.pro_team_grants,p_actor) order by g.id),'[]'::jsonb) into items from (select * from public.pro_team_grants where member_user_id=p_actor and active and public.pro_appointment_enabled(owner_id) and (p_after is null or id>p_after) order by id limit 21) g;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('items',items,'nextCursor',cursor_id,'canManage',coalesce(public.pro_appointment_enabled(p_actor),false));
end $$;
create or replace function public.pro_team_tasks_read(p_actor uuid,p_grant uuid,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;items jsonb;cursor_id uuid;cursor_due date;
begin
 g:=public.pro_team_context(p_actor,p_grant,false);
 if p_after is not null then select coalesce(due_date,date '9999-12-31') into cursor_due from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and not archived and id=p_after;if not found then raise exception 'Invalid team task cursor' using errcode='22023';end if;end if;
 select coalesce(jsonb_agg(public.pro_team_task_json(t::public.pro_work_tasks) order by t.due_date asc nulls last,t.id),'[]'::jsonb) into items from (
  select * from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and not archived and (p_after is null or (coalesce(due_date,date '9999-12-31'),id)>(cursor_due,p_after)) order by due_date asc nulls last,id limit 21
 ) t;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('grant',public.pro_team_shared_grant_json(g,p_actor),'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_team_comments_read(p_actor uuid,p_grant uuid,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;items jsonb;cursor_id uuid;cursor_at timestamptz;
begin
 g:=public.pro_team_context(p_actor,p_grant,false);
 if p_after is not null then select at into cursor_at from public.pro_team_comments where owner_id=g.owner_id and work_id=g.work_id and id=p_after;if not found then raise exception 'Invalid team comment cursor' using errcode='22023';end if;end if;
 select coalesce(jsonb_agg(public.pro_team_comment_json(c::public.pro_team_comments) order by c.at desc,c.id desc),'[]'::jsonb) into items from (select * from public.pro_team_comments where owner_id=g.owner_id and work_id=g.work_id and (p_after is null or (at,id)<(cursor_at,p_after)) order by at desc,id desc limit 21) c;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('grant',public.pro_team_shared_grant_json(g,p_actor),'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_team_audit_read(p_actor uuid,p_work text,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor_id uuid;cursor_at timestamptz;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_after is not null then select at into cursor_at from public.pro_team_events where owner_id=p_actor and work_id=p_work and id=p_after;if not found then raise exception 'Invalid audit cursor' using errcode='22023';end if;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'actionId',e.action_id,'actorId',e.actor_id,'actorName',e.actor_name,'action',e.action,'at',e.at,'taskId',e.task_id,'title',e.title,'grantId',e.grant_id,'role',e.role) order by e.at desc,e.id desc),'[]'::jsonb) into items from (
  select * from public.pro_team_events where owner_id=p_actor and work_id=p_work and (p_after is null or (at,id)<(cursor_at,p_after)) order by at desc,id desc limit 21
 ) e;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('workId',p_work,'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_team_mutate(p_actor uuid,p_input jsonb,p_verified_email text default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;owner uuid;wid text;gid uuid;iid uuid;tid uuid;rev integer;keys text[];email text;code_hash text;wanted_role text;body_text text;
 i public.pro_team_invites;g public.pro_team_grants;t public.pro_work_tasks;r public.pro_team_actions;c public.pro_team_comments;
 before_json jsonb;after_json jsonb;full_before jsonb;answer jsonb;actor_name text;event_task uuid;event_title text;event_grant uuid;event_role text;has_grant boolean;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid team operation' using errcode='22023';end if;
 act:=p_input->>'action';
 if act is null or act not in('invite','accept','cancel_invite','set_role','revoke','comment','complete','reopen') or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid team identity' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if act='invite' then
  if keys<>array['action','actionId','codeHash','email','role','workId'] or jsonb_typeof(p_input->'email') is distinct from 'string' or jsonb_typeof(p_input->'role') is distinct from 'string' then raise exception 'Invalid invitation fields' using errcode='22023';end if;
  email:=p_input->>'email';wanted_role:=p_input->>'role';
  if email<>lower(btrim(email)) or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or wanted_role not in('viewer','contributor') then raise exception 'Invalid invitation' using errcode='22023';end if;
 elsif act='accept' then
  if keys<>array['action','actionId','codeHash'] then raise exception 'Invalid acceptance fields' using errcode='22023';end if;
 elsif act='cancel_invite' then
  if keys<>array['action','actionId','inviteId','revision','workId'] or jsonb_typeof(p_input->'inviteId') is distinct from 'string' then raise exception 'Invalid invitation cancellation' using errcode='22023';end if;iid:=(p_input->>'inviteId')::uuid;
 elsif act in('set_role','revoke') then
  if (act='set_role' and keys<>array['action','actionId','grantId','revision','role','workId']) or (act='revoke' and keys<>array['action','actionId','grantId','revision','workId']) or jsonb_typeof(p_input->'grantId') is distinct from 'string' then raise exception 'Invalid member change' using errcode='22023';end if;
  gid:=(p_input->>'grantId')::uuid;
  if act='set_role' then wanted_role:=p_input->>'role';if jsonb_typeof(p_input->'role') is distinct from 'string' or wanted_role not in('viewer','contributor') then raise exception 'Invalid role' using errcode='22023';end if;end if;
 elsif act='comment' then
  if keys<>array['action','actionId','grantId','text'] or jsonb_typeof(p_input->'grantId') is distinct from 'string' or jsonb_typeof(p_input->'text') is distinct from 'string' then raise exception 'Invalid team comment' using errcode='22023';end if;
  gid:=(p_input->>'grantId')::uuid;body_text:=btrim(p_input->>'text');if length(body_text) not between 1 and 1000 then raise exception 'Invalid comment' using errcode='22023';end if;
 else
  if keys<>array['action','actionId','grantId','revision','taskId'] or jsonb_typeof(p_input->'grantId') is distinct from 'string' or jsonb_typeof(p_input->'taskId') is distinct from 'string' then raise exception 'Invalid team task action' using errcode='22023';end if;
  gid:=(p_input->>'grantId')::uuid;tid:=(p_input->>'taskId')::uuid;
 end if;
 if act in('invite','accept') then
  if jsonb_typeof(p_input->'codeHash') is distinct from 'string' or not coalesce((p_input->>'codeHash')~'^[a-f0-9]{64}$',false) then raise exception 'Invalid code hash' using errcode='22023';end if;code_hash:=p_input->>'codeHash';
 end if;
 if act in('cancel_invite','set_role','revoke','complete','reopen') then
  if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;rev:=(p_input->>'revision')::integer;
 end if;
 if act in('invite','cancel_invite','set_role','revoke') then
  if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid job identity' using errcode='22023';end if;owner:=p_actor;wid:=p_input->>'workId';
  if not coalesce(public.pro_appointment_enabled(owner),false) or not exists(select 1 from public.pro_work where user_id=owner and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 elsif act='accept' then
  select * into i from public.pro_team_invites where token_sha256=code_hash;
  if not found or p_verified_email is null or lower(btrim(p_verified_email)) is distinct from i.recipient_email or i.owner_id=p_actor or not coalesce(public.pro_appointment_enabled(i.owner_id),false) then raise exception 'Code unavailable' using errcode='42501';end if;owner:=i.owner_id;wid:=i.work_id;
 else
  g:=public.pro_team_context(p_actor,gid,true);owner:=g.owner_id;wid:=g.work_id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-team-action:'||p_actor::text||':'||aid::text,0));
 -- Match the existing owner task writer: owner/work advisory, grant, task.
 -- Revocation and role changes take this identical lock before returning receipts.
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||owner::text||':'||wid,0));
 if act='accept' then
  select * into i from public.pro_team_invites where token_sha256=code_hash for update;
  if not found or i.owner_id<>owner or i.work_id<>wid or p_verified_email is null or lower(btrim(p_verified_email)) is distinct from i.recipient_email or not coalesce(public.pro_appointment_enabled(owner),false) then raise exception 'Code unavailable' using errcode='42501';end if;
  select * into g from public.pro_team_grants where owner_id=owner and work_id=wid and member_user_id=p_actor for update;has_grant:=found;
  if i.status='accepted' then
   if i.accepted_by is distinct from p_actor or i.accept_action_id is distinct from aid or not has_grant or not g.active or g.id is distinct from i.grant_id or g.source_invite_id is distinct from i.id then raise exception 'Code unavailable' using errcode='42501';end if;
  elsif i.status<>'pending' or i.expires_at<=now() or has_grant and g.active then raise exception 'Code unavailable' using errcode='42501';end if;
 elsif act='cancel_invite' then
  select * into i from public.pro_team_invites where id=iid and owner_id=owner and work_id=wid for update;if not found then raise exception 'Forbidden' using errcode='42501';end if;
 elsif act in('set_role','revoke') then
  select * into g from public.pro_team_grants where id=gid and owner_id=owner and work_id=wid for update;if not found then raise exception 'Forbidden' using errcode='42501';end if;
 elsif act in('comment','complete','reopen') then
  select * into g from public.pro_team_grants where id=gid for update;if not found then raise exception 'Forbidden' using errcode='42501';end if;
  g:=public.pro_team_context(p_actor,gid,true);
  if g.owner_id<>owner or g.work_id<>wid then raise exception 'Forbidden' using errcode='42501';end if;
  if act in('complete','reopen') then
   select * into t from public.pro_work_tasks where owner_id=owner and work_id=wid and id=tid and not archived for update;if not found then raise exception 'Forbidden' using errcode='42501';end if;
  end if;
 end if;
 if not coalesce(public.pro_appointment_enabled(owner),false) or not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 -- Never return an old committed result to a revoked/downgraded collaborator.
 select * into r from public.pro_team_actions where actor_id=p_actor and action_id=aid;
 if found then
  if r.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return r.result;
 end if;
 actor_name:=public.pro_team_name(p_actor);
 if act='invite' then
  insert into public.pro_team_invites(id,owner_id,work_id,recipient_email,role,token_sha256,expires_at) values(aid,owner,wid,email,wanted_role,code_hash,now()+interval '72 hours') returning * into i;
  after_json:=jsonb_build_object('role',i.role,'status',i.status,'revision',i.revision);event_role:=i.role;
  answer:=jsonb_build_object('action',act,'ownerId',owner,'workId',wid,'invite',public.pro_team_invite_json(i));
 elsif act='accept' then
  if i.status<>'pending' then raise exception 'Code unavailable' using errcode='42501';end if;
  if has_grant then
   before_json:=jsonb_build_object('role',g.role,'active',g.active,'revision',g.revision);
   if g.revision>=2147483647 then raise exception 'Member revision exhausted' using errcode='54000';end if;
   update public.pro_team_grants set role=i.role,active=true,revision=revision+1,source_invite_id=i.id,member_name=actor_name,updated_at=now() where id=g.id returning * into g;
  else
   insert into public.pro_team_grants(id,owner_id,work_id,member_user_id,member_name,role,source_invite_id) values(gen_random_uuid(),owner,wid,p_actor,actor_name,i.role,i.id) returning * into g;
  end if;
  update public.pro_team_invites set status='accepted',revision=revision+1,accepted_by=p_actor,grant_id=g.id,accept_action_id=aid where id=i.id returning * into i;
  after_json:=jsonb_build_object('role',g.role,'active',g.active,'revision',g.revision);event_grant:=g.id;event_role:=g.role;
  answer:=jsonb_build_object('action',act,'ownerId',owner,'workId',wid,'grant',public.pro_team_grant_json(g));
 elsif act='cancel_invite' then
  if rev<>i.revision or i.status='accepted' then raise exception 'Invitation changed' using errcode='40001';end if;
  if i.status<>'pending' then raise exception 'Invitation unavailable' using errcode='22023';end if;
  before_json:=jsonb_build_object('role',i.role,'status',i.status,'revision',i.revision);
  update public.pro_team_invites set status='revoked',revision=revision+1 where id=i.id returning * into i;
  after_json:=jsonb_build_object('role',i.role,'status',i.status,'revision',i.revision);event_role:=i.role;
  answer:=jsonb_build_object('action',act,'ownerId',owner,'workId',wid,'invite',public.pro_team_invite_json(i));
 elsif act in('set_role','revoke') then
  if rev<>g.revision or not g.active then raise exception 'Member changed' using errcode='40001';end if;
  before_json:=jsonb_build_object('role',g.role,'active',g.active,'revision',g.revision);
  update public.pro_team_grants set role=case when act='set_role' then wanted_role else role end,active=act<>'revoke',revision=revision+1,updated_at=now() where id=g.id returning * into g;
  after_json:=jsonb_build_object('role',g.role,'active',g.active,'revision',g.revision);event_grant:=g.id;event_role:=g.role;
  answer:=jsonb_build_object('action',act,'ownerId',owner,'workId',wid,'grant',public.pro_team_grant_json(g));
 elsif act='comment' then
  insert into public.pro_team_comments(id,owner_id,work_id,actor_id,actor_name,text) values(aid,owner,wid,p_actor,actor_name,body_text) returning * into c;
  after_json:=jsonb_build_object('commentId',c.id);event_grant:=g.id;event_role:=g.role;
  answer:=jsonb_build_object('action',act,'ownerId',owner,'workId',wid,'comment',public.pro_team_comment_json(c));
 else
  if rev<>t.revision then raise exception 'Task changed' using errcode='40001';end if;
  if act='complete' and t.status<>'open' or act='reopen' and t.status<>'done' then raise exception 'Invalid task transition' using errcode='22023';end if;
  full_before:=public.pro_work_task_json(t);before_json:=public.pro_team_task_json(t);
  update public.pro_work_tasks set status=case when act='complete' then 'done' else 'open' end,revision=revision+1,updated_at=now() where owner_id=owner and id=tid returning * into t;
  after_json:=public.pro_team_task_json(t);event_task:=t.id;event_title:=t.title;event_grant:=g.id;event_role:=g.role;
  -- owner_id below is storage scope, NOT the actor. Real actor is recorded in
  -- team_events/actions; never call the existing owner mutation as p_owner.
  insert into public.pro_work_task_history(owner_id,work_id,task_id,action_id,action,before_task,after_task) values(owner,wid,tid,aid,act,full_before,public.pro_work_task_json(t));
  answer:=jsonb_build_object('action',act,'ownerId',owner,'workId',wid,'task',after_json);
 end if;
 insert into public.pro_team_events(owner_id,work_id,actor_id,actor_name,action_id,action,task_id,title,grant_id,role,before_projected,after_projected)
 values(owner,wid,p_actor,actor_name,aid,act,event_task,event_title,event_grant,event_role,before_json,after_json);
 insert into public.pro_team_actions(actor_id,action_id,owner_id,work_id,input,result) values(p_actor,aid,owner,wid,p_input,answer);return answer;
end $$;
create or replace function public.pro_team_action_read(p_actor uuid,p_action uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_team_actions;i public.pro_team_invites;g public.pro_team_grants;t public.pro_work_tasks;c public.pro_team_comments;act text;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_team_actions where actor_id=p_actor and action_id=p_action;if not found then return null;end if;act:=r.input->>'action';
 if act in('invite','cancel_invite','set_role','revoke') then
  if r.owner_id<>p_actor or not coalesce(public.pro_appointment_enabled(p_actor),false) or not exists(select 1 from public.pro_work where user_id=p_actor and id=r.work_id) then raise exception 'Forbidden' using errcode='42501';end if;
  if act in('invite','cancel_invite') then
   select * into i from public.pro_team_invites where id=case when act='invite' then p_action else (r.input->>'inviteId')::uuid end and owner_id=p_actor and work_id=r.work_id;
   if not found then return null;end if;
   return jsonb_build_object('action',act,'ownerId',r.owner_id,'workId',r.work_id,'invite',public.pro_team_invite_json(i));
  end if;
  select * into g from public.pro_team_grants where id=(r.input->>'grantId')::uuid and owner_id=p_actor and work_id=r.work_id;if not found then return null;end if;
  return jsonb_build_object('action',act,'ownerId',r.owner_id,'workId',r.work_id,'grant',public.pro_team_grant_json(g));
 elsif act='accept' then
  select * into i from public.pro_team_invites where token_sha256=r.input->>'codeHash';
  if not found or i.status<>'accepted' or i.accepted_by is distinct from p_actor or i.accept_action_id is distinct from p_action then raise exception 'Forbidden' using errcode='42501';end if;
  g:=public.pro_team_context(p_actor,i.grant_id,false);
  if not g.active or g.source_invite_id<>i.id or g.owner_id<>r.owner_id or g.work_id<>r.work_id then raise exception 'Forbidden' using errcode='42501';end if;
  return jsonb_build_object('action',act,'ownerId',r.owner_id,'workId',r.work_id,'grant',public.pro_team_grant_json(g));
 else
  g:=public.pro_team_context(p_actor,(r.input->>'grantId')::uuid,true);
  if g.owner_id<>r.owner_id or g.work_id<>r.work_id then raise exception 'Forbidden' using errcode='42501';end if;
  if act='comment' then
   select * into c from public.pro_team_comments where id=p_action and owner_id=r.owner_id and work_id=r.work_id and actor_id=p_actor;if not found then return null;end if;
   return jsonb_build_object('action',act,'ownerId',r.owner_id,'workId',r.work_id,'comment',public.pro_team_comment_json(c));
  end if;
  select * into t from public.pro_work_tasks where owner_id=r.owner_id and work_id=r.work_id and id=(r.input->>'taskId')::uuid and not archived;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  return jsonb_build_object('action',act,'ownerId',r.owner_id,'workId',r.work_id,'task',public.pro_team_task_json(t));
 end if;
end $$;
create or replace function public.pro_team_append_only() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Team comments, events and receipts are append-only' using errcode='23514';end $$;
drop trigger if exists pro_team_comments_immutable on public.pro_team_comments;
create trigger pro_team_comments_immutable before update on public.pro_team_comments for each row execute function public.pro_team_append_only();
drop trigger if exists pro_team_events_immutable on public.pro_team_events;
create trigger pro_team_events_immutable before update on public.pro_team_events for each row execute function public.pro_team_append_only();
drop trigger if exists pro_team_actions_immutable on public.pro_team_actions;
create trigger pro_team_actions_immutable before update on public.pro_team_actions for each row execute function public.pro_team_append_only();
alter table public.pro_team_invites enable row level security;alter table public.pro_team_grants enable row level security;alter table public.pro_team_comments enable row level security;alter table public.pro_team_events enable row level security;alter table public.pro_team_actions enable row level security;
revoke all on public.pro_team_invites,public.pro_team_grants,public.pro_team_comments,public.pro_team_events,public.pro_team_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_team_invites,public.pro_team_grants,public.pro_team_comments,public.pro_team_events,public.pro_team_actions to service_role;
revoke all on function public.pro_team_name(uuid),public.pro_team_invite_json(public.pro_team_invites),public.pro_team_grant_json(public.pro_team_grants),public.pro_team_shared_grant_json(public.pro_team_grants,uuid),public.pro_team_task_json(public.pro_work_tasks),public.pro_team_comment_json(public.pro_team_comments),public.pro_team_context(uuid,uuid,boolean),public.pro_team_owned_read(uuid,text),public.pro_team_owner_read(uuid,text,text,uuid),public.pro_team_shared_read(uuid,uuid),public.pro_team_tasks_read(uuid,uuid,uuid),public.pro_team_comments_read(uuid,uuid,uuid),public.pro_team_audit_read(uuid,text,uuid),public.pro_team_mutate(uuid,jsonb,text),public.pro_team_action_read(uuid,uuid),public.pro_team_append_only() from public,anon,authenticated;
grant execute on function public.pro_team_name(uuid),public.pro_team_invite_json(public.pro_team_invites),public.pro_team_grant_json(public.pro_team_grants),public.pro_team_shared_grant_json(public.pro_team_grants,uuid),public.pro_team_task_json(public.pro_work_tasks),public.pro_team_comment_json(public.pro_team_comments),public.pro_team_context(uuid,uuid,boolean),public.pro_team_owned_read(uuid,text),public.pro_team_owner_read(uuid,text,text,uuid),public.pro_team_shared_read(uuid,uuid),public.pro_team_tasks_read(uuid,uuid,uuid),public.pro_team_comments_read(uuid,uuid,uuid),public.pro_team_audit_read(uuid,text,uuid),public.pro_team_mutate(uuid,jsonb,text),public.pro_team_action_read(uuid,uuid) to service_role;
commit;
