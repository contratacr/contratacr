-- LOCAL PRO ONLY. Launch round (2026-11-18): photo uploads of directory places. Depends on directory-core-local.sql
-- (dir_place_media), directory-claims-local.sql (managers, receipts), directory-reviews-local.sql, directory-moderation-local.sql
-- (dir_moderation_log) and directory-place-tools-local.sql (dir_tool_authorize, team roles).
-- 2026-11-18 (launch without Pro): a company member's role resolves through dir_tool_authorize → the NEUTRAL helpers
-- dir_business_role_of / dir_business_allows (dir-business-roles-local.sql); without the Pro team module every member
-- identity is refused and only the place's own owner/managers (acting as themselves) publish at once.
-- * dir_place_media gains provenance and moderation: origin seed|owner|user, uploader, Pro team member, optional review,
--   sha256 of the normalized image, size, storage paths (private bucket dir-place-photos), caption, revision (CAS) and staff
--   decision. Status: pending -> active (= approved, the only public state) | rejected; active -> removed | hidden. Seed rows
--   (imported URLs) keep origin 'seed'.
-- * dir_place_photo_add(actor, member, input): the active manager of a claimed place (or a member of the owner's Pro team
--   whose role allows listing.publish) publishes at once (still reportable); any other signed-in person uploads as
--   'pending' until staff approves it. A review photo needs the uploader's own published review of that place. Dedupe:
--   the same image (sha256) cannot be pending/active twice on one place (23505, hint dir_photo_duplicate). Caps: 20 uploads
--   per person a day (54000 dir_photo_cap), 5 per review, 80 visible+pending per place (dir_photo_place_cap). Every
--   accepted photo records provenance (field media, source owner|community).
-- * dir_place_photo_remove: the uploader (or a manager for owner photos) removes a photo (status removed, final).
-- * dir_place_photo_flag_create: anyone reports an active photo (signed in, or a device HMAC), one per person, 20 a day.
-- * Staff: dir_admin_photo_queue(pending|flagged|recent) and dir_admin_photo_moderate(approve|reject|remove|restore|dismiss,
--   reason, expectedStatus CAS, idempotent actionId) -> immutable dir_moderation_log (kind 'photo').
-- Tables: RLS on, service_role only, no DELETE grant. Functions security invoker, pinned search_path, service_role only.
begin;

-- ---------------------------------------------------------------- dir_place_media: provenance + moderation
alter table public.dir_place_media add column if not exists origin text not null default 'seed';
alter table public.dir_place_media add column if not exists uploader_id uuid;
alter table public.dir_place_media add column if not exists member_id uuid;
alter table public.dir_place_media add column if not exists review_id uuid references public.dir_reviews(id);
alter table public.dir_place_media add column if not exists sha256 text;
alter table public.dir_place_media add column if not exists width integer;
alter table public.dir_place_media add column if not exists height integer;
alter table public.dir_place_media add column if not exists path_1600 text;
alter table public.dir_place_media add column if not exists path_800 text;
alter table public.dir_place_media add column if not exists path_320 text;
alter table public.dir_place_media add column if not exists caption text;
alter table public.dir_place_media add column if not exists revision integer not null default 1;
alter table public.dir_place_media add column if not exists moderated_by uuid;
alter table public.dir_place_media add column if not exists moderated_at timestamptz;
alter table public.dir_place_media add column if not exists moderation_reason text;
alter table public.dir_place_media add column if not exists updated_at timestamptz not null default clock_timestamp();

