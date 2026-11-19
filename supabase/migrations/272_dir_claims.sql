-- LOCAL PRO ONLY. Multivertical round F3 (2026-11-16): claiming and verifying directory places. Depends on
-- directory-core-local.sql (dir_places, dir_place_actions receipts, dir_place_history, dir_field_provenance).
-- * dir_places.claim_status: unclaimed -> claim_pending -> claimed (back to unclaimed on reject/expiry/withdrawal);
--   claimed -> disputed -> claimed while a dispute claim is open.
-- * dir_place_claims: methods
--     phone_listed      one-time code sent to the phone ALREADY on the place (never one typed by the claimant; the
--                       phone must come from an independent source, i.e. its latest provenance is not 'owner');
--     email_listed      (2026-11-17, owner decision: e-mail instead of SMS, no per-message cost) one-time code to the
--                       e-mail ALREADY on the place (dir_places.email: imported from OSM email/contact:email, set by
--                       staff or by an earlier verified owner). Any domain, free mailboxes included, because the
--                       claimant never chooses, types or sees the full address (only a mask such as so***@gmail.com).
--                       Not eligible while any change of that e-mail in the last 30 days came from someone who is
--                       not staff nor a verified owner (dir_listed_email_eligible, from dir_field_provenance);
--     email_domain      one-time code to an address whose domain equals the listed website host (website from an
--                       independent source; free webmail domains refused);
--     hacienda_juridica cedula juridica matched by the public Hacienda API (src/lib/verification) + staff review;
--     document_review   private documents reviewed by staff (never by the claimant: no self-approval).
--   Statuses open/code_sent/approved/rejected/expired/withdrawn; one open claim per place (partial unique index).
--   Codes are generated and HMAC-hashed by the server (pepper never reaches the database); only the hash, its
--   expiry, the send count (max 3, 60 s cooldown) and the attempt count (max 5) are stored.
-- * SMS is OFF by default (dir_claim_settings.sms_enabled=false, and DIR_CLAIM_SMS_ENABLED on the server): while off,
--   phone_listed is refused with hint dir_claim_sms_disabled at opening and at sending. The code stays for later.
-- * Verification level per method: phone_listed/email_listed/email_domain -> claimed; hacienda_juridica/document_review ->
--   verified. Claims never lower a level and never grant license_verified (staff verify via dir_place_mutate).
-- * dir_place_managers: one active owner per place + up to 9 managers added by the owner.
-- * A place claimed by someone else can only be claimed through a dispute (staff-reviewed methods only).
-- * "Add my business" (dir_place_self_signup) creates a draft place in claim_pending with a staff-reviewed claim.
-- * Claims are free and independent of any commercial relationship: no commercial column or parameter here.
-- Tables: RLS on, service_role only, no DELETE grant; events immutable; functions security invoker with pinned
-- search_path. The route layer checks the signed-in user and, for staff actions, admin + MFA.
begin;

-- ---------------------------------------------------------------- place claim state
alter table public.dir_places add column if not exists claim_status text not null default 'unclaimed';
do $$begin
 if not exists(select 1 from pg_constraint where conname='dir_places_claim_status_check' and conrelid='public.dir_places'::regclass) then
  alter table public.dir_places add constraint dir_places_claim_status_check check(claim_status in('unclaimed','claim_pending','claimed','disputed'));
 end if;end $$;
create index if not exists dir_places_claim_status on public.dir_places(claim_status) where claim_status<>'unclaimed';

-- ---------------------------------------------------------------- tables
create table if not exists public.dir_place_claims(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 claimant_id uuid not null,
 method text not null constraint dir_place_claims_method_check check(method in('phone_listed','email_listed','hacienda_juridica','document_review','email_domain')),
 status text not null default 'open' check(status in('open','code_sent','approved','rejected','expired','withdrawn')),
 is_dispute boolean not null default false,
 self_signup boolean not null default false,
 contact_email text check(contact_email~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' and length(contact_email)<=254),
 evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=8192),
 note text check(length(note) between 1 and 1000),
 otp_hash text check(otp_hash~'^[a-f0-9]{64}$'),
 otp_expires_at timestamptz,
 otp_sends smallint not null default 0 check(otp_sends between 0 and 3),
 otp_attempts smallint not null default 0 check(otp_attempts between 0 and 5),
 otp_last_sent_at timestamptz,
 decision_reason text check(length(decision_reason) between 1 and 1000),
 reviewed_by uuid,reviewed_at timestamptz,
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz,
 check((status in('open','code_sent'))=(resolved_at is null)),
 check((method='email_domain')=(contact_email is not null)),
 constraint dir_place_claims_code_status_check check(status<>'code_sent' or method in('phone_listed','email_listed','email_domain')),
 check((otp_hash is null)=(otp_expires_at is null)),
 constraint dir_place_claims_code_only_check check(method in('phone_listed','email_listed','email_domain') or (otp_sends=0 and otp_hash is null)),
 check(not is_dispute or method in('document_review','hacienda_juridica')),
 check(not self_signup or method in('document_review','hacienda_juridica')),
 -- No self-approval: staff-reviewed methods are approved only by a reviewer who is not the claimant.
 constraint dir_place_claims_reviewer_check check(status<>'approved' or method in('phone_listed','email_listed','email_domain') or reviewed_by is not null),
 check(reviewed_by is null or reviewed_by<>claimant_id),
 check((reviewed_by is null)=(reviewed_at is null))
);
-- Databases created before email_listed: replace the four method-list checks by the named versions (idempotent).
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.dir_place_claims'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%phone_listed%' and pg_get_constraintdef(oid) not like '%email_listed%' loop
  execute format('alter table public.dir_place_claims drop constraint %I',c.conname);
 end loop;
 if not exists(select 1 from pg_constraint where conname='dir_place_claims_method_check' and conrelid='public.dir_place_claims'::regclass) then
  alter table public.dir_place_claims add constraint dir_place_claims_method_check check(method in('phone_listed','email_listed','hacienda_juridica','document_review','email_domain'));end if;
 if not exists(select 1 from pg_constraint where conname='dir_place_claims_code_status_check' and conrelid='public.dir_place_claims'::regclass) then
  alter table public.dir_place_claims add constraint dir_place_claims_code_status_check check(status<>'code_sent' or method in('phone_listed','email_listed','email_domain'));end if;
 if not exists(select 1 from pg_constraint where conname='dir_place_claims_code_only_check' and conrelid='public.dir_place_claims'::regclass) then
  alter table public.dir_place_claims add constraint dir_place_claims_code_only_check check(method in('phone_listed','email_listed','email_domain') or (otp_sends=0 and otp_hash is null));end if;
 if not exists(select 1 from pg_constraint where conname='dir_place_claims_reviewer_check' and conrelid='public.dir_place_claims'::regclass) then
  alter table public.dir_place_claims add constraint dir_place_claims_reviewer_check check(status<>'approved' or method in('phone_listed','email_listed','email_domain') or reviewed_by is not null);end if;
