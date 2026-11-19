-- LOCAL PRO ONLY. Round 7C (2026-11-13): «Mensajes» between the professional and the customer of a
-- job. One thread per linked customer request (pro_appointment_requests with a customer account and a
-- job, confirmed or completed; also invitation links). The side of the author is derived on the
-- server: the request owner writes as 'pro', the linked customer account as 'client'; anyone else
-- gets 42501. Messages are immutable (no edit/delete), idempotent by actionId, and nothing is sent
-- outside ContrataCR (no email, SMS, WhatsApp or push): the other side sees them in the app with an
-- unread count (read marker per side). Patterns: RLS, service_role-only, security invoker.
begin;
create table if not exists public.pro_work_messages(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,work_id text not null,request_id uuid not null,
 side text not null check(side in('pro','client')),author_id uuid not null,author_name text not null default '' check(length(author_name)<=160),
 body text not null check(length(body) between 1 and 2000 and body=btrim(body)),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id));
create index if not exists pro_work_messages_thread_idx on public.pro_work_messages(request_id,created_at desc,id desc);
create index if not exists pro_work_messages_work_idx on public.pro_work_messages(owner_id,work_id,created_at desc);
create table if not exists public.pro_work_message_reads(
 request_id uuid not null,side text not null check(side in('pro','client')),last_read_at timestamptz not null,
 primary key(request_id,side));
create table if not exists public.pro_work_message_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default now(),
 primary key(actor_id,action_id));

-- Side of p_actor in the thread of p_request (null when neither the owner nor the linked customer).
create or replace function public.pro_work_message_side(p_actor uuid,p_request uuid) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when r.owner_id=p_actor and coalesce(public.pro_private_work_tools_enabled(p_actor),false) then 'pro'
  when r.client_user_id=p_actor then 'client' end
 from public.pro_appointment_requests r join public.profiles p on p.id=p_actor and not coalesce(p.is_disabled,false)
 where r.id=p_request and r.work_id is not null and r.client_user_id is not null and r.status in('confirmed','completed')
$$;
create or replace function public.pro_work_message_json(m public.pro_work_messages) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',m.id,'side',m.side,'authorName',m.author_name,'body',m.body,'createdAt',m.created_at)
$$;
create or replace function public.pro_work_message_unread(p_request uuid,p_side text) returns integer language sql stable security invoker set search_path=public,pg_temp as $$
 select count(*)::integer from public.pro_work_messages m where m.request_id=p_request and m.side<>p_side
  and m.created_at>coalesce((select last_read_at from public.pro_work_message_reads where request_id=p_request and side=p_side),'-infinity'::timestamptz)
$$;

-- Thread page (newest 30 before the cursor, returned oldest→newest) + unread count of the reader.
create or replace function public.pro_work_messages_read(p_actor uuid,p_request uuid,p_before uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare me text:=public.pro_work_message_side(p_actor,p_request);anchor public.pro_work_messages;items jsonb;more boolean;r public.pro_appointment_requests;
begin
 if me is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_appointment_requests where id=p_request;
 if p_before is not null then select * into anchor from public.pro_work_messages where request_id=p_request and id=p_before;if not found then raise exception 'Cursor changed' using errcode='40001';end if;end if;
 with page as(select * from public.pro_work_messages m where m.request_id=p_request and(p_before is null or (m.created_at,m.id)<(anchor.created_at,anchor.id)) order by m.created_at desc,m.id desc limit 31)
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'side',p.side,'authorName',p.author_name,'body',p.body,'createdAt',p.created_at) order by p.created_at,p.id) filter(where rn<=30),'[]'::jsonb),count(*)>30 into items,more from (select page.*,row_number() over(order by created_at desc,id desc) rn from page) p;
 return jsonb_build_object('requestId',p_request,'workId',r.work_id,'side',me,'items',items,'hasMore',more,'unread',public.pro_work_message_unread(p_request,me),
  'counterpart',case when me='pro' then coalesce(nullif(btrim(r.client_name),''),'Cliente') else coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=r.owner_id),public.pro_team_name(r.owner_id)) end);
