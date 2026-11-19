-- LOCAL PRO ONLY. Multivertical round V1 (+ data part of R1), 2026-11-16: classified listings (anuncios) for
-- vehicles (/vehiculos) and real estate (/inmuebles).
-- Depends on: directory-core-local.sql (dir_places, dir_immutable, dir_derived_uuid, dir_reports),
--             directory-claims-local.sql (dir_place_managers: who manages a dealer/agency place) and
--             vehicles-catalog-local.sql (ref_vehicle_makes, ref_vehicle_models).
-- Optional at run time: team-roles-local.sql (pro_role_of / pro_company_members) for the R2 agent assignment;
--             without it assigning an agent answers 55000 dir_listing_team_unavailable (unassigning still works).
-- UI-gap round (2026-11-16, after V1):
-- * Public readers include 'reserved' (with the status column) so the page shows the «Reservado» badge.
-- * dir_listing_owner_list(actor, vertical, filter active|closed, cursor): Pro inventory reader; private fields
--   (plate, VIN, plano, folio, exact coordinates) only for the seller of each listing, never for co-managers.
-- * Linking place_id requires the seller to be an active manager of that place (dir_place_managers).
-- * R2 agent: dir_listings.agent_profile_id (properties only) + dir_listing_assign_agent (owner/manager of the
--   linked place; the agent must be an admin/manager/member of the place owner's Pro team, pro_role_of).
-- * Declared financing PER PLACE (dir_listing_financing): one dealer program for the whole lot, shown on vehicle
--   listings that opted in (seller_financing) only while the declaration is younger than financing_max_age_days,
--   always flagged declaredBySeller.
-- * V3 photos (dir_listing_media): ≤30 per listing, sha256, size, 1600/800/320 variants, exif_stripped must be
--   true, uploaded_by. Publishing (and staying public) needs min_photos_publish (4). Anti-fraud flags
--   (dir_listing_flags, append-only) move moderation to 'review': same photo used by another seller, price below
--   price_outlier_pct (50 %) of the median for the same model+year with ≥ price_outlier_min_samples (5) samples,
--   and reports_to_review (3) distinct abuse reporters. Public reports reuse dir_reports (listing_id column).
-- * dir_listings: generic listing (public_code of 6 chars, vertical vehiculos|inmuebles, seller_kind business|private,
--   optional dealer/agency place, status machine, CRC|USD price + price_crc_norm via dir_fx_rates, 60-day expiry
--   renewable by function (no cron: readers filter expires_at, dir_listing_expire_due marks them on demand), CAS
--   revision (40001), moderation_status, multi-country fields).
-- * dir_listing_vehicle / dir_listing_property: per-vertical extensions. plate_private, vin_private,
--   cadastral_plan_private and folio_real_private are NEVER returned by a public reader.
-- * Public readers: views public_vehicle_listings / public_property_listings (security_invoker) and
--   dir_listing_public(code). Only published, unexpired, moderation clear/approved; coordinates are always
--   fuzzed 305–495 m deterministically per listing (same offset every time, so repeated reads cannot be averaged).
-- * Limits (dir_listing_limits, configurable): private sellers ≤2 active (draft/published/reserved) per vertical;
--   business sellers without business_verified ≤5 published (published/reserved). 54000 + hint.
-- * Receipts (dir_listing_actions) and history (dir_listing_history) are immutable. Order NEVER depends on
--   payment: there is no paid/featured/sponsored column; renewing does not change published_at.
-- Tables: RLS on, service_role only, no DELETE grant, TRUNCATE blocked. Functions security invoker, pinned
-- search_path, executable only by service_role.
begin;

-- ---------------------------------------------------------------- tables
create table if not exists public.dir_fx_rates(
 rate_date date primary key,
 usd_crc numeric(12,4) not null check(usd_crc>0 and usd_crc<100000),
 source text not null check(source in('bccr','manual')),
 recorded_by uuid,recorded_at timestamptz not null default clock_timestamp()
);

create table if not exists public.dir_listing_limits(
 key text primary key check(key in('private_active_per_vertical','business_unverified_published','min_photos_publish','price_outlier_min_samples',
  'price_outlier_pct','financing_max_age_days','reports_to_review')),
 value integer not null check(value between 0 and 10000),
 updated_at timestamptz not null default clock_timestamp(),
 check(key<>'min_photos_publish' or value between 1 and 30),
 check(key<>'price_outlier_pct' or value between 1 and 99),
 check(key not in('price_outlier_min_samples','reports_to_review','financing_max_age_days') or value>=1)
);
insert into public.dir_listing_limits(key,value) values('private_active_per_vertical',2),('business_unverified_published',5),('min_photos_publish',4),
 ('price_outlier_min_samples',5),('price_outlier_pct',50),('financing_max_age_days',180),('reports_to_review',3) on conflict(key) do nothing;

-- Seller registry (one row per profile that has listed). business_verified is set only by staff
-- (cédula jurídica + Hacienda + personería; V2 adds the evidence tables).
create table if not exists public.dir_listing_sellers(
 profile_id uuid primary key,
 business_verified boolean not null default false,
 verified_by uuid,verified_at timestamptz,note text check(length(note)<=500),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(not business_verified or (verified_by is not null and verified_at is not null))
);

create table if not exists public.dir_listings(
 id uuid primary key,
 public_code text not null unique check(public_code~'^[2-9a-hjkmnp-z]{6}$'),
 vertical text not null check(vertical in('vehiculos','inmuebles')),
 seller_kind text not null check(seller_kind in('business','private')),
 seller_profile_id uuid not null references public.dir_listing_sellers(profile_id),
 place_id uuid references public.dir_places(id),
 status text not null default 'draft' check(status in('draft','published','reserved','sold','rented','archived','suspended','expired')),
 moderation_status text not null default 'clear' check(moderation_status in('clear','review','approved','rejected')),
 title text not null check(length(btrim(title)) between 5 and 120),
 description text check(length(description) between 1 and 5000),
 price_minor bigint not null check(price_minor>0 and price_minor<=100000000000000),
 currency text not null check(currency in('CRC','USD')),
 price_crc_norm bigint check(price_crc_norm>0),fx_rate_date date,fx_usd_crc numeric(12,4),
 country_code text not null default 'CR' check(country_code~'^[A-Z]{2}$'),
 admin_area_1 text check(length(admin_area_1) between 1 and 80),
 admin_area_2 text check(length(admin_area_2) between 1 and 80),
 admin_area_3 text check(length(admin_area_3) between 1 and 80),
 locality text check(length(locality) between 1 and 80),
 lat numeric(9,6) check(lat between -90 and 90),lng numeric(9,6) check(lng between -180 and 180),
 published_at timestamptz,expires_at timestamptz,status_changed_at timestamptz not null default clock_timestamp(),
 revision integer not null default 1 check(revision>0),
 -- R2: team agent in charge of a property listing (profile id; validated against the Pro team at assignment).
 agent_profile_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((lat is null)=(lng is null)),
 check(seller_kind='business' or place_id is null),
 check(agent_profile_id is null or (vertical='inmuebles' and place_id is not null)),
 check((currency='CRC' and price_crc_norm=price_minor and fx_rate_date is null) or (currency='USD' and (price_crc_norm is null)=(fx_rate_date is null) and (fx_rate_date is null)=(fx_usd_crc is null))),
 check(status not in('published','reserved','expired') or (published_at is not null and expires_at is not null))
);
create index if not exists dir_listings_public on public.dir_listings(vertical,status,country_code,expires_at);
create index if not exists dir_listings_seller on public.dir_listings(seller_profile_id,vertical,status);
create index if not exists dir_listings_price on public.dir_listings(vertical,price_crc_norm) where status='published';
create index if not exists dir_listings_place on public.dir_listings(place_id) where place_id is not null;
create index if not exists dir_listings_expiry on public.dir_listings(expires_at) where status in('published','reserved');

create table if not exists public.dir_listing_vehicle(
 listing_id uuid primary key references public.dir_listings(id),
 make_id bigint not null references public.ref_vehicle_makes(id),
 model_id bigint not null references public.ref_vehicle_models(id),
 vehicle_type text not null check(vehicle_type in('car','suv','pickup','van','truck','motorcycle','atv')),
 version text check(length(btrim(version)) between 1 and 80),
 year smallint not null check(year between 1950 and 2100),
 condition text not null check(condition in('new','used')),
 mileage_km integer check(mileage_km between 0 and 2000000),
 transmission text check(transmission in('manual','automatic','cvt','other')),
 fuel text check(fuel in('gasoline','diesel','hybrid','plugin_hybrid','electric','lpg','other')),
 drivetrain text check(drivetrain in('4x2','4x4','awd')),
 engine_cc integer check(engine_cc between 49 and 20000),
 doors smallint check(doors between 0 and 6),seats smallint check(seats between 1 and 60),
 color text check(length(btrim(color)) between 1 and 40),
 accepts_trade_in boolean not null default false,seller_financing boolean not null default false,
 -- Declared by the seller (not verified by ContrataCR); the page labels them as declarations.
 marchamo_current_declared boolean,rtv_current_declared boolean,taxes_paid_declared boolean,
 -- PRIVATE: never in a public reader (plate visibility pending legal review).
 plate_private text check(plate_private~'^[A-Z0-9][A-Z0-9 -]{0,10}[A-Z0-9]$'),
 vin_private text check(vin_private~'^[A-HJ-NPR-Z0-9]{11,17}$')
);
create index if not exists dir_listing_vehicle_model on public.dir_listing_vehicle(make_id,model_id,year);

create table if not exists public.dir_listing_property(
 listing_id uuid primary key references public.dir_listings(id),
 operation text not null check(operation in('sale','rent')),
 property_type text not null check(property_type in('house','apartment','condo','lot','office','commercial','warehouse','farm','room')),
 bedrooms smallint check(bedrooms between 0 and 50),bathrooms numeric(3,1) check(bathrooms between 0 and 50),
 parking_spaces smallint check(parking_spaces between 0 and 50),
 built_m2 numeric(10,2) check(built_m2>0 and built_m2<=1000000),lot_m2 numeric(14,2) check(lot_m2>0 and lot_m2<=100000000000),
 floors smallint check(floors between 1 and 200),year_built smallint check(year_built between 1800 and 2100),
 furnished boolean,pets_allowed boolean,in_condominium boolean,
 hoa_fee_minor bigint check(hoa_fee_minor>=0 and hoa_fee_minor<=100000000000),
 min_lease_months smallint check(min_lease_months between 1 and 120),
 amenities text[] not null default '{}' check(cardinality(amenities)<=20 and amenities<@array['pool','gym','security','elevator','garden','terrace','bbq','playground','laundry','storage','air_conditioning','water_tank','solar','generator','ocean_view','mountain_view','gated','accessible']::text[]),
 -- PRIVATE: never in a public reader.
 cadastral_plan_private text check(cadastral_plan_private~'^[0-9A-Z][0-9A-Z-]{4,23}[0-9A-Z]$'),
 folio_real_private text check(folio_real_private~'^[0-9A-Z][0-9A-Z-]{4,23}[0-9A-Z]$'),
 check(operation='rent' or min_lease_months is null)
);
create index if not exists dir_listing_property_type on public.dir_listing_property(operation,property_type);

create table if not exists public.dir_listing_actions(
 actor_id uuid not null,action_id uuid not null,input jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);
create table if not exists public.dir_listing_history(
 id bigint generated always as identity primary key,
 listing_id uuid not null references public.dir_listings(id),
 action_id uuid not null,actor_id uuid not null,
 action text not null check(action in('create','update','status','renew','expire','suspend','reinstate','moderation','assign_agent','flag')),
 revision integer not null,before jsonb,after jsonb not null,at timestamptz not null default clock_timestamp()
);
create index if not exists dir_listing_history_listing on public.dir_listing_history(listing_id,id);
create index if not exists dir_listings_agent on public.dir_listings(agent_profile_id) where agent_profile_id is not null;

-- V3 photos. Files live in storage at dir-listings/<media id>/<1600|800|320>.<webp|jpg|avif> (the media id, never the
-- listing id, so public paths do not reveal internal ids). The upload route re-encodes, strips EXIF/GPS and
-- computes sha256 of the decoded original; exif_stripped=false is refused by the database. Rows are never
-- deleted: removal sets status='removed' and sort=null (sort is compacted 0..n-1 for the active photos).
create table if not exists public.dir_listing_media(
 id uuid primary key,
 listing_id uuid not null references public.dir_listings(id),
 sort smallint check(sort between 0 and 29),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 width integer not null check(width between 200 and 1600),height integer not null check(height between 200 and 1600),
 path_1600 text not null,path_800 text not null,path_320 text not null,
 exif_stripped boolean not null check(exif_stripped),
 alt_es text check(length(alt_es) between 1 and 200),alt_en text check(length(alt_en) between 1 and 200),
 uploaded_by uuid not null,
 status text not null default 'active' check(status in('active','removed')),
 removed_by uuid,removed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check(greatest(width,height)>=640),
 check((status='active')=(sort is not null) and (status='active')=(removed_at is null)),
 check(path_1600~('^dir-listings/'||id::text||'/1600\.(webp|jpg|avif)$') and path_800~('^dir-listings/'||id::text||'/800\.(webp|jpg|avif)$')
   and path_320~('^dir-listings/'||id::text||'/320\.(webp|jpg|avif)$')),
 constraint dir_listing_media_sort unique(listing_id,sort) deferrable initially deferred
);
create unique index if not exists dir_listing_media_sha_once on public.dir_listing_media(listing_id,sha256) where status='active';
create index if not exists dir_listing_media_sha on public.dir_listing_media(sha256);

-- Anti-fraud flags (append-only). One row per (listing, kind, key): the same signal never re-flags after staff
-- approval; a new signal (another photo, a lower price, more reporters) does.
create table if not exists public.dir_listing_flags(
 id bigint generated always as identity primary key,
 listing_id uuid not null references public.dir_listings(id),
 kind text not null check(kind in('duplicate_photo','price_outlier','reports')),
 key text not null check(length(key) between 1 and 80),
 detail jsonb not null default '{}' check(jsonb_typeof(detail)='object' and octet_length(detail::text)<=2048),
 created_at timestamptz not null default clock_timestamp(),
 unique(listing_id,kind,key)
);

-- Declared financing, PER PLACE (dealer program for the whole lot; see the doc for the reasoning). Declared by an
-- owner/manager of the dealer place; NOT verified by ContrataCR and always shown as declared by the seller.
create table if not exists public.dir_listing_financing(
 place_id uuid primary key references public.dir_places(id),
 annual_rate_pct numeric(5,2) not null check(annual_rate_pct between 0 and 60),
 max_term_months smallint not null check(max_term_months between 1 and 120),
 min_down_payment_pct numeric(5,2) not null check(min_down_payment_pct between 0 and 90),
 status text not null default 'active' check(status in('active','withdrawn')),
 declared_by uuid not null,declared_at timestamptz not null default clock_timestamp(),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp()
);

-- Public reports about a listing reuse dir_reports (core): listing_id set, place_id null.
alter table public.dir_reports add column if not exists listing_id uuid references public.dir_listings(id);
alter table public.dir_reports alter column place_id drop not null;
do $$begin
 if not exists(select 1 from pg_constraint where conname='dir_reports_target_check' and conrelid='public.dir_reports'::regclass) then
  alter table public.dir_reports add constraint dir_reports_target_check check(num_nonnulls(place_id,listing_id)=1
   and (listing_id is null or kind in('wrong_info','duplicate','abuse','other')));
 end if;end $$;
create index if not exists dir_reports_listing on public.dir_reports(listing_id,created_at desc) where listing_id is not null;

-- ---------------------------------------------------------------- immutability
do $$declare t text;begin foreach t in array array['dir_listing_actions','dir_listing_history','dir_listing_flags'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.dir_immutable()',t||'_immutable',t);
end loop;
foreach t in array array['dir_listing_actions','dir_listing_history','dir_listings','dir_listing_vehicle','dir_listing_property','dir_listing_sellers','dir_fx_rates','dir_listing_limits',
 'dir_listing_media','dir_listing_flags','dir_listing_financing'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
end loop;end $$;

-- ---------------------------------------------------------------- helpers
-- camelCase input → column names; unknown keys are rejected (22023).
create or replace function public.dir_listing_remap(p_value jsonb,p_map jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare k text;out jsonb:='{}';
begin
 if p_value is null then return '{}';end if;
 if jsonb_typeof(p_value)<>'object' then raise exception 'Invalid listing fields' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_value) loop
  if not p_map ? k then raise exception 'Unknown listing field %',k using errcode='22023';end if;
  out:=out||jsonb_build_object(p_map->>k,p_value->k);
 end loop;
 return out;
end $$;

create or replace function public.dir_listing_limit(p_key text) returns integer
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select value from public.dir_listing_limits where key=p_key),case p_key when 'private_active_per_vertical' then 2 when 'min_photos_publish' then 4
  when 'price_outlier_pct' then 50 when 'financing_max_age_days' then 180 when 'reports_to_review' then 3 else 5 end) $$;

-- Active photos of a listing.
create or replace function public.dir_listing_photo_count(p_id uuid) returns integer
language sql stable security invoker set search_path=public,pg_temp as $$
 select count(*)::integer from public.dir_listing_media where listing_id=p_id and status='active' $$;

-- Records an anti-fraud flag once per (listing, kind, key) and moves moderation to 'review' (from clear/approved;
-- 'rejected' stays). p_log=true (actions that do not bump the revision themselves: photos, public reports) bumps
-- the revision and writes a 'flag' history row. Returns true when the flag is new.
create or replace function public.dir_listing_flag(p_id uuid,p_kind text,p_key text,p_detail jsonb,p_actor uuid,p_action uuid,p_log boolean) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;before jsonb;
begin
 insert into public.dir_listing_flags(listing_id,kind,key,detail) values(p_id,p_kind,p_key,coalesce(p_detail,'{}')) on conflict(listing_id,kind,key) do nothing;
 get diagnostics n=row_count;
 if n=0 then return false;end if;
 if p_log then before:=public.dir_listing_snapshot(p_id);end if;
 update public.dir_listings set moderation_status='review',
  revision=case when p_log and moderation_status in('clear','approved') then revision+1 else revision end,
  updated_at=case when p_log and moderation_status in('clear','approved') then clock_timestamp() else updated_at end
  where id=p_id and moderation_status in('clear','approved');
 get diagnostics n=row_count;
 if p_log and n>0 then
  insert into public.dir_listing_history(listing_id,action_id,actor_id,action,revision,before,after)
  values(p_id,public.dir_derived_uuid(p_action,'flag:'||p_kind||':'||p_key),coalesce(p_actor,'00000000-0000-0000-0000-000000000000'),'flag',
   (select revision from public.dir_listings where id=p_id),before,public.dir_listing_snapshot(p_id)||jsonb_build_object('flag',p_kind));
 end if;
 return true;
end $$;

-- Price outlier (vehicles): price_crc_norm below price_outlier_pct % of the median of OTHER sellers' listings for
-- the same model and year (published/reserved/sold, moderation clear/approved) with at least
-- price_outlier_min_samples samples. Called inside the owner action (which already bumps the revision).
create or replace function public.dir_listing_price_check(p_id uuid,p_actor uuid,p_action uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.dir_listings;v public.dir_listing_vehicle;n integer;med numeric;
begin
 select * into l from public.dir_listings where id=p_id;
 if l.vertical<>'vehiculos' or l.price_crc_norm is null then return false;end if;
 select * into v from public.dir_listing_vehicle where listing_id=p_id;
 select count(*),percentile_cont(0.5) within group(order by o.price_crc_norm) into n,med
  from public.dir_listings o join public.dir_listing_vehicle ov on ov.listing_id=o.id
  where ov.model_id=v.model_id and ov.year=v.year and o.id<>p_id and o.seller_profile_id<>l.seller_profile_id
   and o.status in('published','reserved','sold') and o.moderation_status in('clear','approved') and o.price_crc_norm is not null;
 if n<public.dir_listing_limit('price_outlier_min_samples') or l.price_crc_norm>=med*public.dir_listing_limit('price_outlier_pct')/100.0 then return false;end if;
 return public.dir_listing_flag(p_id,'price_outlier',l.price_crc_norm::text,jsonb_build_object('priceCrcNorm',l.price_crc_norm,'medianCrcNorm',round(med),'samples',n),p_actor,p_action,false);
end $$;

-- Valid status transitions. p_by: owner | staff | system. Renewal (expired→published) is the 'renew' action.
create or replace function public.dir_listing_transition_ok(p_from text,p_to text,p_vertical text,p_operation text,p_by text) returns boolean
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select coalesce(case p_by
  when 'owner' then
   (p_from='draft' and p_to in('published','archived'))
   or (p_from='published' and p_to in('reserved','draft','archived'))
   or (p_from='reserved' and p_to in('published','archived'))
   or (p_from in('published','reserved') and p_to='sold' and (p_vertical='vehiculos' or p_operation='sale'))
   or (p_from in('published','reserved') and p_to='rented' and p_vertical='inmuebles' and p_operation='rent')
   or (p_from in('expired','sold','rented','suspended') and p_to='archived')
   or (p_from='rented' and p_to='published' and p_vertical='inmuebles' and p_operation='rent')
   or (p_from='archived' and p_to='draft')
  when 'staff' then (p_from<>'suspended' and p_to='suspended') or (p_from='suspended' and p_to in('draft','archived'))
  when 'system' then p_from in('published','reserved') and p_to='expired'
  else false end,false) $$;

-- Deterministic 6-char public code (no 0/1/i/l/o), derived from the listing id; retries on collision.
create or replace function public.dir_listing_code(p_id uuid) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare alpha constant text:='23456789abcdefghjkmnpqrstuvwxyz';h text;c text;i integer;n integer;
begin
 for n in 0..50 loop
  h:=md5('ccr-listing-code:'||p_id::text||':'||n);c:='';
  for i in 0..5 loop c:=c||substr(alpha,(('x'||substr(h,i*2+1,2))::bit(8)::integer%31)+1,1);end loop;
  if not exists(select 1 from public.dir_listings where public_code=c) then return c;end if;
 end loop;
 raise exception 'Could not allocate a public code' using errcode='40001';
end $$;

-- Public location: fixed offset of 305–495 m in a fixed direction per listing (rounded to 5 decimals).
create or replace function public.dir_listing_fuzz(p_id uuid,p_lat numeric,p_lng numeric) returns table(lat numeric,lng numeric)
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select case when p_lat is null then null else round(p_lat+degrees(d/6371008.8*cos(t))::numeric,5) end,
        case when p_lat is null then null else round(p_lng+degrees(d/6371008.8*sin(t)/cos(radians(p_lat::double precision)))::numeric,5) end
 from (select 305+(('x'||substr(h,1,4))::bit(16)::integer%191)::double precision d,
              radians((('x'||substr(h,5,4))::bit(16)::integer%3600)/10.0)::double precision t
       from (select md5('ccr-listing-fuzz:'||p_id::text) h) a) b $$;

-- Latest USD→CRC rate on or before a date.
create or replace function public.dir_fx_usd_crc(p_on date) returns table(usd_crc numeric,rate_date date)
language sql stable security invoker set search_path=public,pg_temp as $$
 select r.usd_crc,r.rate_date from public.dir_fx_rates r where r.rate_date<=p_on order by r.rate_date desc limit 1 $$;

create or replace function public.dir_listing_snapshot(p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select to_jsonb(l)||jsonb_build_object(
  'vehicle',(select to_jsonb(v)-'listing_id' from public.dir_listing_vehicle v where v.listing_id=l.id),
  'property',(select to_jsonb(p)-'listing_id' from public.dir_listing_property p where p.listing_id=l.id))
 from public.dir_listings l where l.id=p_id $$;

-- Normalise trimmed fields, place, coordinates and CRC price. Raises 22023 on invalid combinations.
create or replace function public.dir_listing_prepare(p_l public.dir_listings,p_price_changed boolean) returns public.dir_listings
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.dir_listings:=p_l;pl public.dir_places;fx record;
begin
 l.title:=btrim(l.title);l.description:=nullif(btrim(l.description),'');
 l.admin_area_1:=nullif(btrim(l.admin_area_1),'');l.admin_area_2:=nullif(btrim(l.admin_area_2),'');
 l.admin_area_3:=nullif(btrim(l.admin_area_3),'');l.locality:=nullif(btrim(l.locality),'');
 if l.title is null then raise exception 'Title required' using errcode='22023';end if;
 if l.place_id is not null then
  if l.seller_kind<>'business' then raise exception 'Only businesses link a place' using errcode='22023';end if;
  select * into pl from public.dir_places where id=l.place_id;
  if not found or pl.status='removed' or pl.vertical_id<>(array['vehicle_dealer','real_estate'])[array_position(array['vehiculos','inmuebles'],l.vertical)] then
   raise exception 'Invalid place for this listing' using errcode='22023';end if;
 end if;
 if (l.lat is null)<>(l.lng is null) then raise exception 'Invalid coordinates' using errcode='22023';end if;
 if l.country_code='CR' and l.lat is not null and not(l.lat between 5.0 and 11.5 and l.lng between -87.5 and -82.5) then
  raise exception 'Coordinates outside the country' using errcode='22023';end if;
 if l.currency='CRC' then l.price_crc_norm:=l.price_minor;l.fx_rate_date:=null;l.fx_usd_crc:=null;
 elsif p_price_changed then
  select * into fx from public.dir_fx_usd_crc(current_date);
  if fx.usd_crc is null then l.price_crc_norm:=null;l.fx_rate_date:=null;l.fx_usd_crc:=null;
  else l.price_crc_norm:=round(l.price_minor*fx.usd_crc)::bigint;l.fx_rate_date:=fx.rate_date;l.fx_usd_crc:=fx.usd_crc;end if;
 end if;
 return l;
end $$;

create or replace function public.dir_listing_vehicle_prepare(p_v public.dir_listing_vehicle) returns public.dir_listing_vehicle
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v public.dir_listing_vehicle:=p_v;mt text;
begin
 if not exists(select 1 from public.ref_vehicle_makes where id=v.make_id and active) then raise exception 'Unknown make' using errcode='22023';end if;
 select o.vehicle_type into mt from public.ref_vehicle_models o where o.id=v.model_id and o.make_id=v.make_id and o.active;
 if mt is null then raise exception 'Model does not belong to the make' using errcode='22023';end if;
 v.vehicle_type:=mt;
 if v.year is null or v.year>extract(year from current_date)::integer+1 then raise exception 'Invalid year' using errcode='22023';end if;
 if v.condition is null then raise exception 'Condition required' using errcode='22023';end if;
 v.version:=nullif(btrim(v.version),'');v.color:=nullif(btrim(v.color),'');
 v.plate_private:=nullif(upper(btrim(v.plate_private)),'');v.vin_private:=nullif(upper(btrim(v.vin_private)),'');
 return v;
end $$;

create or replace function public.dir_listing_property_prepare(p_p public.dir_listing_property) returns public.dir_listing_property
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare p public.dir_listing_property:=p_p;
begin
 if p.operation is null or p.property_type is null then raise exception 'Operation and property type required' using errcode='22023';end if;
 if p.operation='sale' and p.min_lease_months is not null then raise exception 'Lease terms only for rentals' using errcode='22023';end if;
 p.amenities:=coalesce(p.amenities,'{}');
 p.cadastral_plan_private:=nullif(upper(btrim(p.cadastral_plan_private)),'');p.folio_real_private:=nullif(upper(btrim(p.folio_real_private)),'');
 return p;
end $$;

-- Seller limits (call with the seller lock held). p_entering: status the listing is entering.
create or replace function public.dir_listing_check_limits(p_l public.dir_listings,p_from text,p_to text) returns void
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_l.seller_kind='private' and p_to in('draft','published','reserved') and coalesce(p_from,'') not in('draft','published','reserved') then
  select count(*) into n from public.dir_listings where seller_profile_id=p_l.seller_profile_id and vertical=p_l.vertical and seller_kind='private'
   and status in('draft','published','reserved') and id<>p_l.id;
  if n>=public.dir_listing_limit('private_active_per_vertical') then
   raise exception 'Private sellers have reached their active listing limit' using errcode='54000',hint='dir_listing_limit_private';end if;
 end if;
 if p_l.seller_kind='business' and p_to in('published','reserved') and coalesce(p_from,'') not in('published','reserved')
  and not coalesce((select business_verified from public.dir_listing_sellers where profile_id=p_l.seller_profile_id),false) then
  select count(*) into n from public.dir_listings where seller_profile_id=p_l.seller_profile_id and seller_kind='business'
   and status in('published','reserved') and id<>p_l.id;
  if n>=public.dir_listing_limit('business_unverified_published') then
   raise exception 'Unverified businesses have reached their published listing limit' using errcode='54000',hint='dir_listing_limit_business_unverified';end if;
 end if;
end $$;

-- Requirements to be (or stay) public. Returns the listing with a fresh CRC normalisation for USD prices.
create or replace function public.dir_listing_publish_ready(p_l public.dir_listings) returns public.dir_listings
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.dir_listings;
begin
 if p_l.moderation_status not in('clear','approved') then raise exception 'Listing is under moderation' using errcode='22023',hint='dir_listing_moderation';end if;
 if length(coalesce(p_l.description,''))<20 or p_l.admin_area_1 is null or p_l.admin_area_2 is null then
  raise exception 'Listing incomplete' using errcode='22023',hint='dir_listing_incomplete';end if;
 if (p_l.vertical='vehiculos' and not exists(select 1 from public.dir_listing_vehicle where listing_id=p_l.id))
  or (p_l.vertical='inmuebles' and not exists(select 1 from public.dir_listing_property where listing_id=p_l.id)) then
  raise exception 'Listing incomplete' using errcode='22023',hint='dir_listing_incomplete';end if;
 if public.dir_listing_photo_count(p_l.id)<public.dir_listing_limit('min_photos_publish') then
  raise exception 'Not enough photos to publish' using errcode='22023',hint='dir_listing_photos_missing';end if;
 l:=public.dir_listing_prepare(p_l,true);
 if l.price_crc_norm is null then raise exception 'No USD exchange rate on file' using errcode='22023',hint='dir_listing_fx_missing';end if;
 return l;
end $$;

create or replace function public.dir_listing_result(p_action text,p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('action',p_action,'listingId',l.id,'code',l.public_code,'revision',l.revision,'status',l.status,
  'moderationStatus',l.moderation_status,'publishedAt',l.published_at,'expiresAt',l.expires_at)
 from public.dir_listings l where l.id=p_id $$;

-- ---------------------------------------------------------------- owner actions
-- Input: {action:create|update|status|renew, actionId, listingId, revision, listing?, vehicle?, property?, status?}.
-- p_actor is the seller (profile id). Another seller's listing answers P0002. Route validates with zod first.
create or replace function public.dir_listing_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;lid uuid;rev integer;receipt public.dir_listing_actions;l public.dir_listings;
 v public.dir_listing_vehicle;pr public.dir_listing_property;before jsonb;result jsonb;lm jsonb;vm jsonb;pm jsonb;to_status text;old_status text;
 price_changed boolean:=false;touched boolean:=false;old_place uuid;
 lmap constant jsonb:='{"vertical":"vertical","sellerKind":"seller_kind","placeId":"place_id","title":"title","description":"description","priceMinor":"price_minor","currency":"currency","countryCode":"country_code","adminArea1":"admin_area_1","adminArea2":"admin_area_2","adminArea3":"admin_area_3","locality":"locality","lat":"lat","lng":"lng"}';
 vmap constant jsonb:='{"makeId":"make_id","modelId":"model_id","version":"version","year":"year","condition":"condition","mileageKm":"mileage_km","transmission":"transmission","fuel":"fuel","drivetrain":"drivetrain","engineCc":"engine_cc","doors":"doors","seats":"seats","color":"color","acceptsTradeIn":"accepts_trade_in","sellerFinancing":"seller_financing","marchamoCurrentDeclared":"marchamo_current_declared","rtvCurrentDeclared":"rtv_current_declared","taxesPaidDeclared":"taxes_paid_declared","platePrivate":"plate_private","vinPrivate":"vin_private"}';
 pmap constant jsonb:='{"operation":"operation","propertyType":"property_type","bedrooms":"bedrooms","bathrooms":"bathrooms","parkingSpaces":"parking_spaces","builtM2":"built_m2","lotM2":"lot_m2","floors":"floors","yearBuilt":"year_built","furnished":"furnished","petsAllowed":"pets_allowed","inCondominium":"in_condominium","hoaFeeMinor":"hoa_fee_minor","minLeaseMonths":"min_lease_months","amenities":"amenities","cadastralPlanPrivate":"cadastral_plan_private","folioRealPrivate":"folio_real_private"}';
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or act is null or act not in('create','update','status','renew') or jsonb_typeof(p_input->'revision')<>'number' then
  raise exception 'Invalid listing action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'listingId')::uuid;rev:=(p_input->>'revision')::integer;
 exception when others then raise exception 'Invalid listing action' using errcode='22023';end;
 if aid is null or lid is null or rev<0 then raise exception 'Invalid listing action' using errcode='22023';end if;
 -- Seller lock first (limits), then listing lock.
 perform pg_advisory_xact_lock(hashtextextended('dir-seller:'||p_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('dir-listing:'||lid::text,0));
 select * into receipt from public.dir_listing_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into l from public.dir_listings where id=lid for update;

 if act='create' then
  if found or rev<>0 then raise exception 'Listing changed' using errcode='40001';end if;
  lm:=public.dir_listing_remap(p_input->'listing',lmap);
  if coalesce(lm->>'vertical','') not in('vehiculos','inmuebles') or coalesce(lm->>'seller_kind','') not in('business','private') then
   raise exception 'Invalid vertical or seller kind' using errcode='22023';end if;
  if (lm->>'vertical'='vehiculos' and (jsonb_typeof(p_input->'vehicle')<>'object' or p_input ? 'property'))
   or (lm->>'vertical'='inmuebles' and (jsonb_typeof(p_input->'property')<>'object' or p_input ? 'vehicle')) then
   raise exception 'Vertical details required' using errcode='22023';end if;
  begin l:=jsonb_populate_record(null::public.dir_listings,lm);
  exception when others then raise exception 'Invalid listing fields' using errcode='22023';end;
  if l.price_minor is null or l.currency is null then raise exception 'Price required' using errcode='22023';end if;
  l.id:=lid;l.seller_profile_id:=p_actor;l.country_code:=coalesce(l.country_code,'CR');l.status:='draft';l.moderation_status:='clear';
  l:=public.dir_listing_prepare(l,true);
  if l.place_id is not null and public.dir_place_manager_role(p_actor,l.place_id) is null then
   raise exception 'You do not manage this place' using errcode='42501',hint='dir_listing_place_not_managed';end if;
  insert into public.dir_listing_sellers(profile_id) values(p_actor) on conflict(profile_id) do nothing;
  perform public.dir_listing_check_limits(l,null,'draft');
  l.public_code:=public.dir_listing_code(lid);
  insert into public.dir_listings(id,public_code,vertical,seller_kind,seller_profile_id,place_id,status,moderation_status,title,description,price_minor,currency,
   price_crc_norm,fx_rate_date,fx_usd_crc,country_code,admin_area_1,admin_area_2,admin_area_3,locality,lat,lng)
  values(l.id,l.public_code,l.vertical,l.seller_kind,l.seller_profile_id,l.place_id,'draft','clear',l.title,l.description,l.price_minor,l.currency,
   l.price_crc_norm,l.fx_rate_date,l.fx_usd_crc,l.country_code,l.admin_area_1,l.admin_area_2,l.admin_area_3,l.locality,l.lat,l.lng) returning * into l;
  if l.vertical='vehiculos' then
   vm:=public.dir_listing_remap(p_input->'vehicle',vmap);
   begin v:=jsonb_populate_record(null::public.dir_listing_vehicle,vm);exception when others then raise exception 'Invalid vehicle fields' using errcode='22023';end;
   v.listing_id:=lid;v.accepts_trade_in:=coalesce(v.accepts_trade_in,false);v.seller_financing:=coalesce(v.seller_financing,false);
   v:=public.dir_listing_vehicle_prepare(v);insert into public.dir_listing_vehicle select v.*;
  else
   pm:=public.dir_listing_remap(p_input->'property',pmap);
   begin pr:=jsonb_populate_record(null::public.dir_listing_property,pm);exception when others then raise exception 'Invalid property fields' using errcode='22023';end;
   pr.listing_id:=lid;pr:=public.dir_listing_property_prepare(pr);insert into public.dir_listing_property select pr.*;
  end if;
 else
  if not found or l.seller_profile_id<>p_actor then raise exception 'Listing not found' using errcode='P0002';end if;
  if l.revision<>rev then raise exception 'Listing changed' using errcode='40001';end if;
  before:=public.dir_listing_snapshot(lid);old_status:=l.status;
  if act='update' then
   if l.status in('sold','rented','suspended') then raise exception 'Listing cannot be edited in this status' using errcode='22023',hint='dir_listing_locked';end if;
   lm:=public.dir_listing_remap(p_input->'listing',lmap-array['vertical','sellerKind','countryCode']);
   if (p_input ? 'vehicle' and l.vertical<>'vehiculos') or (p_input ? 'property' and l.vertical<>'inmuebles') then raise exception 'Wrong vertical details' using errcode='22023';end if;
   if lm<>'{}' then
    price_changed:=lm ?| array['price_minor','currency'];old_place:=l.place_id;
    begin l:=jsonb_populate_record(l,lm);exception when others then raise exception 'Invalid listing fields' using errcode='22023';end;
    if l.title is null or l.price_minor is null or l.currency is null then raise exception 'Required field cleared' using errcode='22023';end if;
    l:=public.dir_listing_prepare(l,price_changed);touched:=true;
    if l.place_id is not null and l.place_id is distinct from old_place and public.dir_place_manager_role(p_actor,l.place_id) is null then
     raise exception 'You do not manage this place' using errcode='42501',hint='dir_listing_place_not_managed';end if;
    -- Unlinking the place drops the agent (an agent belongs to the place's team).
    if l.place_id is null then l.agent_profile_id:=null;end if;
   end if;
   if p_input ? 'vehicle' then
    vm:=public.dir_listing_remap(p_input->'vehicle',vmap);
    if vm<>'{}' then
     select * into v from public.dir_listing_vehicle where listing_id=lid;
     begin v:=jsonb_populate_record(v,vm);exception when others then raise exception 'Invalid vehicle fields' using errcode='22023';end;
     v.accepts_trade_in:=coalesce(v.accepts_trade_in,false);v.seller_financing:=coalesce(v.seller_financing,false);
     v:=public.dir_listing_vehicle_prepare(v);
     update public.dir_listing_vehicle t set make_id=v.make_id,model_id=v.model_id,vehicle_type=v.vehicle_type,version=v.version,year=v.year,condition=v.condition,
      mileage_km=v.mileage_km,transmission=v.transmission,fuel=v.fuel,drivetrain=v.drivetrain,engine_cc=v.engine_cc,doors=v.doors,seats=v.seats,color=v.color,
      accepts_trade_in=v.accepts_trade_in,seller_financing=v.seller_financing,marchamo_current_declared=v.marchamo_current_declared,
      rtv_current_declared=v.rtv_current_declared,taxes_paid_declared=v.taxes_paid_declared,plate_private=v.plate_private,vin_private=v.vin_private where t.listing_id=lid;
     touched:=true;
    end if;
   end if;
   if p_input ? 'property' then
    pm:=public.dir_listing_remap(p_input->'property',pmap);
    if pm<>'{}' then
     select * into pr from public.dir_listing_property where listing_id=lid;
     if pm ? 'operation' and pm->>'operation' is distinct from pr.operation then raise exception 'The operation cannot change' using errcode='22023';end if;
     begin pr:=jsonb_populate_record(pr,pm);exception when others then raise exception 'Invalid property fields' using errcode='22023';end;
     pr:=public.dir_listing_property_prepare(pr);
     update public.dir_listing_property t set property_type=pr.property_type,bedrooms=pr.bedrooms,bathrooms=pr.bathrooms,parking_spaces=pr.parking_spaces,
      built_m2=pr.built_m2,lot_m2=pr.lot_m2,floors=pr.floors,year_built=pr.year_built,furnished=pr.furnished,pets_allowed=pr.pets_allowed,
      in_condominium=pr.in_condominium,hoa_fee_minor=pr.hoa_fee_minor,min_lease_months=pr.min_lease_months,amenities=pr.amenities,
      cadastral_plan_private=pr.cadastral_plan_private,folio_real_private=pr.folio_real_private where t.listing_id=lid;
     touched:=true;
    end if;
   end if;
   if not touched then raise exception 'Nothing to change' using errcode='22023';end if;
   -- A public listing must stay complete.
   if l.status in('published','reserved') then l:=public.dir_listing_publish_ready(l);end if;
   update public.dir_listings set place_id=l.place_id,title=l.title,description=l.description,price_minor=l.price_minor,currency=l.currency,
    price_crc_norm=l.price_crc_norm,fx_rate_date=l.fx_rate_date,fx_usd_crc=l.fx_usd_crc,admin_area_1=l.admin_area_1,admin_area_2=l.admin_area_2,
    admin_area_3=l.admin_area_3,locality=l.locality,lat=l.lat,lng=l.lng,agent_profile_id=l.agent_profile_id,revision=revision+1,updated_at=clock_timestamp() where id=lid returning * into l;
   if price_changed and l.status in('published','reserved') then perform public.dir_listing_price_check(lid,p_actor,aid);end if;
  elsif act='status' then
   to_status:=p_input->>'status';
   if not public.dir_listing_transition_ok(l.status,to_status,l.vertical,(select operation from public.dir_listing_property where listing_id=lid),'owner') then
    raise exception 'Invalid status transition' using errcode='22023',hint='dir_listing_transition';end if;
   perform public.dir_listing_check_limits(l,l.status,to_status);
   if to_status='published' then l:=public.dir_listing_publish_ready(l);end if;
   update public.dir_listings set status=to_status,status_changed_at=clock_timestamp(),
    price_crc_norm=l.price_crc_norm,fx_rate_date=l.fx_rate_date,fx_usd_crc=l.fx_usd_crc,
    published_at=case when to_status='published' then coalesce(published_at,clock_timestamp()) else published_at end,
    expires_at=case when to_status='published' and old_status not in('published','reserved') then clock_timestamp()+interval '60 days' else expires_at end,
    revision=revision+1,updated_at=clock_timestamp() where id=lid returning * into l;
   if to_status='published' then perform public.dir_listing_price_check(lid,p_actor,aid);end if;
  else -- renew: +60 days from now; published_at never changes (no bumping).
   if l.status not in('published','reserved','expired') then raise exception 'Only public or expired listings can be renewed' using errcode='22023',hint='dir_listing_transition';end if;
   if l.status='expired' then perform public.dir_listing_check_limits(l,'expired','published');end if;
   l:=public.dir_listing_publish_ready(l);
   update public.dir_listings set status=case when status='expired' then 'published' else status end,
    status_changed_at=case when status='expired' then clock_timestamp() else status_changed_at end,
    price_crc_norm=l.price_crc_norm,fx_rate_date=l.fx_rate_date,fx_usd_crc=l.fx_usd_crc,
    expires_at=clock_timestamp()+interval '60 days',revision=revision+1,updated_at=clock_timestamp() where id=lid returning * into l;
   perform public.dir_listing_price_check(lid,p_actor,aid);
  end if;
 end if;
 select * into l from public.dir_listings where id=lid;
 insert into public.dir_listing_history(listing_id,action_id,actor_id,action,revision,before,after) values(lid,aid,p_actor,act,l.revision,before,public.dir_listing_snapshot(lid));
 result:=public.dir_listing_result(act,lid);
 insert into public.dir_listing_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- staff actions
-- Input: {action:suspend|reinstate|moderation|seller, actionId, listingId?, revision?, status? (reinstate: draft|archived),
--         moderationStatus? (clear|review|approved|rejected), profileId?, businessVerified?, note?}. Route checks staff first.
create or replace function public.dir_listing_moderate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;lid uuid;pid uuid;rev integer;receipt public.dir_listing_actions;l public.dir_listings;before jsonb;result jsonb;
 to_status text;ms text;note text:=nullif(btrim(coalesce(p_input->>'note','')),'');
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or act is null or act not in('suspend','reinstate','moderation','seller') or length(coalesce(note,''))>500 then
  raise exception 'Invalid moderation action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'listingId')::uuid;pid:=(p_input->>'profileId')::uuid;rev:=(p_input->>'revision')::integer;
 exception when others then raise exception 'Invalid moderation action' using errcode='22023';end;
 if aid is null then raise exception 'Invalid moderation action' using errcode='22023';end if;
 if act='seller' then
  if pid is null or jsonb_typeof(p_input->'businessVerified')<>'boolean' then raise exception 'Invalid moderation action' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('dir-seller:'||pid::text,0));
 else
  if lid is null or rev is null or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid moderation action' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('dir-listing:'||lid::text,0));
 end if;
 select * into receipt from public.dir_listing_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 if act='seller' then
  insert into public.dir_listing_sellers(profile_id,business_verified,verified_by,verified_at,note,updated_at)
  values(pid,(p_input->>'businessVerified')::boolean,case when (p_input->>'businessVerified')::boolean then p_actor end,case when (p_input->>'businessVerified')::boolean then clock_timestamp() end,note,clock_timestamp())
  on conflict(profile_id) do update set business_verified=excluded.business_verified,verified_by=excluded.verified_by,verified_at=excluded.verified_at,note=excluded.note,updated_at=excluded.updated_at;
  result:=jsonb_build_object('action','seller','profileId',pid,'businessVerified',(p_input->>'businessVerified')::boolean);
 else
  select * into l from public.dir_listings where id=lid for update;
  if not found then raise exception 'Listing not found' using errcode='P0002';end if;
  if l.revision<>rev then raise exception 'Listing changed' using errcode='40001';end if;
  before:=public.dir_listing_snapshot(lid);
  if act in('suspend','reinstate') then
   to_status:=case when act='suspend' then 'suspended' else coalesce(p_input->>'status','draft') end;
   if not public.dir_listing_transition_ok(l.status,to_status,l.vertical,null,'staff') then
    raise exception 'Invalid status transition' using errcode='22023',hint='dir_listing_transition';end if;
   update public.dir_listings set status=to_status,status_changed_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=lid;
  else
   ms:=p_input->>'moderationStatus';
   if ms is null or ms not in('clear','review','approved','rejected') or ms=l.moderation_status then raise exception 'Invalid moderation status' using errcode='22023';end if;
   update public.dir_listings set moderation_status=ms,revision=revision+1,updated_at=clock_timestamp() where id=lid;
  end if;
  insert into public.dir_listing_history(listing_id,action_id,actor_id,action,revision,before,after)
   values(lid,aid,p_actor,act,(select revision from public.dir_listings where id=lid),before,public.dir_listing_snapshot(lid)||jsonb_build_object('note',note));
  result:=public.dir_listing_result(act,lid);
 end if;
 insert into public.dir_listing_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Marks due listings as expired (no cron needed: readers already hide them by expires_at). Returns how many.
create or replace function public.dir_listing_expire_due(p_actor uuid,p_limit integer default 500) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r record;n integer:=0;before jsonb;
begin
 if p_actor is null or p_limit is null or p_limit not between 1 and 5000 then raise exception 'Invalid expiry run' using errcode='22023';end if;
 for r in select id,revision from public.dir_listings where status in('published','reserved') and expires_at<=clock_timestamp() order by expires_at limit p_limit for update skip locked loop
  before:=public.dir_listing_snapshot(r.id);
  update public.dir_listings set status='expired',status_changed_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=r.id;
  insert into public.dir_listing_history(listing_id,action_id,actor_id,action,revision,before,after)
   values(r.id,public.dir_derived_uuid(r.id,'expire:'||r.revision),p_actor,'expire',r.revision+1,before,public.dir_listing_snapshot(r.id));
  n:=n+1;
 end loop;
 return n;
end $$;

-- ---------------------------------------------------------------- exchange rates (staff / BCCR import)
-- Input: {date:'YYYY-MM-DD', usdCrc:number, source:'bccr'|'manual'}. Upsert; listings keep the rate they were priced with
-- until dir_listing_fx_refresh or a price edit / publish / renew.
create or replace function public.dir_fx_rate_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d date;r numeric;s text:=p_input->>'source';
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'usdCrc')<>'number' or s is null or s not in('bccr','manual') then raise exception 'Invalid exchange rate' using errcode='22023';end if;
 begin d:=(p_input->>'date')::date;r:=(p_input->>'usdCrc')::numeric;exception when others then raise exception 'Invalid exchange rate' using errcode='22023';end;
 if d is null or d>current_date+1 or r<=0 or r>=100000 then raise exception 'Invalid exchange rate' using errcode='22023';end if;
 insert into public.dir_fx_rates(rate_date,usd_crc,source,recorded_by) values(d,r,s,p_actor)
 on conflict(rate_date) do update set usd_crc=excluded.usd_crc,source=excluded.source,recorded_by=excluded.recorded_by,recorded_at=clock_timestamp();
 return jsonb_build_object('date',d,'usdCrc',r,'source',s);
end $$;
-- Re-normalise USD prices of live listings with the latest rate (derived field: no revision bump, no history).
create or replace function public.dir_listing_fx_refresh(p_actor uuid) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare fx record;n integer;
begin
 if p_actor is null then raise exception 'Invalid refresh' using errcode='22023';end if;
 select * into fx from public.dir_fx_usd_crc(current_date);
 if fx.usd_crc is null then return 0;end if;
 update public.dir_listings set price_crc_norm=round(price_minor*fx.usd_crc)::bigint,fx_rate_date=fx.rate_date,fx_usd_crc=fx.usd_crc
  where currency='USD' and status in('draft','published','reserved') and fx_rate_date is distinct from fx.rate_date;
 get diagnostics n=row_count;return n;
end $$;

-- ---------------------------------------------------------------- V3 photos (seller only)
-- Input: {action:add|remove|reorder, actionId, listingId, media?, mediaId?, order?}.
--  add:     media {id, sha256, width, height, path1600, path800, path320, exifStripped:true, altEs?, altEn?} → appended last.
--  remove:  mediaId. A public listing never drops below min_photos_publish (dir_listing_photos_missing).
--  reorder: order = every active media id exactly once, in the new order.
-- Photos do NOT bump the listing revision (parallel uploads must not conflict); they are serialised by the listing
-- lock and idempotent by actionId. Adding a photo whose sha256 already belongs to ANOTHER seller's listing flags
-- this listing (duplicate_photo → moderation 'review', revision bump + history 'flag').
create or replace function public.dir_listing_media_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;lid uuid;mid uuid;receipt public.dir_listing_actions;l public.dir_listings;m jsonb:=p_input->'media';
 n integer;cur public.dir_listing_media;other text;ids uuid[];result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or act is null or act not in('add','remove','reorder')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('action','actionId','listingId','media','mediaId','order'))
  or (act='add')<>(p_input ? 'media') or (act='remove')<>(p_input ? 'mediaId') or (act='reorder')<>(p_input ? 'order') then
  raise exception 'Invalid photo action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'listingId')::uuid;
 exception when others then raise exception 'Invalid photo action' using errcode='22023';end;
 if aid is null or lid is null then raise exception 'Invalid photo action' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-listing:'||lid::text,0));
 select * into receipt from public.dir_listing_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into l from public.dir_listings where id=lid for update;
 if not found or l.seller_profile_id<>p_actor then raise exception 'Listing not found' using errcode='P0002';end if;
 if l.status in('sold','rented','suspended') then raise exception 'Listing cannot be edited in this status' using errcode='22023',hint='dir_listing_locked';end if;
 n:=public.dir_listing_photo_count(lid);
 if act='add' then
  if jsonb_typeof(m)<>'object' or exists(select 1 from jsonb_object_keys(m) k where k not in('id','sha256','width','height','path1600','path800','path320','exifStripped','altEs','altEn'))
   or jsonb_typeof(m->'width')<>'number' or jsonb_typeof(m->'height')<>'number' or jsonb_typeof(m->'exifStripped')<>'boolean' then
   raise exception 'Invalid photo' using errcode='22023';end if;
  if not (m->>'exifStripped')::boolean then raise exception 'Photo metadata must be removed' using errcode='22023',hint='dir_listing_media_exif';end if;
  mid:=public.dir_try_uuid(m->>'id');
  if mid is null or coalesce(m->>'sha256','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid photo' using errcode='22023';end if;
  if exists(select 1 from public.dir_listing_media where id=mid) then raise exception 'Photo id already used' using errcode='23505';end if;
  if n>=30 then raise exception 'Photo limit reached' using errcode='54000',hint='dir_listing_media_cap';end if;
  if exists(select 1 from public.dir_listing_media where listing_id=lid and sha256=m->>'sha256' and status='active') then
   raise exception 'This photo is already in the listing' using errcode='23505',hint='dir_listing_media_duplicate';end if;
  begin
   insert into public.dir_listing_media(id,listing_id,sort,sha256,width,height,path_1600,path_800,path_320,exif_stripped,alt_es,alt_en,uploaded_by)
   values(mid,lid,n,m->>'sha256',(m->>'width')::integer,(m->>'height')::integer,m->>'path1600',m->>'path800',m->>'path320',true,
    nullif(btrim(coalesce(m->>'altEs','')),''),nullif(btrim(coalesce(m->>'altEn','')),''),p_actor);
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid photo' using errcode='22023';end;
  -- Same image already used by another seller (any status: copying a removed photo is still suspicious).
  select o.public_code into other from public.dir_listing_media x join public.dir_listings o on o.id=x.listing_id
   where x.sha256=m->>'sha256' and o.seller_profile_id<>p_actor order by x.created_at limit 1;
  if other is not null then perform public.dir_listing_flag(lid,'duplicate_photo',m->>'sha256',jsonb_build_object('otherCode',other),p_actor,aid,true);end if;
 elsif act='remove' then
  mid:=public.dir_try_uuid(p_input->>'mediaId');
  select * into cur from public.dir_listing_media where id=mid and listing_id=lid and status='active' for update;
  if not found then raise exception 'Photo not found' using errcode='P0002';end if;
  if l.status in('published','reserved') and n-1<public.dir_listing_limit('min_photos_publish') then
   raise exception 'A public listing needs its minimum photos' using errcode='22023',hint='dir_listing_photos_missing';end if;
  update public.dir_listing_media set status='removed',sort=null,removed_by=p_actor,removed_at=clock_timestamp() where id=mid;
  update public.dir_listing_media set sort=sort-1 where listing_id=lid and status='active' and sort>cur.sort;
 else
  if jsonb_typeof(p_input->'order')<>'array' then raise exception 'Invalid photo order' using errcode='22023';end if;
  begin select array_agg(e::uuid order by o) into ids from jsonb_array_elements_text(p_input->'order') with ordinality t(e,o);
  exception when others then raise exception 'Invalid photo order' using errcode='22023';end;
  if coalesce(cardinality(ids),0)<>n or (select count(distinct x) from unnest(ids) x)<>n
   or exists(select 1 from unnest(ids) x where not exists(select 1 from public.dir_listing_media where id=x and listing_id=lid and status='active')) then
   raise exception 'Invalid photo order' using errcode='22023';end if;
  update public.dir_listing_media d set sort=t.o-1 from unnest(ids) with ordinality t(x,o) where d.id=t.x;
 end if;
 select jsonb_build_object('action',act,'listingId',lid,'photoCount',public.dir_listing_photo_count(lid),'moderationStatus',(select moderation_status from public.dir_listings where id=lid),
  'revision',(select revision from public.dir_listings where id=lid),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'sort',x.sort) order by x.sort) from public.dir_listing_media x where x.listing_id=lid and x.status='active'),'[]')) into result;
 insert into public.dir_listing_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- R2 agent assignment
