-- LOCAL PRO ONLY. Multivertical round P2 (2026-11-16): restaurant menus of a CLAIMED directory place.
-- Depends on: directory-core-local.sql (dir_places, dir_verticals, dir_immutable, dir_place_public, dir_normalize)
--             directory-claims-local.sql (dir_places.claim_status, dir_place_managers).
-- Optional at run time: team-roles-local.sql + the F4 capability patch (pro_role_of / pro_role_allows with
--             'menu.write'). When a company member edits (p_member not null) the member's role in the actor's team
--             must allow menu.write; without the team module a member write is refused (42501 menu_role).
-- * Who edits: p_actor is the effective Pro account (the owner's account when a member works in the owner's
--   company, see src/lib/pro/workspace-user.ts). p_actor must be an ACTIVE dir_place_managers row (owner or
--   manager) of a restaurant place whose claim_status is claimed/disputed. Module gates (pro_module_require
--   'menu' / 'menu_from_photo') stay in the route, like every other F4 module.
-- * pro_menu_settings (one row per place): whether the prices typed by the business ALREADY include IVA (13 %) and
--   the 10 % service, and whether the place charges service at all. The public reader always shows the FINAL
--   price (base + IVA + service) with the breakdown (pro_menu_price; mirror: src/lib/directory/menu-price.ts).
--   Assumption to confirm with the accountant/lawyer: service is computed on the base (before IVA) and is not part
--   of the IVA base.
-- * pro_menu_sections / pro_menu_items: ES/EN names, description, price_minor (céntimos), dietary tags
--   (vegetariano, vegano ⇒ vegetariano, sin_gluten, picante), availability (available/sold_out/unavailable +
--   optional daily window), optional https photo, order, status draft/published/archived. Never deleted (archived).
-- * Dishes are per place, NOT canonical price_items: menus never write price_observations (comparator stays apart).
-- * pro_menu_mutate: CAS per entity (40001), idempotent actionId receipts (pro_menu_actions), immutable history
--   (pro_menu_history, with the member id). Reorders send the full id list; a stale list answers 40001.
-- * Menu from photo (draft contract only, mock adapter): pro_menu_import_record stores the validated extraction in
--   pro_menu_import_drafts (immutable, like pro_ai_suggestions) and creates NOTHING. pro_menu_import_review
--   applies the owner's reviewed/edited copy as DRAFT items (never published) or discards it; reviewed once.
-- * dir_place_menu_public(slug): published places only (same visibility rules as dir_place_public, plus claimed),
--   published + not-unavailable items, no internal ids, revisions or actors.
-- Tables: RLS on, service_role only, no DELETE grant, DELETE/TRUNCATE blocked. Functions security invoker with a
-- pinned search_path, executable only by service_role. No commercial column: order never depends on payment.
-- 2026-11-18 (launch without Pro): company-member roles come from the NEUTRAL helpers dir_business_role_of /
-- dir_business_allows (dir-business-roles-local.sql, required); they delegate to the Pro team module only when installed.
begin;

-- ---------------------------------------------------------------- tables
-- Dietary tags: known, distinct, vegano implies vegetariano (used by a table check, so it must exist first).
create or replace function public.pro_menu_tags_ok(p_tags text[]) returns boolean
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select p_tags is not null and p_tags<@array['vegetariano','vegano','sin_gluten','picante']::text[]
  and coalesce(cardinality(p_tags),0)=(select count(distinct t) from unnest(p_tags) t)
  and (not 'vegano'=any(p_tags) or 'vegetariano'=any(p_tags)) $$;
