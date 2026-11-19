-- LOCAL PRO ONLY. Place features round (owner approval 2026-11-17): shared helpers of the owner tools of a claimed
-- place + the «Pedir» link-out. Depends on directory-core-local.sql, directory-claims-local.sql and
-- directory-moderation-local.sql (dir_moderation_log). Team roles (team-roles-local.sql) are optional: they are
-- called dynamically, exactly like dir_review_reply_write.
-- * dir_tool_authorize(actor, member, place, capability): the effective account (owner of the Pro workspace when a
--   company member works in it) must actively manage the CLAIMED place; a member's role must allow the capability
--   (read / work.write / listing.publish). Used by reservations, events and the «Pedir» link.
-- * dir_moderation_log kinds extended with question, answer, event, brand and brand_claim (same immutable trail).
-- * «Pedir» (order link-out): the owner sets ONE channel of the business itself — its WhatsApp number (wa.me link built
--   here from digits only), an https order page of its own website, or a phone number. ContrataCR takes no orders, no
--   payments and no commission; the public page only links out (rel nofollow). Allowed only where people order goods or
--   food (restaurants, cafés, supermarkets, corner stores, pharmacies, hardware stores, pet shops); never banks, health,
--   lodging, tours... History is immutable; CAS by revision; idempotent actionId.
-- Tables: RLS on, service_role only, no DELETE grant. Functions security invoker, pinned search_path, service_role only.
-- 2026-11-18 (launch without Pro): company-member roles come from the NEUTRAL helpers dir_business_role_of /
-- dir_business_allows (dir-business-roles-local.sql, required); they delegate to the Pro team module only when installed.
begin;

-- ---------------------------------------------------------------- shared authorization
create or replace function public.dir_tool_authorize(p_actor uuid,p_member uuid,p_place uuid,p_capability text) returns public.dir_places
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;r text;allowed boolean;
begin
 if p_actor is null or p_place is null or p_capability not in('read','work.write','listing.publish') then raise exception 'Invalid tool access' using errcode='22023';end if;
 select * into p from public.dir_places where id=p_place;
 if not found then raise exception 'Place not found' using errcode='P0002';end if;
 if p.claim_status<>'claimed' or not exists(select 1 from public.dir_place_managers m where m.place_id=p.id and m.user_id=p_actor and m.status='active') then
  raise exception 'Only the manager of a claimed place' using errcode='42501',hint='dir_tool_not_manager';end if;
 if p_member is not null and p_member<>p_actor then
  r:=public.dir_business_role_of(p_member,p_actor);
  allowed:=public.dir_business_allows(r,p_capability);
  if r is null or not coalesce(allowed,false) then raise exception 'Role does not allow this' using errcode='42501',hint='dir_tool_role';end if;
 end if;
 return p;
end $$;

-- ---------------------------------------------------------------- moderation log kinds
do $$begin
 if exists(select 1 from pg_constraint where conname='dir_moderation_log_kind_check' and conrelid='public.dir_moderation_log'::regclass
   and pg_get_constraintdef(oid) not like '%brand_claim%') then
  alter table public.dir_moderation_log drop constraint dir_moderation_log_kind_check;end if;
 if not exists(select 1 from pg_constraint where conname='dir_moderation_log_kind_check' and conrelid='public.dir_moderation_log'::regclass) then
  alter table public.dir_moderation_log add constraint dir_moderation_log_kind_check
   check(kind in('claim','review','reply','price','report','permit','question','answer','event','brand','brand_claim'));end if;
end $$;

-- ---------------------------------------------------------------- «Pedir» link
create or replace function public.dir_order_vertical_ok(p_vertical text) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select p_vertical in('restaurant','cafe_bar','grocery','convenience','pharmacy','hardware','vet_pets') $$;

create table if not exists public.dir_place_order_links(
 place_id uuid primary key references public.dir_places(id),
 channel text check(channel in('whatsapp','web','phone')),
 value text check(length(value) between 3 and 500),
 revision integer not null default 1 check(revision>0),
 updated_by uuid not null,member_id uuid,
 updated_at timestamptz not null default clock_timestamp(),
 check((channel is null)=(value is null)),
 check(channel is distinct from 'whatsapp' or value~'^https://wa\.me/[0-9]{8,15}$'),
 check(channel is distinct from 'web' or (value~'^https://[^\s"<>]{3,}$' and value!~*'^https://(wa\.me|api\.whatsapp\.com)')),
 check(channel is distinct from 'phone' or value~'^\+?[0-9][0-9 ()-]{6,22}$')
);
create table if not exists public.dir_place_order_link_history(
 id bigint generated always as identity primary key,
 place_id uuid not null references public.dir_places(id),
 revision integer not null check(revision>0),
 channel text,value text,
 actor_id uuid not null,member_id uuid,action_id uuid not null,
 at timestamptz not null default clock_timestamp(),
 unique(place_id,revision)
);
do $$begin
 drop trigger if exists dir_place_order_link_history_immutable on public.dir_place_order_link_history;
 create trigger dir_place_order_link_history_immutable before update or delete on public.dir_place_order_link_history for each row execute function public.dir_immutable();
 drop trigger if exists dir_place_order_link_history_no_truncate on public.dir_place_order_link_history;
 create trigger dir_place_order_link_history_no_truncate before truncate on public.dir_place_order_link_history for each statement execute function public.dir_immutable();
 drop trigger if exists dir_place_order_links_no_truncate on public.dir_place_order_links;
 create trigger dir_place_order_links_no_truncate before truncate on public.dir_place_order_links for each statement execute function public.dir_immutable();