-- Input: {action:'assign_agent', actionId, listingId, revision, agentId|null}. Only an active owner/manager of the
-- listing's place (others: P0002). The agent must hold role admin/manager/member in the Pro team of the place OWNER
-- (pro_role_of; the owner is admin of their own team). CAS revision, receipt, history 'assign_agent'.
create or replace function public.dir_listing_assign_agent(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;lid uuid;rev integer;agent uuid;receipt public.dir_listing_actions;l public.dir_listings;owner_id uuid;r text;before jsonb;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or p_input->>'action' is distinct from 'assign_agent' or jsonb_typeof(p_input->'revision')<>'number'
  or not (p_input ? 'agentId') or jsonb_typeof(p_input->'agentId') not in('string','null')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('action','actionId','listingId','revision','agentId')) then
  raise exception 'Invalid agent assignment' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');lid:=public.dir_try_uuid(p_input->>'listingId');agent:=public.dir_try_uuid(p_input->>'agentId');
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid agent assignment' using errcode='22023';end;
 if aid is null or lid is null or rev<1 or (jsonb_typeof(p_input->'agentId')='string' and agent is null) then raise exception 'Invalid agent assignment' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-listing:'||lid::text,0));
 select * into receipt from public.dir_listing_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into l from public.dir_listings where id=lid for update;
 if not found or l.place_id is null or public.dir_place_manager_role(p_actor,l.place_id) is null then raise exception 'Listing not found' using errcode='P0002';end if;
 if l.vertical<>'inmuebles' then raise exception 'Agents apply to property listings only' using errcode='22023',hint='dir_listing_agent_vertical';end if;
 if l.revision<>rev then raise exception 'Listing changed' using errcode='40001';end if;
 if l.status='suspended' then raise exception 'Listing cannot be edited in this status' using errcode='22023',hint='dir_listing_locked';end if;
 if agent is not distinct from l.agent_profile_id then raise exception 'Nothing to change' using errcode='22023';end if;
 if agent is not null then
  if to_regprocedure('public.pro_role_of(uuid,uuid)') is null then
   raise exception 'Team module unavailable' using errcode='55000',hint='dir_listing_team_unavailable';end if;
  select user_id into owner_id from public.dir_place_managers where place_id=l.place_id and role='owner' and status='active';
  if owner_id is not null then execute 'select public.pro_role_of($1,$2)' into r using agent,owner_id;end if;
  if r is null or r not in('admin','manager','member') then
   raise exception 'The agent is not an active member of the team' using errcode='22023',hint='dir_listing_agent_not_member';end if;
 end if;
 before:=public.dir_listing_snapshot(lid);
 update public.dir_listings set agent_profile_id=agent,revision=revision+1,updated_at=clock_timestamp() where id=lid;
 insert into public.dir_listing_history(listing_id,action_id,actor_id,action,revision,before,after)
  values(lid,aid,p_actor,'assign_agent',rev+1,before,public.dir_listing_snapshot(lid));
 result:=public.dir_listing_result('assign_agent',lid)||jsonb_build_object('agentId',agent);
 insert into public.dir_listing_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- declared financing (per dealer place)