end $$;

-- Claim channels. SMS (phone_listed) stays OFF until the owner turns it on (per-message cost). One row, staff only.
create table if not exists public.dir_claim_settings(
 id boolean primary key default true check(id),
 sms_enabled boolean not null default false,
 updated_at timestamptz not null default clock_timestamp()
);
insert into public.dir_claim_settings(id) values(true) on conflict(id) do nothing;

create unique index if not exists dir_place_claims_one_open on public.dir_place_claims(place_id) where status in('open','code_sent');
create index if not exists dir_place_claims_claimant on public.dir_place_claims(claimant_id,created_at desc);
create index if not exists dir_place_claims_queue on public.dir_place_claims(created_at) where status in('open','code_sent');

create table if not exists public.dir_place_managers(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 user_id uuid not null,
 role text not null check(role in('owner','manager')),
 status text not null default 'active' check(status in('active','revoked')),
 claim_id uuid references public.dir_place_claims(id),
 granted_by uuid not null,granted_at timestamptz not null default clock_timestamp(),
 revoked_by uuid,revoked_at timestamptz,
 revoke_reason text check(revoke_reason in('dispute','owner_removed','left','staff')),
 check((status='active')=(revoked_at is null)),
 check((status='active')=(revoke_reason is null)),
 check(role<>'owner' or claim_id is not null)
);
create unique index if not exists dir_place_managers_one_owner on public.dir_place_managers(place_id) where role='owner' and status='active';
create unique index if not exists dir_place_managers_active on public.dir_place_managers(place_id,user_id) where status='active';
create index if not exists dir_place_managers_user on public.dir_place_managers(user_id) where status='active';

create table if not exists public.dir_place_claim_events(
 id bigint generated always as identity primary key,
 claim_id uuid not null references public.dir_place_claims(id),
 actor_id uuid not null,
 event text not null check(event in('opened','code_sent','code_failed','approved','rejected','expired','withdrawn')),
 from_status text,to_status text not null,
 at timestamptz not null default clock_timestamp()
);
create index if not exists dir_place_claim_events_claim on public.dir_place_claim_events(claim_id,id);

-- ---------------------------------------------------------------- guards
do $$begin
 drop trigger if exists dir_place_claim_events_immutable on public.dir_place_claim_events;
 create trigger dir_place_claim_events_immutable before update or delete on public.dir_place_claim_events for each row execute function public.dir_immutable();
 drop trigger if exists dir_place_claim_events_no_truncate on public.dir_place_claim_events;
 create trigger dir_place_claim_events_no_truncate before truncate on public.dir_place_claim_events for each statement execute function public.dir_immutable();
 drop trigger if exists dir_place_claims_no_truncate on public.dir_place_claims;
 create trigger dir_place_claims_no_truncate before truncate on public.dir_place_claims for each statement execute function public.dir_immutable();
 drop trigger if exists dir_place_managers_no_truncate on public.dir_place_managers;
 create trigger dir_place_managers_no_truncate before truncate on public.dir_place_managers for each statement execute function public.dir_immutable();
end $$;

-- Claims: identity fields never change, closed claims are final, the attempt count never goes down.
create or replace function public.dir_place_claims_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Claims are never deleted' using errcode='23514';end if;
 if new.id<>old.id or new.place_id<>old.place_id or new.claimant_id<>old.claimant_id or new.method<>old.method
  or new.is_dispute<>old.is_dispute or new.self_signup<>old.self_signup or new.created_at<>old.created_at
  or new.contact_email is distinct from old.contact_email or new.evidence is distinct from old.evidence then
  raise exception 'Claim identity is immutable' using errcode='23514';end if;
 if old.status not in('open','code_sent') then raise exception 'A closed claim is final' using errcode='23514';end if;
 if new.otp_attempts<old.otp_attempts or new.otp_sends<old.otp_sends then raise exception 'Claim counters never decrease' using errcode='23514';end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
