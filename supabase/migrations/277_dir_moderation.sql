-- LOCAL PRO ONLY. Multivertical round M1 (2026-11-16): staff moderation queue of the public directory + owner replies
-- with history + review flags + claim document uploads. Depends on directory-core-local.sql, directory-claims-local.sql,
-- directory-reviews-local.sql and price-observations-local.sql (all applied before it in the manifest).
-- * dir_moderation_log: ONE immutable audit trail for every staff decision of the queue (claims, reviews/replies,
--   price reports, place reports, pharmacy permits): actor, idempotent actionId (unique per actor), reason,
--   before/after snapshots. Each dir_admin_* function also stores a receipt in dir_place_actions (same actionId +
--   same input -> same answer; same actionId + other input -> 22023) and checks an expected state (CAS -> 40001).
-- * dir_review_flags: public reports of a review (signed-in person or device hash), one per person per review,
--   capped. Staff hides/restores/dismisses through dir_admin_review_moderate, which closes the open flags.
-- * Owner reply with history: dir_review_reply_write lets an active owner/manager of the place (or a member of the
--   owner's Pro team whose role allows listing.publish = admin/manager) post ONE public reply per review and edit it
--   with CAS (replyRevision). Every revision is kept in the immutable dir_review_reply_history. The protective trigger
--   of the reviews module is replaced so the reply text can change ONLY through that function.
-- * Place reports: dir_admin_report_resolve applies a fix (dir_place_mutate update, source contratacr), hides,
--   closes, removes, recategorizes (vertical change with attribute filtering, history + provenance) or rejects.
-- * Pharmacies (Decreto 36868-S): dir_admin_pharmacy_verify records the health permit (number + evidence) in the
--   immutable dir_place_permits, sets licenseNumber and license_verified and publishes a draft. It never touches
--   prices: prescription medicines stay blocked by price-observations-local.sql.
-- * Claim documents: dir_claim_upload_record registers each private file (bucket dir-claim-documents, object
--   dir-claims/<claimId>/<file>) for its uploader; dir_claim_open_reviewed opens document_review / hacienda_juridica
--   claims only with files uploaded by the same person for that claim id.
-- Tables: RLS on, service_role only, no DELETE grant; logs, history, permits and uploads immutable. Functions
-- security invoker with a pinned search_path, executable only by service_role. Idempotent (create or replace / if
-- not exists); it never edits rows of other modules except through their own functions.
-- 2026-11-18 (launch without Pro): company-member roles come from the NEUTRAL helpers dir_business_role_of /
-- dir_business_allows (dir-business-roles-local.sql, required); they delegate to the Pro team module only when installed.
begin;

-- ---------------------------------------------------------------- audit log
create table if not exists public.dir_moderation_log(
 id bigint generated always as identity primary key,
 actor_id uuid not null,action_id uuid not null,
 kind text not null check(kind in('claim','review','reply','price','report','permit')),
 target_id uuid not null,place_id uuid references public.dir_places(id),
 decision text not null check(decision~'^[a-z_]{2,40}$'),
 reason text check(length(reason) between 1 and 1000),
 before jsonb,after jsonb not null,
 at timestamptz not null default clock_timestamp(),
 unique(actor_id,action_id)
);
create index if not exists dir_moderation_log_kind on public.dir_moderation_log(kind,at desc);
create index if not exists dir_moderation_log_target on public.dir_moderation_log(target_id,id);

-- ---------------------------------------------------------------- review flags
create table if not exists public.dir_review_flags(
 id uuid primary key,
 review_id uuid not null references public.dir_reviews(id),
 reporter_id uuid,
 visitor_hash text check(visitor_hash~'^[a-f0-9]{64}$'),
 reason text not null check(reason in('spam','offensive','fake','conflict_of_interest','private_info','other')),
 message text check(length(message) between 1 and 500),
 input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 status text not null default 'open' check(status in('open','upheld','dismissed')),
 resolved_by uuid,resolved_at timestamptz,resolution_action uuid,
 created_at timestamptz not null default clock_timestamp(),
 check((reporter_id is null)<>(visitor_hash is null)),
 check((status='open')=(resolved_at is null)),
 check((resolved_by is null)=(resolved_at is null))
);
create unique index if not exists dir_review_flags_person on public.dir_review_flags(review_id,reporter_id) where reporter_id is not null;
create unique index if not exists dir_review_flags_device on public.dir_review_flags(review_id,visitor_hash) where visitor_hash is not null;
create index if not exists dir_review_flags_open on public.dir_review_flags(review_id) where status='open';
create index if not exists dir_review_flags_reporter on public.dir_review_flags(coalesce(reporter_id::text,visitor_hash),created_at);

create or replace function public.dir_review_flags_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Review flags are never deleted' using errcode='23514';end if;
 if new.id<>old.id or new.review_id<>old.review_id or new.reporter_id is distinct from old.reporter_id or new.visitor_hash is distinct from old.visitor_hash
  or new.reason<>old.reason or new.message is distinct from old.message or new.input_hash<>old.input_hash or new.created_at<>old.created_at then
  raise exception 'Flag identity is immutable' using errcode='23514';end if;
 if old.status<>'open' then raise exception 'A resolved flag is final' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists dir_review_flags_guard on public.dir_review_flags;
create trigger dir_review_flags_guard before update or delete on public.dir_review_flags for each row execute function public.dir_review_flags_guard();

-- ---------------------------------------------------------------- owner reply revisions
alter table public.dir_reviews add column if not exists owner_reply_revision integer;
do $$begin
 if not exists(select 1 from pg_constraint where conname='dir_reviews_owner_reply_revision_check' and conrelid='public.dir_reviews'::regclass) then
  alter table public.dir_reviews add constraint dir_reviews_owner_reply_revision_check check(owner_reply_revision is null or owner_reply_revision>0);
 end if;end $$;
create table if not exists public.dir_review_reply_history(
 id bigint generated always as identity primary key,
 review_id uuid not null references public.dir_reviews(id),
 revision integer not null check(revision>0),
 reply text not null check(length(btrim(reply)) between 1 and 1000),
 edited_by uuid not null,member_id uuid,action_id uuid not null,
 at timestamptz not null default clock_timestamp(),
 unique(review_id,revision)
);

-- Replaces the reviews-module trigger: identical rules, except that the reply text/revision may change when
-- dir_review_reply_write sets dir.review_reply_edit (next revision only, same original author and time).
create or replace function public.dir_reviews_protect() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare moderating boolean:=coalesce(current_setting('dir.review_moderation',true),'')='on';
 editing boolean:=coalesce(current_setting('dir.review_reply_edit',true),'')='on';
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
 if old.owner_reply is null and new.owner_reply is not null then new.owner_reply_revision:=coalesce(new.owner_reply_revision,1);end if;
 if old.owner_reply is not null then
  if editing then
   if new.owner_reply is null or new.owner_reply_by is distinct from old.owner_reply_by or new.owner_reply_at is distinct from old.owner_reply_at
    or new.owner_reply_revision is distinct from coalesce(old.owner_reply_revision,1)+1 then
    raise exception 'Invalid reply edit' using errcode='23514',hint='dir_review_reply_final';end if;
  elsif new.owner_reply is distinct from old.owner_reply or new.owner_reply_by is distinct from old.owner_reply_by or new.owner_reply_at is distinct from old.owner_reply_at
   or coalesce(new.owner_reply_revision,1) is distinct from coalesce(old.owner_reply_revision,1) then
   raise exception 'The owner reply changes only through its edit function' using errcode='23514',hint='dir_review_reply_final';
  end if;
 end if;
 if not moderating and (new.moderation_status is distinct from old.moderation_status or new.moderation_reason is distinct from old.moderation_reason
  or new.moderated_at is distinct from old.moderated_at or new.moderated_by is distinct from old.moderated_by
  or (old.owner_reply_status is not null and new.owner_reply_status is distinct from old.owner_reply_status)) then
  raise exception 'Review moderation fields are managed by administrators' using errcode='42501',hint='dir_review_moderation_only';end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
update public.dir_reviews set owner_reply_revision=1 where owner_reply is not null and owner_reply_revision is null;

-- ---------------------------------------------------------------- claim uploads + permits
create table if not exists public.dir_claim_uploads(
 path text primary key check(path~'^dir-claims/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
 claim_id uuid not null,uploader_id uuid not null,
 kind text not null check(kind in('municipal_license','legal_personhood','health_permit','utility_bill','other')),
 mime text not null check(mime in('image/jpeg','image/png','image/webp','image/gif','application/pdf')),
 size integer not null check(size between 1 and 4194304),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 check(left(path,48)='dir-claims/'||claim_id::text||'/')
);
create index if not exists dir_claim_uploads_claim on public.dir_claim_uploads(claim_id);
create index if not exists dir_claim_uploads_uploader on public.dir_claim_uploads(uploader_id,created_at);

create table if not exists public.dir_place_permits(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 permit_number text not null check(permit_number~'^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$'),
 authority text not null check(length(btrim(authority)) between 2 and 120),
 evidence jsonb not null check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=4096),
 verified_by uuid not null,action_id uuid not null,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists dir_place_permits_place on public.dir_place_permits(place_id,created_at desc);

do $$declare t text;begin
 foreach t in array array['dir_moderation_log','dir_review_reply_history','dir_claim_uploads','dir_place_permits'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function public.dir_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['dir_moderation_log','dir_review_reply_history','dir_claim_uploads','dir_place_permits','dir_review_flags'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
 end loop;end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.dir_mod_log(p_actor uuid,p_action uuid,p_kind text,p_target uuid,p_place uuid,p_decision text,p_reason text,p_before jsonb,p_after jsonb) returns void
language sql security invoker set search_path=public,pg_temp as $$
 insert into public.dir_moderation_log(actor_id,action_id,kind,target_id,place_id,decision,reason,before,after)
 values(p_actor,p_action,p_kind,p_target,p_place,p_decision,nullif(btrim(coalesce(p_reason,'')),''),p_before,p_after) $$;

-- Staff reason: required (3..1000) unless p_optional.
create or replace function public.dir_mod_reason_ok(p_reason text,p_optional boolean) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when nullif(btrim(coalesce(p_reason,'')),'') is null then p_optional else length(btrim(p_reason)) between 3 and 1000 end $$;

-- ---------------------------------------------------------------- public: flag a review
-- Input: {flagId, reviewId, reason, message?, visitorHash?}. p_actor = signed-in person, or null with visitorHash
-- (server HMAC of the device). One flag per person/device per review (a repeat answers ok). Cap 20 a day.
create or replace function public.dir_review_flag_create(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare fid uuid;rid uuid;r public.dir_reviews;p public.dir_places;prior public.dir_review_flags;vh text:=p_input->>'visitorHash';h text;msg text;who text;
begin
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('flagId','reviewId','reason','message','visitorHash')) then
  raise exception 'Invalid flag' using errcode='22023';end if;
 fid:=public.dir_try_uuid(p_input->>'flagId');rid:=public.dir_try_uuid(p_input->>'reviewId');msg:=nullif(btrim(regexp_replace(coalesce(p_input->>'message',''),'\s+',' ','g')),'');
 if fid is null or rid is null or coalesce(p_input->>'reason','') not in('spam','offensive','fake','conflict_of_interest','private_info','other')
  or length(coalesce(msg,''))>500 or (p_input->>'reason'='other' and length(coalesce(msg,''))<5)
  or (p_actor is null)=(vh is null) or (vh is not null and vh!~'^[a-f0-9]{64}$') then raise exception 'Invalid flag' using errcode='22023';end if;
 who:=coalesce(p_actor::text,vh);
 h:=encode(sha256(convert_to(jsonb_build_object('who',who,'review',rid,'reason',p_input->>'reason','message',msg)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('dir-flag:'||who,0));
 select * into prior from public.dir_review_flags where id=fid;
 if found then if prior.input_hash<>h then raise exception 'Flag id reused' using errcode='22023';end if;return jsonb_build_object('ok',true);end if;
 select * into r from public.dir_reviews where id=rid;
 if not found or r.moderation_status<>'published' then raise exception 'Review not found' using errcode='P0002';end if;
 select * into p from public.dir_places where id=r.place_id;
 if public.dir_place_public(p.slug) is null then raise exception 'Review not found' using errcode='P0002';end if;
 if p_actor is not null and r.author_id=p_actor then raise exception 'Cannot flag your own review' using errcode='42501',hint='dir_flag_own_review';end if;
 if exists(select 1 from public.dir_review_flags f where f.review_id=rid and (f.reporter_id=p_actor or f.visitor_hash=vh)) then return jsonb_build_object('ok',true);end if;
 if (select count(*) from public.dir_review_flags f where coalesce(f.reporter_id::text,f.visitor_hash)=who and f.created_at>clock_timestamp()-interval '1 day')>=20 then
  raise exception 'Too many flags' using errcode='54000',hint='dir_flag_cap';end if;
 insert into public.dir_review_flags(id,review_id,reporter_id,visitor_hash,reason,message,input_hash) values(fid,rid,p_actor,vh,p_input->>'reason',msg,h);
 return jsonb_build_object('ok',true);
end $$;

-- ---------------------------------------------------------------- owner reply (create or edit, with history)
-- Input: {actionId, reviewId, reply, replyRevision (0 = new reply)}. p_actor = effective account (the owner's when a
-- team member works in the owner's company); p_member = that member (null for the account itself).
create or replace function public.dir_review_reply_write(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;rev integer;prior jsonb;r public.dir_reviews;txt text:=btrim(coalesce(p_input->>'reply',''));result jsonb;who uuid;role text;allowed boolean;cur integer;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'replyRevision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reviewId','reply','replyRevision')) then raise exception 'Invalid reply' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rid:=public.dir_try_uuid(p_input->>'reviewId');
 begin rev:=(p_input->>'replyRevision')::integer;exception when others then raise exception 'Invalid reply' using errcode='22023';end;
 if aid is null or rid is null or rev<0 or length(txt) not between 1 and 1000 or txt~*'(https?://|www\.)' then raise exception 'Invalid reply' using errcode='22023';end if;
 who:=coalesce(p_member,p_actor);
 prior:=public.dir_action_receipt(who,aid,p_input);if prior is not null then return prior;end if;
 select * into r from public.dir_reviews where id=rid for update;
 if not found or r.moderation_status<>'published' then raise exception 'Review not found' using errcode='P0002';end if;
 if not exists(select 1 from public.dir_place_managers where place_id=r.place_id and user_id=p_actor and status='active') then
  raise exception 'Only the place manager replies' using errcode='42501',hint='dir_reply_not_manager';end if;
 if p_member is not null and p_member<>p_actor then
  role:=public.dir_business_role_of(p_member,p_actor);
  allowed:=public.dir_business_allows(role,'listing.publish');
  if role is null or not coalesce(allowed,false) then raise exception 'Role does not allow public replies' using errcode='42501',hint='dir_reply_role';end if;
 end if;
 if r.author_id is not null and r.author_id in(p_actor,who) then raise exception 'Cannot reply to your own review' using errcode='42501',hint='dir_reply_not_manager';end if;
 if r.owner_reply is null then
  if rev<>0 then raise exception 'Reply changed' using errcode='40001';end if;
  update public.dir_reviews set owner_reply=txt,owner_reply_by=who,owner_reply_at=clock_timestamp(),owner_reply_status='published',owner_reply_revision=1 where id=rid returning * into r;
 else
  cur:=coalesce(r.owner_reply_revision,1);
  if rev<>cur then raise exception 'Reply changed' using errcode='40001';end if;
  if r.owner_reply=txt then raise exception 'Nothing to change' using errcode='22023';end if;
  -- Replies written before this module have no history row: keep their first text before the edit.
  insert into public.dir_review_reply_history(review_id,revision,reply,edited_by,member_id,action_id,at)
  values(rid,cur,r.owner_reply,r.owner_reply_by,null,public.dir_derived_uuid(rid,'reply-'||cur),r.owner_reply_at) on conflict(review_id,revision) do nothing;
  perform set_config('dir.review_reply_edit','on',true);
  update public.dir_reviews set owner_reply=txt,owner_reply_revision=cur+1 where id=rid returning * into r;
  perform set_config('dir.review_reply_edit','off',true);
 end if;
 insert into public.dir_review_reply_history(review_id,revision,reply,edited_by,member_id,action_id) values(rid,r.owner_reply_revision,txt,who,p_member,aid);
 result:=jsonb_build_object('reviewId',rid,'replyRevision',r.owner_reply_revision,'ownerReplyStatus',r.owner_reply_status);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(who,aid,p_input,result);
 return result;
end $$;

-- Reviews of a place a manager may answer (published reviews; includes the reply status even when staff hid it).
create or replace function public.dir_review_reply_targets(p_actor uuid,p_slug text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when not exists(select 1 from public.dir_place_managers m join public.dir_places p on p.id=m.place_id where p.slug=p_slug and m.user_id=p_actor and m.status='active') then null
 else coalesce((select jsonb_agg(jsonb_build_object('reviewId',r.id,'replyRevision',coalesce(r.owner_reply_revision,case when r.owner_reply is null then 0 else 1 end),
   'reply',r.owner_reply,'replyStatus',r.owner_reply_status,'own',r.author_id=p_actor) order by r.created_at desc)
  from public.dir_reviews r join public.dir_places p on p.id=r.place_id where p.slug=p_slug and r.moderation_status='published'),'[]') end $$;

-- Public reader (replaces the reviews-module version): the owner reply carries «edited» and the time of its last edit.
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
   'ownerReply',case when r.owner_reply_status='published' then jsonb_build_object('text',r.owner_reply,'at',r.owner_reply_at,
     'edited',coalesce(r.owner_reply_revision,1)>1,
     'editedAt',case when coalesce(r.owner_reply_revision,1)>1 then (select h.at from public.dir_review_reply_history h where h.review_id=r.id and h.revision=r.owner_reply_revision) end) end) j
  from public.dir_reviews r where r.place_id=pid and r.moderation_status='published' and (cat is null or (r.created_at,r.id)<(cat,cid))
  order by r.created_at desc,r.id desc limit 21) x;
 return jsonb_build_object('summary',pub->'rating','items',case when jsonb_array_length(items)>20 then items-20 else items end,
  'nextCursor',case when jsonb_array_length(items)>20 then jsonb_build_object('at',items->19->>'createdAt','id',items->19->>'id') end);
end $$;

-- ---------------------------------------------------------------- claims: uploads + staff-reviewed opening
-- Input: {claimId, path, kind, mime, size, sha256}. Same path again by the same person → same answer.
create or replace function public.dir_claim_upload_record(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare cid uuid;u public.dir_claim_uploads;pth text:=p_input->>'path';
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'size')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('claimId','path','kind','mime','size','sha256')) then raise exception 'Invalid upload' using errcode='22023';end if;
 cid:=public.dir_try_uuid(p_input->>'claimId');
 if cid is null or coalesce(pth,'')!~'^dir-claims/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$' or left(pth,48)<>'dir-claims/'||cid::text||'/' then raise exception 'Invalid upload' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-claim-upload:'||cid::text,0));
 select * into u from public.dir_claim_uploads where path=pth;
 if found then
  if u.uploader_id<>p_actor or u.claim_id<>cid or u.sha256<>p_input->>'sha256' or u.kind<>p_input->>'kind' then raise exception 'Upload belongs to someone else' using errcode='42501',hint='dir_claim_upload_foreign';end if;
  return jsonb_build_object('path',pth,'kind',u.kind);
 end if;
 if exists(select 1 from public.dir_place_claims where id=cid) or exists(select 1 from public.dir_claim_uploads where claim_id=cid and uploader_id<>p_actor) then
  raise exception 'Upload belongs to someone else' using errcode='42501',hint='dir_claim_upload_foreign';end if;
 if (select count(*) from public.dir_claim_uploads where claim_id=cid)>=5 or (select count(*) from public.dir_claim_uploads where uploader_id=p_actor and created_at>clock_timestamp()-interval '1 day')>=20 then
  raise exception 'Too many uploads' using errcode='54000',hint='dir_claim_upload_cap';end if;
 begin
  insert into public.dir_claim_uploads(path,claim_id,uploader_id,kind,mime,size,sha256) values(pth,cid,p_actor,p_input->>'kind',p_input->>'mime',(p_input->>'size')::integer,p_input->>'sha256');
 exception when check_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid upload' using errcode='22023';end;
 return jsonb_build_object('path',pth,'kind',p_input->>'kind');
end $$;

-- Same input as dir_claim_open, only for document_review / hacienda_juridica. document_review: every document must
-- be an upload of this person for this claim id (the claimant never points at someone else's file).
create or replace function public.dir_claim_open_reviewed(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare cid uuid;m text:=p_input->>'method';
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or m is null or m not in('document_review','hacienda_juridica') then raise exception 'Invalid claim' using errcode='22023';end if;
 cid:=public.dir_try_uuid(p_input->>'claimId');
 if cid is null then raise exception 'Invalid claim' using errcode='22023';end if;
 if m='document_review' and (jsonb_typeof(p_input#>'{evidence,documents}')<>'array' or exists(select 1 from jsonb_array_elements(p_input#>'{evidence,documents}') d
   where not exists(select 1 from public.dir_claim_uploads u where u.path=d->>'path' and u.claim_id=cid and u.uploader_id=p_actor and u.kind=d->>'kind'))) then
  raise exception 'Unknown document' using errcode='22023',hint='dir_claim_evidence';end if;
 return public.dir_claim_open(p_actor,p_input);
end $$;

-- ---------------------------------------------------------------- staff: claims
-- Input: {actionId, claimId, decision: approve|reject, reason (required to reject)}.
create or replace function public.dir_admin_claim_decide(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;prior jsonb;c public.dir_place_claims;res jsonb;why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');dec text:=p_input->>'decision';
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId','decision','reason')) then
  raise exception 'Invalid decision' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');
 if aid is null or cid is null or dec is null or dec not in('approve','reject') or not public.dir_mod_reason_ok(why,dec='approve') then raise exception 'Invalid decision' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into c from public.dir_place_claims where id=cid;
 if not found then raise exception 'Claim not found' using errcode='P0002';end if;
 res:=public.dir_claim_review(p_actor,jsonb_strip_nulls(jsonb_build_object('actionId',public.dir_derived_uuid(aid,'claim-review'),'claimId',cid,'decision',dec,'reason',why)));
 perform public.dir_mod_log(p_actor,aid,'claim',cid,c.place_id,dec,why,jsonb_build_object('status',c.status,'method',c.method,'isDispute',c.is_dispute),res);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,res);
 return res;
end $$;

-- ---------------------------------------------------------------- staff: reviews and replies
-- Input: {actionId, reviewId, target: review|reply, decision: hide|restore|dismiss, reason, expectedStatus}.
-- expectedStatus = the status the moderator saw (published|hidden): anything else → 40001. Open flags of the review
-- are closed (hide → upheld; restore/dismiss → dismissed).
create or replace function public.dir_admin_review_moderate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;prior jsonb;r public.dir_reviews;tgt text:=p_input->>'target';dec text:=p_input->>'decision';why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');
 cur text;before jsonb;after jsonb;closed integer;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reviewId','target','decision','reason','expectedStatus')) then
  raise exception 'Invalid moderation' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rid:=public.dir_try_uuid(p_input->>'reviewId');
 if aid is null or rid is null or tgt is null or tgt not in('review','reply') or dec is null or dec not in('hide','restore','dismiss')
  or coalesce(p_input->>'expectedStatus','') not in('published','hidden') or not public.dir_mod_reason_ok(why,false) then raise exception 'Invalid moderation' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into r from public.dir_reviews where id=rid for update;
 if not found then raise exception 'Review not found' using errcode='P0002';end if;
 if tgt='reply' and r.owner_reply is null then raise exception 'No reply to moderate' using errcode='P0002';end if;
 cur:=case when tgt='review' then r.moderation_status else r.owner_reply_status end;
 if cur<>p_input->>'expectedStatus' or (dec='hide' and cur='hidden') or (dec='restore' and cur='published') then raise exception 'Review changed' using errcode='40001';end if;
 before:=jsonb_build_object('status',r.moderation_status,'replyStatus',r.owner_reply_status,'openFlags',(select count(*) from public.dir_review_flags where review_id=rid and status='open'));
 if dec<>'dismiss' then
  perform public.dir_review_moderate(p_actor,jsonb_build_object('actionId',public.dir_derived_uuid(aid,'moderate'),'reviewId',rid,'target',tgt,'status',case when dec='hide' then 'hidden' else 'published' end,'reason',why));
 end if;
 update public.dir_review_flags set status=case when dec='hide' then 'upheld' else 'dismissed' end,resolved_by=p_actor,resolved_at=clock_timestamp(),resolution_action=aid
  where review_id=rid and status='open';
 get diagnostics closed=row_count;
 select * into r from public.dir_reviews where id=rid;
 after:=jsonb_build_object('reviewId',rid,'status',r.moderation_status,'replyStatus',r.owner_reply_status,'flagsClosed',closed);
 perform public.dir_mod_log(p_actor,aid,tgt,rid,r.place_id,dec,why,before,after);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,after);
 return after;
end $$;

-- p_filter: flagged (open flags) | hidden (review or reply hidden) | recent. Newest flags/reviews first.
create or replace function public.dir_admin_review_queue(p_filter text default 'flagged',p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.k desc),'[]') from(
  select coalesce((select max(f.created_at) from public.dir_review_flags f where f.review_id=r.id and f.status='open'),r.updated_at) k,
   jsonb_build_object('reviewId',r.id,'slug',p.slug,'placeName',p.name,'placePublic',public.dir_place_public(p.slug) is not null,'name',r.author_name_snapshot,'guest',r.author_id is null,
   'rating',r.rating,'comment',r.comment,'status',r.moderation_status,'reason',r.moderation_reason,'ownerReply',r.owner_reply,'replyStatus',r.owner_reply_status,
   'replyRevision',r.owner_reply_revision,'createdAt',r.created_at,'moderatedAt',r.moderated_at,
   'openFlags',(select count(*) from public.dir_review_flags f where f.review_id=r.id and f.status='open'),
   'flags',coalesce((select jsonb_agg(jsonb_build_object('reason',f.reason,'message',f.message,'at',f.created_at) order by f.created_at desc) from public.dir_review_flags f where f.review_id=r.id and f.status='open'),'[]')) j
  from public.dir_reviews r join public.dir_places p on p.id=r.place_id
  where case coalesce(p_filter,'flagged') when 'flagged' then exists(select 1 from public.dir_review_flags f where f.review_id=r.id and f.status='open')
   when 'hidden' then r.moderation_status='hidden' or r.owner_reply_status='hidden' else true end
  order by 1 desc limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- ---------------------------------------------------------------- staff: price reports
-- Input: {actionId, observationId, decision: publish|reject, reason (required to reject), expectedStatus}.
create or replace function public.dir_admin_price_moderate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;oid uuid;prior jsonb;o public.price_observations;dec text:=p_input->>'decision';why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');res jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','observationId','decision','reason','expectedStatus')) then
  raise exception 'Invalid moderation' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');oid:=public.dir_try_uuid(p_input->>'observationId');
 if aid is null or oid is null or dec is null or dec not in('publish','reject') or coalesce(p_input->>'expectedStatus','') not in('pending','published')
  or not public.dir_mod_reason_ok(why,dec='publish') then raise exception 'Invalid moderation' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into o from public.price_observations where id=oid for update;
 if not found or o.source_kind<>'user_report' then raise exception 'Observation not found' using errcode='P0002';end if;
 if o.moderation_status<>p_input->>'expectedStatus' then raise exception 'Observation changed' using errcode='40001';end if;
 res:=public.price_observation_moderate(p_actor,jsonb_strip_nulls(jsonb_build_object('actionId',public.dir_derived_uuid(aid,'price'),'observationId',oid,'decision',dec,'note',why)));
 perform public.dir_mod_log(p_actor,aid,'price',oid,o.place_id,dec,why,jsonb_build_object('status',o.moderation_status,'confidence',o.confidence,'price',o.price),res);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,res);
 return res;
end $$;

-- User price reports: pending (oldest first) or published (newest first), with the number of matching reports.
create or replace function public.dir_admin_price_queue(p_status text default 'pending',p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by case when p_status='published' then -extract(epoch from x.created_at) else extract(epoch from x.created_at) end),'[]') from(
  select o.created_at,jsonb_build_object('observationId',o.id,'itemSlug',i.slug,'itemName',i.name,'presentation',i.presentation,'itemKind',i.kind,
   'placeSlug',p.slug,'placeName',p.name,'price',o.price,'currency',o.currency,'observedAt',o.observed_at,'staleAfter',o.stale_after,
   'status',o.moderation_status,'confidence',o.confidence,'createdAt',o.created_at,'hasEvidence',o.evidence_sha256 is not null,
   'similarReports',(select count(distinct x.reporter_id) from public.price_observations x where x.item_id=o.item_id and x.place_id=o.place_id and x.source_kind='user_report'
     and x.moderation_status in('pending','published') and x.stale_after>clock_timestamp())) j
  from public.price_observations o join public.price_items i on i.id=o.item_id left join public.dir_places p on p.id=o.place_id
  where o.source_kind='user_report' and o.moderation_status=coalesce(p_status,'pending') and o.stale_after>clock_timestamp()
  order by case when p_status='published' then o.created_at end desc,o.created_at limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- ---------------------------------------------------------------- staff: place reports
-- Input: {actionId, reportId, decision: fix|hide|close|remove|recategorize|reject, reason, revision (place revision
-- the moderator saw; not used by reject), place? (fix: name/address/areas/phone/website/email/location), vertical? (recategorize)}.
-- 2026-11-17: `email` (the business address that receives a claim code; never public) is editable in the fix.
create or replace function public.dir_admin_report_resolve(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rptid uuid;prior jsonb;rp public.dir_reports;p public.dir_places;v public.dir_verticals;dec text:=p_input->>'decision';why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');
 rev integer;before jsonb;after jsonb;mut jsonb;pl jsonb:=p_input->'place';attrs jsonb;res jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','reportId','decision','reason','revision','place','vertical')) then
  raise exception 'Invalid resolution' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');rptid:=public.dir_try_uuid(p_input->>'reportId');
 if aid is null or rptid is null or dec is null or dec not in('fix','hide','close','remove','recategorize','reject') or not public.dir_mod_reason_ok(why,false)
  or (dec<>'reject' and jsonb_typeof(p_input->'revision')<>'number') or (p_input ? 'place')<>(dec='fix') or (p_input ? 'vertical')<>(dec='recategorize')
  or (dec='fix' and (jsonb_typeof(pl)<>'object' or pl='{}'::jsonb or exists(select 1 from jsonb_object_keys(pl) k where k not in('name','addressLine','locality','adminArea1','adminArea2','adminArea3','phone','website','email','lat','lng','locationPrecision')))) then
  raise exception 'Invalid resolution' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into rp from public.dir_reports where id=rptid;
 if not found then raise exception 'Report not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||rp.place_id::text,0));
 select * into rp from public.dir_reports where id=rptid for update;
 if rp.status<>'open' then raise exception 'Report already resolved' using errcode='40001',hint='dir_report_closed';end if;
 select * into p from public.dir_places where id=rp.place_id for update;
 before:=public.dir_place_snapshot(p.id);
 if dec<>'reject' then
  rev:=(p_input->>'revision')::integer;
  if p.revision<>rev then raise exception 'Place changed' using errcode='40001';end if;
 end if;
 if dec='fix' then
  mut:=public.dir_place_mutate(p_actor,jsonb_build_object('action','update','actionId',public.dir_derived_uuid(aid,'fix'),'placeId',p.id,'revision',rev,'place',pl,'source',jsonb_build_object('id','contratacr','ref','report:'||rptid::text)));
 elsif dec in('hide','close','remove') then
  if p.status=(case dec when 'hide' then 'hidden' when 'close' then 'closed_permanently' else 'removed' end) then raise exception 'Nothing to change' using errcode='22023';end if;
  mut:=public.dir_place_mutate(p_actor,jsonb_build_object('action','status','actionId',public.dir_derived_uuid(aid,'status'),'placeId',p.id,'revision',rev,
   'status',case dec when 'hide' then 'hidden' when 'close' then 'closed_permanently' else 'removed' end));
 elsif dec='recategorize' then
  select * into v from public.dir_verticals where id=p_input->>'vertical' and active;
  if not found or v.id=p.vertical_id then raise exception 'Invalid vertical' using errcode='22023';end if;
  select coalesce(jsonb_object_agg(k,val),'{}') into attrs from jsonb_each(p.attributes) e(k,val) where k=any(v.attribute_keys);
  update public.dir_places set vertical_id=v.id,attributes=attrs,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
  insert into public.dir_field_provenance(place_id,field,source_id,source_ref,action_id) values(p.id,'vertical','contratacr','report:'||rptid::text,aid);
  insert into public.dir_place_history(place_id,action_id,actor_id,action,revision,before,after) values(p.id,aid,p_actor,'update',p.revision,before,public.dir_place_snapshot(p.id));
  mut:=jsonb_build_object('placeId',p.id,'revision',p.revision,'vertical',v.id);
 end if;
 update public.dir_reports set status=case when dec='reject' then 'rejected' else 'accepted' end,resolution_note=why,resolved_by=p_actor,resolved_at=clock_timestamp() where id=rptid;
 select * into p from public.dir_places where id=rp.place_id;
 after:=public.dir_place_snapshot(p.id);
 res:=jsonb_build_object('reportId',rptid,'status',case when dec='reject' then 'rejected' else 'accepted' end,'decision',dec,'placeId',p.id,'slug',p.slug,
  'revision',p.revision,'placeStatus',p.status,'vertical',p.vertical_id);
 perform public.dir_mod_log(p_actor,aid,'report',rptid,p.id,dec,why,before||jsonb_build_object('report',rp.kind),after);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,res);
 return res;
end $$;

-- Open reports, oldest first, with the editable fields and revision of the place.
create or replace function public.dir_admin_report_queue(p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.created_at),'[]') from(
  select r.created_at,jsonb_build_object('reportId',r.id,'kind',r.kind,'message',r.message,'contactEmail',r.contact_email,'signedIn',r.reporter_id is not null,'createdAt',r.created_at,
   'place',jsonb_build_object('placeId',p.id,'slug',p.slug,'name',p.name,'vertical',p.vertical_id,'status',p.status,'revision',p.revision,'verificationLevel',p.verification_level,
    'addressLine',p.address_line,'locality',p.locality,'adminArea1',p.admin_area_1,'adminArea2',p.admin_area_2,'phone',p.phone,'website',p.website,'email',p.email),
   'openReports',(select count(*) from public.dir_reports o where o.place_id=p.id and o.status='open')) j
  from public.dir_reports r join public.dir_places p on p.id=r.place_id where r.status='open'
  order by r.created_at limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- ---------------------------------------------------------------- staff: pharmacy permits (Decreto 36868-S)
-- Input: {actionId, placeId, revision, permitNumber, authority?, evidence:{kind: document|official_registry|inspection,
-- reference, note?}}. Draft → published; a place hidden or closed by moderation keeps its status (never auto-shown).
create or replace function public.dir_admin_pharmacy_verify(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;pid uuid;rev integer;prior jsonb;p public.dir_places;num text:=btrim(coalesce(p_input->>'permitNumber',''));ev jsonb:=p_input->'evidence';
 auth text:=coalesce(nullif(btrim(coalesce(p_input->>'authority','')),''),'Ministerio de Salud');before jsonb;m jsonb;res jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'revision')<>'number' or jsonb_typeof(ev)<>'object'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','placeId','revision','permitNumber','authority','evidence'))
  or exists(select 1 from jsonb_object_keys(ev) k where k not in('kind','reference','note')) then raise exception 'Invalid permit' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');pid:=public.dir_try_uuid(p_input->>'placeId');
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid permit' using errcode='22023';end;
 if aid is null or pid is null or num!~'^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$' or length(auth) not between 2 and 120
  or coalesce(ev->>'kind','') not in('document','official_registry','inspection') or length(btrim(coalesce(ev->>'reference',''))) not between 3 and 300
  or length(coalesce(ev->>'note',''))>500 then raise exception 'Invalid permit' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||pid::text,0));
 select * into p from public.dir_places where id=pid for update;
 if not found then raise exception 'Place not found' using errcode='P0002';end if;
 if p.vertical_id<>'pharmacy' then raise exception 'Permits are for pharmacies' using errcode='22023',hint='dir_permit_vertical';end if;
 if p.status='removed' then raise exception 'Place removed' using errcode='P0002';end if;
 if p.revision<>rev then raise exception 'Place changed' using errcode='40001';end if;
 before:=public.dir_place_snapshot(pid);
 m:=public.dir_place_mutate(p_actor,jsonb_build_object('action','update','actionId',public.dir_derived_uuid(aid,'permit-number'),'placeId',pid,'revision',rev,
  'place',jsonb_build_object('attributes',p.attributes||jsonb_build_object('licenseNumber',num)),'source',jsonb_build_object('id','contratacr','ref','permit:'||left(num,100))));
 rev:=(m->>'revision')::integer;
 if p.verification_level<>'license_verified' then
  m:=public.dir_place_mutate(p_actor,jsonb_build_object('action','verify','actionId',public.dir_derived_uuid(aid,'permit-verify'),'placeId',pid,'revision',rev,'verificationLevel','license_verified'));
  rev:=(m->>'revision')::integer;
 end if;
 if p.status='draft' then
  m:=public.dir_place_mutate(p_actor,jsonb_build_object('action','status','actionId',public.dir_derived_uuid(aid,'permit-publish'),'placeId',pid,'revision',rev,'status','published'));
 end if;
 insert into public.dir_place_permits(id,place_id,permit_number,authority,evidence,verified_by,action_id)
 values(public.dir_derived_uuid(aid,'permit'),pid,num,auth,jsonb_strip_nulls(jsonb_build_object('kind',ev->>'kind','reference',btrim(ev->>'reference'),'note',nullif(btrim(coalesce(ev->>'note','')),''))),p_actor,aid);
 select * into p from public.dir_places where id=pid;
 res:=jsonb_build_object('placeId',pid,'slug',p.slug,'revision',p.revision,'status',p.status,'verificationLevel',p.verification_level,'public',public.dir_place_public(p.slug) is not null);
 perform public.dir_mod_log(p_actor,aid,'permit',pid,pid,'verify_permit',num,before,public.dir_place_snapshot(pid)||jsonb_build_object('authority',auth,'evidenceKind',ev->>'kind'));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,res);
 return res;