do $$declare c record;begin
 -- Widen the status list once (the core module allows active|hidden).
 for c in select conname from pg_constraint where conrelid='public.dir_place_media'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%''hidden''%' and pg_get_constraintdef(oid) not like '%''pending''%' loop
  execute format('alter table public.dir_place_media drop constraint %I',c.conname);
 end loop;
 if not exists(select 1 from pg_constraint where conname='dir_place_media_status_v2' and conrelid='public.dir_place_media'::regclass) then
  alter table public.dir_place_media add constraint dir_place_media_status_v2 check(status in('active','hidden','pending','rejected','removed'));end if;
 if not exists(select 1 from pg_constraint where conname='dir_place_media_upload_shape' and conrelid='public.dir_place_media'::regclass) then
  alter table public.dir_place_media add constraint dir_place_media_upload_shape check(
   origin in('seed','owner','user')
   and (origin='seed' or (uploader_id is not null and sha256~'^[a-f0-9]{64}$' and width between 200 and 1600 and height between 200 and 1600
     and path_1600~'^dir-places/[0-9a-f-]{36}/1600\.(webp|jpg)$' and path_800~'^dir-places/[0-9a-f-]{36}/800\.(webp|jpg)$' and path_320~'^dir-places/[0-9a-f-]{36}/320\.(webp|jpg)$'))
   and (origin<>'owner' or review_id is null)
   and (caption is null or (length(caption) between 1 and 200 and caption!~*'(https?://|www\.)'))
   and (moderation_reason is null or length(moderation_reason) between 3 and 1000)
   and revision>0 and (status<>'pending' or origin='user'));end if;
end $$;
create unique index if not exists dir_place_media_dedupe on public.dir_place_media(place_id,sha256) where sha256 is not null and status in('pending','active');
create index if not exists dir_place_media_pending on public.dir_place_media(created_at) where status='pending';
create index if not exists dir_place_media_uploader on public.dir_place_media(uploader_id,created_at) where uploader_id is not null;

-- ---------------------------------------------------------------- photo reports
create table if not exists public.dir_place_media_flags(
 id uuid primary key,
 media_id uuid not null references public.dir_place_media(id),
 reporter_id uuid,
 visitor_hash text check(visitor_hash~'^[a-f0-9]{64}$'),
 reason text not null check(reason in('not_this_place','offensive','private_info','copyright','spam','other')),
 message text check(length(message) between 1 and 500),
 input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 status text not null default 'open' check(status in('open','upheld','dismissed')),
 resolved_by uuid,resolved_at timestamptz,resolution_action uuid,
 created_at timestamptz not null default clock_timestamp(),
 check((reporter_id is null)<>(visitor_hash is null)),
 check((status='open')=(resolved_at is null)),
 check((resolved_by is null)=(resolved_at is null))
);
create unique index if not exists dir_place_media_flags_person on public.dir_place_media_flags(media_id,reporter_id) where reporter_id is not null;
create unique index if not exists dir_place_media_flags_device on public.dir_place_media_flags(media_id,visitor_hash) where visitor_hash is not null;
create index if not exists dir_place_media_flags_open on public.dir_place_media_flags(media_id) where status='open';

-- ---------------------------------------------------------------- moderation log kind 'photo' (keeps every existing kind)
do $$declare def text;kinds text[];begin
 select pg_get_constraintdef(oid) into def from pg_constraint where conname='dir_moderation_log_kind_check' and conrelid='public.dir_moderation_log'::regclass;
 if def is null or def not like '%''photo''%' then
  select coalesce(array_agg(distinct m[1]),'{}') into kinds from regexp_matches(coalesce(def,''),'([a-z_]{3,})','g') m where m[1] not in('kind','any','array','text','check');
  kinds:=kinds||array(select distinct l.kind from public.dir_moderation_log l);
  kinds:=array(select distinct unnest(kinds||array['claim','review','reply','price','report','permit','photo']) order by 1);
  if def is not null then alter table public.dir_moderation_log drop constraint dir_moderation_log_kind_check;end if;
  execute format('alter table public.dir_moderation_log add constraint dir_moderation_log_kind_check check(kind = any(%L::text[]))',kinds);
 end if;
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.dir_photo_json(m public.dir_place_media) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',m.id,'status',case m.status when 'active' then 'approved' else m.status end,'origin',m.origin,'caption',m.caption,
  'width',m.width,'height',m.height,'reviewId',m.review_id,'revision',m.revision,'createdAt',m.created_at) $$;

