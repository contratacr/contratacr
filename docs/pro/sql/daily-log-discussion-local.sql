-- LOCAL PRO ONLY. Append-only comments on immutable published versions/channels.
-- No draft access, storage, notifications, messages, outbox, email or billing writes.
begin;
create table if not exists public.pro_daily_log_comments(
 id uuid primary key,owner_id uuid not null,work_id text not null,log_id uuid not null,version integer not null,channel text not null check(channel in('client','team')),
 actor_id uuid not null,actor_name text not null check(length(actor_name)<=160),actor_side text not null check(actor_side in('owner','client','team')),grant_id uuid,source_invite_id uuid,
 text text not null check(length(btrim(text)) between 1 and 1000),at timestamptz not null default now(),
 foreign key(owner_id,work_id,log_id,version) references public.pro_daily_log_versions(owner_id,work_id,log_id,version) on delete cascade,
 check((actor_side='team')=(grant_id is not null and source_invite_id is not null)),check(actor_side='team' or grant_id is null and source_invite_id is null)
);
create index if not exists pro_daily_log_comments_thread on pro_daily_log_comments(owner_id,work_id,log_id,version,channel,at,id);
create table if not exists public.pro_daily_log_comment_actions(
 actor_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,owner_id uuid not null references profiles(id) on delete cascade,
 work_id text not null,log_id uuid not null,version integer not null,channel text not null check(channel in('client','team')),generation uuid,input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id),
 foreign key(owner_id,work_id,log_id,version) references pro_daily_log_versions(owner_id,work_id,log_id,version) on delete cascade
);
create or replace function public.pro_daily_log_comment_json(p_comment public.pro_daily_log_comments) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$select jsonb_build_object('id',p_comment.id,'actorId',p_comment.actor_id,'actorName',p_comment.actor_name,'text',p_comment.text,'at',p_comment.at)$$;
create or replace function public.pro_daily_log_discussion_context(p_actor uuid,p_scope jsonb,p_write boolean default false,p_generation uuid default null,p_check_generation boolean default false) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare side text;wid text;lid uuid;ver integer;channel_name text;own uuid;g pro_team_grants;r pro_appointment_requests;keys text[];expected text[];can_write boolean;begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_scope) is distinct from 'object' or jsonb_typeof(p_scope->'side') is distinct from 'string' or jsonb_typeof(p_scope->'logId') is distinct from 'string' or jsonb_typeof(p_scope->'version') is distinct from 'number' or not coalesce((p_scope->>'version')~'^[0-9]{1,10}$',false) or(p_scope->>'version')::numeric not between 1 and 2147483647 or jsonb_typeof(p_scope->'channel') is distinct from 'string' then raise exception 'Invalid discussion scope' using errcode='22023';end if;
 side:=p_scope->>'side';lid:=(p_scope->>'logId')::uuid;ver:=(p_scope->>'version')::integer;channel_name:=p_scope->>'channel';
 if side='owner' then expected:=array['channel','logId','side','version','workId'];elsif side='client' then expected:=array['channel','logId','requestId','side','version'];elsif side='team' then expected:=array['channel','grantId','logId','side','version'];else raise exception 'Invalid discussion side' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_scope)key;if keys is distinct from expected then raise exception 'Unexpected discussion scope fields' using errcode='22023';end if;
 if side='owner' then
  if channel_name not in('client','team') or jsonb_typeof(p_scope->'workId') is distinct from 'string' then raise exception 'Invalid owner scope' using errcode='22023';end if;wid:=p_scope->>'workId';own:=p_actor;perform pro_work_schedule_owner(p_actor,wid);can_write:=true;
 elsif side='client' then
  if channel_name<>'client' or jsonb_typeof(p_scope->'requestId') is distinct from 'string' then raise exception 'Invalid client scope' using errcode='22023';end if;
  select * into r from pro_appointment_requests where id=(p_scope->>'requestId')::uuid and client_user_id=p_actor and work_id is not null and status in('confirmed','completed');if not found then raise exception 'Forbidden' using errcode='42501';end if;own:=r.owner_id;wid:=r.work_id;can_write:=coalesce(pro_appointment_enabled(own),false);
  if not exists(select 1 from pro_daily_log_audiences a where a.owner_id=own and a.work_id=wid and a.log_id=lid and a.version=ver and a.kind='client' and a.recipient_id=p_actor and a.request_id=r.id) then raise exception 'Forbidden' using errcode='42501';end if;
 else
  if channel_name<>'team' or jsonb_typeof(p_scope->'grantId') is distinct from 'string' then raise exception 'Invalid team scope' using errcode='22023';end if;
  g:=pro_team_context(p_actor,(p_scope->>'grantId')::uuid,false);if p_actor=g.owner_id then raise exception 'Owners use their own scope' using errcode='22023';end if;own:=g.owner_id;wid:=g.work_id;
  -- A current member can discover that their own captured generation changed,
  -- but receives neither old publication nor receipt. Outsiders fail above.
  if p_write and g.role<>'contributor' then raise exception 'Read-only discussion' using errcode='42501';end if;
  if p_check_generation and p_generation is distinct from g.source_invite_id then raise exception 'Team generation changed' using errcode='40001';end if;
  if not exists(select 1 from pro_daily_log_audiences a where a.owner_id=own and a.work_id=wid and a.log_id=lid and a.version=ver and a.kind='team' and a.recipient_id=p_actor and a.grant_id=g.id and a.source_invite_id=g.source_invite_id) then raise exception 'Forbidden' using errcode='42501';end if;
  can_write:=g.role='contributor';
 end if;
 if side<>'team' and p_generation is not null then raise exception 'Unexpected team generation' using errcode='22023';end if;
 if not exists(select 1 from pro_daily_log_versions v where v.owner_id=own and v.work_id=wid and v.log_id=lid and v.version=ver) or not exists(select 1 from pro_daily_log_audiences a where a.owner_id=own and a.work_id=wid and a.log_id=lid and a.version=ver and a.kind=channel_name) then raise exception 'Published channel unavailable' using errcode='P0002';end if;
 if p_write and not can_write then raise exception 'Read-only discussion' using errcode='42501';end if;
 return jsonb_build_object('ownerId',own,'workId',wid,'logId',lid,'version',ver,'channel',channel_name,'generation',case when side='team' then g.source_invite_id else null end,'canComment',can_write);