-- Input: {actionId, placeId, revision (0 = first declaration), financing:{annualRatePct, maxTermMonths, minDownPaymentPct}|null}.
-- null withdraws it. Owner/manager of a vehicle_dealer place only (others: P0002). Every save refreshes declared_at.
create or replace function public.dir_listing_financing_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;pid uuid;rev integer;f jsonb:=p_input->'financing';receipt public.dir_listing_actions;cur public.dir_listing_financing;pl public.dir_places;
 rate numeric;term integer;down numeric;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'revision')<>'number' or not (p_input ? 'financing') or jsonb_typeof(f) not in('object','null')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','placeId','revision','financing')) then
  raise exception 'Invalid financing' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');pid:=public.dir_try_uuid(p_input->>'placeId');
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid financing' using errcode='22023';end;
 if aid is null or pid is null or rev<0 then raise exception 'Invalid financing' using errcode='22023';end if;
 if jsonb_typeof(f)='object' then
  if exists(select 1 from jsonb_object_keys(f) k where k not in('annualRatePct','maxTermMonths','minDownPaymentPct'))
   or jsonb_typeof(f->'annualRatePct')<>'number' or jsonb_typeof(f->'maxTermMonths')<>'number' or jsonb_typeof(f->'minDownPaymentPct')<>'number' then
   raise exception 'Invalid financing' using errcode='22023';end if;
  rate:=(f->>'annualRatePct')::numeric;term:=null;down:=(f->>'minDownPaymentPct')::numeric;
  if (f->>'maxTermMonths')::numeric=trunc((f->>'maxTermMonths')::numeric) then term:=(f->>'maxTermMonths')::numeric::integer;end if;
  if rate<0 or rate>60 or rate<>round(rate,2) or term is null or term not between 1 and 120 or down<0 or down>90 or down<>round(down,2) then
   raise exception 'Financing values out of range' using errcode='22023',hint='dir_listing_financing_range';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-financing:'||pid::text,0));
 select * into receipt from public.dir_listing_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into pl from public.dir_places where id=pid;
 if not found or pl.status='removed' or pl.vertical_id<>'vehicle_dealer' or public.dir_place_manager_role(p_actor,pid) is null then
  raise exception 'Place not found' using errcode='P0002';end if;
 select * into cur from public.dir_listing_financing where place_id=pid for update;
 if coalesce(cur.revision,0)<>rev then raise exception 'Financing changed' using errcode='40001';end if;
 if f is null or jsonb_typeof(f)='null' then
  if not found or cur.status='withdrawn' then raise exception 'Nothing to withdraw' using errcode='22023';end if;
  update public.dir_listing_financing set status='withdrawn',revision=revision+1,updated_at=clock_timestamp() where place_id=pid returning * into cur;
 elsif not found then
  insert into public.dir_listing_financing(place_id,annual_rate_pct,max_term_months,min_down_payment_pct,declared_by) values(pid,rate,term,down,p_actor) returning * into cur;
 else
  update public.dir_listing_financing set annual_rate_pct=rate,max_term_months=term,min_down_payment_pct=down,status='active',declared_by=p_actor,
   declared_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where place_id=pid returning * into cur;
 end if;
 result:=jsonb_build_object('placeId',pid,'revision',cur.revision,'status',cur.status,'annualRatePct',cur.annual_rate_pct,'maxTermMonths',cur.max_term_months,
  'minDownPaymentPct',cur.min_down_payment_pct,'declaredAt',cur.declared_at,'declaredBySeller',true);
 insert into public.dir_listing_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- public reports (reuse dir_reports)