end $$;

-- Pharmacies waiting for a permit (not license_verified; draft or published), claimed first, then by name.
create or replace function public.dir_admin_pharmacy_queue(p_query text default null,p_limit integer default 30,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with c as(select p.* from public.dir_places p where p.vertical_id='pharmacy' and p.verification_level<>'license_verified' and p.status in('draft','published')
   and (nullif(btrim(coalesce(p_query,'')),'') is null or p.name_normalized like '%'||public.dir_normalize(p_query)||'%' or public.dir_normalize(coalesce(p.locality,'')) like '%'||public.dir_normalize(p_query)||'%'))
 select jsonb_build_object('total',(select count(*) from c),'items',coalesce((select jsonb_agg(x.j order by x.o1,x.o2,x.o3) from(
  select (c.claim_status='unclaimed') o1,c.name_normalized o2,c.id o3,jsonb_build_object('placeId',c.id,'slug',c.slug,'name',c.name,'status',c.status,'revision',c.revision,
   'verificationLevel',c.verification_level,'claimStatus',c.claim_status,'locality',c.locality,'adminArea1',c.admin_area_1,'adminArea2',c.admin_area_2,'addressLine',c.address_line,
   'phone',c.phone,'licenseNumber',c.attributes->>'licenseNumber') j
  from c order by (c.claim_status='unclaimed'),c.name_normalized,c.id offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,30),1),100)) x),'[]')) $$;

-- Recent staff decisions (audit trail view).
create or replace function public.dir_admin_moderation_log(p_limit integer default 30) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.id desc),'[]') from(
  select l.id,jsonb_build_object('kind',l.kind,'decision',l.decision,'reason',l.reason,'targetId',l.target_id,'placeName',p.name,'placeSlug',p.slug,'actorId',l.actor_id,'at',l.at) j
  from public.dir_moderation_log l left join public.dir_places p on p.id=l.place_id order by l.id desc limit least(greatest(coalesce(p_limit,30),1),200)) x $$;

-- ---------------------------------------------------------------- storage (skipped where Storage is not installed)
do $$
begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('dir-claim-documents','dir-claim-documents',false,4194304,array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
   on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
 end if;
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['dir_moderation_log','dir_review_flags','dir_review_reply_history','dir_claim_uploads','dir_place_permits'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n='dir_review_flags' then execute format('grant select,insert,update on public.%I to service_role',n);
 else execute format('grant select,insert on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype and f::text not like 'dir_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