-- ---------------------------------------------------------------- add (owner / team member / signed-in person)
-- Input: {actionId, mediaId, slug, review (bool), caption?, sha256, width, height, path1600, path800, path320, url}.
-- p_actor = effective account (the owner's when a Pro team member works in the owner's company); p_member = that member.
create or replace function public.dir_place_photo_add(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;mid uuid;prior jsonb;p public.dir_places;human uuid:=coalesce(p_member,p_actor);own boolean;rid uuid;cap text;m public.dir_place_media;result jsonb;
 base text;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','mediaId','slug','review','caption','sha256','width','height','path1600','path800','path320','url')) then
  raise exception 'Invalid photo' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');mid:=public.dir_try_uuid(p_input->>'mediaId');
 cap:=nullif(btrim(regexp_replace(coalesce(p_input->>'caption',''),'\s+',' ','g')),'');
 base:='dir-places/'||mid::text||'/';
 if aid is null or mid is null or jsonb_typeof(p_input->'width')<>'number' or jsonb_typeof(p_input->'height')<>'number'
  or coalesce(p_input->>'sha256','')!~'^[a-f0-9]{64}$' or coalesce(jsonb_typeof(p_input->'review'),'boolean')<>'boolean'
  or length(coalesce(cap,''))>200 or coalesce(cap,'')~*'(https?://|www\.)'
  or coalesce(p_input->>'path1600','') not in(base||'1600.webp',base||'1600.jpg') or coalesce(p_input->>'path800','') not in(base||'800.webp',base||'800.jpg')
  or coalesce(p_input->>'path320','') not in(base||'320.webp',base||'320.jpg')
  or coalesce(p_input->>'url','')!~('^https://[a-z0-9.-]+(:[0-9]+)?/api/fotos-lugar/'||mid::text||'$') then
  raise exception 'Invalid photo' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into p from public.dir_places where slug=p_input->>'slug';
 if not found or public.dir_place_public(p.slug) is null then raise exception 'Place not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-photo:'||p.id::text,0));
 -- Who publishes at once: a manager of the claimed place, or a team member allowed to publish listings.
 if p_member is not null and p_member<>p_actor then perform public.dir_tool_authorize(p_actor,p_member,p.id,'listing.publish');own:=true;
 else own:=p.claim_status='claimed' and exists(select 1 from public.dir_place_managers g where g.place_id=p.id and g.user_id=p_actor and g.status='active');end if;
 if coalesce((p_input->>'review')::boolean,false) then
  if own then raise exception 'The business cannot attach photos to reviews' using errcode='42501',hint='dir_review_own_place';end if;
  select r.id into rid from public.dir_reviews r where r.place_id=p.id and r.author_id=human and r.moderation_status='published';
  if rid is null then raise exception 'Review first' using errcode='P0002',hint='dir_photo_review_missing';end if;
  if (select count(*) from public.dir_place_media x where x.review_id=rid and x.status in('pending','active'))>=5 then
   raise exception 'Too many review photos' using errcode='54000',hint='dir_photo_review_cap';end if;
 end if;
 if exists(select 1 from public.dir_place_media x where x.id=mid) then raise exception 'Photo id reused' using errcode='23505',hint='dir_photo_duplicate';end if;
 if exists(select 1 from public.dir_place_media x where x.place_id=p.id and x.sha256=p_input->>'sha256' and x.status in('pending','active')) then
  raise exception 'Same photo already on this place' using errcode='23505',hint='dir_photo_duplicate';end if;
 if (select count(*) from public.dir_place_media x where x.uploader_id=human and x.created_at>clock_timestamp()-interval '1 day')>=20 then
  raise exception 'Too many photos today' using errcode='54000',hint='dir_photo_cap';end if;
 if (select count(*) from public.dir_place_media x where x.place_id=p.id and x.status in('pending','active'))>=80 then
  raise exception 'Too many photos on this place' using errcode='54000',hint='dir_photo_place_cap';end if;
 insert into public.dir_place_media(id,place_id,kind,url,alt_es,alt_en,source_id,sort,status,origin,uploader_id,member_id,review_id,sha256,width,height,path_1600,path_800,path_320,caption)
  values(mid,p.id,'photo',p_input->>'url',cap,cap,case when own then 'owner' else 'community' end,case when own then 0 else 10 end,
   case when own then 'active' else 'pending' end,case when own then 'owner' else 'user' end,human,case when p_member<>p_actor then p_member end,rid,
   p_input->>'sha256',(p_input->>'width')::int,(p_input->>'height')::int,p_input->>'path1600',p_input->>'path800',p_input->>'path320',cap)
  returning * into m;
 if own then
  insert into public.dir_field_provenance(place_id,field,source_id,source_ref,observed_at,action_id) values(p.id,'media','owner','photo:'||mid::text,clock_timestamp(),aid);
 end if;
 result:=jsonb_build_object('ok',true,'photo',public.dir_photo_json(m));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- remove (uploader, or manager for owner photos)