end $$;

-- Owner: threads of one job (customer requests linked to it) with unread counts.
create or replace function public.pro_work_message_threads(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('workId',p_work,'threads',coalesce((select jsonb_agg(jsonb_build_object('requestId',r.id,'clientName',coalesce(nullif(btrim(r.client_name),''),'Cliente'),'unread',public.pro_work_message_unread(r.id,'pro'),
   'lastAt',(select max(created_at) from public.pro_work_messages m where m.request_id=r.id)) order by r.created_at)
  from public.pro_appointment_requests r where r.owner_id=p_actor and r.work_id=p_work and r.client_user_id is not null and r.status in('confirmed','completed')),'[]'::jsonb));
end $$;

create or replace function public.pro_work_messages_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;rid uuid;me text;keys text[];hash text:=md5(p_input::text);prior public.pro_work_message_actions;r public.pro_appointment_requests;m public.pro_work_messages;body_text text;answer jsonb;
begin
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act='post' and keys is distinct from array['action','actionId','body','requestId'] or act='read' and keys is distinct from array['action','requestId'] or act is null or act not in('post','read') then raise exception 'Invalid message' using errcode='22023';end if;
 begin rid:=(p_input->>'requestId')::uuid;if act='post' then aid:=(p_input->>'actionId')::uuid;end if;exception when others then raise exception 'Invalid message' using errcode='22023';end;
 me:=public.pro_work_message_side(p_actor,rid);if me is null then raise exception 'Forbidden' using errcode='42501';end if;
 if act='read' then
  insert into public.pro_work_message_reads(request_id,side,last_read_at) values(rid,me,clock_timestamp()) on conflict(request_id,side) do update set last_read_at=greatest(public.pro_work_message_reads.last_read_at,excluded.last_read_at);
  return jsonb_build_object('requestId',rid,'unread',0);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-message:'||p_actor::text||':'||aid::text,0));
 select * into prior from public.pro_work_message_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 body_text:=btrim(coalesce(p_input->>'body',''));
 if jsonb_typeof(p_input->'body') is distinct from 'string' or length(body_text) not between 1 and 2000 then raise exception 'Invalid message body' using errcode='22023';end if;
 if (select count(*) from public.pro_work_messages where request_id=rid and author_id=p_actor and created_at>clock_timestamp()-interval '1 minute')>=20 then raise exception 'Too many messages' using errcode='54000';end if;
 select * into r from public.pro_appointment_requests where id=rid;
 insert into public.pro_work_messages(owner_id,id,work_id,request_id,side,author_id,author_name,body) values(r.owner_id,aid,r.work_id,rid,me,p_actor,left(coalesce(case when me='pro' then (select nullif(btrim(business_name),'') from public.professionals where profile_id=r.owner_id) end,public.pro_team_name(p_actor),''),160),body_text) returning * into m;
 -- Writing marks the thread as read for the author.
 insert into public.pro_work_message_reads(request_id,side,last_read_at) values(rid,me,m.created_at) on conflict(request_id,side) do update set last_read_at=greatest(public.pro_work_message_reads.last_read_at,excluded.last_read_at);
 answer:=jsonb_build_object('message',public.pro_work_message_json(m));
 insert into public.pro_work_message_actions(actor_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;
create or replace function public.pro_work_messages_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Messages are immutable' using errcode='23514';end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_work_messages','pro_work_message_reads','pro_work_message_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_work_messages','pro_work_message_actions'] loop
  execute format('drop trigger if exists pro_work_messages_immutable on public.%I',t);execute format('create trigger pro_work_messages_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_work_messages_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_work_message_side','pro_work_message_json','pro_work_message_unread','pro_work_messages_read','pro_work_message_threads','pro_work_messages_mutate','pro_work_messages_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
