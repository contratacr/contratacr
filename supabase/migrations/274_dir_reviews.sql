-- LOCAL PRO ONLY. Multivertical round F5 (2026-11-16): reviews of directory places. Depends on
-- directory-core-local.sql and directory-claims-local.sql (dir_place_managers, dir_try_uuid, dir_action_receipt).
-- Mirrors the professional review rules (supabase/migrations 063, 170, 208, 217 and src/lib/moderation/reviews.ts):
-- * rating 0.5..5 in half steps; comment required, 1..300 characters, no links or @handles (the route also runs
--   validateReviewText for insults/threats);
-- * moderation published/hidden, reversible, with reason/moderator/time; a protective trigger only lets
--   dir_review_moderate change moderation fields (equivalent of protect_review_moderation_fields);
-- * one review per person per place (editing updates it, CAS by revision); guest reviews (no account) only through
--   a contact registered from that device with that place (dir_place_contacts, 1:1 like whatsapp_contact_id), and
--   at most one guest review per device per place;
-- * author name snapshot taken at submission; managers of the place cannot review it;
-- * owner_reply: once, by an active owner/manager, never edited; staff can hide it (owner_reply_status);
-- * trigger recomputes dir_places.rating_avg / rating_count from PUBLISHED reviews (no place revision bump: the
--   aggregate is not editable content and must not cause 40001 for editors).
-- Tables: RLS on, service_role only, no DELETE grant. Functions security invoker with pinned search_path.
begin;

