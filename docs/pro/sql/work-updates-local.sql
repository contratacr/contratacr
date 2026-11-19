-- LOCAL PRO ONLY. Private text progress with explicitly shared immutable snapshots.
-- No changes to work/delivery/request records, storage buckets, messages or outboxes.
begin;
create table if not exists public.pro_work_updates(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 160),text text not null check(length(btrim(text)) between 1 and 2000),
 revision integer not null default 1 check(revision>0),published_revision integer check(published_revision>0 and published_revision<=revision),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,work_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_work_updates_page on public.pro_work_updates(owner_id,work_id,created_at desc,id desc);
create table if not exists public.pro_work_update_history(
 owner_id uuid not null,work_id text not null,entry_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','publish')),before_entry jsonb,after_entry jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id),foreign key(owner_id,work_id,entry_id) references public.pro_work_updates(owner_id,work_id,id) on delete cascade
);
create index if not exists pro_work_update_history_page on public.pro_work_update_history(owner_id,work_id,entry_id,((after_entry->>'revision')::integer) desc);
create table if not exists public.pro_work_update_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
create table if not exists public.pro_work_update_versions(
 owner_id uuid not null,work_id text not null,entry_id uuid not null,version integer not null check(version>0),
 client_user_id uuid not null references public.profiles(id) on delete cascade,recipient_name text not null check(length(recipient_name) between 1 and 160),entry_revision integer not null check(entry_revision>0),
 title text not null check(length(btrim(title)) between 1 and 160),text text not null check(length(btrim(text)) between 1 and 2000),
 service text not null check(length(service) between 1 and 160),published_at timestamptz not null default now(),entry_created_at timestamptz not null,
 primary key(owner_id,entry_id,version),unique(owner_id,entry_id,entry_revision),foreign key(owner_id,work_id,entry_id) references public.pro_work_updates(owner_id,work_id,id) on delete cascade
);
create index if not exists pro_work_update_versions_client_page on public.pro_work_update_versions(client_user_id,owner_id,work_id,entry_created_at desc,entry_id desc,version desc);
create or replace function public.pro_work_update_json(p_entry public.pro_work_updates) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_entry.id,'workId',p_entry.work_id,'title',p_entry.title,'text',p_entry.text,'revision',p_entry.revision,
 'publishedRevision',p_entry.published_revision,'createdAt',p_entry.created_at,'updatedAt',p_entry.updated_at);
$$;
create or replace function public.pro_work_update_can_share(p_actor uuid,p_work text) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.pro_work w join public.pro_appointment_requests r on r.owner_id=w.user_id and r.work_id=w.id
 join public.profiles c on c.id=r.client_user_id where w.user_id=p_actor and w.id=p_work and not coalesce(w.cancelled,false)
 and r.status in('confirmed','completed') and not coalesce(c.is_disabled,false));
$$;
create or replace function public.pro_work_updates_read(p_actor uuid,p_work text,p_after uuid default null,p_entry uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare entry public.pro_work_updates;items jsonb;hist jsonb;cursor_time timestamptz;cursor_id uuid;can_share boolean;recipient uuid;recipient_name text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_after is not null and p_entry is not null then raise exception 'Invalid progress query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 can_share:=public.pro_work_update_can_share(p_actor,p_work);
 if can_share then
  select ar.client_user_id,ar.client_name into recipient,recipient_name from public.pro_appointment_requests ar join public.profiles c on c.id=ar.client_user_id
   where ar.owner_id=p_actor and ar.work_id=p_work and ar.status in('confirmed','completed') and not coalesce(c.is_disabled,false);
 end if;
 if p_entry is not null then
  select * into entry from public.pro_work_updates where owner_id=p_actor and work_id=p_work and id=p_entry;
  if not found then return null;end if;
  select coalesce(jsonb_agg(x.content order by x.revision desc),'[]'::jsonb) into hist from (
   select (h.after_entry->>'revision')::integer as revision,jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_entry,'after',h.after_entry) as content
   from public.pro_work_update_history h where h.owner_id=p_actor and h.work_id=p_work and h.entry_id=p_entry order by (h.after_entry->>'revision')::integer desc limit 20
  ) x;
  return jsonb_build_object('entry',public.pro_work_update_json(entry),'history',hist,'canShare',can_share,'recipientId',recipient,'recipientName',recipient_name);
 end if;
 if p_after is not null then
  select created_at into cursor_time from public.pro_work_updates where owner_id=p_actor and work_id=p_work and id=p_after;
  if not found then raise exception 'Invalid progress cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(public.pro_work_update_json(e::public.pro_work_updates) order by e.created_at desc,e.id desc),'[]'::jsonb) into items from (
  select * from public.pro_work_updates where owner_id=p_actor and work_id=p_work and (p_after is null or (created_at,id)<(cursor_time,p_after)) order by created_at desc,id desc limit 21
 ) e;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('workId',p_work,'items',items,'nextCursor',cursor_id,'canShare',can_share,'recipientId',recipient,'recipientName',recipient_name);