end $$;
create or replace function public.pro_daily_log_discussion_read(p_actor uuid,p_scope jsonb,p_after uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ctx jsonb;own uuid;wid text;lid uuid;ver integer;channel_name text;items jsonb;cursor_time timestamptz;cursor_id uuid;publication jsonb;begin
 ctx:=pro_daily_log_discussion_context(p_actor,p_scope);own:=(ctx->>'ownerId')::uuid;wid:=ctx->>'workId';lid:=(ctx->>'logId')::uuid;ver:=(ctx->>'version')::integer;channel_name:=ctx->>'channel';
 if p_after is not null then select at into cursor_time from pro_daily_log_comments where owner_id=own and work_id=wid and log_id=lid and version=ver and channel=channel_name and id=p_after;if not found then raise exception 'Discussion cursor changed' using errcode='40001';end if;end if;
 select coalesce(jsonb_agg(pro_daily_log_comment_json(c::public.pro_daily_log_comments) order by c.at desc,c.id desc),'[]'::jsonb) into items from(select * from pro_daily_log_comments where owner_id=own and work_id=wid and log_id=lid and version=ver and channel=channel_name and(p_after is null or(at,id)<(cursor_time,p_after)) order by at desc,id desc limit 21)c;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 select content into publication from pro_daily_log_versions where owner_id=own and work_id=wid and log_id=lid and version=ver;
 return jsonb_build_object('context',ctx,'publication',publication,'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_daily_log_discussion_versions(p_actor uuid,p_work text,p_log uuid,p_after integer default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor_version integer;begin
 perform pro_work_schedule_owner(p_actor,p_work);if not exists(select 1 from pro_daily_logs where owner_id=p_actor and work_id=p_work and id=p_log) then return null;end if;
 if p_after is not null and(p_after<1 or not exists(select 1 from pro_daily_log_versions where owner_id=p_actor and work_id=p_work and log_id=p_log and version=p_after)) then raise exception 'Version cursor changed' using errcode='40001';end if;
 select coalesce(jsonb_agg(jsonb_build_object('version',v.version,'title',v.content->'title','publishedAt',v.content->'publishedAt','channels',coalesce((select jsonb_agg(x.kind order by x.kind) from(select distinct a.kind from pro_daily_log_audiences a where a.owner_id=v.owner_id and a.work_id=v.work_id and a.log_id=v.log_id and a.version=v.version)x),'[]'::jsonb)) order by v.version desc),'[]'::jsonb) into items from(select * from pro_daily_log_versions where owner_id=p_actor and work_id=p_work and log_id=p_log and(p_after is null or version<p_after) order by version desc limit 21)v;
 if jsonb_array_length(items)>20 then cursor_version:=(items->19->>'version')::integer;items:=items-20;end if;return jsonb_build_object('items',items,'nextCursor',cursor_version);
end $$;
create or replace function public.pro_daily_log_comment_write(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare ctx jsonb;own uuid;wid text;lid uuid;ver integer;channel_name text;aid uuid;cid uuid;gen uuid;keys text[];receipt pro_daily_log_comment_actions;c pro_daily_log_comments;answer jsonb;begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid comment operation' using errcode='22023';end if;select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if keys is distinct from array['action','actionId','commentId','generation','scope','text'] or p_input->>'action' is distinct from 'comment' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'commentId') is distinct from 'string' or jsonb_typeof(p_input->'generation') not in('string','null') or jsonb_typeof(p_input->'text') is distinct from 'string' or length(btrim(p_input->>'text')) not between 1 and 1000 then raise exception 'Invalid comment fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;cid:=(p_input->>'commentId')::uuid;gen:=(p_input->>'generation')::uuid;
 ctx:=pro_daily_log_discussion_context(p_actor,p_input->'scope',true,gen,true);own:=(ctx->>'ownerId')::uuid;wid:=ctx->>'workId';lid:=(ctx->>'logId')::uuid;ver:=(ctx->>'version')::integer;channel_name:=ctx->>'channel';
 perform pg_advisory_xact_lock(hashtextextended('pro-daily-log-comment-action:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||own::text||':'||wid,0));
 if p_input->'scope'->>'side'='client' then perform 1 from pro_appointment_requests where id=(p_input->'scope'->>'requestId')::uuid for share;
 elsif p_input->'scope'->>'side'='team' then perform 1 from pro_team_grants where id=(p_input->'scope'->>'grantId')::uuid for share;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-daily-log-thread:'||own::text||':'||length(wid)::text||':'||wid||':'||lid::text||':'||ver::text||':'||channel_name,0));
 -- Recheck current audience/role/owner subscription and generation after waiting,
 -- before even looking up a committed actor receipt. Never lock the work row.
 ctx:=pro_daily_log_discussion_context(p_actor,p_input->'scope',true,gen,true);
 select * into receipt from pro_daily_log_comment_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Comment action identity reused' using errcode='22023';end if;return receipt.result;end if;
 if exists(select 1 from pro_daily_log_comments where id=cid) then raise exception 'Comment identity already used' using errcode='40001';end if;
 if(select count(*) from pro_daily_log_comments where owner_id=own and work_id=wid and log_id=lid and version=ver and channel=channel_name)>=1000 then raise exception 'Discussion limit reached' using errcode='40001';end if;
 insert into pro_daily_log_comments(id,owner_id,work_id,log_id,version,channel,actor_id,actor_name,actor_side,grant_id,source_invite_id,text) values(cid,own,wid,lid,ver,channel_name,p_actor,pro_team_name(p_actor),p_input->'scope'->>'side',case when p_input->'scope'->>'side'='team' then(p_input->'scope'->>'grantId')::uuid else null end,gen,btrim(p_input->>'text')) returning * into c;
 ctx:=pro_daily_log_discussion_context(p_actor,p_input->'scope',true,gen,true);answer:=jsonb_build_object('action','comment','comment',pro_daily_log_comment_json(c),'thread',ctx-'canComment');
 insert into pro_daily_log_comment_actions(actor_id,action_id,owner_id,work_id,log_id,version,channel,generation,input,result) values(p_actor,aid,own,wid,lid,ver,channel_name,gen,p_input,answer);return answer;
end $$;
create or replace function public.pro_daily_log_comment_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare receipt pro_daily_log_comment_actions;ctx jsonb;begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into receipt from pro_daily_log_comment_actions where actor_id=p_actor and action_id=p_action;if not found then return jsonb_build_object('receipt',null);end if;
 ctx:=pro_daily_log_discussion_context(p_actor,receipt.input->'scope',true);
 if(ctx->>'generation')::uuid is distinct from receipt.generation then raise exception 'Receipt access changed' using errcode='42501';end if;
 return jsonb_build_object('receipt',jsonb_build_object('input',receipt.input,'result',receipt.result));
end $$;
alter table public.pro_daily_log_comments enable row level security;alter table public.pro_daily_log_comment_actions enable row level security;
revoke all on public.pro_daily_log_comments,public.pro_daily_log_comment_actions from public,anon,authenticated;
grant all on public.pro_daily_log_comments,public.pro_daily_log_comment_actions to service_role;
drop trigger if exists pro_daily_comment_immutable on public.pro_daily_log_comments;create trigger pro_daily_comment_immutable before update on public.pro_daily_log_comments for each row execute function public.pro_team_append_only();
drop trigger if exists pro_daily_comment_action_immutable on public.pro_daily_log_comment_actions;create trigger pro_daily_comment_action_immutable before update on public.pro_daily_log_comment_actions for each row execute function public.pro_team_append_only();
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_daily_log_comment_json','pro_daily_log_discussion_context','pro_daily_log_discussion_read','pro_daily_log_discussion_versions','pro_daily_log_comment_write','pro_daily_log_comment_action_read') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
commit;