create table if not exists public.pro_menu_settings(
 place_id uuid primary key references public.dir_places(id),
 prices_include_iva boolean not null default true,
 prices_include_service boolean not null default false,
 service_charge boolean not null default true,
 iva_bps integer not null default 1300 check(iva_bps in(0,1300)),
 service_bps integer not null default 1000 check(service_bps in(0,1000)),
 revision integer not null default 1 check(revision>0),
 menu_version integer not null default 1 check(menu_version>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(service_charge or not prices_include_service),
 check(service_charge=(service_bps>0))
);

create table if not exists public.pro_menu_sections(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 name_es text not null check(length(btrim(name_es)) between 1 and 80),
 name_en text check(length(btrim(name_en)) between 1 and 80),
 description_es text check(length(description_es) between 1 and 300),
 description_en text check(length(description_en) between 1 and 300),
 sort integer not null check(sort between 0 and 10000),
 status text not null default 'active' check(status in('active','archived')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index if not exists pro_menu_sections_place on public.pro_menu_sections(place_id,sort) where status='active';

create table if not exists public.pro_menu_import_drafts(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 actor_id uuid not null,member_id uuid,action_id uuid not null,
 mode text not null check(mode in('mock','sandbox','production')),
 model text not null check(length(model) between 1 and 80),
 source jsonb not null default '{}' check(jsonb_typeof(source)='object' and octet_length(source::text)<=1024),
 status text not null check(status in('ready','failed')),
 extraction jsonb check(extraction is null or (jsonb_typeof(extraction)='object' and octet_length(extraction::text)<=131072)),
 error text check(error is null or error~'^[a-z_]{1,60}$'),
 review text check(review is null or review in('applied','discarded')),
 reviewed_at timestamptz,reviewed_by uuid,applied_items integer check(applied_items between 1 and 300),
 created_at timestamptz not null default clock_timestamp(),
 unique(actor_id,action_id),
 check((status='ready')=(extraction is not null)),check((status='failed')=(error is not null)),
 check((review is null)=(reviewed_at is null)),check((review is null)=(reviewed_by is null)),
 check((review='applied')=(applied_items is not null)),check(review is distinct from 'applied' or status='ready')
);
create index if not exists pro_menu_import_drafts_place on public.pro_menu_import_drafts(place_id,created_at desc);

create table if not exists public.pro_menu_items(
 id uuid primary key,
 place_id uuid not null references public.dir_places(id),
 section_id uuid not null references public.pro_menu_sections(id),
 name_es text not null check(length(btrim(name_es)) between 1 and 120),
 name_en text check(length(btrim(name_en)) between 1 and 120),
 description_es text check(length(description_es) between 1 and 500),
 description_en text check(length(description_en) between 1 and 500),
 price_minor bigint not null check(price_minor between 0 and 1000000000),
 dietary text[] not null default '{}' check(public.pro_menu_tags_ok(dietary)),
 availability text not null default 'available' check(availability in('available','sold_out','unavailable')),
 available_from time,available_until time,
 photo_url text check(photo_url~'^https://[^\s"<>]{8,}$' and length(photo_url)<=1000),
 photo_alt_es text check(length(photo_alt_es) between 1 and 200),photo_alt_en text check(length(photo_alt_en) between 1 and 200),
 sort integer not null check(sort between 0 and 100000),
 status text not null default 'draft' check(status in('draft','published','archived')),
 origin text not null default 'manual' check(origin in('manual','photo_import')),
 import_id uuid references public.pro_menu_import_drafts(id),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((available_from is null)=(available_until is null)),check(available_from is distinct from available_until or available_from is null),
 check((origin='photo_import')=(import_id is not null)),
 check(photo_url is not null or (photo_alt_es is null and photo_alt_en is null))
);
create index if not exists pro_menu_items_section on public.pro_menu_items(section_id,sort) where status<>'archived';
create index if not exists pro_menu_items_place on public.pro_menu_items(place_id) where status<>'archived';

create table if not exists public.pro_menu_actions(
 actor_id uuid not null,action_id uuid not null,input jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);
create table if not exists public.pro_menu_history(
 id bigint generated always as identity primary key,
 place_id uuid not null references public.dir_places(id),
 action_id uuid not null,actor_id uuid not null,member_id uuid,
 action text not null check(action in('settings','section_create','section_update','section_archive','sections_reorder',
  'item_create','item_update','item_archive','items_reorder','items_publish','import_record','import_apply','import_discard')),
 entity text not null check(entity in('settings','section','item','import')),entity_id uuid,
 before jsonb,after jsonb not null,at timestamptz not null default clock_timestamp()
);
create index if not exists pro_menu_history_place on public.pro_menu_history(place_id,id);

-- ---------------------------------------------------------------- guards
create or replace function public.pro_menu_no_delete() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Menu rows are archived, never deleted' using errcode='23514';end $$;
create or replace function public.pro_menu_import_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Import drafts are never deleted' using errcode='23514';end if;
 if (new.id,new.place_id,new.actor_id,new.member_id,new.action_id,new.mode,new.model,new.source,new.status,new.extraction,new.error,new.created_at)
  is distinct from (old.id,old.place_id,old.actor_id,old.member_id,old.action_id,old.mode,old.model,old.source,old.status,old.extraction,old.error,old.created_at) then
  raise exception 'An import draft is immutable' using errcode='23514';end if;
 if old.review is not null then raise exception 'The review outcome is recorded once' using errcode='23514';end if;
 return new;
end $$;
do $$declare t text;begin
 foreach t in array array['pro_menu_actions','pro_menu_history'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function public.dir_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['pro_menu_settings','pro_menu_sections','pro_menu_items'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_delete',t);
  execute format('create trigger %I before delete on public.%I for each row execute function public.pro_menu_no_delete()',t||'_no_delete',t);
 end loop;
 foreach t in array array['pro_menu_actions','pro_menu_history','pro_menu_settings','pro_menu_sections','pro_menu_items','pro_menu_import_drafts'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
 end loop;
 drop trigger if exists pro_menu_import_guard on public.pro_menu_import_drafts;
 create trigger pro_menu_import_guard before update or delete on public.pro_menu_import_drafts for each row execute function public.pro_menu_import_guard();
end $$;

-- ---------------------------------------------------------------- price (mirror: src/lib/directory/menu-price.ts)
-- round(a*b/c) half up, integers only (a,b ≥ 0, c > 0).
create or replace function public.pro_menu_rdiv(a bigint,b bigint,c bigint) returns bigint
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$ select (2*a*b+c)/(2*c) $$;
-- FINAL price shown to the public + breakdown. p_svc_bps = 0 when the place does not charge service.
create or replace function public.pro_menu_price(p_price bigint,p_inc_iva boolean,p_inc_svc boolean,p_iva_bps integer,p_svc_bps integer) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare base bigint;iva bigint;svc bigint;total bigint;i bigint:=greatest(coalesce(p_iva_bps,0),0);s bigint:=greatest(coalesce(p_svc_bps,0),0);
begin
 if p_price is null or p_price<0 then return null;end if;
 if s=0 then p_inc_svc:=false;end if;
 if p_inc_iva and p_inc_svc then base:=public.pro_menu_rdiv(p_price,10000,10000+i+s);svc:=public.pro_menu_rdiv(base,s,10000);iva:=p_price-base-svc;total:=p_price;
 elsif p_inc_iva then base:=public.pro_menu_rdiv(p_price,10000,10000+i);iva:=p_price-base;svc:=public.pro_menu_rdiv(base,s,10000);total:=p_price+svc;
 elsif p_inc_svc then base:=public.pro_menu_rdiv(p_price,10000,10000+s);svc:=p_price-base;iva:=public.pro_menu_rdiv(base,i,10000);total:=p_price+iva;
 else base:=p_price;iva:=public.pro_menu_rdiv(p_price,i,10000);svc:=public.pro_menu_rdiv(p_price,s,10000);total:=p_price+iva+svc;end if;
 return jsonb_build_object('base',base,'iva',iva,'service',svc,'total',total);
end $$;

-- ---------------------------------------------------------------- validation helpers
create or replace function public.pro_menu_text_ok(p jsonb,k text,max integer,required boolean) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when not (p ? k) or jsonb_typeof(p->k)='null' then not required
  else jsonb_typeof(p->k)='string' and length(btrim(p->>k)) between 1 and max end $$;
create or replace function public.pro_menu_txt(p jsonb,k text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$ select nullif(btrim(coalesce(p->>k,'')),'') $$;
-- Full item payload (create/update replace every field). Same rules as menuItemFieldsSchema (zod).
create or replace function public.pro_menu_item_ok(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare tags text[];
begin
 if jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where k not in('nameEs','nameEn','descriptionEs','descriptionEn','priceMinor',
  'dietary','availability','availableFrom','availableUntil','photoUrl','photoAltEs','photoAltEn','status')) then return false;end if;
 if not (public.pro_menu_text_ok(p,'nameEs',120,true) and public.pro_menu_text_ok(p,'nameEn',120,false) and public.pro_menu_text_ok(p,'descriptionEs',500,false)
  and public.pro_menu_text_ok(p,'descriptionEn',500,false) and public.pro_menu_text_ok(p,'photoAltEs',200,false) and public.pro_menu_text_ok(p,'photoAltEn',200,false)) then return false;end if;
 if jsonb_typeof(p->'priceMinor') is distinct from 'number' then return false;end if;
 if (p->>'priceMinor')::numeric<>trunc((p->>'priceMinor')::numeric) or (p->>'priceMinor')::numeric not between 0 and 1000000000 then return false;end if;
 if p ? 'dietary' then
  if jsonb_typeof(p->'dietary')<>'array' or exists(select 1 from jsonb_array_elements(p->'dietary') e where jsonb_typeof(e)<>'string') then return false;end if;
  tags:=array(select jsonb_array_elements_text(p->'dietary'));
  if not tags<@array['vegetariano','vegano','sin_gluten','picante'] or cardinality(tags)<>(select count(distinct t) from unnest(tags) t)
   or ('vegano'=any(tags) and not 'vegetariano'=any(tags)) then return false;end if;
 end if;
 if coalesce(p->>'availability','available') not in('available','sold_out','unavailable') or (p ? 'availability' and jsonb_typeof(p->'availability')<>'string') then return false;end if;
 if coalesce(p->>'status','draft') not in('draft','published') or (p ? 'status' and jsonb_typeof(p->'status')<>'string') then return false;end if;
 if (public.pro_menu_txt(p,'availableFrom') is null)<>(public.pro_menu_txt(p,'availableUntil') is null)
  or coalesce(p->>'availableFrom','00:00')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p->>'availableUntil','00:01')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or (p->>'availableFrom' is not null and p->>'availableFrom'=p->>'availableUntil') then return false;end if;
 if public.pro_menu_txt(p,'photoUrl') is not null and (jsonb_typeof(p->'photoUrl')<>'string' or p->>'photoUrl'!~'^https://[^\s"<>]{8,}$' or length(p->>'photoUrl')>1000) then return false;end if;
 if public.pro_menu_txt(p,'photoUrl') is null and (public.pro_menu_txt(p,'photoAltEs') is not null or public.pro_menu_txt(p,'photoAltEn') is not null) then return false;end if;
 return true;
end $$;
create or replace function public.pro_menu_section_ok(p jsonb) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in('nameEs','nameEn','descriptionEs','descriptionEn'))
  and public.pro_menu_text_ok(p,'nameEs',80,true) and public.pro_menu_text_ok(p,'nameEn',80,false)
  and public.pro_menu_text_ok(p,'descriptionEs',300,false) and public.pro_menu_text_ok(p,'descriptionEn',300,false) $$;
-- Extraction returned by the (mock) menu-from-photo adapter, already normalised by src/lib/directory/menu-import.ts.
create or replace function public.pro_menu_extraction_ok(p jsonb) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_typeof(p)='object'
  and not exists(select 1 from jsonb_object_keys(p) k where k not in('language','currency','pricesIncludeIva','pricesIncludeService','sections','warnings'))
  and coalesce(p->>'language','') in('es','en') and coalesce(p->>'currency','') in('CRC','USD')
  and coalesce(jsonb_typeof(p->'pricesIncludeIva'),'') in('boolean','null') and coalesce(jsonb_typeof(p->'pricesIncludeService'),'') in('boolean','null')
  and jsonb_typeof(p->'warnings')='array' and jsonb_array_length(p->'warnings')<=10
  and not exists(select 1 from jsonb_array_elements(p->'warnings') w where jsonb_typeof(w)<>'string' or length(w#>>'{}')>300)
  and jsonb_typeof(p->'sections')='array' and jsonb_array_length(p->'sections') between 1 and 40
  and not exists(select 1 from jsonb_array_elements(p->'sections') s where jsonb_typeof(s)<>'object'
   or exists(select 1 from jsonb_object_keys(s) k where k not in('name','items'))
   or jsonb_typeof(s->'name')<>'string' or length(btrim(s->>'name')) not between 1 and 80
   or jsonb_typeof(s->'items')<>'array' or jsonb_array_length(s->'items') not between 1 and 150
   or exists(select 1 from jsonb_array_elements(s->'items') i where jsonb_typeof(i)<>'object'
    or exists(select 1 from jsonb_object_keys(i) k where k not in('name','description','priceMinor','dietary','confidence'))
    or jsonb_typeof(i->'name')<>'string' or length(btrim(i->>'name')) not between 1 and 120
    or coalesce(jsonb_typeof(i->'description'),'null') not in('string','null') or length(coalesce(i->>'description',''))>500
    or coalesce(jsonb_typeof(i->'priceMinor'),'null') not in('number','null')
    or case when jsonb_typeof(i->'priceMinor')='number' then (i->>'priceMinor')::numeric<>trunc((i->>'priceMinor')::numeric) or (i->>'priceMinor')::numeric not between 0 and 1000000000 else false end
    or case when jsonb_typeof(i->'dietary')='array' then exists(select 1 from jsonb_array_elements(i->'dietary') t where jsonb_typeof(t)<>'string')
       or not public.pro_menu_tags_ok(array(select jsonb_array_elements_text(i->'dietary'))) else true end
    or coalesce(i->>'confidence','') not in('low','medium','high')))
  and (select count(*) from jsonb_array_elements(p->'sections') s,jsonb_array_elements(s->'items') i)<=300 $$;

-- ---------------------------------------------------------------- authorization
-- Raises unless p_actor (effective Pro account) is an active manager of a claimed restaurant place and, for a
-- company member, the member's role allows menu.write (writes) / read (reads). Returns the place.
create or replace function public.pro_menu_authorize(p_actor uuid,p_member uuid,p_place uuid,p_capability text) returns public.dir_places
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;r text;allowed boolean;
begin
 if p_actor is null or p_place is null or p_capability not in('read','menu.write') then raise exception 'Invalid menu request' using errcode='22023';end if;
 select * into p from public.dir_places where id=p_place;
 if not found or p.status='removed' then raise exception 'Place not found' using errcode='P0002';end if;
 if not exists(select 1 from public.dir_place_managers where place_id=p_place and user_id=p_actor and status='active') then
  raise exception 'Not a manager of this place' using errcode='42501',hint='menu_not_manager';end if;
 -- 2026-11-17: cafés, bakeries and bars (cafe_bar, split out of restaurants) keep their menu too.
 if p.vertical_id not in('restaurant','cafe_bar') then raise exception 'Menus are for restaurants' using errcode='22023',hint='menu_vertical';end if;
 if p.claim_status not in('claimed','disputed') then raise exception 'The place is not claimed' using errcode='42501',hint='menu_place_unclaimed';end if;
 if p_member is not null and p_member<>p_actor then
  r:=public.dir_business_role_of(p_member,p_actor);
  allowed:=public.dir_business_allows(r,p_capability);
  if r is null or not coalesce(allowed,false) then raise exception 'Role does not allow %',p_capability using errcode='42501',hint='menu_role';end if;
 end if;
 return p;
end $$;

-- ---------------------------------------------------------------- json
create or replace function public.pro_menu_settings_json(s public.pro_menu_settings) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('pricesIncludeIva',coalesce(s.prices_include_iva,true),'pricesIncludeService',coalesce(s.prices_include_service,false),
  'serviceCharge',coalesce(s.service_charge,true),'ivaRateBps',coalesce(s.iva_bps,1300),'serviceRateBps',coalesce(s.service_bps,1000),
  'revision',coalesce(s.revision,0),'menuVersion',coalesce(s.menu_version,0)) $$;
create or replace function public.pro_menu_item_json(i public.pro_menu_items,s public.pro_menu_settings) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('nameEs',i.name_es,'nameEn',i.name_en,'descriptionEs',i.description_es,'descriptionEn',i.description_en,
  'priceMinor',i.price_minor,'price',public.pro_menu_price(i.price_minor,coalesce(s.prices_include_iva,true),coalesce(s.prices_include_service,false),coalesce(s.iva_bps,1300),case when coalesce(s.service_charge,true) then coalesce(s.service_bps,1000) else 0 end),
  'dietary',to_jsonb(i.dietary),'availability',i.availability,'availableFrom',to_char(i.available_from,'HH24:MI'),'availableUntil',to_char(i.available_until,'HH24:MI'),
  'photoUrl',i.photo_url,'photoAltEs',i.photo_alt_es,'photoAltEn',i.photo_alt_en) $$;
create or replace function public.pro_menu_import_json(d public.pro_menu_import_drafts) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',d.id,'mode',d.mode,'model',d.model,'status',d.status,'extraction',d.extraction,'error',d.error,
  'review',d.review,'appliedItems',d.applied_items,'createdAt',d.created_at) $$;

-- Owner/editor reader: every non-archived section and item (drafts included), revisions and open imports.
create or replace function public.pro_menu_read(p_actor uuid,p_member uuid,p_place uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;s public.pro_menu_settings;
begin
 p:=public.pro_menu_authorize(p_actor,p_member,p_place,'read');
 select * into s from public.pro_menu_settings where place_id=p_place;
 return jsonb_build_object('placeId',p.id,'slug',p.slug,'name',p.name,'placeStatus',p.status,'currency',p.currency,
  'settings',public.pro_menu_settings_json(s),
  'sections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nameEs',c.name_es,'nameEn',c.name_en,'descriptionEs',c.description_es,'descriptionEn',c.description_en,'revision',c.revision,
    'items',coalesce((select jsonb_agg(public.pro_menu_item_json(i,s)||jsonb_build_object('id',i.id,'status',i.status,'origin',i.origin,'revision',i.revision) order by i.sort,i.created_at)
     from public.pro_menu_items i where i.section_id=c.id and i.status<>'archived'),'[]')) order by c.sort,c.created_at)
   from public.pro_menu_sections c where c.place_id=p_place and c.status='active'),'[]'),
  'imports',coalesce((select jsonb_agg(public.pro_menu_import_json(d) order by d.created_at desc) from (select * from public.pro_menu_import_drafts where place_id=p_place and review is null order by created_at desc limit 10) d),'[]'));
end $$;

-- ---------------------------------------------------------------- mutations
create or replace function public.pro_menu_receipt(p_actor uuid,p_action uuid,p_input jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_menu_actions;
begin
 select * into r from public.pro_menu_actions where actor_id=p_actor and action_id=p_action;
 if not found then return null;end if;
 if r.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023',hint='menu_action_reused';end if;
 return r.result||jsonb_build_object('replayed',true);
end $$;
create or replace function public.pro_menu_section_row(p_id uuid,p_place uuid,p_lock boolean) returns public.pro_menu_sections
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_menu_sections;
begin
 if p_lock then select * into c from public.pro_menu_sections where id=p_id and place_id=p_place and status='active' for update;
 else select * into c from public.pro_menu_sections where id=p_id and place_id=p_place and status='active';end if;
 if not found then raise exception 'Section not found' using errcode='P0002',hint='menu_section_missing';end if;
 return c;
end $$;
create or replace function public.pro_menu_item_write(p_id uuid,p_place uuid,p_section uuid,p jsonb,p_origin text,p_import uuid,p_force_draft boolean) returns public.pro_menu_items
language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.pro_menu_items;srt integer;had boolean;st text:=case when p_force_draft then 'draft' else coalesce(p->>'status','draft') end;
begin
 select * into i from public.pro_menu_items where id=p_id for update;had:=found;
 if had and (i.place_id<>p_place or i.status='archived') then raise exception 'Item not found' using errcode='P0002',hint='menu_item_missing';end if;
 if not had or i.section_id<>p_section then select coalesce(max(sort)+1,0) into srt from public.pro_menu_items where section_id=p_section and status<>'archived';
 else srt:=i.sort;end if;
 if not had then
  insert into public.pro_menu_items(id,place_id,section_id,name_es,name_en,description_es,description_en,price_minor,dietary,availability,available_from,available_until,
   photo_url,photo_alt_es,photo_alt_en,sort,status,origin,import_id)
  values(p_id,p_place,p_section,btrim(p->>'nameEs'),public.pro_menu_txt(p,'nameEn'),public.pro_menu_txt(p,'descriptionEs'),public.pro_menu_txt(p,'descriptionEn'),
   (p->>'priceMinor')::bigint,coalesce(array(select jsonb_array_elements_text(p->'dietary')),'{}'),coalesce(p->>'availability','available'),
   public.pro_menu_txt(p,'availableFrom')::time,public.pro_menu_txt(p,'availableUntil')::time,public.pro_menu_txt(p,'photoUrl'),public.pro_menu_txt(p,'photoAltEs'),public.pro_menu_txt(p,'photoAltEn'),
   srt,st,p_origin,p_import) returning * into i;
 else
  update public.pro_menu_items set section_id=p_section,name_es=btrim(p->>'nameEs'),name_en=public.pro_menu_txt(p,'nameEn'),description_es=public.pro_menu_txt(p,'descriptionEs'),
   description_en=public.pro_menu_txt(p,'descriptionEn'),price_minor=(p->>'priceMinor')::bigint,dietary=coalesce(array(select jsonb_array_elements_text(p->'dietary')),'{}'),
   availability=coalesce(p->>'availability','available'),available_from=public.pro_menu_txt(p,'availableFrom')::time,available_until=public.pro_menu_txt(p,'availableUntil')::time,
   photo_url=public.pro_menu_txt(p,'photoUrl'),photo_alt_es=public.pro_menu_txt(p,'photoAltEs'),photo_alt_en=public.pro_menu_txt(p,'photoAltEn'),
   sort=srt,status=st,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into i;
 end if;
 return i;
end $$;

-- Gaps round (2026-11-17): prices the public sees are published only by roles with price.write (company admin or
-- manager; the owner always). A company member with menu.write (role «member») edits the menu and creates DRAFTS, but
-- cannot publish dishes, change the price of a published dish or change the price settings (IVA/service): 42501
-- hint menu_price_role. Owners (p_member null) are never affected.
create or replace function public.pro_menu_price_gate(p_actor uuid,p_member uuid,p_place uuid,p_action text,p_input jsonb) returns void
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;allowed boolean;cur public.pro_menu_items;
begin
 if p_member is null or p_member=p_actor then return;end if;
 r:=public.dir_business_role_of(p_member,p_actor);
 allowed:=public.dir_business_allows(r,'price.write');
 if coalesce(allowed,false) then return;end if;
 if p_action in('items_publish','settings') then raise exception 'Role does not allow publishing prices' using errcode='42501',hint='menu_price_role';end if;
 if p_action='item_create' and coalesce(p_input#>>'{item,status}','draft')='published' then
  raise exception 'Role does not allow publishing prices' using errcode='42501',hint='menu_price_role';end if;
 if p_action='item_update' then
  select * into cur from public.pro_menu_items where id=public.dir_try_uuid(p_input->>'itemId') and place_id=p_place;
  if found and coalesce(p_input#>>'{item,status}','draft')='published' and (cur.status<>'published'
     or cur.price_minor is distinct from (p_input#>>'{item,priceMinor}')::bigint) then
   raise exception 'Role does not allow publishing prices' using errcode='42501',hint='menu_price_role';end if;
 end if;
end $$;

-- Input {action, actionId, placeId, ...} (exact keys per action, mirrored by menuMutationSchema):
--  settings        {revision, pricesIncludeIva, pricesIncludeService, serviceCharge}   revision = settings.revision (0 = none yet)
--  section_create  {sectionId, section}          section_update {sectionId, revision, section}
--  section_archive {sectionId, revision}         sections_reorder {sectionIds}  (every active section, new order)
--  item_create     {itemId, sectionId, item}     item_update {itemId, revision, sectionId, item}
--  item_archive    {itemId, revision}            items_reorder {sectionId, itemIds} (every non-archived item of it)
--  items_publish   {itemIds}                     (draft/published items of this place → published)
create or replace function public.pro_menu_mutate(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;pid uuid;act text:=p_input->>'action';prior jsonb;keys text[];p public.dir_places;s public.pro_menu_settings;
 c public.pro_menu_sections;i public.pro_menu_items;before jsonb;after jsonb;ent text;eid uuid;rev integer;ids uuid[];cur uuid[];n integer;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid menu change' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');pid:=public.dir_try_uuid(p_input->>'placeId');
 keys:=case act
  when 'settings' then array['revision','pricesIncludeIva','pricesIncludeService','serviceCharge']
  when 'section_create' then array['sectionId','section'] when 'section_update' then array['sectionId','revision','section']
  when 'section_archive' then array['sectionId','revision'] when 'sections_reorder' then array['sectionIds']
  when 'item_create' then array['itemId','sectionId','item'] when 'item_update' then array['itemId','revision','sectionId','item']
  when 'item_archive' then array['itemId','revision'] when 'items_reorder' then array['sectionId','itemIds'] when 'items_publish' then array['itemIds'] end;
 if aid is null or pid is null or keys is null
  or (select array_agg(k order by k) from jsonb_object_keys(p_input) k) is distinct from (select array_agg(k order by k) from unnest(keys||array['action','actionId','placeId']) k)
  or (p_input ? 'revision' and (jsonb_typeof(p_input->'revision')<>'number' or (p_input->>'revision')::numeric<>trunc((p_input->>'revision')::numeric) or (p_input->>'revision')::numeric<0)) then
  raise exception 'Invalid menu change' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-menu:'||pid::text,0));
 prior:=public.pro_menu_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 p:=public.pro_menu_authorize(p_actor,p_member,pid,'menu.write');
 perform public.pro_menu_price_gate(p_actor,p_member,pid,act,p_input);
 rev:=(p_input->>'revision')::integer;
 select * into s from public.pro_menu_settings where place_id=pid for update;
 if not found then insert into public.pro_menu_settings(place_id) values(pid) returning * into s;s.revision:=0;end if;

 if act='settings' then
  if jsonb_typeof(p_input->'pricesIncludeIva')<>'boolean' or jsonb_typeof(p_input->'pricesIncludeService')<>'boolean' or jsonb_typeof(p_input->'serviceCharge')<>'boolean'
   or ((p_input->>'pricesIncludeService')::boolean and not (p_input->>'serviceCharge')::boolean) then raise exception 'Invalid menu settings' using errcode='22023';end if;
  if rev<>s.revision then raise exception 'Menu settings changed' using errcode='40001';end if;
  ent:='settings';before:=case when s.revision=0 then null else public.pro_menu_settings_json(s) end;
  update public.pro_menu_settings set prices_include_iva=(p_input->>'pricesIncludeIva')::boolean,prices_include_service=(p_input->>'pricesIncludeService')::boolean,
   service_charge=(p_input->>'serviceCharge')::boolean,service_bps=case when (p_input->>'serviceCharge')::boolean then 1000 else 0 end,
   revision=case when s.revision=0 then 1 else revision+1 end,updated_at=clock_timestamp() where place_id=pid returning * into s;
  after:=public.pro_menu_settings_json(s);rev:=s.revision;

 elsif act in('section_create','section_update') then
  if not public.pro_menu_section_ok(p_input->'section') then raise exception 'Invalid section' using errcode='22023';end if;
  eid:=public.dir_try_uuid(p_input->>'sectionId');if eid is null then raise exception 'Invalid section' using errcode='22023';end if;
  ent:='section';
  if act='section_create' then
   if exists(select 1 from public.pro_menu_sections where id=eid) then raise exception 'Section exists' using errcode='23505';end if;
   if (select count(*) from public.pro_menu_sections where place_id=pid and status='active')>=40 then raise exception 'Too many sections' using errcode='54000',hint='menu_section_cap';end if;
   insert into public.pro_menu_sections(id,place_id,name_es,name_en,description_es,description_en,sort)
   values(eid,pid,btrim(p_input#>>'{section,nameEs}'),public.pro_menu_txt(p_input->'section','nameEn'),public.pro_menu_txt(p_input->'section','descriptionEs'),public.pro_menu_txt(p_input->'section','descriptionEn'),
    (select coalesce(max(sort)+1,0) from public.pro_menu_sections where place_id=pid and status='active')) returning * into c;
  else
   c:=public.pro_menu_section_row(eid,pid,true);before:=to_jsonb(c);
   if rev<>c.revision then raise exception 'Section changed' using errcode='40001';end if;
   update public.pro_menu_sections set name_es=btrim(p_input#>>'{section,nameEs}'),name_en=public.pro_menu_txt(p_input->'section','nameEn'),
    description_es=public.pro_menu_txt(p_input->'section','descriptionEs'),description_en=public.pro_menu_txt(p_input->'section','descriptionEn'),
    revision=revision+1,updated_at=clock_timestamp() where id=eid returning * into c;
  end if;
  after:=to_jsonb(c);rev:=c.revision;

 elsif act='section_archive' then
  eid:=public.dir_try_uuid(p_input->>'sectionId');if eid is null then raise exception 'Invalid section' using errcode='22023';end if;
  c:=public.pro_menu_section_row(eid,pid,true);ent:='section';before:=to_jsonb(c);
  if rev<>c.revision then raise exception 'Section changed' using errcode='40001';end if;
  if exists(select 1 from public.pro_menu_items where section_id=eid and status<>'archived') then raise exception 'Section has items' using errcode='23514',hint='menu_section_not_empty';end if;
  update public.pro_menu_sections set status='archived',revision=revision+1,updated_at=clock_timestamp() where id=eid returning * into c;
  after:=to_jsonb(c);rev:=c.revision;

 elsif act in('sections_reorder','items_reorder','items_publish') then
  if jsonb_typeof(p_input->(case when act='sections_reorder' then 'sectionIds' else 'itemIds' end))<>'array' then raise exception 'Invalid order' using errcode='22023';end if;
  ids:=array(select public.dir_try_uuid(x) from jsonb_array_elements_text(p_input->(case when act='sections_reorder' then 'sectionIds' else 'itemIds' end)) with ordinality t(x,o) order by o);
  if cardinality(ids)=0 or cardinality(ids)>300 or array_position(ids,null) is not null or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Invalid order' using errcode='22023';end if;
  if act='sections_reorder' then
   ent:='settings';cur:=array(select id from public.pro_menu_sections where place_id=pid and status='active' order by sort,created_at for update);
   if (select array_agg(x order by x) from unnest(ids) x) is distinct from (select array_agg(x order by x) from unnest(cur) x) then raise exception 'Menu order changed' using errcode='40001',hint='menu_order_stale';end if;
   before:=to_jsonb(cur);
   update public.pro_menu_sections c2 set sort=o.ord-1,revision=revision+1,updated_at=clock_timestamp() from unnest(ids) with ordinality o(id,ord) where c2.id=o.id and c2.sort<>o.ord-1;
   after:=to_jsonb(ids);
  elsif act='items_reorder' then
   eid:=public.dir_try_uuid(p_input->>'sectionId');if eid is null then raise exception 'Invalid order' using errcode='22023';end if;
   c:=public.pro_menu_section_row(eid,pid,true);ent:='section';
   cur:=array(select id from public.pro_menu_items where section_id=eid and status<>'archived' order by sort,created_at for update);
   if (select array_agg(x order by x) from unnest(ids) x) is distinct from (select array_agg(x order by x) from unnest(cur) x) then raise exception 'Menu order changed' using errcode='40001',hint='menu_order_stale';end if;
   before:=to_jsonb(cur);
   update public.pro_menu_items i2 set sort=o.ord-1,revision=revision+1,updated_at=clock_timestamp() from unnest(ids) with ordinality o(id,ord) where i2.id=o.id and i2.sort<>o.ord-1;
   after:=to_jsonb(ids);
  else
   ent:='item';
   select count(*) into n from public.pro_menu_items where id=any(ids) and place_id=pid and status in('draft','published');
   if n<>cardinality(ids) then raise exception 'Item not found' using errcode='40001',hint='menu_order_stale';end if;
   before:=(select jsonb_agg(jsonb_build_object('id',id,'status',status)) from public.pro_menu_items where id=any(ids) and status='draft');
   update public.pro_menu_items set status='published',revision=revision+1,updated_at=clock_timestamp() where id=any(ids) and status='draft';
   get diagnostics n=row_count;
   after:=jsonb_build_object('published',n,'itemIds',to_jsonb(ids));
  end if;

 elsif act in('item_create','item_update') then
  if not public.pro_menu_item_ok(p_input->'item') then raise exception 'Invalid item' using errcode='22023';end if;
  eid:=public.dir_try_uuid(p_input->>'itemId');if eid is null or public.dir_try_uuid(p_input->>'sectionId') is null then raise exception 'Invalid item' using errcode='22023';end if;
  c:=public.pro_menu_section_row(public.dir_try_uuid(p_input->>'sectionId'),pid,true);ent:='item';
  if act='item_create' then
   if exists(select 1 from public.pro_menu_items where id=eid) then raise exception 'Item exists' using errcode='23505';end if;
   if (select count(*) from public.pro_menu_items where place_id=pid and status<>'archived')>=300 then raise exception 'Too many items' using errcode='54000',hint='menu_item_cap';end if;
  else
   select * into i from public.pro_menu_items where id=eid and place_id=pid and status<>'archived' for update;
   if not found then raise exception 'Item not found' using errcode='P0002',hint='menu_item_missing';end if;
   if rev<>i.revision then raise exception 'Item changed' using errcode='40001';end if;
   before:=to_jsonb(i);
  end if;
  i:=public.pro_menu_item_write(eid,pid,c.id,p_input->'item',coalesce(i.origin,'manual'),i.import_id,false);
  after:=to_jsonb(i);rev:=i.revision;

 elsif act='item_archive' then
  eid:=public.dir_try_uuid(p_input->>'itemId');if eid is null then raise exception 'Invalid item' using errcode='22023';end if;
  select * into i from public.pro_menu_items where id=eid and place_id=pid and status<>'archived' for update;
  if not found then raise exception 'Item not found' using errcode='P0002',hint='menu_item_missing';end if;
  if rev<>i.revision then raise exception 'Item changed' using errcode='40001';end if;
  ent:='item';before:=to_jsonb(i);
  update public.pro_menu_items set status='archived',revision=revision+1,updated_at=clock_timestamp() where id=eid returning * into i;
  after:=to_jsonb(i);rev:=i.revision;
 end if;

 if act<>'settings' then update public.pro_menu_settings set menu_version=menu_version+1,updated_at=clock_timestamp() where place_id=pid returning * into s;
 else update public.pro_menu_settings set menu_version=menu_version+1 where place_id=pid returning * into s;end if;
 insert into public.pro_menu_history(place_id,action_id,actor_id,member_id,action,entity,entity_id,before,after)
 values(pid,aid,p_actor,p_member,act,ent,eid,before,after);
 result:=jsonb_build_object('action',act,'placeId',pid,'id',eid,'revision',rev,'menuVersion',s.menu_version,'settingsRevision',s.revision);
 insert into public.pro_menu_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- menu from photo (draft contract)
-- Input {actionId, draftId, placeId, mode, model, source{sha256,bytes,mime}, ok, extraction|null, error|null}.
-- Stores the suggestion apart; creates NO section or item. An extraction that fails the shape check is stored as
-- failed (invalid_output). Same actionId → same draft.
create or replace function public.pro_menu_import_record(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;did uuid;pid uuid;d public.pro_menu_import_drafts;ok boolean;err text;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','draftId','placeId','mode','model','source','ok','extraction','error'))
  or jsonb_typeof(p_input->'ok')<>'boolean' or coalesce(p_input->>'mode','') not in('mock','sandbox','production')
  or jsonb_typeof(p_input->'model')<>'string' or length(p_input->>'model') not between 1 and 80
  or jsonb_typeof(p_input->'source')<>'object' or exists(select 1 from jsonb_object_keys(p_input->'source') k where k not in('sha256','bytes','mime'))
  or coalesce(p_input#>>'{source,sha256}','')!~'^[a-f0-9]{64}$' or coalesce(p_input#>>'{source,mime}','') not in('image/jpeg','image/png','image/webp')
  or jsonb_typeof(p_input#>'{source,bytes}')<>'number' or (p_input#>>'{source,bytes}')::numeric not between 1 and 5242880 then
  raise exception 'Invalid menu import' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');did:=public.dir_try_uuid(p_input->>'draftId');pid:=public.dir_try_uuid(p_input->>'placeId');
 if aid is null or did is null or pid is null then raise exception 'Invalid menu import' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-menu:'||pid::text,0));
 select * into d from public.pro_menu_import_drafts where actor_id=p_actor and action_id=aid;
 if found then
  if d.id<>did or d.place_id<>pid or d.source is distinct from p_input->'source' then raise exception 'Action id reused' using errcode='22023',hint='menu_action_reused';end if;
  return public.pro_menu_import_json(d)||jsonb_build_object('replayed',true);
 end if;
 perform public.pro_menu_authorize(p_actor,p_member,pid,'menu.write');
 ok:=(p_input->>'ok')::boolean and public.pro_menu_extraction_ok(p_input->'extraction');
 err:=case when ok then null when (p_input->>'ok')::boolean then 'invalid_output' else coalesce(nullif(substring(coalesce(p_input->>'error','') from '^[a-z_]{1,60}$'),''),'provider_failed') end;
 insert into public.pro_menu_import_drafts(id,place_id,actor_id,member_id,action_id,mode,model,source,status,extraction,error)
 values(did,pid,p_actor,p_member,aid,p_input->>'mode',p_input->>'model',p_input->'source',case when ok then 'ready' else 'failed' end,case when ok then p_input->'extraction' end,err) returning * into d;
 insert into public.pro_menu_history(place_id,action_id,actor_id,member_id,action,entity,entity_id,before,after)
 values(pid,aid,p_actor,p_member,'import_record','import',did,null,jsonb_build_object('status',d.status,'mode',d.mode,'error',d.error));
 return public.pro_menu_import_json(d)||jsonb_build_object('replayed',false);
end $$;

-- Input {actionId, placeId, draftId, decision:'discard'} or {actionId, placeId, draftId, decision:'apply', sections:[
--   {sectionId, section?, items:[{itemId, item}]}]}: sectionId = an active section of the place, or a NEW id with
--   `section` (names). Every item is created as DRAFT (an item asking for 'published' is refused): the owner
--   publishes later with items_publish. A draft is reviewed once (40001 menu_import_reviewed).
create or replace function public.pro_menu_import_review(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;did uuid;pid uuid;dec text:=p_input->>'decision';prior jsonb;d public.pro_menu_import_drafts;sec jsonb;it jsonb;sid uuid;iid uuid;
 c public.pro_menu_sections;i public.pro_menu_items;n integer:=0;created jsonb:='[]';result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or dec is null or dec not in('apply','discard')
  or (select array_agg(k order by k) from jsonb_object_keys(p_input) k) is distinct from
     (case when dec='apply' then array['actionId','decision','draftId','placeId','sections'] else array['actionId','decision','draftId','placeId'] end) then
  raise exception 'Invalid menu import review' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');did:=public.dir_try_uuid(p_input->>'draftId');pid:=public.dir_try_uuid(p_input->>'placeId');
 if aid is null or did is null or pid is null then raise exception 'Invalid menu import review' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-menu:'||pid::text,0));
 prior:=public.pro_menu_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 perform public.pro_menu_authorize(p_actor,p_member,pid,'menu.write');
 select * into d from public.pro_menu_import_drafts where id=did and place_id=pid and actor_id=p_actor for update;
 if not found then raise exception 'Import not found' using errcode='P0002';end if;
 if d.review is not null then raise exception 'Import already reviewed' using errcode='40001',hint='menu_import_reviewed';end if;
 if dec='apply' then
  if d.status<>'ready' then raise exception 'Import failed' using errcode='22023',hint='menu_import_failed';end if;
  if jsonb_typeof(p_input->'sections')<>'array' or jsonb_array_length(p_input->'sections') not between 1 and 40 then raise exception 'Invalid menu import review' using errcode='22023';end if;
  if (select count(*) from jsonb_array_elements(p_input->'sections') s,jsonb_array_elements(case when jsonb_typeof(s->'items')='array' then s->'items' else '[]' end) x)
     +(select count(*) from public.pro_menu_items where place_id=pid and status<>'archived')>300 then raise exception 'Too many items' using errcode='54000',hint='menu_item_cap';end if;
  insert into public.pro_menu_settings(place_id) values(pid) on conflict do nothing;
  for sec in select value from jsonb_array_elements(p_input->'sections') loop
   sid:=public.dir_try_uuid(sec->>'sectionId');
   if jsonb_typeof(sec)<>'object' or sid is null or exists(select 1 from jsonb_object_keys(sec) k where k not in('sectionId','section','items'))
    or jsonb_typeof(sec->'items')<>'array' or jsonb_array_length(sec->'items') not between 1 and 150 then raise exception 'Invalid menu import review' using errcode='22023';end if;
   select * into c from public.pro_menu_sections where id=sid;
   if found then
    if c.place_id<>pid or c.status<>'active' or sec ? 'section' then raise exception 'Invalid section' using errcode='22023';end if;
   else
    if not public.pro_menu_section_ok(sec->'section') then raise exception 'Invalid section' using errcode='22023';end if;
    if (select count(*) from public.pro_menu_sections where place_id=pid and status='active')>=40 then raise exception 'Too many sections' using errcode='54000',hint='menu_section_cap';end if;
    insert into public.pro_menu_sections(id,place_id,name_es,name_en,description_es,description_en,sort)
    values(sid,pid,btrim(sec#>>'{section,nameEs}'),public.pro_menu_txt(sec->'section','nameEn'),public.pro_menu_txt(sec->'section','descriptionEs'),public.pro_menu_txt(sec->'section','descriptionEn'),
     (select coalesce(max(sort)+1,0) from public.pro_menu_sections where place_id=pid and status='active')) returning * into c;
    insert into public.pro_menu_history(place_id,action_id,actor_id,member_id,action,entity,entity_id,before,after) values(pid,aid,p_actor,p_member,'import_apply','section',sid,null,to_jsonb(c));
   end if;
   for it in select value from jsonb_array_elements(sec->'items') loop
    iid:=public.dir_try_uuid(it->>'itemId');
    if jsonb_typeof(it)<>'object' or iid is null or exists(select 1 from jsonb_object_keys(it) k where k not in('itemId','item')) or not public.pro_menu_item_ok(it->'item') then
     raise exception 'Invalid item' using errcode='22023';end if;
    if coalesce(it#>>'{item,status}','draft')<>'draft' then raise exception 'Imported items start as drafts' using errcode='22023',hint='menu_import_never_publishes';end if;
    if exists(select 1 from public.pro_menu_items where id=iid) then raise exception 'Item exists' using errcode='23505';end if;
    i:=public.pro_menu_item_write(iid,pid,c.id,it->'item','photo_import',did,true);
    insert into public.pro_menu_history(place_id,action_id,actor_id,member_id,action,entity,entity_id,before,after) values(pid,aid,p_actor,p_member,'import_apply','item',iid,null,to_jsonb(i));
    n:=n+1;created:=created||to_jsonb(iid);
   end loop;
  end loop;
  update public.pro_menu_import_drafts set review='applied',reviewed_at=clock_timestamp(),reviewed_by=coalesce(p_member,p_actor),applied_items=n where id=did returning * into d;
 else
  update public.pro_menu_import_drafts set review='discarded',reviewed_at=clock_timestamp(),reviewed_by=coalesce(p_member,p_actor) where id=did returning * into d;
  insert into public.pro_menu_history(place_id,action_id,actor_id,member_id,action,entity,entity_id,before,after) values(pid,aid,p_actor,p_member,'import_discard','import',did,null,jsonb_build_object('review','discarded'));
 end if;
 update public.pro_menu_settings set menu_version=menu_version+1,updated_at=clock_timestamp() where place_id=pid;
 result:=jsonb_build_object('action','import_'||dec,'placeId',pid,'draftId',did,'review',d.review,'createdItems',created,'published',0);
 insert into public.pro_menu_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- public reader
-- Published, claimed places with the same visibility rules as dir_place_public (licence where the vertical requires it, active
-- vertical). Only published items not marked unavailable; sections without visible items are omitted. No ids,
-- revisions, origins or actors. Prices: as typed (priceMinor) + final price breakdown.
create or replace function public.dir_place_menu_public(p_slug text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.dir_places;s public.pro_menu_settings;secs jsonb;
begin
 if public.dir_place_public(p_slug) is null then return null;end if;
 select * into p from public.dir_places where slug=p_slug;
 if p.status<>'published' or p.vertical_id not in('restaurant','cafe_bar') or p.claim_status not in('claimed','disputed') then return null;end if;
 select * into s from public.pro_menu_settings where place_id=p.id;
 if not found then return null;end if;
 secs:=coalesce((select jsonb_agg(x.j order by x.sort,x.created_at) from (
   select c.sort,c.created_at,jsonb_build_object('nameEs',c.name_es,'nameEn',c.name_en,'descriptionEs',c.description_es,'descriptionEn',c.description_en,
    'items',(select jsonb_agg(public.pro_menu_item_json(i,s) order by i.sort,i.created_at) from public.pro_menu_items i
      where i.section_id=c.id and i.status='published' and i.availability<>'unavailable')) j
   from public.pro_menu_sections c where c.place_id=p.id and c.status='active'
    and exists(select 1 from public.pro_menu_items i where i.section_id=c.id and i.status='published' and i.availability<>'unavailable')) x),'[]');
 return jsonb_build_object('slug',p.slug,'name',p.name,'currency',p.currency,
  'pricing',jsonb_build_object('pricesIncludeIva',s.prices_include_iva,'pricesIncludeService',s.prices_include_service,'serviceCharge',s.service_charge,
   'ivaRateBps',s.iva_bps,'serviceRateBps',case when s.service_charge then s.service_bps else 0 end),
  'sections',secs,'updatedAt',s.updated_at);
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['pro_menu_settings','pro_menu_sections','pro_menu_items','pro_menu_import_drafts','pro_menu_actions','pro_menu_history'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n in('pro_menu_actions','pro_menu_history') then execute format('grant select,insert on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'pro\_menu\_%' or p.proname='dir_place_menu_public') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