end $$;
create or replace function public.pro_work_updates_client_read(p_actor uuid,p_request uuid,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;cursor_time timestamptz;cursor_id uuid;items jsonb;
begin
 -- Shared history remains readable without a Pro membership on either account.
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id into owner,wid from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 if p_after is not null then
  select entry_created_at into cursor_time from public.pro_work_update_versions where owner_id=owner and work_id=wid and client_user_id=p_actor and entry_id=p_after order by version desc limit 1;
  if not found then raise exception 'Invalid shared progress cursor' using errcode='22023';end if;
 end if;
 -- Filter recipient before taking latest; never read a private draft into this view.
 with latest as (
  select distinct on(v.entry_id) v.* from public.pro_work_update_versions v where v.owner_id=owner and v.work_id=wid and v.client_user_id=p_actor order by v.entry_id,v.version desc
 )
 select coalesce(jsonb_agg(x.content order by x.entry_created_at desc,x.entry_id desc),'[]'::jsonb) into items from (
  select v.entry_created_at,v.entry_id,jsonb_build_object('id',v.entry_id,'version',v.version,'title',v.title,'text',v.text,'publishedAt',v.published_at,'service',v.service) as content
  from latest v where p_after is null or (v.entry_created_at,v.entry_id)<(cursor_time,p_after) order by v.entry_created_at desc,v.entry_id desc limit 21
 ) x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_work_updates_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;eid uuid;aid uuid;act text;rev integer;keys text[];receipt public.pro_work_update_actions;entry public.pro_work_updates;w public.pro_work;r public.pro_appointment_requests;before_json jsonb;after_json jsonb;result jsonb;entry_title text;entry_text text;recipient uuid;publication integer;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid progress' using errcode='22023';end if;
 act:=p_input->>'action';wid:=p_input->>'workId';
 if act is null or act not in('create','update','publish') or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(wid) not between 1 and 160
 or jsonb_typeof(p_input->'entryId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
 or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) then raise exception 'Invalid progress identity' using errcode='22023';end if;
 if (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 eid:=(p_input->>'entryId')::uuid;aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if act in('create','update') then
  if keys<>array['action','actionId','entryId','revision','text','title','workId'] or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'text') is distinct from 'string' then raise exception 'Invalid progress fields' using errcode='22023';end if;
  entry_title:=btrim(p_input->>'title');entry_text:=btrim(p_input->>'text');
  if length(entry_title) not between 1 and 160 or length(entry_text) not between 1 and 2000 then raise exception 'Invalid progress text' using errcode='22023';end if;
 else
  if keys<>array['action','actionId','entryId','recipientId','revision','workId'] or jsonb_typeof(p_input->'recipientId') is distinct from 'string' then raise exception 'Unexpected progress fields' using errcode='22023';end if;
  recipient:=(p_input->>'recipientId')::uuid;
 end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-update-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_update_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-updates:'||p_actor::text||':'||wid,0));
 -- Match appointment cancel/reschedule ordering: request first, then work.
 -- A private create/update never locks the request. Receipt replay above never
 -- re-targets an already committed publication to a newly linked customer.
 if act='publish' then
  select ar.* into r from public.pro_appointment_requests ar where ar.owner_id=p_actor and ar.work_id=wid for share of ar;
  if not found then raise exception 'No linked customer' using errcode='42501';end if;
 end if;
 select * into w from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select * into entry from public.pro_work_updates where owner_id=p_actor and id=eid for update;
 if act='create' then
  if rev<>0 then raise exception 'Create requires zero revision' using errcode='22023';end if;
  if found then raise exception 'Progress identity already exists' using errcode='22023';end if;
  if (select count(*) from public.pro_work_updates where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Progress entry limit' using errcode='54000';end if;
  insert into public.pro_work_updates(owner_id,work_id,id,title,text) values(p_actor,wid,eid,entry_title,entry_text) returning * into entry;
 else
  if not found or entry.work_id<>wid then raise exception 'Forbidden' using errcode='42501';end if;
  if rev<>entry.revision then raise exception 'Progress changed' using errcode='40001';end if;
  before_json:=public.pro_work_update_json(entry);
  if act='update' then
   update public.pro_work_updates set title=entry_title,text=entry_text,revision=revision+1,updated_at=now() where owner_id=p_actor and id=eid returning * into entry;
  else
   if entry.published_revision is not distinct from entry.revision then raise exception 'No private changes to share' using errcode='22023';end if;
   if coalesce(w.cancelled,false) then raise exception 'Cancelled job cannot share progress' using errcode='42501';end if;
   if r.client_user_id<>recipient then raise exception 'The share recipient changed' using errcode='40001';end if;
   if r.status not in('confirmed','completed') or not exists(select 1 from public.profiles where id=r.client_user_id and not coalesce(is_disabled,false)) then raise exception 'No linked confirmed customer' using errcode='42501';end if;
   update public.pro_work_updates set revision=revision+1,published_revision=revision+1,updated_at=now() where owner_id=p_actor and id=eid returning * into entry;
   select coalesce(max(version),0)+1 into publication from public.pro_work_update_versions where owner_id=p_actor and entry_id=eid;
   insert into public.pro_work_update_versions(owner_id,work_id,entry_id,version,entry_revision,client_user_id,recipient_name,title,text,service,entry_created_at)
    values(p_actor,wid,eid,publication,entry.revision,r.client_user_id,r.client_name,entry.title,entry.text,w.service,entry.created_at);
  end if;
 end if;
 after_json:=public.pro_work_update_json(entry);result:=jsonb_build_object('entry',after_json);
 insert into public.pro_work_update_history(owner_id,work_id,entry_id,action_id,action,before_entry,after_entry) values(p_actor,wid,eid,aid,act,before_json,after_json);
 insert into public.pro_work_update_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.pro_work_update_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Progress history and shared versions are immutable' using errcode='23514';end $$;
drop trigger if exists pro_work_update_history_immutable on public.pro_work_update_history;
create trigger pro_work_update_history_immutable before update on public.pro_work_update_history for each row execute function public.pro_work_update_immutable();
drop trigger if exists pro_work_update_action_immutable on public.pro_work_update_actions;
create trigger pro_work_update_action_immutable before update on public.pro_work_update_actions for each row execute function public.pro_work_update_immutable();
drop trigger if exists pro_work_update_version_immutable on public.pro_work_update_versions;
create trigger pro_work_update_version_immutable before update on public.pro_work_update_versions for each row execute function public.pro_work_update_immutable();
alter table public.pro_work_updates enable row level security;
alter table public.pro_work_update_history enable row level security;
alter table public.pro_work_update_actions enable row level security;
alter table public.pro_work_update_versions enable row level security;
revoke all on public.pro_work_updates,public.pro_work_update_history,public.pro_work_update_actions,public.pro_work_update_versions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_updates,public.pro_work_update_history,public.pro_work_update_actions,public.pro_work_update_versions to service_role;
revoke all on function public.pro_work_update_json(public.pro_work_updates),public.pro_work_update_can_share(uuid,text),public.pro_work_updates_read(uuid,text,uuid,uuid),public.pro_work_updates_client_read(uuid,uuid,uuid),public.pro_work_updates_mutate(uuid,jsonb),public.pro_work_update_immutable() from public,anon,authenticated;
grant execute on function public.pro_work_update_json(public.pro_work_updates),public.pro_work_update_can_share(uuid,text),public.pro_work_updates_read(uuid,text,uuid,uuid),public.pro_work_updates_client_read(uuid,uuid,uuid),public.pro_work_updates_mutate(uuid,jsonb) to service_role;
commit;