create table if not exists public.dir_place_contacts(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 channel text not null check(channel in('whatsapp','call','message')),
 visitor_hash text not null check(visitor_hash~'^[a-f0-9]{64}$'),
 actor_id uuid,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists dir_place_contacts_visitor on public.dir_place_contacts(visitor_hash,created_at desc);

create table if not exists public.dir_reviews(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 author_id uuid,
 guest_contact_id uuid references public.dir_place_contacts(id),
 guest_visitor_hash text check(guest_visitor_hash~'^[a-f0-9]{64}$'),
 author_name_snapshot text not null check(length(btrim(author_name_snapshot)) between 2 and 80),
 rating numeric(2,1) not null check(rating>=0.5 and rating<=5 and rating*2=floor(rating*2)),
 comment text not null check(length(comment) between 1 and 300 and comment!~*'(https?://|www\.|@[a-z0-9_.-]+)'),
 moderation_status text not null default 'published' check(moderation_status in('published','hidden')),
 moderation_reason text check(length(moderation_reason) between 3 and 500),
 moderated_at timestamptz,moderated_by uuid,
 owner_reply text check(length(btrim(owner_reply)) between 1 and 1000 and owner_reply!~*'(https?://|www\.)'),
 owner_reply_by uuid,owner_reply_at timestamptz,
 owner_reply_status text check(owner_reply_status in('published','hidden')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((author_id is null)<>(guest_contact_id is null)),
 check((guest_contact_id is null)=(guest_visitor_hash is null)),
 check((owner_reply is null)=(owner_reply_by is null) and (owner_reply is null)=(owner_reply_at is null) and (owner_reply is null)=(owner_reply_status is null)),
 check(moderation_status='published' or moderation_reason is not null),
 check((moderated_by is null)=(moderated_at is null))
);
create unique index if not exists dir_reviews_person_place on public.dir_reviews(author_id,place_id) where author_id is not null;
create unique index if not exists dir_reviews_guest_contact on public.dir_reviews(guest_contact_id) where guest_contact_id is not null;
create unique index if not exists dir_reviews_guest_device on public.dir_reviews(place_id,guest_visitor_hash) where guest_visitor_hash is not null;
create index if not exists dir_reviews_place_public on public.dir_reviews(place_id,created_at desc,id desc) where moderation_status='published';
create index if not exists dir_reviews_moderation on public.dir_reviews(moderation_status,created_at desc);

-- ---------------------------------------------------------------- protective trigger
create or replace function public.dir_reviews_protect() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare moderating boolean:=coalesce(current_setting('dir.review_moderation',true),'')='on';
begin
 if tg_op='DELETE' then raise exception 'Reviews are hidden, never deleted' using errcode='23514';end if;
 if tg_op='INSERT' then
  if not moderating and (new.moderation_status<>'published' or new.moderation_reason is not null or new.moderated_by is not null or new.owner_reply is not null) then
   raise exception 'Review moderation fields are managed by administrators' using errcode='42501',hint='dir_review_moderation_only';end if;
  return new;
 end if;
 if new.id<>old.id or new.place_id<>old.place_id or new.author_id is distinct from old.author_id or new.guest_contact_id is distinct from old.guest_contact_id
  or new.guest_visitor_hash is distinct from old.guest_visitor_hash or new.created_at<>old.created_at then
  raise exception 'Review identity is immutable' using errcode='23514';end if;
 if old.owner_reply is not null and (new.owner_reply is distinct from old.owner_reply or new.owner_reply_by is distinct from old.owner_reply_by or new.owner_reply_at is distinct from old.owner_reply_at) then
  raise exception 'The owner reply is final' using errcode='23514',hint='dir_review_reply_final';end if;
 if not moderating and (new.moderation_status is distinct from old.moderation_status or new.moderation_reason is distinct from old.moderation_reason
  or new.moderated_at is distinct from old.moderated_at or new.moderated_by is distinct from old.moderated_by
  or (old.owner_reply_status is not null and new.owner_reply_status is distinct from old.owner_reply_status)) then
  raise exception 'Review moderation fields are managed by administrators' using errcode='42501',hint='dir_review_moderation_only';end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
drop trigger if exists dir_reviews_protect on public.dir_reviews;
create trigger dir_reviews_protect before insert or update or delete on public.dir_reviews for each row execute function public.dir_reviews_protect();

-- ---------------------------------------------------------------- aggregate trigger
create or replace function public.dir_reviews_aggregate() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare pid uuid:=coalesce(new.place_id,old.place_id);
begin
 update public.dir_places p set rating_count=s.n,rating_avg=case when s.n=0 then null else s.avg end
 from(select count(*)::integer n,round(avg(r.rating)::numeric,2) avg from public.dir_reviews r where r.place_id=pid and r.moderation_status='published') s
 where p.id=pid and (p.rating_count is distinct from s.n or p.rating_avg is distinct from case when s.n=0 then null else s.avg end);
 return null;
end $$;
drop trigger if exists dir_reviews_aggregate on public.dir_reviews;
create trigger dir_reviews_aggregate after insert or update of rating,moderation_status on public.dir_reviews for each row execute function public.dir_reviews_aggregate();

do $$declare t text;begin foreach t in array array['dir_reviews','dir_place_contacts'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
end loop;end $$;
drop trigger if exists dir_place_contacts_immutable on public.dir_place_contacts;
create trigger dir_place_contacts_immutable before update or delete on public.dir_place_contacts for each row execute function public.dir_immutable();

-- ---------------------------------------------------------------- contacts (guest path)
-- Input: {contactId, channel, visitorHash}. Recorded when a visitor taps WhatsApp/call on a public place page;
-- the route keeps contactId in an httpOnly cookie of that device. visitorHash = server HMAC of the device id.
create or replace function public.dir_place_contact_record(p_actor uuid,p_slug text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare cid uuid;p public.dir_places;prior public.dir_place_contacts;vh text:=p_input->>'visitorHash';
begin
 if jsonb_typeof(p_input)<>'object' then raise exception 'Invalid contact' using errcode='22023';end if;
 cid:=public.dir_try_uuid(p_input->>'contactId');
 if cid is null or coalesce(p_input->>'channel','') not in('whatsapp','call','message') or coalesce(vh,'')!~'^[a-f0-9]{64}$'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('contactId','channel','visitorHash')) then raise exception 'Invalid contact' using errcode='22023';end if;
 if public.dir_place_public(p_slug) is null then raise exception 'Place unavailable' using errcode='P0002';end if;
 select * into p from public.dir_places where slug=p_slug;
 select * into prior from public.dir_place_contacts where id=cid;
 if found then
  if prior.place_id<>p.id or prior.visitor_hash<>vh or prior.channel<>p_input->>'channel' or prior.actor_id is distinct from p_actor then raise exception 'Contact id reused' using errcode='22023';end if;
  return jsonb_build_object('contactId',cid);
 end if;
 if (select count(*) from public.dir_place_contacts where visitor_hash=vh and created_at>clock_timestamp()-interval '1 day')>=30 then
  raise exception 'Too many contacts' using errcode='54000',hint='dir_contact_cap';end if;
 insert into public.dir_place_contacts(id,place_id,channel,visitor_hash,actor_id) values(cid,p.id,p_input->>'channel',vh,p_actor);
 return jsonb_build_object('contactId',cid);
end $$;

-- ---------------------------------------------------------------- submit / edit
-- Input: {actionId, reviewId, slug, revision (0 = new), rating, comment, authorName, contactId?, visitorHash?}.
-- p_actor = signed-in author, or null for a guest (then contactId + visitorHash are required).
create or replace function public.dir_review_submit(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;rev integer;p public.dir_places;ct public.dir_place_contacts;r public.dir_reviews;who uuid;prior jsonb;result jsonb;
 v_rating numeric;msg text:=btrim(regexp_replace(coalesce(p_input->>'comment',''),'\s+',' ','g'));nm text:=btrim(regexp_replace(coalesce(p_input->>'authorName',''),'\s+',' ','g'));
begin
 if jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'rating')<>'number' or jsonb_typeof(p_input->'revision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reviewId','slug','revision','rating','comment','authorName','contactId','visitorHash')) then
  raise exception 'Invalid review' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rid:=public.dir_try_uuid(p_input->>'reviewId');v_rating:=(p_input->>'rating')::numeric;
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid review' using errcode='22023';end;
 if aid is null or rid is null or rev<0 or v_rating<0.5 or v_rating>5 or v_rating*2<>floor(v_rating*2) or length(msg) not between 1 and 300
  or msg~*'(https?://|www\.|@[a-z0-9_.-]+)' or length(nm) not between 2 and 80 then raise exception 'Invalid review' using errcode='22023';end if;
 if p_actor is null then
  if public.dir_try_uuid(p_input->>'contactId') is null or coalesce(p_input->>'visitorHash','')!~'^[a-f0-9]{64}$' then
   raise exception 'Guest reviews need a registered contact' using errcode='42501',hint='dir_review_contact_required';end if;
  who:=public.dir_derived_uuid((p_input->>'contactId')::uuid,'guest');
 else
  if p_input ?| array['contactId','visitorHash'] then raise exception 'Invalid review' using errcode='22023';end if;
  who:=p_actor;
 end if;
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 if public.dir_place_public(p_input->>'slug') is null then raise exception 'Place unavailable' using errcode='P0002';end if;
 -- 2026-11-17 (later the same day, owner decision): banks/ATMs accept reviews again, about service and attention only (the
 -- place page shows the same scope note as health); still no prices, rates or financial products anywhere.
 select * into p from public.dir_places where slug=p_input->>'slug';
 perform pg_advisory_xact_lock(hashtextextended('dir-review:'||p.id::text||':'||who::text,0));
 if p_actor is not null and exists(select 1 from public.dir_place_managers where place_id=p.id and user_id=p_actor and status='active') then
  raise exception 'Managers cannot review their own place' using errcode='42501',hint='dir_review_own_place';end if;
 if p_actor is null then
  select * into ct from public.dir_place_contacts where id=(p_input->>'contactId')::uuid;
  if not found or ct.place_id<>p.id or ct.visitor_hash<>p_input->>'visitorHash' or ct.created_at<clock_timestamp()-interval '90 days' then
   raise exception 'Guest reviews need a registered contact' using errcode='42501',hint='dir_review_contact_required';end if;
  select * into r from public.dir_reviews where guest_contact_id=ct.id or (place_id=p.id and guest_visitor_hash=ct.visitor_hash) order by created_at limit 1;
 else
  select * into r from public.dir_reviews where author_id=p_actor and place_id=p.id;
 end if;
 if r.id is null then
  if rev<>0 then raise exception 'Review changed' using errcode='40001';end if;
  if exists(select 1 from public.dir_reviews where id=rid) then raise exception 'Review id reused' using errcode='22023';end if;
  if p_actor is not null and (select count(*) from public.dir_reviews where author_id=p_actor and created_at>clock_timestamp()-interval '1 day')>=10 then
   raise exception 'Too many reviews' using errcode='54000',hint='dir_review_cap';end if;
  insert into public.dir_reviews(id,place_id,author_id,guest_contact_id,guest_visitor_hash,author_name_snapshot,rating,comment)
  values(rid,p.id,p_actor,ct.id,ct.visitor_hash,nm,v_rating,msg) returning * into r;
 else
  -- One review per person and place: an edit updates it (moderation state is kept: a hidden review stays hidden).
  if r.id<>rid or r.revision<>rev then raise exception 'Review changed' using errcode='40001';end if;
  if p_actor is null and r.guest_contact_id<>ct.id then raise exception 'Review changed' using errcode='40001';end if;
  update public.dir_reviews set rating=v_rating,comment=msg,author_name_snapshot=nm,revision=revision+1 where id=r.id returning * into r;
 end if;
 result:=jsonb_build_object('reviewId',r.id,'revision',r.revision,'status',r.moderation_status);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- owner reply (once)
-- Input: {actionId, reviewId, reply}.
create or replace function public.dir_review_reply(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;prior jsonb;r public.dir_reviews;txt text:=btrim(coalesce(p_input->>'reply',''));result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid reply' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rid:=public.dir_try_uuid(p_input->>'reviewId');
 if aid is null or rid is null or length(txt) not between 1 and 1000 or txt~*'(https?://|www\.)'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reviewId','reply')) then raise exception 'Invalid reply' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into r from public.dir_reviews where id=rid for update;
 if not found or r.moderation_status<>'published' then raise exception 'Review not found' using errcode='P0002';end if;
 if not exists(select 1 from public.dir_place_managers where place_id=r.place_id and user_id=p_actor and status='active') then
  raise exception 'Only the place manager replies' using errcode='42501';end if;
 if r.author_id=p_actor then raise exception 'Cannot reply to your own review' using errcode='42501';end if;
 if r.owner_reply is not null then raise exception 'Already replied' using errcode='23505',hint='dir_review_reply_exists';end if;
 update public.dir_reviews set owner_reply=txt,owner_reply_by=p_actor,owner_reply_at=clock_timestamp(),owner_reply_status='published' where id=rid returning * into r;
 result:=jsonb_build_object('reviewId',rid,'ownerReplyStatus',r.owner_reply_status,'ownerReplyAt',r.owner_reply_at);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- moderation (staff)
-- Input: {actionId, reviewId, target: review|reply, status: published|hidden, reason (required to hide)}.
create or replace function public.dir_review_moderate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;prior jsonb;r public.dir_reviews;tgt text:=p_input->>'target';st text:=p_input->>'status';why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid moderation' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rid:=public.dir_try_uuid(p_input->>'reviewId');
 if aid is null or rid is null or tgt is null or tgt not in('review','reply') or st is null or st not in('published','hidden')
  or (st='hidden' and length(coalesce(why,''))<3) or length(coalesce(why,''))>500
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reviewId','target','status','reason')) then raise exception 'Invalid moderation' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into r from public.dir_reviews where id=rid for update;
 if not found then raise exception 'Review not found' using errcode='P0002';end if;
 if r.author_id=p_actor or r.owner_reply_by=p_actor then raise exception 'Cannot moderate your own text' using errcode='42501',hint='dir_review_self_moderation';end if;
 if tgt='reply' and r.owner_reply is null then raise exception 'No reply to moderate' using errcode='P0002';end if;
 if (tgt='review' and r.moderation_status=st) or (tgt='reply' and r.owner_reply_status=st) then raise exception 'Nothing to change' using errcode='22023';end if;
 perform set_config('dir.review_moderation','on',true);
 if tgt='review' then
  update public.dir_reviews set moderation_status=st,moderation_reason=case when st='hidden' then why else coalesce(why,moderation_reason) end,moderated_by=p_actor,moderated_at=clock_timestamp() where id=rid returning * into r;
 else
  update public.dir_reviews set owner_reply_status=st,moderation_reason=coalesce(why,moderation_reason),moderated_by=p_actor,moderated_at=clock_timestamp() where id=rid returning * into r;
 end if;
 perform set_config('dir.review_moderation','off',true);
 result:=jsonb_build_object('reviewId',rid,'status',r.moderation_status,'ownerReplyStatus',r.owner_reply_status);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- readers
-- Public: published reviews only, newest first, 20 per page; cursor {at,id}. No author ids, contacts or moderators.
create or replace function public.dir_place_reviews_public(p_slug text,p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pub jsonb:=public.dir_place_public(p_slug);pid uuid;cat timestamptz;cid uuid;items jsonb;
begin
 if pub is null then return null;end if;
 select id into pid from public.dir_places where slug=p_slug;
 if p_after is not null then
  begin cat:=(p_after->>'at')::timestamptz;cid:=(p_after->>'id')::uuid;exception when others then raise exception 'Invalid cursor' using errcode='22023';end;
  if cat is null or cid is null then raise exception 'Invalid cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(x.j order by x.created_at desc,x.id desc),'[]') into items from(
  select r.created_at,r.id,jsonb_build_object('id',r.id,'name',r.author_name_snapshot,'rating',r.rating,'comment',r.comment,'guest',r.author_id is null,
   'createdAt',r.created_at,'edited',r.revision>1,
   'ownerReply',case when r.owner_reply_status='published' then jsonb_build_object('text',r.owner_reply,'at',r.owner_reply_at) end) j
  from public.dir_reviews r where r.place_id=pid and r.moderation_status='published' and (cat is null or (r.created_at,r.id)<(cat,cid))
  order by r.created_at desc,r.id desc limit 21) x;
 return jsonb_build_object('summary',pub->'rating','items',case when jsonb_array_length(items)>20 then items-20 else items end,
  'nextCursor',case when jsonb_array_length(items)>20 then jsonb_build_object('at',items->19->>'createdAt','id',items->19->>'id') end);
end $$;

-- Author view of their own review (also when hidden, with the reason).
create or replace function public.dir_review_mine(p_actor uuid,p_slug text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('reviewId',r.id,'revision',r.revision,'rating',r.rating,'comment',r.comment,'name',r.author_name_snapshot,
  'status',r.moderation_status,'moderationReason',r.moderation_reason,'ownerReply',case when r.owner_reply_status='published' then r.owner_reply end,'updatedAt',r.updated_at)
 from public.dir_reviews r join public.dir_places p on p.id=r.place_id where p.slug=p_slug and r.author_id=p_actor $$;

-- Staff list (feeds admin_reviews_unified, see wiring notes).
create or replace function public.dir_review_admin_list(p_status text default null,p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.created_at desc),'[]') from(
  select r.created_at,jsonb_build_object('reviewId',r.id,'placeId',p.id,'slug',p.slug,'placeName',p.name,'authorId',r.author_id,'guest',r.author_id is null,
   'name',r.author_name_snapshot,'rating',r.rating,'comment',r.comment,'status',r.moderation_status,'reason',r.moderation_reason,
   'moderatedBy',r.moderated_by,'moderatedAt',r.moderated_at,'ownerReply',r.owner_reply,'ownerReplyStatus',r.owner_reply_status,'createdAt',r.created_at) j
  from public.dir_reviews r join public.dir_places p on p.id=r.place_id
  where p_status is null or r.moderation_status=p_status order by r.created_at desc limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['dir_reviews','dir_place_contacts'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n='dir_place_contacts' then execute format('grant select,insert on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
