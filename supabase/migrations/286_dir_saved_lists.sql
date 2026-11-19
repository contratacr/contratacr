-- LOCAL PRO ONLY. Place features round (owner approval 2026-11-17): saved lists of places. Depends on
-- directory-core-local.sql and directory-claims-local.sql (dir_try_uuid, dir_action_receipt).
-- * A signed-in person keeps named lists (1..80 characters) of published places. Private by default.
-- * Optional share link: a random 32-character token (no user id inside, not derived from any id); turning sharing off
--   clears it, turning it on again issues a NEW token (an old link never works again). The public reader returns
--   only the list name and the published places — never the owner, ids of people or other lists.
-- * Lists and items are never deleted: a list goes to status 'deleted'; an item gets removed_at (re-adding clears it).
-- * CAS by list revision (40001), idempotent actionId. Limits: 50 active lists per person, 500 places per list,
--   30 new lists a day, 300 list changes an hour.
-- Tables: RLS on, service_role only, no DELETE grant. Functions security invoker, pinned search_path, service_role only.
begin;

create table if not exists public.dir_saved_lists(
 id uuid primary key,
 owner_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 80 and name!~*'(https?://|www\.)'),
 status text not null default 'active' check(status in('active','deleted')),
 share_token text unique check(share_token~'^[a-f0-9]{32}$'),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(status='active' or share_token is null)
);
create index if not exists dir_saved_lists_owner on public.dir_saved_lists(owner_id,created_at) where status='active';
create table if not exists public.dir_saved_list_items(
 list_id uuid not null references public.dir_saved_lists(id),
 place_id uuid not null references public.dir_places(id),
 added_at timestamptz not null default clock_timestamp(),
 removed_at timestamptz,
 primary key(list_id,place_id)
);
create table if not exists public.dir_saved_list_changes(
 id bigint generated always as identity primary key,
 list_id uuid not null references public.dir_saved_lists(id),
 actor_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','rename','delete','share_on','share_off','add','remove')),
 place_id uuid,
 at timestamptz not null default clock_timestamp()
);
create index if not exists dir_saved_list_changes_actor on public.dir_saved_list_changes(actor_id,at);
do $$declare t text;begin
 drop trigger if exists dir_saved_list_changes_immutable on public.dir_saved_list_changes;
 create trigger dir_saved_list_changes_immutable before update or delete on public.dir_saved_list_changes for each row execute function public.dir_immutable();
 foreach t in array array['dir_saved_lists','dir_saved_list_items','dir_saved_list_changes'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
 end loop;
end $$;
create or replace function public.dir_saved_lists_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Lists are never deleted' using errcode='23514';end if;
 if tg_table_name='dir_saved_lists' then
  if new.id<>old.id or new.owner_id<>old.owner_id or new.created_at<>old.created_at then raise exception 'List identity is immutable' using errcode='23514';end if;
  if old.status='deleted' then raise exception 'A deleted list is final' using errcode='23514';end if;
  new.updated_at:=clock_timestamp();
 elsif new.list_id<>old.list_id or new.place_id<>old.place_id then raise exception 'Item identity is immutable' using errcode='23514';
 end if;
 return new;
end $$;
drop trigger if exists dir_saved_lists_guard on public.dir_saved_lists;
create trigger dir_saved_lists_guard before update or delete on public.dir_saved_lists for each row execute function public.dir_saved_lists_guard();
drop trigger if exists dir_saved_list_items_guard on public.dir_saved_list_items;
create trigger dir_saved_list_items_guard before update or delete on public.dir_saved_list_items for each row execute function public.dir_saved_lists_guard();

-- Input: {actionId, action, listId, revision (lists that exist), name? (create/rename), slug? (add/remove)}.
create or replace function public.dir_saved_list_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;lid uuid;rev integer;act text:=p_input->>'action';prior jsonb;l public.dir_saved_lists;pid uuid;nm text:=btrim(regexp_replace(coalesce(p_input->>'name',''),'\s+',' ','g'));
 it public.dir_saved_list_items;result jsonb;
begin
 if p_actor is null then raise exception 'Sign in to save places' using errcode='42501',hint='dir_list_login';end if;
 if jsonb_typeof(p_input)<>'object' or act is null or act not in('create','rename','delete','share_on','share_off','add','remove')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','action','listId','revision','name','slug'))
  or (act<>'create' and jsonb_typeof(p_input->'revision')<>'number') then raise exception 'Invalid list change' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');lid:=public.dir_try_uuid(p_input->>'listId');
 if act<>'create' then begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid list change' using errcode='22023';end;end if;
 if aid is null or lid is null or (act in('create','rename') and (length(nm) not between 1 and 80 or nm~*'(https?://|www\.)'))
  or (act in('add','remove')) <> (p_input ? 'slug') or (act not in('create','rename') and p_input ? 'name') then raise exception 'Invalid list change' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-lists:'||p_actor::text,0));
 if (select count(*) from public.dir_saved_list_changes where actor_id=p_actor and at>clock_timestamp()-interval '1 hour')>=300 then
  raise exception 'Too many changes' using errcode='54000',hint='dir_list_cap';end if;
 if act='create' then
  if exists(select 1 from public.dir_saved_lists where id=lid) then raise exception 'List id reused' using errcode='22023';end if;
  if (select count(*) from public.dir_saved_lists where owner_id=p_actor and status='active')>=50
   or (select count(*) from public.dir_saved_lists where owner_id=p_actor and created_at>clock_timestamp()-interval '1 day')>=30 then
   raise exception 'Too many lists' using errcode='54000',hint='dir_list_cap';end if;
  insert into public.dir_saved_lists(id,owner_id,name) values(lid,p_actor,nm) returning * into l;
 else
  select * into l from public.dir_saved_lists where id=lid for update;
  if not found or l.owner_id<>p_actor or l.status<>'active' then raise exception 'List not found' using errcode='P0002';end if;
  if l.revision<>rev then raise exception 'List changed' using errcode='40001';end if;
  if act in('add','remove') then
   select id into pid from public.dir_places where slug=p_input->>'slug';
   if pid is null then raise exception 'Place unavailable' using errcode='P0002';end if;
   select * into it from public.dir_saved_list_items where list_id=lid and place_id=pid;
   if act='add' then
    if public.dir_place_public(p_input->>'slug') is null then raise exception 'Place unavailable' using errcode='P0002';end if;
    if it.list_id is not null and it.removed_at is null then raise exception 'Already saved' using errcode='23505',hint='dir_list_item_exists';end if;
    if (select count(*) from public.dir_saved_list_items where list_id=lid and removed_at is null)>=500 then raise exception 'List full' using errcode='54000',hint='dir_list_cap';end if;
    if it.list_id is null then insert into public.dir_saved_list_items(list_id,place_id) values(lid,pid);
    else update public.dir_saved_list_items set removed_at=null,added_at=clock_timestamp() where list_id=lid and place_id=pid;end if;
   else
    if it.list_id is null or it.removed_at is not null then raise exception 'Not in the list' using errcode='P0002';end if;
    update public.dir_saved_list_items set removed_at=clock_timestamp() where list_id=lid and place_id=pid;
   end if;
   update public.dir_saved_lists set revision=revision+1 where id=lid returning * into l;
  elsif act='rename' then
   if l.name=nm then raise exception 'Nothing to change' using errcode='22023';end if;
   update public.dir_saved_lists set name=nm,revision=revision+1 where id=lid returning * into l;
  elsif act='delete' then
   update public.dir_saved_lists set status='deleted',share_token=null,revision=revision+1 where id=lid returning * into l;
  elsif act='share_on' then
   if l.share_token is not null then raise exception 'Already shared' using errcode='22023';end if;
   update public.dir_saved_lists set share_token=substr(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),1,32),revision=revision+1 where id=lid returning * into l;
  else
   if l.share_token is null then raise exception 'Not shared' using errcode='22023';end if;
   update public.dir_saved_lists set share_token=null,revision=revision+1 where id=lid returning * into l;
  end if;
 end if;
 insert into public.dir_saved_list_changes(list_id,actor_id,action_id,action,place_id) values(lid,p_actor,aid,act,pid);
 result:=jsonb_build_object('listId',l.id,'revision',l.revision,'status',l.status,'name',l.name,'shareToken',l.share_token);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Owner view: active lists with their (still public) places; p_slug marks which lists contain that place.