drop trigger if exists dir_place_claims_guard on public.dir_place_claims;
create trigger dir_place_claims_guard before update or delete on public.dir_place_claims for each row execute function public.dir_place_claims_guard();

create or replace function public.dir_place_managers_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Managers are revoked, never deleted' using errcode='23514';end if;
 if new.id<>old.id or new.place_id<>old.place_id or new.user_id<>old.user_id or new.role<>old.role or new.claim_id is distinct from old.claim_id
  or new.granted_by<>old.granted_by or new.granted_at<>old.granted_at or old.status='revoked' then
  raise exception 'Manager rows only move from active to revoked' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists dir_place_managers_guard on public.dir_place_managers;
create trigger dir_place_managers_guard before update or delete on public.dir_place_managers for each row execute function public.dir_place_managers_guard();

-- ---------------------------------------------------------------- helpers
create or replace function public.dir_try_uuid(p_value text) returns uuid
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin return p_value::uuid;exception when others then return null;end $$;

create or replace function public.dir_verification_rank(p_level text) returns integer
language sql immutable security invoker set search_path=public,pg_temp as $$
 select array_position(array['unverified','imported','claimed','verified','license_verified'],p_level) $$;

create or replace function public.dir_claim_method_level(p_method text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_method in('phone_listed','email_listed','email_domain') then 'claimed' when p_method in('hacienda_juridica','document_review') then 'verified' end $$;

create or replace function public.dir_claim_sms_enabled() returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select sms_enabled from public.dir_claim_settings where id),false) $$;

-- True when the latest provenance of the field is an independent source (not text typed by an owner/claimant).
create or replace function public.dir_field_independent(p_place uuid,p_field text) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select f.source_id<>'owner' from public.dir_field_provenance f where f.place_id=p_place and f.field=p_field order by f.id desc limit 1),false) $$;

-- A change of the place e-mail is trusted when it came from staff, or from someone who already was the owner of the
-- place (approved claim) when the change was recorded. The actor is read from the place history of that action.
create or replace function public.dir_email_change_trusted(p_place uuid,p_source text,p_action uuid,p_at timestamptz) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select case (select s.kind from public.dir_data_sources s where s.id=p_source)
  when 'staff' then true
  when 'owner' then exists(select 1 from public.dir_place_history h join public.dir_place_managers m on m.place_id=h.place_id and m.user_id=h.actor_id
    where h.place_id=p_place and h.action_id=p_action and m.role='owner' and m.claim_id is not null and m.granted_at<=p_at)
  else false end $$;

