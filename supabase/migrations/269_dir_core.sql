-- LOCAL PRO ONLY. Multivertical round F1 (2026-11-16): core of the public places directory (dir_*).
-- * dir_verticals: sections (restaurants, fuel stations, pharmacies, supermarkets, vehicle dealers, real estate).
--   Owner approval 2026-11-17: + cafe_bar (/cafes: cafés, bakeries, bars — split out of restaurants), convenience
--   (/pulperias), hardware (/ferreterias), lodging (/hospedaje), health (/salud), vet_pets (/veterinarias), auto_services
--   (/talleres), beauty (/belleza), fitness (/gimnasios), tours (/tours), banking (/bancos). Each carries `kind` (its
--   subtype, src/lib/directory/place-verticals.ts). health/vet_pets: requires_license=false like pharmacies (every place
--   shown with a neutral «Habilitación sin verificar por ContrataCR» line); banking: map points only (no prices, no
--   reviews). No attribute claims an official status (no ICT declaratoria, no stars, no SUGEF products).
--   Each vertical lists the attribute keys a place may carry (types are checked with zod in src/lib/directory).
--   requires_license=true: the public readers only serve a place of that vertical once verification_level is
--   'license_verified'. The mechanism stays per vertical. Owner decision 2026-11-17 ("farmacias quiero mostrar
--   todo"): pharmacies now have requires_license=false, so every published pharmacy is public and its page/card
--   states whether ContrataCR verified its operating permit (badge) or not (neutral note). The 2026-11-16 rule
--   (pharmacies only when license_verified) is replaced; prescription prices stay forbidden (Decreto 36868-S).
-- * dir_places: generic place with multi-country fields (country_code, currency, admin_area_1..3), coordinates
--   with an explicit precision, status, verification level, rating aggregate (written by F5), CAS revision and a
--   generated full-text vector. Order and visibility NEVER depend on payment: there is no paid/featured column.
-- * Field provenance (dir_data_sources + append-only dir_field_provenance): every create/update records which
--   source set which field (OSM attribution travels to the public page).
-- * dir_places.email (2026-11-17, claim by e-mail): the business address from an import (OSM email /
--   contact:email), staff or a verified owner, with its own provenance field 'email'. It is NEVER returned by the
--   public reader: the claim block shows it masked and only the server sends the one-time code to it.
-- * dir_place_mutate: CAS (40001), idempotent actionId receipts (dir_place_actions), immutable dir_place_history
--   (before/after snapshots). Public reader dir_place_public(slug) exposes no internal ids or actor ids.
-- * dir_reports: corrections, closures, duplicates and REMOVAL REQUESTS from the public (idempotent reportId,
--   database caps); dir_report_resolve accepts a removal by moving the place to 'removed' (terminal for the seed).
-- Tables: RLS on, service_role only (no DELETE grant anywhere: places are removed by status); receipts, history
-- and provenance are immutable (UPDATE/DELETE/TRUNCATE blocked by triggers). Functions security invoker with a
-- pinned search_path; only service_role may execute them.
begin;

-- ---------------------------------------------------------------- helpers
create or replace function public.dir_normalize(p_value text) returns text
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select btrim(regexp_replace(translate(lower(coalesce(p_value,'')),'áàäãéèëêíìïîóòöôõúùüûñçâ','aaaaeeeeiiiiooooouuuunca'),'[^a-z0-9]+',' ','g')) $$;
create or replace function public.dir_derived_uuid(p_base uuid,p_label text) returns uuid
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select md5('ccr-dir:'||p_base::text||':'||p_label) h) x $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.dir_verticals(
 id text primary key check(id~'^[a-z][a-z_]{1,30}$'),
 name_es text not null check(length(name_es) between 2 and 60),name_en text not null check(length(name_en) between 2 and 60),
 path_es text not null check(path_es~'^[a-z-]{3,40}$'),path_en text not null check(path_en~'^[a-z-]{3,40}$'),
 attribute_keys text[] not null default '{}',requires_license boolean not null default false,
 active boolean not null default true,sort smallint not null default 0
);
insert into public.dir_verticals(id,name_es,name_en,path_es,path_en,attribute_keys,requires_license,sort) values
 ('restaurant','Restaurantes','Restaurants','restaurantes','restaurants',array['cuisines','priceLevel','serviceCharge','delivery','takeaway','reservations','vegetarianOptions'],false,10),
 ('fuel','Gasolineras','Fuel stations','gasolineras','fuel-stations',array['brand','fuels','open24h','services'],false,20),
 ('pharmacy','Farmacias','Pharmacies','farmacias','pharmacies',array['licenseNumber','onDuty','delivery','acceptsPrescriptions'],false,30),
 ('grocery','Supermercados','Supermarkets','supermercados','supermarkets',array['chain','format','delivery','paymentMethods'],false,40),
 ('vehicle_dealer','Agencias de vehículos','Vehicle dealers','vehiculos','vehicles',array['brands','newVehicles','usedVehicles','financing','workshop'],false,50),
 ('real_estate','Inmobiliarias','Real estate agencies','inmuebles','real-estate',array['operations','propertyTypes'],false,60),
 ('cafe_bar','Cafés, panaderías y bares','Cafés, bakeries and bars','cafes','cafes',array['kind','cuisines','priceLevel','serviceCharge','delivery','takeaway','reservations','vegetarianOptions'],false,15),
 ('convenience','Pulperías y minisúper','Corner stores and minimarts','pulperias','corner-stores',array['kind','delivery','paymentMethods'],false,45),
 ('hardware','Ferreterías','Hardware stores','ferreterias','hardware-stores',array['kind','delivery','paymentMethods'],false,70),
 ('lodging','Hospedaje','Lodging','hospedaje','lodging',array['kind','pool','wifi','parking','breakfast','petFriendly'],false,80),
 ('health','Salud','Health','salud','health',array['kind','publicService','emergency'],false,90),
 ('vet_pets','Veterinarias y mascotas','Vets and pet shops','veterinarias','vets-and-pets',array['kind','emergency','delivery'],false,100),
 ('auto_services','Talleres y servicios para vehículos','Auto repair and car services','talleres','car-services',array['kind','services'],false,110),
 ('beauty','Belleza','Beauty','belleza','beauty',array['kind','byAppointment'],false,120),
 ('fitness','Gimnasios','Gyms','gimnasios','gyms',array['kind'],false,130),
 ('tours','Tours y atracciones','Tours and attractions','tours','tours',array['kind'],false,140),
 ('banking','Bancos y cajeros','Banks and ATMs','bancos','banks',array['kind','atm','operator'],false,150)