-- Input: {reportId, kind: wrong_info|duplicate|abuse|other, message, email?}. Only listings that are currently public.
-- Caps: 20 per listing a day, 5 a day per contact e-mail (shared with place reports) → 54000 dir_listing_report_cap.
-- reports_to_review distinct identified reporters (account or e-mail) of open 'abuse' reports in 7 days flag the
-- listing ('reports' → review). Same reportId + same input → same answer.
create or replace function public.dir_listing_report_create(p_actor uuid,p_code text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rid uuid;l public.dir_listings;prior public.dir_reports;h text;mail text;answer jsonb:=jsonb_build_object('ok',true);n integer;t integer;
begin
 if jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('reportId','kind','message','email')) then
  raise exception 'Invalid report' using errcode='22023';end if;
 rid:=public.dir_try_uuid(p_input->>'reportId');
 mail:=nullif(lower(btrim(coalesce(p_input->>'email',''))),'');
 if rid is null or coalesce(p_input->>'kind','') not in('wrong_info','duplicate','abuse','other')
  or length(btrim(coalesce(p_input->>'message',''))) not between 5 and 2000 or (mail is not null and (mail!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(mail)>254)) then
  raise exception 'Invalid report' using errcode='22023';end if;
 if p_code is null or p_code!~'^[2-9a-hjkmnp-z]{6}$' or public.dir_listing_public(p_code) is null then raise exception 'Listing unavailable' using errcode='P0002';end if;
 select * into l from public.dir_listings where public_code=p_code;
 h:=encode(sha256(convert_to(jsonb_build_object('code',p_code,'actor',p_actor,'kind',p_input->>'kind','message',btrim(p_input->>'message'),'email',mail)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('dir-listing:'||l.id::text,0));
 select * into prior from public.dir_reports where id=rid;
 if found then if prior.input_hash<>h then raise exception 'Report id reused' using errcode='22023';end if;return answer;end if;
 if (select count(*) from public.dir_reports r where r.listing_id=l.id and r.created_at>clock_timestamp()-interval '1 day')>=20
  or (mail is not null and (select count(*) from public.dir_reports r where r.contact_email=mail and r.created_at>clock_timestamp()-interval '1 day')>=5) then
  raise exception 'Too many reports' using errcode='54000',hint='dir_listing_report_cap';end if;
 insert into public.dir_reports(id,place_id,listing_id,kind,message,contact_email,reporter_id,input_hash) values(rid,null,l.id,p_input->>'kind',btrim(p_input->>'message'),mail,p_actor,h);
 if p_input->>'kind'='abuse' then
  t:=public.dir_listing_limit('reports_to_review');
  select count(distinct coalesce(r.reporter_id::text,r.contact_email)) into n from public.dir_reports r
   where r.listing_id=l.id and r.kind='abuse' and r.status='open' and r.created_at>clock_timestamp()-interval '7 days' and coalesce(r.reporter_id::text,r.contact_email) is not null;
  if n>=t then perform public.dir_listing_flag(l.id,'reports','abuse:'||(n/t)::text,jsonb_build_object('reporters',n),p_actor,rid,true);end if;
 end if;
 return answer;
end $$;

-- Staff queue: listings under review with their flags and open reports (oldest first). The route checks staff + MFA.
create or replace function public.dir_listing_review_queue(p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.updated_at,x.id),'[]') from (
  select l.id,l.updated_at,jsonb_build_object('listingId',l.id,'code',l.public_code,'vertical',l.vertical,'status',l.status,'revision',l.revision,
   'title',l.title,'priceMinor',l.price_minor,'currency',l.currency,'priceCrcNorm',l.price_crc_norm,
   'flags',coalesce((select jsonb_agg(jsonb_build_object('kind',f.kind,'key',f.key,'detail',f.detail,'at',f.created_at) order by f.id) from public.dir_listing_flags f where f.listing_id=l.id),'[]'),
   'openReports',(select count(*) from public.dir_reports r where r.listing_id=l.id and r.status='open')) j
  from public.dir_listings l where l.moderation_status='review'
  order by l.updated_at,l.id limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- ---------------------------------------------------------------- Pro inventory reader
-- One inventory item. Private fields (plate, VIN, plano, folio, exact lat/lng) only when p_actor is the seller.
create or replace function public.dir_listing_owner_item(p_id uuid,p_actor uuid,p_status text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',l.id,'code',l.public_code,'revision',l.revision,'status',p_status,'moderationStatus',l.moderation_status,
  'title',l.title,'description',l.description,'priceMinor',l.price_minor,'currency',l.currency,'priceCrcNorm',l.price_crc_norm,'fxRateDate',l.fx_rate_date,
  'adminArea1',l.admin_area_1,'adminArea2',l.admin_area_2,'adminArea3',l.admin_area_3,'locality',l.locality,
  'lat',case when mine then l.lat end,'lng',case when mine then l.lng end,
  'placeId',l.place_id,'agentId',l.agent_profile_id,'sellerKind',l.seller_kind,'mine',mine,'canEdit',mine,
  'photoCount',public.dir_listing_photo_count(l.id),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sort',m.sort,'path1600',m.path_1600,'path800',m.path_800,'path320',m.path_320,
    'width',m.width,'height',m.height,'altEs',m.alt_es,'altEn',m.alt_en) order by m.sort) from public.dir_listing_media m where m.listing_id=l.id and m.status='active'),'[]'),
  'publishedAt',l.published_at,'expiresAt',l.expires_at,'updatedAt',l.updated_at,
  'vehicle',(select jsonb_build_object('makeId',v.make_id,'modelId',v.model_id,'vehicleType',v.vehicle_type,'version',v.version,'year',v.year,'condition',v.condition,
    'mileageKm',v.mileage_km,'transmission',v.transmission,'fuel',v.fuel,'drivetrain',v.drivetrain,'engineCc',v.engine_cc,'doors',v.doors,'seats',v.seats,
    'color',v.color,'acceptsTradeIn',v.accepts_trade_in,'sellerFinancing',v.seller_financing,'marchamoCurrentDeclared',v.marchamo_current_declared,
    'rtvCurrentDeclared',v.rtv_current_declared,'taxesPaidDeclared',v.taxes_paid_declared,
    'platePrivate',case when mine then v.plate_private end,'vinPrivate',case when mine then v.vin_private end)
   from public.dir_listing_vehicle v where v.listing_id=l.id),
  'property',(select jsonb_build_object('operation',p.operation,'propertyType',p.property_type,'bedrooms',p.bedrooms,'bathrooms',p.bathrooms,
    'parkingSpaces',p.parking_spaces,'builtM2',p.built_m2,'lotM2',p.lot_m2,'floors',p.floors,'yearBuilt',p.year_built,'furnished',p.furnished,
    'petsAllowed',p.pets_allowed,'inCondominium',p.in_condominium,'hoaFeeMinor',p.hoa_fee_minor,'minLeaseMonths',p.min_lease_months,'amenities',to_jsonb(p.amenities),
    'cadastralPlanPrivate',case when mine then p.cadastral_plan_private end,'folioRealPrivate',case when mine then p.folio_real_private end)
   from public.dir_listing_property p where p.listing_id=l.id))
 from public.dir_listings l cross join lateral (select l.seller_profile_id=p_actor as mine) o where l.id=p_id $$;