-- Input: {actionId, mediaId}. Final: a removed photo never comes back (staff 'restore' is only for hidden ones).
create or replace function public.dir_place_photo_remove(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;mid uuid;prior jsonb;m public.dir_place_media;human uuid:=coalesce(p_member,p_actor);allowed boolean;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','mediaId')) then
  raise exception 'Invalid photo' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');mid:=public.dir_try_uuid(p_input->>'mediaId');
 if aid is null or mid is null then raise exception 'Invalid photo' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into m from public.dir_place_media where id=mid for update;
 if not found or m.origin='seed' or m.status not in('pending','active','hidden') then raise exception 'Photo not found' using errcode='P0002';end if;
 allowed:=m.uploader_id=human;
 if not allowed and m.origin='owner' then
  if p_member is not null and p_member<>p_actor then perform public.dir_tool_authorize(p_actor,p_member,m.place_id,'listing.publish');allowed:=true;
  else allowed:=exists(select 1 from public.dir_place_managers g where g.place_id=m.place_id and g.user_id=p_actor and g.status='active');end if;
 end if;
 if not allowed then raise exception 'Not your photo' using errcode='42501',hint='dir_photo_not_owner';end if;
 update public.dir_place_media set status='removed',revision=revision+1,updated_at=clock_timestamp() where id=mid returning * into m;
 result:=jsonb_build_object('ok',true,'photo',public.dir_photo_json(m));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- public: report a photo
-- Input: {flagId, mediaId, reason, message?, visitorHash?}. p_actor = signed-in person, or null with visitorHash.
create or replace function public.dir_place_photo_flag_create(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare fid uuid;mid uuid;m public.dir_place_media;prior public.dir_place_media_flags;vh text:=p_input->>'visitorHash';h text;msg text;who text;p public.dir_places;
begin
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('flagId','mediaId','reason','message','visitorHash')) then
  raise exception 'Invalid flag' using errcode='22023';end if;
 fid:=public.dir_try_uuid(p_input->>'flagId');mid:=public.dir_try_uuid(p_input->>'mediaId');msg:=nullif(btrim(regexp_replace(coalesce(p_input->>'message',''),'\s+',' ','g')),'');
 if fid is null or mid is null or coalesce(p_input->>'reason','') not in('not_this_place','offensive','private_info','copyright','spam','other')
  or length(coalesce(msg,''))>500 or (p_input->>'reason'='other' and length(coalesce(msg,''))<5)
  or (p_actor is null)=(vh is null) or (vh is not null and vh!~'^[a-f0-9]{64}$') then raise exception 'Invalid flag' using errcode='22023';end if;
 who:=coalesce(p_actor::text,vh);
 h:=encode(sha256(convert_to(jsonb_build_object('who',who,'media',mid,'reason',p_input->>'reason','message',msg)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('dir-photo-flag:'||who,0));
 select * into prior from public.dir_place_media_flags where id=fid;
 if found then if prior.input_hash<>h then raise exception 'Flag id reused' using errcode='22023';end if;return jsonb_build_object('ok',true);end if;
 select * into m from public.dir_place_media where id=mid;
 if not found or m.status<>'active' then raise exception 'Photo not found' using errcode='P0002';end if;
 select * into p from public.dir_places where id=m.place_id;
 if public.dir_place_public(p.slug) is null then raise exception 'Photo not found' using errcode='P0002';end if;
 if p_actor is not null and m.uploader_id=p_actor then raise exception 'Cannot report your own photo' using errcode='42501',hint='dir_photo_own_flag';end if;
 if exists(select 1 from public.dir_place_media_flags f where f.media_id=mid and (f.reporter_id=p_actor or f.visitor_hash=vh)) then return jsonb_build_object('ok',true);end if;
 if (select count(*) from public.dir_place_media_flags f where coalesce(f.reporter_id::text,f.visitor_hash)=who and f.created_at>clock_timestamp()-interval '1 day')>=20 then
  raise exception 'Too many flags' using errcode='54000',hint='dir_flag_cap';end if;
 insert into public.dir_place_media_flags(id,media_id,reporter_id,visitor_hash,reason,message,input_hash) values(fid,mid,p_actor,vh,p_input->>'reason',msg,h);
 return jsonb_build_object('ok',true);
end $$;

-- ---------------------------------------------------------------- public reads
-- Approved photos of a public place (owner photos first, then newest). No uploader ids.
create or replace function public.dir_place_photos_public(p_slug text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when public.dir_place_public(p_slug) is null then null else coalesce((select jsonb_agg(public.dir_photo_json(m) order by m.sort,m.created_at desc,m.id)
  from public.dir_place_media m join public.dir_places p on p.id=m.place_id where p.slug=p_slug and m.status='active' and m.origin<>'seed'),'[]') end $$;

-- Storage object of a photo for the serving route: only approved photos of public places (staff preview passes p_staff).
create or replace function public.dir_place_photo_object(p_id uuid,p_staff boolean default false) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('path1600',m.path_1600,'path800',m.path_800,'path320',m.path_320,'status',m.status)
 from public.dir_place_media m join public.dir_places p on p.id=m.place_id
 where m.id=p_id and m.origin<>'seed' and (case when coalesce(p_staff,false) then m.status<>'removed' else m.status='active' and public.dir_place_public(p.slug) is not null end) $$;

-- ---------------------------------------------------------------- staff
-- p_filter: pending (awaiting approval) | flagged (open reports) | recent (any uploaded photo).
create or replace function public.dir_admin_photo_queue(p_filter text default 'pending',p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.k desc),'[]') from(
  select coalesce((select max(f.created_at) from public.dir_place_media_flags f where f.media_id=m.id and f.status='open'),m.created_at) k,
   public.dir_photo_json(m)||jsonb_build_object('slug',p.slug,'placeName',p.name,'uploaderId',m.uploader_id,
    'reviewComment',(select r.comment from public.dir_reviews r where r.id=m.review_id),
    'openFlags',(select count(*) from public.dir_place_media_flags f where f.media_id=m.id and f.status='open'),
    'flags',coalesce((select jsonb_agg(jsonb_build_object('reason',f.reason,'message',f.message,'at',f.created_at) order by f.created_at desc) from public.dir_place_media_flags f where f.media_id=m.id and f.status='open'),'[]')) j
  from public.dir_place_media m join public.dir_places p on p.id=m.place_id
  where m.origin<>'seed' and case coalesce(p_filter,'pending') when 'pending' then m.status='pending'
   when 'flagged' then exists(select 1 from public.dir_place_media_flags f where f.media_id=m.id and f.status='open') else m.status<>'removed' end
  order by 1 desc limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- Input: {actionId, mediaId, decision: approve|reject|remove|restore|dismiss, reason (required except approve/dismiss), expectedStatus}.
--  approve: pending -> active; reject: pending -> rejected; remove: active -> hidden (reported photo taken down, flags upheld);
--  restore: hidden -> active; dismiss: closes the open reports of an active photo.
create or replace function public.dir_admin_photo_moderate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;mid uuid;prior jsonb;m public.dir_place_media;dec text:=p_input->>'decision';why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');
 exp text:=p_input->>'expectedStatus';nxt text;before jsonb;after jsonb;closed integer;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','mediaId','decision','reason','expectedStatus')) then
  raise exception 'Invalid moderation' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');mid:=public.dir_try_uuid(p_input->>'mediaId');
 if aid is null or mid is null or coalesce(dec,'') not in('approve','reject','remove','restore','dismiss') or coalesce(exp,'') not in('pending','approved','hidden')
  or not public.dir_mod_reason_ok(why,dec in('approve','dismiss')) then raise exception 'Invalid moderation' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into m from public.dir_place_media where id=mid for update;
 if not found or m.origin='seed' then raise exception 'Photo not found' using errcode='P0002';end if;
 if m.uploader_id=p_actor or exists(select 1 from public.dir_place_managers g where g.place_id=m.place_id and g.user_id=p_actor and g.status='active') then
  raise exception 'Staff cannot moderate their own place or photo' using errcode='42501',hint='dir_review_self_moderation';end if;
 if (case m.status when 'active' then 'approved' else m.status end)<>exp then raise exception 'Photo changed' using errcode='40001';end if;
 nxt:=case dec when 'approve' then case when m.status='pending' then 'active' end when 'reject' then case when m.status='pending' then 'rejected' end
  when 'remove' then case when m.status='active' then 'hidden' end when 'restore' then case when m.status='hidden' then 'active' end
  when 'dismiss' then case when m.status='active' then 'active' end end;
 if nxt is null then raise exception 'Photo changed' using errcode='40001';end if;
 before:=jsonb_build_object('status',m.status,'openFlags',(select count(*) from public.dir_place_media_flags where media_id=mid and status='open'));
 if dec<>'dismiss' then
  update public.dir_place_media set status=nxt,revision=revision+1,moderated_by=p_actor,moderated_at=clock_timestamp(),moderation_reason=why,updated_at=clock_timestamp()
   where id=mid returning * into m;
  if dec='approve' then
   insert into public.dir_field_provenance(place_id,field,source_id,source_ref,observed_at,action_id) values(m.place_id,'media','community','photo:'||mid::text,m.created_at,aid);
  end if;
 end if;
 if dec in('remove','dismiss','restore') then
  update public.dir_place_media_flags set status=case when dec='remove' then 'upheld' else 'dismissed' end,resolved_by=p_actor,resolved_at=clock_timestamp(),resolution_action=aid
   where media_id=mid and status='open';
 end if;
 get diagnostics closed=row_count;
 after:=public.dir_photo_json(m)||jsonb_build_object('decision',dec);
 perform public.dir_mod_log(p_actor,aid,'photo',mid,m.place_id,dec,why,before,after);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,after);
 return after;
end $$;

-- ---------------------------------------------------------------- storage (skipped where Storage is not installed)
do $$
begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('dir-place-photos','dir-place-photos',false,20971520,array['image/webp','image/jpeg'])
   on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
 end if;
end $$;

-- ---------------------------------------------------------------- privileges
do $$begin
 alter table public.dir_place_media_flags enable row level security;
 revoke all on public.dir_place_media_flags from public,anon,authenticated,service_role;
 grant select,insert,update on public.dir_place_media_flags to service_role;
end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and (p.proname like 'dir\_place\_photo%' or p.proname in('dir_photo_json','dir_admin_photo_queue','dir_admin_photo_moderate')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