on conflict(id) do nothing;
-- Launch copy (2026-11-18): clearer English section names; idempotent for databases seeded with the old names.
update public.dir_verticals set name_en='Corner stores and minimarts' where id='convenience' and name_en='Corner stores';
update public.dir_verticals set name_en='Auto repair and car services' where id='auto_services' and name_en='Car services';
-- Owner decision 2026-11-17: show every pharmacy (databases seeded before it still carry true).
update public.dir_verticals set requires_license=false where id='pharmacy' and requires_license;

create table if not exists public.dir_data_sources(
 id text primary key check(id~'^[a-z][a-z0-9_-]{1,40}$'),
 name text not null check(length(name) between 2 and 120),
 kind text not null check(kind in('staff','owner','user','osm','official','partner')),
 license text not null check(length(license) between 2 and 120),
 attribution text not null check(length(attribution) between 2 and 300),
 url text check(url is null or url~'^https://[^\s"<>]+$'),
 allows_phone boolean not null default false,share_alike boolean not null default false,
 public_attribution boolean not null default true,active boolean not null default true,
 created_at timestamptz not null default clock_timestamp()
);
insert into public.dir_data_sources(id,name,kind,license,attribution,url,allows_phone,share_alike,public_attribution) values
 ('contratacr','ContrataCR','staff','Propietario / proprietary','ContrataCR',null,true,false,false),
 ('owner','Responsable del lugar / place manager','owner','Aportado por el responsable / provided by the manager','Información del responsable / manager information',null,true,false,false),
 ('osm','OpenStreetMap','osm','ODbL 1.0','© Colaboradores de OpenStreetMap / © OpenStreetMap contributors','https://www.openstreetmap.org/copyright',true,true,true)