-- Inventory page (shape of inventoryPageSchema). Items: the actor's own listings of the vertical plus listings
-- linked to places the actor manages (read-only for co-managers: canEdit=false, no private fields).
-- p_filter: active (draft/published/reserved) | closed (sold/rented/archived/suspended/expired). Published or
-- reserved rows past expires_at are reported as 'expired' (closed). Keyset pagination on (updated_at desc, id desc);
-- nextCursor = '<updated_at epoch µs>_<id>' or null.
create or replace function public.dir_listing_owner_list(p_actor uuid,p_vertical text,p_filter text default 'active',p_cursor text default null,p_limit integer default 50) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ptype text;lim integer:=coalesce(p_limit,50);cur_ts timestamptz;cur_id uuid;r record;n integer:=0;items jsonb:='[]';nxt text;last_ts timestamptz;last_id uuid;
 places jsonb;agents jsonb:='[]';fin jsonb;catalog jsonb;kind text;
begin
 if p_actor is null or p_vertical is null or p_vertical not in('vehiculos','inmuebles') or coalesce(p_filter,'') not in('active','closed') or lim not between 1 and 100 then
  raise exception 'Invalid inventory query' using errcode='22023';end if;
 if p_cursor is not null then
  if p_cursor!~'^[0-9]{1,20}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid cursor' using errcode='22023',hint='dir_listing_cursor';end if;
  cur_ts:='epoch'::timestamptz+(split_part(p_cursor,'_',1)||' microseconds')::interval;cur_id:=split_part(p_cursor,'_',2)::uuid;
 end if;
 ptype:=case p_vertical when 'vehiculos' then 'vehicle_dealer' else 'real_estate' end;
 places:=coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,'role',m.role,'placeStatus',p.status) order by p.name,p.id)
  from public.dir_place_managers m join public.dir_places p on p.id=m.place_id
  where m.user_id=p_actor and m.status='active' and p.vertical_id=ptype and p.status<>'removed'),'[]');
 if p_vertical='inmuebles' and to_regclass('public.pro_company_members') is not null and to_regclass('public.profiles') is not null then
  execute $q$select coalesce(jsonb_agg(jsonb_build_object('id',x.member_user_id,'name',x.name,'placeIds',x.place_ids) order by x.name,x.member_user_id),'[]') from (
    select c.member_user_id,min(coalesce(nullif(btrim(c.member_name),''),c.member_email)) as name,jsonb_agg(distinct o.place_id) as place_ids
    from public.dir_place_managers me
    join public.dir_places p on p.id=me.place_id and p.vertical_id='real_estate' and p.status<>'removed'
    join public.dir_place_managers o on o.place_id=me.place_id and o.role='owner' and o.status='active'
    join public.pro_company_members c on c.owner_id=o.user_id and c.active and c.role in('admin','manager','member')
    join public.profiles pf on pf.id=c.member_user_id and not coalesce(pf.is_disabled,false)
    where me.user_id=$1 and me.status='active' group by c.member_user_id) x$q$ into agents using p_actor;
 end if;
 if p_vertical='vehiculos' then
  catalog:=jsonb_build_object(
   'makes',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'name',k.name,'slug',k.slug) order by k.name,k.id) from public.ref_vehicle_makes k where k.active),'[]'),
   'models',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'makeId',o.make_id,'name',o.name,'slug',o.slug,'vehicleType',o.vehicle_type) order by o.name,o.id)
     from public.ref_vehicle_models o join public.ref_vehicle_makes k on k.id=o.make_id and k.active where o.active),'[]'));
  fin:=coalesce((select jsonb_agg(jsonb_build_object('placeId',f.place_id,'revision',f.revision,'status',f.status,'annualRatePct',f.annual_rate_pct,
    'maxTermMonths',f.max_term_months,'minDownPaymentPct',f.min_down_payment_pct,'declaredAt',f.declared_at,
    'stale',f.declared_at<=clock_timestamp()-make_interval(days=>public.dir_listing_limit('financing_max_age_days'))) order by f.place_id)
   from public.dir_listing_financing f where f.place_id in(select (e->>'id')::uuid from jsonb_array_elements(places) e)),'[]');
 end if;
 for r in
  select x.id,x.updated_at,x.eff from (
   select l.id,l.updated_at,case when l.status in('published','reserved') and l.expires_at<=now() then 'expired' else l.status end as eff
   from public.dir_listings l
   where l.vertical=p_vertical and (l.seller_profile_id=p_actor
    or l.place_id in(select m.place_id from public.dir_place_managers m where m.user_id=p_actor and m.status='active'))) x
  where (case when p_filter='active' then x.eff in('draft','published','reserved') else x.eff in('sold','rented','archived','suspended','expired') end)
   and (cur_ts is null or (x.updated_at,x.id)<(cur_ts,cur_id))
  order by x.updated_at desc,x.id desc limit lim+1
 loop
  n:=n+1;
  if n>lim then nxt:=((extract(epoch from last_ts)*1000000)::bigint)::text||'_'||last_id::text;exit;end if;
  items:=items||jsonb_build_array(public.dir_listing_owner_item(r.id,p_actor,r.eff));last_ts:=r.updated_at;last_id:=r.id;
 end loop;
 kind:=case when jsonb_array_length(places)>0 or exists(select 1 from public.dir_listings where seller_profile_id=p_actor and seller_kind='business') then 'business' else 'private' end;
 return jsonb_build_object('vertical',p_vertical,'filter',p_filter,'sellerKind',kind,
  'businessVerified',coalesce((select business_verified from public.dir_listing_sellers where profile_id=p_actor),false),
  'limits',jsonb_build_object('privateActivePerVertical',public.dir_listing_limit('private_active_per_vertical'),
   'businessUnverifiedPublished',public.dir_listing_limit('business_unverified_published'),'minPhotosToPublish',public.dir_listing_limit('min_photos_publish'),'maxPhotos',30),
  'counts',jsonb_build_object(
   'active',(select count(*) from public.dir_listings where seller_profile_id=p_actor and vertical=p_vertical and status in('draft','published','reserved')),
   'published',(select count(*) from public.dir_listings where seller_profile_id=p_actor and vertical=p_vertical and status in('published','reserved') and expires_at>now())),
  'places',places,'agents',agents,'catalog',catalog,'financing',fin,'items',items,'nextCursor',nxt);