create or replace function public.dir_saved_lists_mine(p_actor uuid,p_slug text default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('listId',l.id,'name',l.name,'revision',l.revision,'shareToken',l.share_token,'createdAt',l.created_at,
  'count',(select count(*) from public.dir_saved_list_items i join public.dir_places p on p.id=i.place_id where i.list_id=l.id and i.removed_at is null and public.dir_place_public(p.slug) is not null),
  'hasPlace',case when p_slug is null then null else exists(select 1 from public.dir_saved_list_items i join public.dir_places p on p.id=i.place_id where i.list_id=l.id and i.removed_at is null and p.slug=p_slug) end,
  'places',(select coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'name',p.name,'vertical',p.vertical_id,'area',concat_ws(', ',p.locality,p.admin_area_1)) order by i.added_at desc),'[]')
   from public.dir_saved_list_items i join public.dir_places p on p.id=i.place_id where i.list_id=l.id and i.removed_at is null and public.dir_place_public(p.slug) is not null))
  order by l.created_at),'[]')
 from public.dir_saved_lists l where l.owner_id=p_actor and l.status='active' $$;

-- Shared link reader: name + public places only (no owner, no ids of people). Null for unknown/turned-off tokens.
create or replace function public.dir_saved_list_public(p_token text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('name',l.name,'places',(select coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'name',p.name,'vertical',p.vertical_id,'verticalNameEs',v.name_es,'verticalNameEn',v.name_en,
   'area',concat_ws(', ',p.locality,p.admin_area_1),'rating',p.rating_avg,'ratingCount',p.rating_count) order by i.added_at desc),'[]')
  from public.dir_saved_list_items i join public.dir_places p on p.id=i.place_id join public.dir_verticals v on v.id=p.vertical_id
  where i.list_id=l.id and i.removed_at is null and public.dir_place_public(p.slug) is not null))
 from public.dir_saved_lists l where p_token ~ '^[a-f0-9]{32}$' and l.share_token=p_token and l.status='active' $$;

do $$declare n text;begin foreach n in array array['dir_saved_lists','dir_saved_list_items','dir_saved_list_changes'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n='dir_saved_list_changes' then execute format('grant select,insert on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in('dir_saved_lists_guard','dir_saved_list_mutate','dir_saved_lists_mine','dir_saved_list_public') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