on conflict(id) do nothing;

create table if not exists public.dir_places(
 id uuid primary key,
 slug text not null unique check(slug~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$'),
 vertical_id text not null references public.dir_verticals(id),
 name text not null check(length(btrim(name)) between 2 and 160),
 name_normalized text generated always as (public.dir_normalize(name)) stored,
 country_code text not null default 'CR' check(country_code~'^[A-Z]{2}$'),
 currency text not null default 'CRC' check(currency~'^[A-Z]{3}$'),
 admin_area_1 text check(length(admin_area_1) between 1 and 80),
 admin_area_2 text check(length(admin_area_2) between 1 and 80),
 admin_area_3 text check(length(admin_area_3) between 1 and 80),
 locality text check(length(locality) between 1 and 80),
 address_line text check(length(address_line) between 1 and 300),
 lat numeric(9,6) check(lat between -90 and 90),lng numeric(9,6) check(lng between -180 and 180),
 location_precision text not null default 'unknown' check(location_precision in('exact','street','locality','area','unknown')),
 phone text check(phone~'^\+?[0-9][0-9 ()-]{6,22}$'),
 website text check(website~'^https?://[^\s"<>]{3,}$' and length(website)<=500),
 email text check(email~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' and length(email)<=254),
 attributes jsonb not null default '{}' check(jsonb_typeof(attributes)='object' and octet_length(attributes::text)<=16384),
 status text not null default 'draft' check(status in('draft','published','hidden','closed_permanently','removed')),
 verification_level text not null default 'unverified' check(verification_level in('unverified','imported','claimed','verified','license_verified')),
 rating_avg numeric(3,2) check(rating_avg between 0 and 5),rating_count integer not null default 0 check(rating_count>=0),
 revision integer not null default 1 check(revision>0),
 search_tsv tsvector generated always as (to_tsvector('simple'::regconfig,public.dir_normalize(name)||' '||public.dir_normalize(coalesce(locality,''))||' '||public.dir_normalize(coalesce(admin_area_2,''))||' '||public.dir_normalize(coalesce(address_line,'')))) stored,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((lat is null)=(lng is null)),
 check(lat is not null or location_precision='unknown'),
 check((rating_avg is null)=(rating_count=0))
);
create index if not exists dir_places_vertical_status on public.dir_places(vertical_id,status,country_code);
create index if not exists dir_places_name_norm on public.dir_places(name_normalized);
create index if not exists dir_places_latlng on public.dir_places(lat,lng) where lat is not null;
create index if not exists dir_places_search on public.dir_places using gin(search_tsv);

create table if not exists public.dir_place_hours(
 place_id uuid not null references public.dir_places(id),
 weekday smallint not null check(weekday between 0 and 6),seq smallint not null check(seq between 0 and 3),
 opens time not null,closes time not null,check(opens<>closes),
 primary key(place_id,weekday,seq)
);
create table if not exists public.dir_place_media(
 id uuid primary key,place_id uuid not null references public.dir_places(id),
 kind text not null check(kind in('photo','logo')),
 url text not null check(url~'^https://[^\s"<>]{8,}$' and length(url)<=1000),
 alt_es text check(length(alt_es)<=200),alt_en text check(length(alt_en)<=200),
 source_id text not null references public.dir_data_sources(id),
 sort smallint not null default 0,status text not null default 'active' check(status in('active','hidden')),
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists dir_place_media_place on public.dir_place_media(place_id,sort);

create table if not exists public.dir_field_provenance(
 id bigint generated always as identity primary key,
 place_id uuid not null references public.dir_places(id),
 field text not null check(field in('name','vertical','address','admin_areas','location','phone','website','email','attributes','hours','media','status','verification')),
 source_id text not null references public.dir_data_sources(id),
 source_ref text check(length(source_ref) between 1 and 120),
 observed_at timestamptz,action_id uuid not null,recorded_at timestamptz not null default clock_timestamp()
);
create index if not exists dir_field_provenance_place on public.dir_field_provenance(place_id,field,id desc);
create index if not exists dir_field_provenance_ref on public.dir_field_provenance(source_id,source_ref) where source_ref is not null;

-- Databases created before the e-mail field: add the column and widen the provenance field list (idempotent).
alter table public.dir_places add column if not exists email text;
do $$declare c record;begin
 if not exists(select 1 from pg_constraint where conname='dir_places_email_check' and conrelid='public.dir_places'::regclass) then
  alter table public.dir_places add constraint dir_places_email_check check(email~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' and length(email)<=254);
 end if;
 for c in select conname from pg_constraint where conrelid='public.dir_field_provenance'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%''verification''%' and pg_get_constraintdef(oid) not like '%''email''%' loop
  execute format('alter table public.dir_field_provenance drop constraint %I',c.conname);
  alter table public.dir_field_provenance add constraint dir_field_provenance_field_check
   check(field in('name','vertical','address','admin_areas','location','phone','website','email','attributes','hours','media','status','verification'));
 end loop;
end $$;

create table if not exists public.dir_place_actions(
 actor_id uuid not null,action_id uuid not null,input jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);
create table if not exists public.dir_place_history(
 id bigint generated always as identity primary key,
 place_id uuid not null references public.dir_places(id),
 action_id uuid not null,actor_id uuid not null,
 action text not null check(action in('create','update','status','hours','verify','report')),
 revision integer not null,before jsonb,after jsonb not null,at timestamptz not null default clock_timestamp()
);
create index if not exists dir_place_history_place on public.dir_place_history(place_id,id);

create table if not exists public.dir_reports(
 id uuid primary key,place_id uuid not null references public.dir_places(id),
 kind text not null check(kind in('wrong_info','closed','duplicate','removal_request','abuse','other')),
 message text not null check(length(message) between 5 and 2000),
 contact_email text check(contact_email~'^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(contact_email)<=254),
 reporter_id uuid,input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 status text not null default 'open' check(status in('open','accepted','rejected')),
 resolution_note text check(length(resolution_note)<=1000),resolved_by uuid,resolved_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check((status='open')=(resolved_at is null))
);
create index if not exists dir_reports_place on public.dir_reports(place_id,created_at desc);
create index if not exists dir_reports_open on public.dir_reports(status,created_at) where status='open';

-- ---------------------------------------------------------------- immutability
create or replace function public.dir_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Directory history, receipts and provenance are immutable' using errcode='23514';end $$;
do $$declare t text;begin foreach t in array array['dir_place_actions','dir_place_history','dir_field_provenance'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.dir_immutable()',t||'_immutable',t);
 execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
end loop;end $$;
-- Places, hours, media and reports are never deleted (status changes only).
do $$declare t text;begin foreach t in array array['dir_places','dir_place_hours','dir_place_media','dir_reports'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
end loop;end $$;

-- ---------------------------------------------------------------- snapshots / validation
create or replace function public.dir_place_snapshot(p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('slug',p.slug,'vertical',p.vertical_id,'name',p.name,'countryCode',p.country_code,'currency',p.currency,
  'adminArea1',p.admin_area_1,'adminArea2',p.admin_area_2,'adminArea3',p.admin_area_3,'locality',p.locality,'addressLine',p.address_line,
  'lat',p.lat,'lng',p.lng,'locationPrecision',p.location_precision,'phone',p.phone,'website',p.website,'email',p.email,'attributes',p.attributes,
  'status',p.status,'verificationLevel',p.verification_level,'revision',p.revision,
  'hours',coalesce((select jsonb_agg(jsonb_build_object('weekday',h.weekday,'opens',to_char(h.opens,'HH24:MI'),'closes',to_char(h.closes,'HH24:MI')) order by h.weekday,h.seq) from public.dir_place_hours h where h.place_id=p.id),'[]'))
 from public.dir_places p where p.id=p_id $$;

-- Text field: absent key = keep; JSON null or '' = clear; string = trimmed value.
create or replace function public.dir_text(p_place jsonb,p_key text,p_current text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when not (p_place ? p_key) then p_current when jsonb_typeof(p_place->p_key)='null' then null
  when jsonb_typeof(p_place->p_key)='string' then nullif(btrim(p_place->>p_key),'') else p_current end $$;

create or replace function public.dir_attributes_ok(p_vertical text,p_attributes jsonb) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_typeof(p_attributes)='object' and octet_length(p_attributes::text)<=16384
  and not exists(select 1 from jsonb_object_keys(p_attributes) k where not k=any(coalesce((select v.attribute_keys from public.dir_verticals v where v.id=p_vertical),'{}'))) $$;

-- ---------------------------------------------------------------- mutate (staff, owner tools, importer)
-- Input: {action:create|update|status|hours|verify, actionId, placeId, revision, place?, status?, hours?,
--         verificationLevel?, source?:{id,ref?,observedAt?}}. Route validates with zod first; checked again here.
create or replace function public.dir_place_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;pid uuid;rev integer;receipt public.dir_place_actions;p public.dir_places;before jsonb;after jsonb;
 pl jsonb:=coalesce(p_input->'place','{}');src text:=coalesce(p_input#>>'{source,id}','contratacr');sref text:=nullif(btrim(coalesce(p_input#>>'{source,ref}','')),'');
 obs timestamptz;fields text[]:='{}';result jsonb;ds public.dir_data_sources;new_status text;lvl text;h jsonb;v public.dir_verticals;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or act is null or act not in('create','update','status','hours','verify') or jsonb_typeof(p_input->'revision')<>'number' or jsonb_typeof(pl)<>'object' then
  raise exception 'Invalid place action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;pid:=(p_input->>'placeId')::uuid;rev:=(p_input->>'revision')::integer;
  obs:=(p_input#>>'{source,observedAt}')::timestamptz;
 exception when others then raise exception 'Invalid place action' using errcode='22023';end;
 if aid is null or pid is null or rev<0 then raise exception 'Invalid place action' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-place:'||pid::text,0));
 select * into receipt from public.dir_place_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into ds from public.dir_data_sources where id=src and active;
 if not found then raise exception 'Unknown data source' using errcode='22023';end if;
 select * into p from public.dir_places where id=pid for update;
 if act='create' then
  if found or rev<>0 then raise exception 'Place changed' using errcode='40001';end if;
 else
  if not found then raise exception 'Place not found' using errcode='P0002';end if;
  if p.revision<>rev then raise exception 'Place changed' using errcode='40001';end if;
  before:=public.dir_place_snapshot(pid);
 end if;

 if act in('create','update') then
  if act='create' then
   select * into v from public.dir_verticals where id=pl->>'vertical' and active;
   if not found then raise exception 'Unknown vertical' using errcode='22023';end if;
   p.id:=pid;p.vertical_id:=v.id;p.slug:=pl->>'slug';p.country_code:=coalesce(pl->>'countryCode','CR');p.currency:=coalesce(pl->>'currency','CRC');
   p.attributes:='{}';p.status:='draft';p.revision:=0;
   lvl:=coalesce(p_input->>'verificationLevel','unverified');
   if lvl not in('unverified','imported') or (lvl='imported' and ds.kind not in('osm','official','partner')) then raise exception 'Invalid verification level' using errcode='22023';end if;
   p.verification_level:=lvl;fields:=array['name','vertical'];
  elsif pl ? 'vertical' and pl->>'vertical' is distinct from p.vertical_id then
   raise exception 'The vertical of a place cannot change' using errcode='22023';
  end if;
  if pl ? 'name' then p.name:=btrim(pl->>'name');if act='update' then fields:=fields||'name'::text;end if;end if;
  if pl ? 'slug' and act='update' then p.slug:=pl->>'slug';end if;
  if pl ?| array['addressLine','locality'] then p.address_line:=public.dir_text(pl,'addressLine',p.address_line);p.locality:=public.dir_text(pl,'locality',p.locality);fields:=fields||'address'::text;end if;
  if pl ?| array['adminArea1','adminArea2','adminArea3'] then p.admin_area_1:=public.dir_text(pl,'adminArea1',p.admin_area_1);p.admin_area_2:=public.dir_text(pl,'adminArea2',p.admin_area_2);p.admin_area_3:=public.dir_text(pl,'adminArea3',p.admin_area_3);fields:=fields||'admin_areas'::text;end if;
  if pl ?| array['lat','lng','locationPrecision'] then
   if (pl ? 'lat' and jsonb_typeof(pl->'lat') not in('number','null')) or (pl ? 'lng' and jsonb_typeof(pl->'lng') not in('number','null')) then raise exception 'Invalid coordinates' using errcode='22023';end if;
   if pl ? 'lat' then p.lat:=(pl->>'lat')::numeric;end if;if pl ? 'lng' then p.lng:=(pl->>'lng')::numeric;end if;
   p.location_precision:=coalesce(pl->>'locationPrecision',case when p.lat is null then 'unknown' else coalesce(nullif(p.location_precision,'unknown'),'exact') end);
   if p.location_precision not in('exact','street','locality','area','unknown') or (p.lat is null)<>(p.location_precision='unknown') then raise exception 'Invalid location precision' using errcode='22023';end if;
   if p.country_code='CR' and p.lat is not null and not(p.lat between 5.0 and 11.5 and p.lng between -87.5 and -82.5) then raise exception 'Coordinates outside the country' using errcode='22023';end if;
   fields:=fields||'location'::text;
  end if;
  if pl ? 'phone' then
   if not ds.allows_phone and jsonb_typeof(pl->'phone')='string' then raise exception 'This source does not allow phone numbers' using errcode='22023';end if;
   p.phone:=public.dir_text(pl,'phone',p.phone);fields:=fields||'phone'::text;end if;
  if pl ? 'website' then p.website:=public.dir_text(pl,'website',p.website);fields:=fields||'website'::text;end if;
  if pl ? 'email' then p.email:=lower(public.dir_text(pl,'email',p.email));fields:=fields||'email'::text;end if;
  if pl ? 'attributes' then
   if not public.dir_attributes_ok(p.vertical_id,pl->'attributes') then raise exception 'Invalid attributes for this vertical' using errcode='22023';end if;
   p.attributes:=pl->'attributes';fields:=fields||'attributes'::text;end if;
  if p.name is null then raise exception 'Name required' using errcode='22023';end if;
  if act='create' then
   insert into public.dir_places(id,slug,vertical_id,name,country_code,currency,admin_area_1,admin_area_2,admin_area_3,locality,address_line,lat,lng,location_precision,phone,website,email,attributes,status,verification_level)
   values(p.id,p.slug,p.vertical_id,p.name,p.country_code,p.currency,p.admin_area_1,p.admin_area_2,p.admin_area_3,p.locality,p.address_line,p.lat,p.lng,coalesce(p.location_precision,'unknown'),p.phone,p.website,p.email,p.attributes,'draft',p.verification_level) returning * into p;
  else
   if cardinality(fields)=0 and not(pl ? 'slug') then raise exception 'Nothing to change' using errcode='22023';end if;
   update public.dir_places set slug=p.slug,name=p.name,admin_area_1=p.admin_area_1,admin_area_2=p.admin_area_2,admin_area_3=p.admin_area_3,locality=p.locality,address_line=p.address_line,
    lat=p.lat,lng=p.lng,location_precision=p.location_precision,phone=p.phone,website=p.website,email=p.email,attributes=p.attributes,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;
  end if;
 elsif act='status' then
  new_status:=p_input->>'status';
  if new_status is null or new_status not in('draft','published','hidden','closed_permanently','removed') or new_status=p.status then raise exception 'Invalid status' using errcode='22023';end if;
  -- 'removed' (removal request or abuse) is terminal for publication: it may only be kept hidden afterwards.
  if p.status='removed' and new_status<>'hidden' then raise exception 'A removed place cannot be published again' using errcode='22023',hint='dir_place_removed';end if;
  update public.dir_places set status=new_status,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;fields:=array['status'];
 elsif act='hours' then
  if jsonb_typeof(p_input->'hours')<>'array' or jsonb_array_length(p_input->'hours')>28 then raise exception 'Invalid hours' using errcode='22023';end if;
  delete from public.dir_place_hours where place_id=pid;
  begin
   insert into public.dir_place_hours(place_id,weekday,seq,opens,closes)
   select pid,(x->>'weekday')::smallint,(row_number() over(partition by x->>'weekday' order by x->>'opens')-1)::smallint,(x->>'opens')::time,(x->>'closes')::time from jsonb_array_elements(p_input->'hours') x;
  exception when others then raise exception 'Invalid hours' using errcode='22023';end;
  update public.dir_places set revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;fields:=array['hours'];
 else
  lvl:=p_input->>'verificationLevel';
  if lvl is null or lvl not in('unverified','imported','claimed','verified','license_verified') or lvl=p.verification_level or ds.kind<>'staff' then raise exception 'Invalid verification change' using errcode='22023';end if;
  update public.dir_places set verification_level=lvl,revision=revision+1,updated_at=clock_timestamp() where id=pid returning * into p;fields:=array['verification'];
 end if;

 insert into public.dir_field_provenance(place_id,field,source_id,source_ref,observed_at,action_id) select pid,f,src,sref,obs,aid from unnest(fields) f;
 after:=public.dir_place_snapshot(pid);
 insert into public.dir_place_history(place_id,action_id,actor_id,action,revision,before,after) values(pid,aid,p_actor,act,p.revision,before,after);
 result:=jsonb_build_object('action',act,'placeId',pid,'slug',p.slug,'revision',p.revision,'status',p.status,'verificationLevel',p.verification_level);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- public reader (slug only)
create or replace function public.dir_place_public(p_slug text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;v public.dir_verticals;
begin
 if p_slug is null or p_slug!~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$' then return null;end if;
 select * into p from public.dir_places where slug=p_slug and status in('published','closed_permanently');
 if not found then return null;end if;
 select * into v from public.dir_verticals where id=p.vertical_id;
 if not v.active or (v.requires_license and p.verification_level<>'license_verified') then return null;end if;
 return jsonb_build_object('slug',p.slug,'name',p.name,
  'vertical',jsonb_build_object('id',v.id,'nameEs',v.name_es,'nameEn',v.name_en,'pathEs',v.path_es,'pathEn',v.path_en),
  'countryCode',p.country_code,'currency',p.currency,
  'address',jsonb_build_object('adminArea1',p.admin_area_1,'adminArea2',p.admin_area_2,'adminArea3',p.admin_area_3,'locality',p.locality,'line',p.address_line),
  'location',case when p.lat is null then null else jsonb_build_object('lat',p.lat,'lng',p.lng,'precision',p.location_precision) end,
  'phone',p.phone,'website',p.website,'attributes',p.attributes,'status',p.status,'verificationLevel',p.verification_level,
  'rating',jsonb_build_object('average',p.rating_avg,'count',p.rating_count),
  'hours',public.dir_place_snapshot(p.id)->'hours',
  'media',coalesce((select jsonb_agg(jsonb_build_object('kind',m.kind,'url',m.url,'altEs',m.alt_es,'altEn',m.alt_en) order by m.sort,m.created_at) from public.dir_place_media m where m.place_id=p.id and m.status='active'),'[]'),
  -- Attribution of every source that currently backs a visible field (latest provenance per field).
  'sources',coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'license',s.license,'attribution',s.attribution,'url',s.url) order by s.id)
    from public.dir_data_sources s where s.public_attribution and s.id in(
     select distinct on(f.field) f.source_id from public.dir_field_provenance f where f.place_id=p.id order by f.field,f.id desc)),'[]'),
  'updatedAt',p.updated_at);
end $$;

-- ---------------------------------------------------------------- reports (public) and resolution (staff)
-- Input: {reportId, kind, message, email?}. p_actor = signed-in reporter or null. Caps: 20 per place a day,
-- 5 a day per contact e-mail (54000 → 429). Same reportId + same input → same answer.
create or replace function public.dir_report_create(p_actor uuid,p_slug text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rid uuid;p public.dir_places;prior public.dir_reports;h text;mail text;answer jsonb:=jsonb_build_object('ok',true);
begin
 if jsonb_typeof(p_input)<>'object' then raise exception 'Invalid report' using errcode='22023';end if;
 begin rid:=(p_input->>'reportId')::uuid;exception when others then raise exception 'Invalid report' using errcode='22023';end;
 mail:=nullif(lower(btrim(coalesce(p_input->>'email',''))),'');
 if rid is null or coalesce(p_input->>'kind','') not in('wrong_info','closed','duplicate','removal_request','abuse','other')
  or length(btrim(coalesce(p_input->>'message',''))) not between 5 and 2000 or (mail is not null and (mail!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(mail)>254)) then
  raise exception 'Invalid report' using errcode='22023';end if;
 select * into p from public.dir_places where slug=p_slug and status in('published','closed_permanently');
 if not found then raise exception 'Place unavailable' using errcode='P0002';end if;
 h:=encode(sha256(convert_to(jsonb_build_object('slug',p_slug,'actor',p_actor,'kind',p_input->>'kind','message',btrim(p_input->>'message'),'email',mail)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('dir-report:'||p.id::text,0));
 select * into prior from public.dir_reports where id=rid;
 if found then if prior.input_hash<>h then raise exception 'Report id reused' using errcode='22023';end if;return answer;end if;
 if (select count(*) from public.dir_reports r where r.place_id=p.id and r.created_at>clock_timestamp()-interval '1 day')>=20
  or (mail is not null and (select count(*) from public.dir_reports r where r.contact_email=mail and r.created_at>clock_timestamp()-interval '1 day')>=5) then
  raise exception 'Too many reports' using errcode='54000',hint='dir_report_cap';end if;
 insert into public.dir_reports(id,place_id,kind,message,contact_email,reporter_id,input_hash) values(rid,p.id,p_input->>'kind',btrim(p_input->>'message'),mail,p_actor,h);
 return answer;
end $$;
-- Input: {actionId, reportId, decision:accept|reject, note?, revision (place revision, used when a removal is accepted)}.
create or replace function public.dir_report_resolve(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;r public.dir_reports;receipt public.dir_place_actions;result jsonb;mut jsonb;dec text:=p_input->>'decision';
begin
 begin aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'reportId')::uuid;exception when others then raise exception 'Invalid resolution' using errcode='22023';end;
 if p_actor is null or aid is null or rid is null or dec is null or dec not in('accept','reject') or length(coalesce(p_input->>'note',''))>1000 then raise exception 'Invalid resolution' using errcode='22023';end if;
 select * into receipt from public.dir_place_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into r from public.dir_reports where id=rid for update;
 if not found then raise exception 'Report not found' using errcode='P0002';end if;
 if r.status<>'open' then raise exception 'Report already resolved' using errcode='40001';end if;
 if dec='accept' and r.kind='removal_request' then
  mut:=public.dir_place_mutate(p_actor,jsonb_build_object('action','status','status','removed','placeId',r.place_id,'revision',p_input->'revision','actionId',public.dir_derived_uuid(aid,'removal')));
 end if;
 update public.dir_reports set status=case when dec='accept' then 'accepted' else 'rejected' end,resolution_note=nullif(btrim(coalesce(p_input->>'note','')),''),resolved_by=p_actor,resolved_at=clock_timestamp() where id=rid;
 result:=jsonb_build_object('reportId',rid,'status',case when dec='accept' then 'accepted' else 'rejected' end,'place',mut);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['dir_verticals','dir_data_sources','dir_places','dir_place_hours','dir_place_media','dir_field_provenance','dir_place_actions','dir_place_history','dir_reports'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n in('dir_field_provenance','dir_place_actions','dir_place_history') then execute format('grant select,insert on public.%I to service_role',n);
 elsif n='dir_place_hours' then execute format('grant select,insert,delete on public.%I to service_role',n); -- hours are replaced as a set
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'dir_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