end $$;

-- ---------------------------------------------------------------- public readers
-- No internal ids, seller ids, revision, exact coordinates or *_private fields. Only published or reserved
-- (status column → «Reservado» badge, CTAs off, noindex), unexpired and moderation clear/approved; drafts, sold,
-- rented, archived, suspended, expired and listings under review stay hidden. No ORDER BY here: callers order by
-- neutral keys (published_at, price, distance). photo_count / cover paths come from dir_listing_media.
create or replace view public.public_vehicle_listings with (security_invoker=true) as
select l.public_code as code,l.seller_kind,
 case when p.status in('published','closed_permanently') then p.slug end as place_slug,
 case when p.status in('published','closed_permanently') then p.name end as place_name,
 (l.seller_kind='business' and coalesce(s.business_verified,false)) as seller_business_verified,
 l.title,l.description,l.price_minor,l.currency,l.price_crc_norm,l.fx_rate_date,
 l.country_code,l.admin_area_1,l.admin_area_2,l.admin_area_3,l.locality,f.lat as approx_lat,f.lng as approx_lng,
 case when f.lat is null then null else 500 end as location_radius_m,
 l.published_at,l.expires_at,l.updated_at,
 mk.slug as make_slug,mk.name as make_name,md.slug as model_slug,md.name as model_name,v.vehicle_type,v.version,v.year,v.condition,
 v.mileage_km,v.transmission,v.fuel,v.drivetrain,v.engine_cc,v.doors,v.seats,v.color,v.accepts_trade_in,v.seller_financing,
 v.marchamo_current_declared,v.rtv_current_declared,v.taxes_paid_declared,
 l.status,ph.n as photo_count,ph.c800 as cover_path_800,ph.c320 as cover_path_320