-- email_listed is possible when the place has an e-mail whose latest change came from an independent source (import),
-- staff or a verified owner, AND no change of that e-mail in the last 30 days came from anyone else. For imports the
-- date is the upstream edit date when known (observed_at), so a recent anonymous edit upstream is not trusted either.
create or replace function public.dir_listed_email_eligible(p_place uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 with f as(select f.id,f.source_id,s.kind,f.action_id,f.recorded_at,f.observed_at from public.dir_field_provenance f
   join public.dir_data_sources s on s.id=f.source_id where f.place_id=p_place and f.field='email')
 select coalesce((select p.email is not null from public.dir_places p where p.id=p_place),false)
  and coalesce((select x.kind in('osm','official','partner','staff') or public.dir_email_change_trusted(p_place,x.source_id,x.action_id,x.recorded_at) from f x order by x.id desc limit 1),false)
  and not exists(select 1 from f x where
   (x.kind in('osm','official','partner') and x.observed_at>clock_timestamp()-interval '30 days')
   or (x.kind not in('osm','official','partner','staff') and x.recorded_at>clock_timestamp()-interval '30 days'
       and not public.dir_email_change_trusted(p_place,x.source_id,x.action_id,x.recorded_at))) $$;

create or replace function public.dir_website_host(p_url text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select nullif(regexp_replace(lower(substring(coalesce(p_url,'') from '^https?://([^/:?#]+)')),'^www\.',''),'') $$;

create or replace function public.dir_mask_destination(p_value text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_value is null then null
  when position('@' in p_value)>0 then left(p_value,case when length(split_part(p_value,'@',1))>=4 then 2 else 1 end)||'***@'||split_part(p_value,'@',2)
  else '*** '||right(regexp_replace(p_value,'[^0-9]','','g'),4) end $$;

create or replace function public.dir_action_receipt(p_actor uuid,p_action uuid,p_input jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.dir_place_actions;
begin
 select * into r from public.dir_place_actions where actor_id=p_actor and action_id=p_action;
 if not found then return null;end if;
 if r.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;
 return r.result;
end $$;

-- Evidence shape per method. document_review: 1..5 private files stored under dir-claims/<claimId>/.
-- hacienda_juridica: result of HaciendaIdentityVerifier for a cedula juridica (10 digits starting with 3).
create or replace function public.dir_claim_evidence_ok(p_method text,p_claim uuid,p_evidence jsonb) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_typeof(p_evidence)='object' and case
  when p_method in('phone_listed','email_listed','email_domain') then p_evidence='{}'::jsonb
  when p_method='document_review' then
   not exists(select 1 from jsonb_object_keys(p_evidence) k where k not in('documents'))
   and jsonb_typeof(p_evidence->'documents')='array' and jsonb_array_length(p_evidence->'documents') between 1 and 5
   and not exists(select 1 from jsonb_array_elements(p_evidence->'documents') d where jsonb_typeof(d)<>'object'
    or exists(select 1 from jsonb_object_keys(d) k where k not in('path','kind'))
    or coalesce(d->>'kind','') not in('municipal_license','legal_personhood','health_permit','utility_bill','other')
    or left(coalesce(d->>'path',''),48)<>'dir-claims/'||p_claim::text||'/'
    or coalesce(d->>'path','')!~('^dir-claims/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'))
  when p_method='hacienda_juridica' then
   not exists(select 1 from jsonb_object_keys(p_evidence) k where k not in('hacienda'))
   and jsonb_typeof(p_evidence->'hacienda')='object'
   and not exists(select 1 from jsonb_object_keys(p_evidence->'hacienda') k where k not in('cedula','officialName','score','matched','provider','checkedAt'))
   and coalesce(p_evidence#>>'{hacienda,cedula}','')~'^3[0-9]{9}$'
   and length(coalesce(p_evidence#>>'{hacienda,officialName}','')) between 2 and 300
   and jsonb_typeof(p_evidence#>'{hacienda,score}')='number' and (p_evidence#>>'{hacienda,score}')::numeric between 0.6 and 1
   and p_evidence#>'{hacienda,matched}'='true'::jsonb and p_evidence#>>'{hacienda,provider}'='hacienda_api'
  else false end $$;

-- Moves the place claim state (and raises the verification level, never lowering it); history + provenance.
create or replace function public.dir_claim_place_set(p_place uuid,p_actor uuid,p_action uuid,p_claim_status text,p_level text,p_claim uuid) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;before jsonb;lvl text;
begin
 select * into p from public.dir_places where id=p_place for update;
 if not found then raise exception 'Place not found' using errcode='P0002';end if;
 before:=public.dir_place_snapshot(p_place)||jsonb_build_object('claimStatus',p.claim_status);
 lvl:=p.verification_level;
 if p_level is not null and public.dir_verification_rank(p_level)>public.dir_verification_rank(lvl) then lvl:=p_level;end if;
 update public.dir_places set claim_status=p_claim_status,verification_level=lvl,revision=revision+1,updated_at=clock_timestamp() where id=p_place returning * into p;
 if lvl is distinct from before->>'verificationLevel' then
  insert into public.dir_field_provenance(place_id,field,source_id,source_ref,action_id) values(p_place,'verification','contratacr','claim:'||p_claim::text,p_action);
 end if;
 insert into public.dir_place_history(place_id,action_id,actor_id,action,revision,before,after)
 values(p_place,p_action,p_actor,'verify',p.revision,before,public.dir_place_snapshot(p_place)||jsonb_build_object('claimStatus',p.claim_status,'claimId',p_claim));
 return p.revision;
end $$;

-- Closes an open claim. Approval grants the owner (revoking previous managers on a dispute) and marks the place
-- claimed; any other outcome returns the place to unclaimed (or to claimed after a dispute).
create or replace function public.dir_claim_finish(p_claim uuid,p_status text,p_actor uuid,p_action uuid,p_reason text,p_reviewer uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.dir_place_claims;lvl text;
begin
 if p_status not in('approved','rejected','expired','withdrawn') then raise exception 'Invalid claim outcome' using errcode='22023';end if;
 select * into c from public.dir_place_claims where id=p_claim for update;
 if not found then raise exception 'Claim not found' using errcode='P0002';end if;
 if c.status not in('open','code_sent') then raise exception 'Claim already closed' using errcode='40001',hint='dir_claim_closed';end if;
 update public.dir_place_claims set status=p_status,otp_hash=null,otp_expires_at=null,decision_reason=coalesce(p_reason,decision_reason),
  reviewed_by=p_reviewer,reviewed_at=case when p_reviewer is null then null else clock_timestamp() end,resolved_at=clock_timestamp() where id=p_claim;
 if p_status='approved' then
  if c.is_dispute then
   update public.dir_place_managers set status='revoked',revoked_by=p_actor,revoked_at=clock_timestamp(),revoke_reason='dispute' where place_id=c.place_id and status='active';
  end if;
  insert into public.dir_place_managers(id,place_id,user_id,role,claim_id,granted_by) values(public.dir_derived_uuid(c.id,'owner'),c.place_id,c.claimant_id,'owner',c.id,p_actor);
  perform public.dir_claim_place_set(c.place_id,p_actor,public.dir_derived_uuid(p_action,'claim-place'),'claimed',public.dir_claim_method_level(c.method),c.id);
 else
  perform public.dir_claim_place_set(c.place_id,p_actor,public.dir_derived_uuid(p_action,'claim-place'),case when c.is_dispute then 'claimed' else 'unclaimed' end,null,c.id);
 end if;
 insert into public.dir_place_claim_events(claim_id,actor_id,event,from_status,to_status) values(c.id,p_actor,p_status,c.status,p_status);
 select verification_level into lvl from public.dir_places where id=c.place_id;
 return jsonb_build_object('claimId',c.id,'status',p_status,'verificationLevel',lvl);
end $$;

-- Shared by dir_claim_open and dir_place_self_signup (place already locked by the caller).
create or replace function public.dir_claim_insert(p_actor uuid,p_action uuid,p_claim uuid,p_place uuid,p_method text,p_email text,p_dispute boolean,p_self boolean,p_note text,p_evidence jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare exp timestamptz:=clock_timestamp()+case when p_method in('phone_listed','email_listed','email_domain') then interval '7 days' else interval '30 days' end;
begin
 if exists(select 1 from public.dir_place_claims where id=p_claim) then raise exception 'Claim id reused' using errcode='22023';end if;
 if not public.dir_claim_evidence_ok(p_method,p_claim,p_evidence) then raise exception 'Invalid claim evidence' using errcode='22023',hint='dir_claim_evidence';end if;
 if (select count(*) from public.dir_place_claims where claimant_id=p_actor and created_at>clock_timestamp()-interval '1 day')>=5
  or (select count(*) from public.dir_place_claims where claimant_id=p_actor and place_id=p_place and created_at>clock_timestamp()-interval '30 days')>=3 then
  raise exception 'Too many claims' using errcode='54000',hint='dir_claim_cap';end if;
 insert into public.dir_place_claims(id,place_id,claimant_id,method,is_dispute,self_signup,contact_email,evidence,note,expires_at)
 values(p_claim,p_place,p_actor,p_method,p_dispute,p_self,p_email,p_evidence,nullif(btrim(coalesce(p_note,'')),''),exp);
 perform public.dir_claim_place_set(p_place,p_actor,public.dir_derived_uuid(p_action,'claim-place'),case when p_dispute then 'disputed' else 'claim_pending' end,null,p_claim);
 insert into public.dir_place_claim_events(claim_id,actor_id,event,from_status,to_status) values(p_claim,p_actor,'opened',null,'open');
 return jsonb_build_object('claimId',p_claim,'status','open','method',p_method,'isDispute',p_dispute,'expiresAt',exp);
end $$;

-- ---------------------------------------------------------------- claimant actions
-- Input: {actionId, claimId, slug, method, email? (email_domain only), dispute?, note?, evidence?}. email_listed
-- carries NO address: the code always goes to the e-mail already on the place.
create or replace function public.dir_claim_open(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;m text;prior jsonb;p public.dir_places;dispute boolean;mail text;host text;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid claim' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');m:=p_input->>'method';
 if aid is null or cid is null or m is null or m not in('phone_listed','email_listed','hacienda_juridica','document_review','email_domain')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId','slug','method','email','dispute','note','evidence'))
  or (p_input ? 'dispute' and jsonb_typeof(p_input->'dispute')<>'boolean') or (p_input ? 'note' and jsonb_typeof(p_input->'note')<>'string')
  or length(coalesce(p_input->>'note',''))>1000 or (p_input ? 'email')<>(m='email_domain') then
  raise exception 'Invalid claim' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 dispute:=coalesce((p_input->>'dispute')::boolean,false);
 select * into p from public.dir_places where slug=p_input->>'slug' and status='published';
 if not found then raise exception 'Place unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||p.id::text,0));
 select * into p from public.dir_places where id=p.id for update;
 if exists(select 1 from public.dir_place_managers where place_id=p.id and user_id=p_actor and status='active') then
  raise exception 'Already a manager of this place' using errcode='22023',hint='dir_claim_already_manager';end if;
 if exists(select 1 from public.dir_place_claims where place_id=p.id and status in('open','code_sent')) then
  raise exception 'Another claim is in progress' using errcode='23505',hint='dir_claim_pending';end if;
 if p.claim_status='claimed' and not dispute then raise exception 'Place already claimed' using errcode='23505',hint='dir_place_already_claimed';end if;
 if p.claim_status<>'claimed' and dispute then raise exception 'Nothing to dispute' using errcode='22023',hint='dir_claim_no_dispute';end if;
 if dispute and m not in('document_review','hacienda_juridica') then raise exception 'Disputes need staff review' using errcode='22023',hint='dir_claim_dispute_method';end if;
 if m='phone_listed' and not public.dir_claim_sms_enabled() then raise exception 'Claims by SMS are off' using errcode='22023',hint='dir_claim_sms_disabled';end if;
 if m='phone_listed' and (p.phone is null or not public.dir_field_independent(p.id,'phone')) then
  raise exception 'No independent phone on this place' using errcode='22023',hint='dir_claim_phone_unavailable';end if;
 if m='email_listed' and not public.dir_listed_email_eligible(p.id) then
  raise exception 'No eligible e-mail on this place' using errcode='22023',hint='dir_claim_email_unavailable';end if;
 if m='email_domain' then
  mail:=lower(btrim(p_input->>'email'));host:=public.dir_website_host(p.website);
  if host is null or not public.dir_field_independent(p.id,'website') or mail!~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' or length(mail)>254
   or split_part(mail,'@',2)<>host or host in('gmail.com','hotmail.com','hotmail.es','outlook.com','outlook.es','live.com','msn.com','yahoo.com','yahoo.es','icloud.com','me.com','aol.com','proton.me','protonmail.com','gmx.com','mail.com','facebook.com','instagram.com','wa.me','linktr.ee') then
   raise exception 'The e-mail domain must match the listed website' using errcode='22023',hint='dir_claim_domain_mismatch';end if;
 end if;
 result:=public.dir_claim_insert(p_actor,aid,cid,p.id,m,mail,dispute,false,p_input->>'note',coalesce(p_input->'evidence','{}'::jsonb));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Input: {actionId, claimId, codeHash}. codeHash = HMAC-SHA256(server pepper, claimId:code), computed by the server.
-- Result carries the destination for the server-side sender adapter; routes must not echo it to the browser.
create or replace function public.dir_claim_send_code(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;prior jsonb;c public.dir_place_claims;p public.dir_places;dest text;result jsonb;exp timestamptz;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid code request' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');
 if aid is null or cid is null or coalesce(p_input->>'codeHash','')!~'^[a-f0-9]{64}$'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId','codeHash')) then
  raise exception 'Invalid code request' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into c from public.dir_place_claims where id=cid;
 if not found or c.claimant_id<>p_actor then raise exception 'Claim not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||c.place_id::text,0));
 select * into c from public.dir_place_claims where id=cid for update;
 if c.method not in('phone_listed','email_listed','email_domain') then raise exception 'This method has no code' using errcode='22023',hint='dir_claim_no_code';end if;
 if c.status not in('open','code_sent') then raise exception 'Claim already closed' using errcode='40001',hint='dir_claim_closed';end if;
 if c.expires_at<=clock_timestamp() then
  result:=public.dir_claim_finish(cid,'expired',p_actor,aid,null,null);
 else
  if c.otp_sends>=3 then raise exception 'No more codes for this claim' using errcode='54000',hint='dir_claim_send_cap';end if;
  if c.otp_last_sent_at>clock_timestamp()-interval '60 seconds' then raise exception 'Wait before asking for another code' using errcode='54000',hint='dir_claim_code_cooldown';end if;
  select * into p from public.dir_places where id=c.place_id;
  if c.method='phone_listed' then
   if not public.dir_claim_sms_enabled() then raise exception 'Claims by SMS are off' using errcode='22023',hint='dir_claim_sms_disabled';end if;
   -- Always the phone currently listed on the place, from an independent source.
   if p.phone is null or not public.dir_field_independent(p.id,'phone') then raise exception 'No independent phone on this place' using errcode='22023',hint='dir_claim_phone_unavailable';end if;
   dest:=p.phone;
  elsif c.method='email_listed' then
   -- Always the e-mail currently on the place, still eligible (checked again at every send).
   if not public.dir_listed_email_eligible(p.id) then raise exception 'No eligible e-mail on this place' using errcode='22023',hint='dir_claim_email_unavailable';end if;
   dest:=p.email;
  else
   if public.dir_website_host(p.website) is distinct from split_part(c.contact_email,'@',2) or not public.dir_field_independent(p.id,'website') then
    raise exception 'The e-mail domain must match the listed website' using errcode='22023',hint='dir_claim_domain_mismatch';end if;
   dest:=c.contact_email;
  end if;
  exp:=clock_timestamp()+interval '10 minutes';
  update public.dir_place_claims set status='code_sent',otp_hash=p_input->>'codeHash',otp_expires_at=exp,otp_sends=otp_sends+1,otp_last_sent_at=clock_timestamp() where id=cid;
  insert into public.dir_place_claim_events(claim_id,actor_id,event,from_status,to_status) values(cid,p_actor,'code_sent',c.status,'code_sent');
  result:=jsonb_build_object('claimId',cid,'status','code_sent','channel',case when c.method='phone_listed' then 'sms' else 'email' end,
   'destination',dest,'destinationMasked',public.dir_mask_destination(dest),'codeExpiresAt',exp,'sendsLeft',3-(c.otp_sends+1));
 end if;
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Input: {actionId, claimId, codeHash}. A wrong code is recorded (never rolled back); 5 wrong codes reject the claim.
create or replace function public.dir_claim_verify_code(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;prior jsonb;c public.dir_place_claims;result jsonb;tries integer;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid code' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');
 if aid is null or cid is null or coalesce(p_input->>'codeHash','')!~'^[a-f0-9]{64}$'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId','codeHash')) then
  raise exception 'Invalid code' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into c from public.dir_place_claims where id=cid;
 if not found or c.claimant_id<>p_actor then raise exception 'Claim not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||c.place_id::text,0));
 select * into c from public.dir_place_claims where id=cid for update;
 if c.status='open' and c.method in('phone_listed','email_listed','email_domain') then raise exception 'Ask for a code first' using errcode='22023',hint='dir_claim_no_code_sent';end if;
 if c.status<>'code_sent' then raise exception 'Claim already closed' using errcode='40001',hint='dir_claim_closed';end if;
 if c.expires_at<=clock_timestamp() then
  result:=public.dir_claim_finish(cid,'expired',p_actor,aid,null,null)||jsonb_build_object('verified',false);
 elsif c.otp_expires_at<=clock_timestamp() then
  result:=jsonb_build_object('claimId',cid,'status','code_sent','verified',false,'reason','code_expired','attemptsLeft',5-c.otp_attempts);
 else
  tries:=c.otp_attempts+1;
  update public.dir_place_claims set otp_attempts=tries where id=cid;
  if c.otp_hash=p_input->>'codeHash' then
   result:=public.dir_claim_finish(cid,'approved',p_actor,aid,null,null)||jsonb_build_object('verified',true);
  elsif tries>=5 then
   result:=public.dir_claim_finish(cid,'rejected',p_actor,aid,'attempts_exhausted',null)||jsonb_build_object('verified',false,'attemptsLeft',0);
  else
   insert into public.dir_place_claim_events(claim_id,actor_id,event,from_status,to_status) values(cid,p_actor,'code_failed','code_sent','code_sent');
   result:=jsonb_build_object('claimId',cid,'status','code_sent','verified',false,'reason','wrong_code','attemptsLeft',5-tries);
  end if;
 end if;
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Input: {actionId, claimId}.
create or replace function public.dir_claim_withdraw(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;prior jsonb;c public.dir_place_claims;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid withdrawal' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');
 if aid is null or cid is null or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId')) then raise exception 'Invalid withdrawal' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into c from public.dir_place_claims where id=cid;
 if not found or c.claimant_id<>p_actor then raise exception 'Claim not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||c.place_id::text,0));
 result:=public.dir_claim_finish(cid,'withdrawn',p_actor,aid,null,null);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Claimant view: never returns the code hash, the full destination or reviewer ids.
create or replace function public.dir_claim_read(p_actor uuid,p_claim uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('claimId',c.id,'slug',p.slug,'placeName',p.name,'method',c.method,'status',c.status,'isDispute',c.is_dispute,
  'selfSignup',c.self_signup,'destinationMasked',case c.method when 'phone_listed' then public.dir_mask_destination(p.phone) when 'email_listed' then public.dir_mask_destination(p.email)
   when 'email_domain' then public.dir_mask_destination(c.contact_email) end,
  'attemptsLeft',5-c.otp_attempts,'sendsLeft',case when c.method in('phone_listed','email_listed','email_domain') then 3-c.otp_sends else 0 end,
  'codeExpiresAt',c.otp_expires_at,'expiresAt',c.expires_at,'decisionReason',c.decision_reason,'createdAt',c.created_at,'resolvedAt',c.resolved_at)
 from public.dir_place_claims c join public.dir_places p on p.id=c.place_id where c.id=p_claim and c.claimant_id=p_actor $$;

-- Ways to claim a published place, for the claim block (server only; never the full e-mail, phone or any id):
-- {emailListed: masked address or null, websiteHost: host for email_domain or null, phoneListed, smsEnabled}.
create or replace function public.dir_claim_options(p_slug text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'emailListed',case when public.dir_listed_email_eligible(p.id) then public.dir_mask_destination(p.email) end,
  'websiteHost',case when public.dir_field_independent(p.id,'website') and public.dir_website_host(p.website) not in('gmail.com','hotmail.com','hotmail.es','outlook.com','outlook.es','live.com','msn.com','yahoo.com','yahoo.es','icloud.com','me.com','aol.com','proton.me','protonmail.com','gmx.com','mail.com','facebook.com','instagram.com','wa.me','linktr.ee')
   then public.dir_website_host(p.website) end,
  'phoneListed',p.phone is not null and public.dir_field_independent(p.id,'phone'),
  'smsEnabled',public.dir_claim_sms_enabled())
 from public.dir_places p where p.slug=p_slug and p.status='published' $$;

-- ---------------------------------------------------------------- "add my business" (self-signup)
-- Input: {actionId, claimId, placeId, place:{slug, vertical, name, ...}, method: document_review|hacienda_juridica,
--         evidence, note?}. Creates a DRAFT place (source 'owner') in claim_pending; staff reviews the claim.
create or replace function public.dir_place_self_signup(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;pid uuid;m text:=p_input->>'method';prior jsonb;pl jsonb:=p_input->'place';created jsonb;claim jsonb;result jsonb;nm text;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid business' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');pid:=public.dir_try_uuid(p_input->>'placeId');
 if aid is null or cid is null or pid is null or jsonb_typeof(pl)<>'object' or m is null or m not in('document_review','hacienda_juridica')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId','placeId','place','method','evidence','note'))
  or (p_input ? 'note' and jsonb_typeof(p_input->'note')<>'string') or length(coalesce(p_input->>'note',''))>1000 then
  raise exception 'Invalid business' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 if (select count(*) from public.dir_place_claims where claimant_id=p_actor and self_signup and created_at>clock_timestamp()-interval '1 day')>=3 then
  raise exception 'Too many new businesses' using errcode='54000',hint='dir_signup_cap';end if;
 nm:=public.dir_normalize(pl->>'name');
 if exists(select 1 from public.dir_places x where x.vertical_id=pl->>'vertical' and x.name_normalized=nm and x.status<>'removed' and (
   (jsonb_typeof(pl->'lat')='number' and jsonb_typeof(pl->'lng')='number' and x.lat is not null
    and abs(x.lat-case when jsonb_typeof(pl->'lat')='number' then (pl->>'lat')::numeric end)<0.0007
    and abs(x.lng-case when jsonb_typeof(pl->'lng')='number' then (pl->>'lng')::numeric end)<0.0007)
   or (x.admin_area_2 is not null and public.dir_normalize(x.admin_area_2)=public.dir_normalize(pl->>'adminArea2')))) then
  raise exception 'This business may already be listed' using errcode='23505',hint='dir_place_possible_duplicate';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||pid::text,0));
 created:=public.dir_place_mutate(p_actor,jsonb_build_object('action','create','actionId',public.dir_derived_uuid(aid,'signup-place'),'placeId',pid,'revision',0,'place',pl,'source',jsonb_build_object('id','owner')));
 claim:=public.dir_claim_insert(p_actor,aid,cid,pid,m,null,false,true,p_input->>'note',coalesce(p_input->'evidence','{}'::jsonb));
 result:=claim||jsonb_build_object('placeId',pid,'slug',created->>'slug','placeStatus','draft');
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- staff
-- Input: {actionId, claimId, decision: approve|reject, reason?}. The reviewer can never be the claimant nor a
-- current manager of the place. Code-based methods can only be rejected here (they are approved by the code).
create or replace function public.dir_claim_review(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;dec text:=p_input->>'decision';prior jsonb;c public.dir_place_claims;result jsonb;why text;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid review' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');why:=nullif(btrim(coalesce(p_input->>'reason','')),'');
 if aid is null or cid is null or dec is null or dec not in('approve','reject') or length(coalesce(why,''))>1000 or (dec='reject' and length(coalesce(why,''))<3)
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId','decision','reason')) then
  raise exception 'Invalid review' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into c from public.dir_place_claims where id=cid;
 if not found then raise exception 'Claim not found' using errcode='P0002';end if;
 if c.claimant_id=p_actor then raise exception 'A claimant cannot review their own claim' using errcode='42501',hint='dir_claim_self_review';end if;
 if exists(select 1 from public.dir_place_managers where place_id=c.place_id and user_id=p_actor and status='active') then
  raise exception 'A manager of the place cannot review this claim' using errcode='42501',hint='dir_claim_conflict';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||c.place_id::text,0));
 select * into c from public.dir_place_claims where id=cid for update;
 if c.status not in('open','code_sent') then raise exception 'Claim already closed' using errcode='40001',hint='dir_claim_closed';end if;
 if dec='approve' and c.method not in('document_review','hacienda_juridica') then raise exception 'This claim is approved by its code' using errcode='22023',hint='dir_claim_requires_code';end if;
 if c.expires_at<=clock_timestamp() then
  result:=public.dir_claim_finish(cid,'expired',p_actor,aid,null,null);
 else
  result:=public.dir_claim_finish(cid,case when dec='approve' then 'approved' else 'rejected' end,p_actor,aid,why,p_actor);
 end if;
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Input: {actionId}. Expires due claims (cron); idempotent per actionId.
create or replace function public.dir_claim_expire_due(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;prior jsonb;c record;n integer:=0;result jsonb;
begin
 aid:=public.dir_try_uuid(p_input->>'actionId');
 if p_actor is null or aid is null or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId')) then raise exception 'Invalid sweep' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 for c in select id,place_id from public.dir_place_claims where status in('open','code_sent') and expires_at<=clock_timestamp() order by expires_at limit 500 loop
  perform pg_advisory_xact_lock(hashtextextended('dir-place:'||c.place_id::text,0));
  perform public.dir_claim_finish(c.id,'expired',p_actor,public.dir_derived_uuid(aid,c.id::text),null,null);n:=n+1;
 end loop;
 result:=jsonb_build_object('expired',n);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Staff queue: open claims that need a human decision (documents / Hacienda), oldest first.
create or replace function public.dir_claim_queue(p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.created_at),'[]') from(
  select c.created_at,jsonb_build_object('claimId',c.id,'placeId',p.id,'slug',p.slug,'placeName',p.name,'placeStatus',p.status,'claimStatus',p.claim_status,
   'claimantId',c.claimant_id,'method',c.method,'isDispute',c.is_dispute,'selfSignup',c.self_signup,'evidence',c.evidence,'note',c.note,
   'createdAt',c.created_at,'expiresAt',c.expires_at) j
  from public.dir_place_claims c join public.dir_places p on p.id=c.place_id
  where c.status='open' and c.method in('document_review','hacienda_juridica') order by c.created_at limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- ---------------------------------------------------------------- managers
create or replace function public.dir_place_manager_role(p_actor uuid,p_place uuid) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select role from public.dir_place_managers where place_id=p_place and user_id=p_actor and status='active' $$;

-- Input: {actionId, placeId, action: add|revoke, userId}. Only the owner adds managers or removes others; a manager
-- may remove themself. Owners change only through a dispute claim.
create or replace function public.dir_place_manager_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;pid uuid;target uuid;act text:=p_input->>'action';prior jsonb;mine text;theirs text;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid manager change' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');pid:=public.dir_try_uuid(p_input->>'placeId');target:=public.dir_try_uuid(p_input->>'userId');
 if aid is null or pid is null or target is null or act is null or act not in('add','revoke')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','placeId','action','userId')) then
  raise exception 'Invalid manager change' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||pid::text,0));
 mine:=public.dir_place_manager_role(p_actor,pid);theirs:=public.dir_place_manager_role(target,pid);
 if mine is null then raise exception 'Not a manager of this place' using errcode='42501';end if;
 if act='add' then
  if mine<>'owner' then raise exception 'Only the owner adds managers' using errcode='42501';end if;
  if theirs is not null then raise exception 'Already a manager' using errcode='23505';end if;
  if (select count(*) from public.dir_place_managers where place_id=pid and status='active')>=10 then raise exception 'Too many managers' using errcode='54000',hint='dir_manager_cap';end if;
  insert into public.dir_place_managers(id,place_id,user_id,role,granted_by) values(public.dir_derived_uuid(aid,'manager'),pid,target,'manager',p_actor);
 else
  if theirs is null then raise exception 'Not a manager' using errcode='P0002';end if;
  if theirs='owner' then raise exception 'The owner changes only through a dispute' using errcode='42501',hint='dir_owner_fixed';end if;
  if mine<>'owner' and target<>p_actor then raise exception 'Only the owner removes managers' using errcode='42501';end if;
  update public.dir_place_managers set status='revoked',revoked_by=p_actor,revoked_at=clock_timestamp(),revoke_reason=case when target=p_actor then 'left' else 'owner_removed' end
   where place_id=pid and user_id=target and status='active';
 end if;
 result:=jsonb_build_object('placeId',pid,'userId',target,'action',act,'managers',(select count(*) from public.dir_place_managers where place_id=pid and status='active'));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['dir_place_claims','dir_place_managers','dir_place_claim_events','dir_claim_settings'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n='dir_place_claim_events' then execute format('grant select,insert on public.%I to service_role',n);
 elsif n='dir_claim_settings' then execute format('grant select,update on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