end $$;

-- Input: {actionId, placeId, revision (0 = first time), channel: whatsapp|web|phone|null, value}. WhatsApp value =
-- any phone; only its digits are kept (8-digit Costa Rican numbers get 506) and the wa.me link is built here.
create or replace function public.dir_order_link_mutate(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;pid uuid;rev integer;who uuid:=coalesce(p_member,p_actor);prior jsonb;p public.dir_places;cur public.dir_place_order_links;
 ch text:=p_input->>'channel';val text:=btrim(coalesce(p_input->>'value',''));digits text;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'revision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','placeId','revision','channel','value')) then raise exception 'Invalid order link' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');pid:=public.dir_try_uuid(p_input->>'placeId');
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid order link' using errcode='22023';end;
 if aid is null or pid is null or rev<0 or (ch is not null and ch not in('whatsapp','web','phone')) then raise exception 'Invalid order link' using errcode='22023';end if;
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 p:=public.dir_tool_authorize(p_actor,p_member,pid,'listing.publish');
 if not public.dir_order_vertical_ok(p.vertical_id) then raise exception 'No order button in this section' using errcode='22023',hint='dir_order_section_off';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-order:'||pid::text,0));
 if ch='whatsapp' then
  digits:=regexp_replace(val,'[^0-9]','','g');if length(digits)=8 then digits:='506'||digits;end if;
  if length(digits) not between 8 and 15 then raise exception 'Invalid order link' using errcode='22023',hint='dir_order_value';end if;
  val:='https://wa.me/'||digits;
 elsif ch='web' then
  if val!~'^https://[^\s"<>]{3,}$' or length(val)>500 or val~*'^https://(wa\.me|api\.whatsapp\.com)' then raise exception 'Invalid order link' using errcode='22023',hint='dir_order_value';end if;
 elsif ch='phone' then
  if val!~'^\+?[0-9][0-9 ()-]{6,22}$' then raise exception 'Invalid order link' using errcode='22023',hint='dir_order_value';end if;
 else val:=null;
 end if;
 select * into cur from public.dir_place_order_links where place_id=pid for update;
 if coalesce(cur.revision,0)<>rev then raise exception 'Order link changed' using errcode='40001';end if;
 if found then
  if cur.channel is not distinct from ch and cur.value is not distinct from val then raise exception 'Nothing to change' using errcode='22023';end if;
  update public.dir_place_order_links set channel=ch,value=val,revision=revision+1,updated_by=p_actor,member_id=p_member,updated_at=clock_timestamp() where place_id=pid returning * into cur;
 else
  if ch is null then raise exception 'Nothing to change' using errcode='22023';end if;
  insert into public.dir_place_order_links(place_id,channel,value,updated_by,member_id) values(pid,ch,val,p_actor,p_member) returning * into cur;
 end if;
 insert into public.dir_place_order_link_history(place_id,revision,channel,value,actor_id,member_id,action_id) values(pid,cur.revision,cur.channel,cur.value,p_actor,p_member,aid);
 result:=jsonb_build_object('placeId',pid,'revision',cur.revision,'channel',cur.channel,'value',cur.value);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- Public: the link of a published, claimed place in an allowed section (null otherwise). No actor ids.
create or replace function public.dir_order_link_public(p_slug text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('channel',o.channel,'value',o.value) from public.dir_places p join public.dir_place_order_links o on o.place_id=p.id
 where p.slug=p_slug and p.status='published' and p.claim_status='claimed' and o.channel is not null and public.dir_order_vertical_ok(p.vertical_id)
  and public.dir_place_public(p_slug) is not null $$;

-- Owner reader (any manager of the claimed place, read capability).
create or replace function public.dir_order_link_read(p_actor uuid,p_member uuid,p_place uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;o public.dir_place_order_links;
begin
 p:=public.dir_tool_authorize(p_actor,p_member,p_place,'read');
 select * into o from public.dir_place_order_links where place_id=p.id;
 return jsonb_build_object('placeId',p.id,'allowed',public.dir_order_vertical_ok(p.vertical_id),'revision',coalesce(o.revision,0),'channel',o.channel,'value',o.value,'phone',p.phone,'website',p.website);
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['dir_place_order_links','dir_place_order_link_history'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n='dir_place_order_link_history' then execute format('grant select,insert on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in('dir_tool_authorize','dir_order_vertical_ok','dir_order_link_mutate','dir_order_link_public','dir_order_link_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