from public.dir_listings l
join public.dir_listing_vehicle v on v.listing_id=l.id
join public.ref_vehicle_makes mk on mk.id=v.make_id
join public.ref_vehicle_models md on md.id=v.model_id
left join public.dir_places p on p.id=l.place_id
left join public.dir_listing_sellers s on s.profile_id=l.seller_profile_id
cross join lateral public.dir_listing_fuzz(l.id,l.lat,l.lng) f
cross join lateral (select count(*)::integer n,(array_agg(m.path_800 order by m.sort))[1] c800,(array_agg(m.path_320 order by m.sort))[1] c320
 from public.dir_listing_media m where m.listing_id=l.id and m.status='active') ph
where l.vertical='vehiculos' and l.status in('published','reserved') and l.moderation_status in('clear','approved') and l.expires_at>now();

create or replace view public.public_property_listings with (security_invoker=true) as
select l.public_code as code,l.seller_kind,
 case when p.status in('published','closed_permanently') then p.slug end as place_slug,
 case when p.status in('published','closed_permanently') then p.name end as place_name,
 (l.seller_kind='business' and coalesce(s.business_verified,false)) as seller_business_verified,
 l.title,l.description,l.price_minor,l.currency,l.price_crc_norm,l.fx_rate_date,
 l.country_code,l.admin_area_1,l.admin_area_2,l.admin_area_3,l.locality,f.lat as approx_lat,f.lng as approx_lng,
 case when f.lat is null then null else 500 end as location_radius_m,
 l.published_at,l.expires_at,l.updated_at,
 pr.operation,pr.property_type,pr.bedrooms,pr.bathrooms,pr.parking_spaces,pr.built_m2,pr.lot_m2,pr.floors,pr.year_built,
 pr.furnished,pr.pets_allowed,pr.in_condominium,pr.hoa_fee_minor,pr.min_lease_months,pr.amenities,
 l.status,ph.n as photo_count,ph.c800 as cover_path_800,ph.c320 as cover_path_320
from public.dir_listings l
join public.dir_listing_property pr on pr.listing_id=l.id
left join public.dir_places p on p.id=l.place_id
left join public.dir_listing_sellers s on s.profile_id=l.seller_profile_id
cross join lateral public.dir_listing_fuzz(l.id,l.lat,l.lng) f
cross join lateral (select count(*)::integer n,(array_agg(m.path_800 order by m.sort))[1] c800,(array_agg(m.path_320 order by m.sort))[1] c320
 from public.dir_listing_media m where m.listing_id=l.id and m.status='active') ph
where l.vertical='inmuebles' and l.status in('published','reserved') and l.moderation_status in('clear','approved') and l.expires_at>now();

-- Public photos (ordered) and declared financing of a listing (helpers of dir_listing_public).
create or replace function public.dir_listing_public_photos(p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('path1600',m.path_1600,'path800',m.path_800,'path320',m.path_320,'width',m.width,'height',m.height,
  'altEs',m.alt_es,'altEn',m.alt_en) order by m.sort),'[]') from public.dir_listing_media m where m.listing_id=p_id and m.status='active' $$;
-- Only for vehicle listings that opted in (seller_financing), linked to a published dealer place with an active
-- declaration younger than financing_max_age_days. Always marked declaredBySeller (ContrataCR does not verify it).
create or replace function public.dir_listing_public_financing(p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('annualRatePct',f.annual_rate_pct,'maxTermMonths',f.max_term_months,'minDownPaymentPct',f.min_down_payment_pct,
  'declaredAt',f.declared_at,'declaredBySeller',true,'labelEs','Declarada por el vendedor; ContrataCR no la comprueba.','labelEn','Declared by the seller; not checked by ContrataCR.')
 from public.dir_listings l join public.dir_listing_vehicle v on v.listing_id=l.id and v.seller_financing
 join public.dir_places p on p.id=l.place_id and p.status='published'
 join public.dir_listing_financing f on f.place_id=l.place_id and f.status='active'
  and f.declared_at>clock_timestamp()-make_interval(days=>public.dir_listing_limit('financing_max_age_days'))
 where l.id=p_id and l.vertical='vehiculos' $$;

-- Detail by public code (either vertical); null when not public. Adds photos[] and financing (or null).
create or replace function public.dir_listing_public(p_code text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare base jsonb;lid uuid;
begin
 if p_code is null or p_code!~'^[2-9a-hjkmnp-z]{6}$' then return null;end if;
 base:=coalesce(
  (select to_jsonb(v)||jsonb_build_object('vertical','vehiculos') from public.public_vehicle_listings v where v.code=p_code),
  (select to_jsonb(v)||jsonb_build_object('vertical','inmuebles') from public.public_property_listings v where v.code=p_code));
 if base is null then return null;end if;
 select id into lid from public.dir_listings where public_code=p_code;
 return base||jsonb_build_object('photos',public.dir_listing_public_photos(lid),'financing',public.dir_listing_public_financing(lid));
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['dir_fx_rates','dir_listing_limits','dir_listing_sellers','dir_listings','dir_listing_vehicle','dir_listing_property','dir_listing_actions','dir_listing_history',
 'dir_listing_media','dir_listing_flags','dir_listing_financing'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n in('dir_listing_actions','dir_listing_history','dir_listing_flags') then execute format('grant select,insert on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;
foreach n in array array['public_vehicle_listings','public_property_listings'] loop
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 execute format('grant select on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'dir\_listing\_%' or p.proname like 'dir\_fx\_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
