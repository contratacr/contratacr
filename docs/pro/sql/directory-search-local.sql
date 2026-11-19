-- LOCAL PRO ONLY. Multivertical round F6 (2026-11-16): shared directory search and facets.
-- Depends on: directory-core-local.sql (dir_places, dir_place_hours, dir_verticals, dir_normalize),
--             directory-import-local.sql (dir_haversine_km), vehicles-catalog-local.sql (ref_vehicle_*),
--             directory-listings-local.sql (dir_listings, dir_listing_vehicle/property, dir_listing_fuzz).
-- * dir_search(vertical, q, filters, lat, lng, radius_km, sort, cursor, limit): one reader for places
--   (restaurantes, gasolineras, farmacias, supermercados, agencias, lugares) and listings (vehiculos, inmuebles).
--   Listings: published AND reserved (reserved is shown with its status), unexpired, moderation clear/approved.
--   Places: published only, active vertical, and only license_verified when the vertical requires_license (none since
--   the owner decision of 2026-11-17: every pharmacy is shown, with its permit status on the card). Never draft/hidden/removed/
--   suspended/expired. No internal ids, seller ids, revisions, exact listing coordinates or *_private fields.
-- * Text: accent-insensitive (dir_normalize) with a 'simple' tsvector prefix query plus a LIKE fallback over
--   normalised text (no pg_trgm). Text score mirrors textMatchScore in src/lib/directory/ranking.ts.
-- * Geography: bounding box first, then dir_haversine_km. Listings use their public fuzzed coordinates for
--   distance and radius (the exact point is never used, so distances cannot be triangulated).
-- * Sorts relevance | best_rated | distance | price_asc | price_desc | newest, the same keys and tie breaks as
--   compareDirectoryItems (ranking.ts); ties end on the public key ('p:'||slug / 'l:'||code, C collation).
--   Keyset cursor {sort, s:numeric[], k:text}; page 20 by default (max 50). Each item carries ranking_reason codes.
-- * Order only uses text match, locality, client ratings, completeness, listing freshness, distance, price and
--   date. No commercial signal exists in this module (verify-directory-neutrality-dynamic.mjs proves it).
-- * dir_facets: disjunctive counts (each facet ignores its own filter) for the same matching rules.
-- * Place prices (owner decision 2026-11-17: price filters wherever prices apply, never at fuel stations because the
--   fuel price is national and regulated by ARESEP):
--   restaurantes: priceMin/priceMax (whole colones) + price_asc/price_desc on the menu's representative price = the
--     MEDIAN final price (IVA and service included, as the public menu shows it) of the published, not unavailable
--     dishes of a claimed place's published menu. Median, not minimum/average, so one cheap side dish or one
--     expensive special does not decide.
--   farmacias/supermercados: `product` (text or catalogue slug, resolved to ONE price_item: exact slug, else the first
--     result of public_price_search) + priceMin/priceMax + price sorts on that product's current price at each place
--     (best tier: official > business > community_verified > community, newest first; CRC only; never Rx). Without a
--     product, price filters and price sorts are refused (22023): a pharmacy has no single "price".
--   gasolineras, agencias, lugares, vehiculos/inmuebles places: no place price at all.
--   Places without a price are never dropped unless priceMin/priceMax is set; price sorts put them last.
--   The price readers live in directory-price-search-local.sql (they need the menu and price modules); this module
--   only creates no-price stubs when they are missing, so it works on its own and a re-apply keeps the real readers.
-- * 2026-11-17 (owner approval): eleven new place sections (cafes, pulperias, ferreterias, hospedaje, salud,
--   veterinarias, talleres, belleza, gimnasios, tours, bancos; src/lib/directory/place-verticals.ts). They accept a
--   `kind` filter (attributes->>'kind', the subtype; also a facet). Prices: cafes = menu like restaurants; pulperias,
--   ferreterias, veterinarias = product like supermarkets; none for hospedaje, salud (no consultation prices), talleres,
--   belleza, gimnasios, tours and bancos (map points only). 'lugares' covers every place vertical.
-- Functions security invoker, pinned search_path, executable only by service_role (routes call them server-side).
begin;

-- ---------------------------------------------------------------- helpers
-- Mirror of textMatchScore (ranking.ts): 3 exact, 2 prefix, 1.5 whole word, 1 substring or all tokens, 0.5 keyword.
create or replace function public.dir_search_text_score(p_q text,p_name text,p_keywords text[]) returns numeric
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select case when x.q='' then 0::numeric
  when x.n=x.q then 3
  when left(x.n,length(x.q))=x.q then 2
  when position(' '||x.q||' ' in ' '||x.n||' ')>0 then 1.5
  when position(x.q in x.n)>0 then 1
  when position(' ' in x.q)>0 and not exists(select 1 from unnest(string_to_array(x.q,' ')) t where position(t in x.n)=0) then 1
  when exists(select 1 from unnest(coalesce(p_keywords,'{}'::text[])) k where position(x.q in public.dir_normalize(k))>0) then 0.5
  else 0 end
 from (select public.dir_normalize(p_q) q,public.dir_normalize(p_name) n) x $$;

-- Prefix tsquery from normalised tokens ([a-z0-9] only, so the text is always a valid tsquery). Null when empty.
create or replace function public.dir_search_tsquery(p_q text) returns tsquery
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select case when public.dir_normalize(p_q)='' then null else
  to_tsquery('simple'::regconfig,(select string_agg(t||':*',' & ') from unnest(string_to_array(public.dir_normalize(p_q),' ')) t where t<>'')) end $$;

-- Opening state at an instant, in Costa Rica local time (UTC-6, no DST). Weekday 0 = Sunday (dir_place_hours).
-- A slot whose closing time is earlier than its opening time crosses midnight into the next day.
create or replace function public.dir_search_open_at(p_place uuid,p_at timestamptz) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.dir_place_hours h,
   (select (p_at at time zone 'America/Costa_Rica') lt) t
  where h.place_id=p_place and (
   (h.weekday=extract(dow from t.lt)::int and ((h.opens<h.closes and t.lt::time>=h.opens and t.lt::time<h.closes) or (h.opens>h.closes and t.lt::time>=h.opens)))
   or (h.weekday=(extract(dow from t.lt)::int+6)%7 and h.opens>h.closes and t.lt::time<h.closes))) $$;

-- Open 24 hours: attribute open24h, or all seven days with a 00:00 slot that closes at 23:59 or later.
create or replace function public.dir_search_is_24h(p_place uuid,p_attributes jsonb) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(p_attributes->>'open24h','')='true'
  or (select count(distinct h.weekday) from public.dir_place_hours h where h.place_id=p_place and h.opens='00:00' and h.closes>='23:59')=7 $$;

-- Filter value as a text list: a string or an array of strings (1..20); anything else raises 22023.
create or replace function public.dir_search_list(p_filters jsonb,p_key text) returns text[]
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v jsonb:=p_filters->p_key;out text[];
begin
 if v is null or jsonb_typeof(v)='null' then return null;end if;
 if jsonb_typeof(v)='string' then out:=array[btrim(v#>>'{}')];
 elsif jsonb_typeof(v)='array' and jsonb_array_length(v) between 1 and 20
  and not exists(select 1 from jsonb_array_elements(v) e where jsonb_typeof(e)<>'string') then
  select array_agg(btrim(e#>>'{}')) into out from jsonb_array_elements(v) e;
 else raise exception 'Invalid search filter %',p_key using errcode='22023',hint='dir_search_filter';end if;
 if exists(select 1 from unnest(out) x where length(x) not between 1 and 80) then
  raise exception 'Invalid search filter %',p_key using errcode='22023',hint='dir_search_filter';end if;
 return out;
end $$;

create or replace function public.dir_search_num(p_filters jsonb,p_key text,p_min numeric,p_max numeric) returns numeric
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v jsonb:=p_filters->p_key;n numeric;
begin
 if v is null or jsonb_typeof(v)='null' then return null;end if;
 if jsonb_typeof(v)<>'number' then raise exception 'Invalid search filter %',p_key using errcode='22023',hint='dir_search_filter';end if;
 n:=(v#>>'{}')::numeric;
 if n<p_min or n>p_max then raise exception 'Invalid search filter %',p_key using errcode='22023',hint='dir_search_filter';end if;
 return n;
end $$;

create or replace function public.dir_search_bool(p_filters jsonb,p_key text) returns boolean
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v jsonb:=p_filters->p_key;
begin
 if v is null or jsonb_typeof(v)='null' then return null;end if;
 if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid search filter %',p_key using errcode='22023',hint='dir_search_filter';end if;
 return (v#>>'{}')::boolean;
end $$;

-- Vertical name → kind and place verticals. 'agencias' = vehicle dealers and real estate agencies; 'lugares' = all.
create or replace function public.dir_search_place_verticals(p_vertical text) returns text[]
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select case p_vertical when 'restaurantes' then array['restaurant'] when 'gasolineras' then array['fuel']
  when 'farmacias' then array['pharmacy'] when 'supermercados' then array['grocery']
  when 'agencias' then array['vehicle_dealer','real_estate']
  when 'cafes' then array['cafe_bar'] when 'pulperias' then array['convenience'] when 'ferreterias' then array['hardware']
  when 'hospedaje' then array['lodging'] when 'salud' then array['health'] when 'veterinarias' then array['vet_pets']
  when 'talleres' then array['auto_services'] when 'belleza' then array['beauty'] when 'gimnasios' then array['fitness']
  when 'tours' then array['tours'] when 'bancos' then array['banking']
  when 'lugares' then array['restaurant','fuel','pharmacy','grocery','vehicle_dealer','real_estate','cafe_bar','convenience','hardware','lodging',
   'health','vet_pets','auto_services','beauty','fitness','tours','banking'] end $$;

-- ---------------------------------------------------------------- place prices
-- Which kind of price a place section can be filtered/sorted by: 'menu', 'product' or null (no price, e.g. fuel).
create or replace function public.dir_search_price_mode(p_vertical text) returns text
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select case p_vertical when 'restaurantes' then 'menu' when 'cafes' then 'menu'
  when 'farmacias' then 'product' when 'supermercados' then 'product' when 'pulperias' then 'product' when 'ferreterias' then 'product' when 'veterinarias' then 'product' end $$;

-- Validated price range of a place search: array[min,max] in whole colones (nulls when absent). 22023 when the section
-- has no prices, when a product section gets a range without a product, or when min > max.
create or replace function public.dir_search_price_bounds(p_vertical text,p_filters jsonb) returns numeric[]
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare mode text:=public.dir_search_price_mode(p_vertical);pmin numeric:=public.dir_search_num(p_filters,'priceMin',0,1e9);pmax numeric:=public.dir_search_num(p_filters,'priceMax',0,1e9);
begin
 if (pmin is not null or pmax is not null) and (mode is null or (mode='product' and nullif(btrim(coalesce(p_filters->>'product','')),'') is null)) then
  raise exception 'Price filter not available' using errcode='22023',hint='dir_search_filter';end if;
 if pmin>pmax then raise exception 'Invalid price range' using errcode='22023',hint='dir_search_filter';end if;
 return array[pmin,pmax];
end $$;

-- dir_search_price_product(vertical, product) → {slug,name,presentation,brand,unitBase,unitQty} | null and
-- dir_search_place_prices(vertical, item) → (place_id, price in céntimos like listings' price_crc_norm, public card detail)
-- are implemented in directory-price-search-local.sql (price catalogue, observations and menus). Here they are only
-- created as no-price stubs WHEN MISSING, so this module works on its own and re-applying it never replaces the real
-- readers (plain `create function` inside the guard: the drift check only tracks `create or replace`).
do $guard$begin
 if to_regprocedure('public.dir_search_price_product(text,text)') is null then
  create function public.dir_search_price_product(p_vertical text,p_product text) returns jsonb
  language sql stable security invoker set search_path=public,pg_temp as $$ select null::jsonb $$;
 end if;
 if to_regprocedure('public.dir_search_place_prices(text,text)') is null then
  create function public.dir_search_place_prices(p_vertical text,p_item_slug text) returns table(place_id uuid,price numeric,info jsonb)
  language sql stable security invoker set search_path=public,pg_temp as $$ select null::uuid,null::numeric,null::jsonb where false $$;
 end if;
end$guard$;

-- ---------------------------------------------------------------- candidates (shared by search and facets)
create or replace function public.dir_search_candidates(p_vertical text,p_q text,p_filters jsonb,p_lat double precision,p_lng double precision,p_radius_km double precision)
returns table(kind text,key text,card jsonb,text_score numeric,loc_rank integer,rating_avg numeric,rating_count integer,verified boolean,
 completeness numeric,fresh integer,created_at timestamptz,updated_at timestamptz,price numeric,distance_km numeric,
 f_vertical text,f_province text,f_canton text,f_type text,f_make text,f_make_name text,f_fuel text,f_transmission text,f_condition text,
 f_operation text,f_year integer,f_bedrooms integer,f_price numeric,f_open_now boolean,f_open24h boolean,f_status text)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
#variable_conflict use_column
declare f jsonb:=coalesce(p_filters,'{}'::jsonb);q text:=public.dir_normalize(p_q);tsq tsquery;pv text[];allowed text[];k text;
 dlat double precision;dlng double precision;r double precision:=p_radius_km;
 fv text[];prov text;cant text;dist text;open_now boolean;open24 boolean;pb numeric[];product text;item_slug text;kinds text[];
 types text[];makes text[];models text[];fuels text[];trans text[];conds text[];ops text[];
 ymin numeric;ymax numeric;pmin numeric;pmax numeric;kmax numeric;bmin numeric;m2min numeric;m2max numeric;
begin
 if jsonb_typeof(f)<>'object' or length(coalesce(p_q,''))>100 then raise exception 'Invalid search' using errcode='22023',hint='dir_search_input';end if;
 if p_vertical is null or (p_vertical not in('vehiculos','inmuebles') and public.dir_search_place_verticals(p_vertical) is null) then
  raise exception 'Unknown search vertical' using errcode='22023',hint='dir_search_vertical';end if;
 if (p_lat is null)<>(p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
  raise exception 'Invalid search location' using errcode='22023',hint='dir_search_location';end if;
 if r is not null and (p_lat is null or r<0.1 or r>100) then raise exception 'Invalid search radius' using errcode='22023',hint='dir_search_location';end if;
 allowed:=case p_vertical
  when 'vehiculos' then array['type','make','model','yearMin','yearMax','priceMin','priceMax','kmMax','fuel','transmission','condition','province','canton']
  when 'inmuebles' then array['operation','type','priceMin','priceMax','bedroomsMin','m2Min','m2Max','province','canton','district']
  when 'restaurantes' then array['vertical','province','canton','district','openNow','open24h','priceMin','priceMax']
  when 'farmacias' then array['vertical','province','canton','district','openNow','open24h','product','priceMin','priceMax']
  when 'supermercados' then array['vertical','province','canton','district','openNow','open24h','product','priceMin','priceMax']
  when 'cafes' then array['vertical','province','canton','district','openNow','open24h','kind','priceMin','priceMax']
  when 'pulperias' then array['vertical','province','canton','district','openNow','open24h','kind','product','priceMin','priceMax']
  when 'ferreterias' then array['vertical','province','canton','district','openNow','open24h','kind','product','priceMin','priceMax']
  when 'veterinarias' then array['vertical','province','canton','district','openNow','open24h','kind','product','priceMin','priceMax']
  when 'hospedaje' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'salud' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'talleres' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'belleza' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'gimnasios' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'tours' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'bancos' then array['vertical','province','canton','district','openNow','open24h','kind']
  else array['vertical','province','canton','district','openNow','open24h'] end;
 for k in select jsonb_object_keys(f) loop
  if not k=any(allowed) then raise exception 'Unknown search filter %',k using errcode='22023',hint='dir_search_filter';end if;
 end loop;
 tsq:=public.dir_search_tsquery(p_q);
 prov:=nullif(public.dir_normalize((public.dir_search_list(f,'province'))[1]),'');
 cant:=nullif(public.dir_normalize((public.dir_search_list(f,'canton'))[1]),'');
 dist:=nullif(public.dir_normalize((public.dir_search_list(f,'district'))[1]),'');
 if r is not null then dlat:=(r+0.5)/111.32;dlng:=(r+0.5)/(111.32*greatest(cos(radians(p_lat)),0.01));end if;

 if p_vertical not in('vehiculos','inmuebles') then
  pv:=public.dir_search_place_verticals(p_vertical);fv:=public.dir_search_list(f,'vertical');
  if fv is not null then
   if exists(select 1 from unnest(fv) x where not x=any(pv)) then raise exception 'Invalid search filter vertical' using errcode='22023',hint='dir_search_filter';end if;
   pv:=fv;end if;
  open_now:=public.dir_search_bool(f,'openNow');open24:=public.dir_search_bool(f,'open24h');
  kinds:=public.dir_search_list(f,'kind');
  if kinds is not null and exists(select 1 from unnest(kinds) x where x!~'^[a-z_]{2,30}$') then raise exception 'Invalid search filter kind' using errcode='22023',hint='dir_search_filter';end if;
  pb:=public.dir_search_price_bounds(p_vertical,f);
  product:=(public.dir_search_list(f,'product'))[1];
  if product is not null and length(product)<2 then raise exception 'Invalid search filter product' using errcode='22023',hint='dir_search_filter';end if;
  if product is not null then item_slug:=public.dir_search_price_product(p_vertical,product)->>'slug';end if;
  return query
  with prices as(
   select x.place_id,x.price,x.info from public.dir_search_place_prices(
    case public.dir_search_price_mode(p_vertical) when 'menu' then p_vertical when 'product' then case when item_slug is not null then p_vertical end end,item_slug) x
  ),base as(
   select p.*,v.name_es v_name_es,v.name_en v_name_en,v.path_es v_path_es,v.path_en v_path_en,
    array_remove(array[v.name_es,v.name_en,p.locality,p.admin_area_2,p.attributes->>'brand',p.attributes->>'chain']
     ||coalesce((select array_agg(c) from jsonb_array_elements_text(case when jsonb_typeof(p.attributes->'cuisines')='array' then p.attributes->'cuisines' else '[]'::jsonb end) c),'{}'::text[]),null) kw,
    case when p_lat is null or p.lat is null then null else round(public.dir_haversine_km(p_lat,p_lng,p.lat::double precision,p.lng::double precision)::numeric,3) end dkm,
    pr.price pr_price,pr.info pr_info
   from public.dir_places p join public.dir_verticals v on v.id=p.vertical_id
   left join prices pr on pr.place_id=p.id
   where p.status='published' and v.active and p.vertical_id=any(pv)
    and (pb[1] is null or pr.price>=pb[1]*100) and (pb[2] is null or pr.price<=pb[2]*100)
    and (not v.requires_license or p.verification_level='license_verified')
    and (prov is null or public.dir_normalize(p.admin_area_1)=prov)
    and (cant is null or public.dir_normalize(p.admin_area_2)=cant)
    and (dist is null or public.dir_normalize(p.admin_area_3)=dist)
    and (kinds is null or p.attributes->>'kind'=any(kinds))
    and (r is null or (p.lat between p_lat-dlat and p_lat+dlat and p.lng between p_lng-dlng and p_lng+dlng))
  ),scored as(
   select b.*,public.dir_search_text_score(p_q,b.name,b.kw) ts,
    public.dir_search_is_24h(b.id,b.attributes) is24,
    case when public.dir_search_is_24h(b.id,b.attributes) then true
     when exists(select 1 from public.dir_place_hours h where h.place_id=b.id) then public.dir_search_open_at(b.id,now()) end isopen,
    round(((b.address_line is not null)::int+(b.phone is not null)::int+(b.website is not null)::int
     +exists(select 1 from public.dir_place_hours h where h.place_id=b.id)::int
     +exists(select 1 from public.dir_place_media m where m.place_id=b.id and m.status='active')::int
     +(b.location_precision in('exact','street'))::int)/6.0,4) compl
   from base b
   where (r is null or b.dkm<=r)
    and (q='' or public.dir_search_text_score(p_q,b.name,b.kw)>0 or b.search_tsv@@tsq
     or (b.name_normalized||' '||public.dir_normalize(array_to_string(b.kw,' '))) like '%'||q||'%')
  )
  select 'place'::text,'p:'||s.slug,
   jsonb_build_object('kind','place','key','p:'||s.slug,'slug',s.slug,'name',s.name,'status',s.status,
    'vertical',jsonb_build_object('id',s.vertical_id,'nameEs',s.v_name_es,'nameEn',s.v_name_en,'pathEs',s.v_path_es,'pathEn',s.v_path_en),
    -- Launch polish (2026-11-18): the card shows the public street address and phone when the place has them.
    'address',jsonb_build_object('adminArea1',s.admin_area_1,'adminArea2',s.admin_area_2,'adminArea3',s.admin_area_3,'locality',s.locality,'line',s.address_line),
    'phone',s.phone,
    'location',case when s.lat is null then null else jsonb_build_object('lat',s.lat,'lng',s.lng,'precision',s.location_precision) end,
    'rating',jsonb_build_object('average',s.rating_avg,'count',s.rating_count),
    'verificationLevel',s.verification_level,'openNow',s.isopen,'open24h',s.is24,
    'attributes',s.attributes-'licenseNumber','keywords',to_jsonb(s.kw),'price',s.pr_info),
   s.ts,
   case when dist is not null and public.dir_normalize(s.admin_area_3)=dist and (cant is null or public.dir_normalize(s.admin_area_2)=cant) then 3
    when cant is not null and public.dir_normalize(s.admin_area_2)=cant and (prov is null or public.dir_normalize(s.admin_area_1)=prov) then 2
    when prov is not null and public.dir_normalize(s.admin_area_1)=prov then 1 else 0 end,
   s.rating_avg,s.rating_count,s.verification_level in('verified','license_verified'),s.compl,0,s.created_at,s.updated_at,s.pr_price,s.dkm,
   s.vertical_id,s.admin_area_1,s.admin_area_2,s.attributes->>'kind',null::text,null::text,null::text,null::text,null::text,null::text,null::integer,null::integer,s.pr_price,
   coalesce(s.isopen,false),s.is24,s.status
  from scored s
  where (open_now is null or coalesce(s.isopen,false)=open_now) and (open24 is null or s.is24=open24);
  return;
 end if;

 -- listings
 types:=public.dir_search_list(f,'type');makes:=public.dir_search_list(f,'make');models:=public.dir_search_list(f,'model');
 fuels:=public.dir_search_list(f,'fuel');trans:=public.dir_search_list(f,'transmission');conds:=public.dir_search_list(f,'condition');
 ops:=public.dir_search_list(f,'operation');
 ymin:=public.dir_search_num(f,'yearMin',1900,2100);ymax:=public.dir_search_num(f,'yearMax',1900,2100);
 -- Prices in whole colones (compared with price_crc_norm, stored in céntimos).
 pmin:=public.dir_search_num(f,'priceMin',0,1e15);pmax:=public.dir_search_num(f,'priceMax',0,1e15);
 kmax:=public.dir_search_num(f,'kmMax',0,2000000);bmin:=public.dir_search_num(f,'bedroomsMin',0,50);
 m2min:=public.dir_search_num(f,'m2Min',0,1e11);m2max:=public.dir_search_num(f,'m2Max',0,1e11);
 return query
 with base as(
  select l.*,fz.lat flat,fz.lng flng,
   v.vehicle_type,v.version,v.year,v.condition,v.mileage_km,v.transmission,v.fuel,v.drivetrain,v.color,
   mk.slug make_slug,mk.name make_name,md.slug model_slug,md.name model_name,
   pr.operation,pr.property_type,pr.bedrooms,pr.bathrooms,pr.parking_spaces,pr.built_m2,pr.lot_m2,pr.year_built,pr.furnished,pr.pets_allowed,pr.amenities,
   case when pl.status in('published','closed_permanently') then pl.slug end place_slug,
   case when pl.status in('published','closed_permanently') then pl.name end place_name,
   (l.seller_kind='business' and coalesce(sl.business_verified,false)) seller_ok,
   array_remove(array[mk.name,md.name,v.version,l.locality,l.admin_area_2],null) kw
  from public.dir_listings l
  left join public.dir_listing_vehicle v on v.listing_id=l.id
  left join public.ref_vehicle_makes mk on mk.id=v.make_id
  left join public.ref_vehicle_models md on md.id=v.model_id
  left join public.dir_listing_property pr on pr.listing_id=l.id
  left join public.dir_places pl on pl.id=l.place_id
  left join public.dir_listing_sellers sl on sl.profile_id=l.seller_profile_id
  cross join lateral public.dir_listing_fuzz(l.id,l.lat,l.lng) fz
  where l.vertical=p_vertical and l.status in('published','reserved') and l.moderation_status in('clear','approved') and l.expires_at>now()
   and ((p_vertical='vehiculos' and v.listing_id is not null) or (p_vertical='inmuebles' and pr.listing_id is not null))
   and (prov is null or public.dir_normalize(l.admin_area_1)=prov)
   and (cant is null or public.dir_normalize(l.admin_area_2)=cant)
   and (dist is null or public.dir_normalize(l.admin_area_3)=dist)
   and (pmin is null or l.price_crc_norm>=pmin*100) and (pmax is null or l.price_crc_norm<=pmax*100)
   and (r is null or (l.lat between p_lat-dlat and p_lat+dlat and l.lng between p_lng-dlng and p_lng+dlng))
   and (types is null or coalesce(v.vehicle_type,pr.property_type)=any(types))
   and (makes is null or mk.slug=any(makes)) and (models is null or md.slug=any(models))
   and (ymin is null or v.year>=ymin) and (ymax is null or v.year<=ymax) and (kmax is null or v.mileage_km<=kmax)
   and (fuels is null or v.fuel=any(fuels)) and (trans is null or v.transmission=any(trans)) and (conds is null or v.condition=any(conds))
   and (ops is null or pr.operation=any(ops)) and (bmin is null or pr.bedrooms>=bmin)
   and (m2min is null or coalesce(pr.built_m2,pr.lot_m2)>=m2min) and (m2max is null or coalesce(pr.built_m2,pr.lot_m2)<=m2max)
 ),scored as(
  select b.*,public.dir_search_text_score(p_q,b.title,b.kw) ts,
   case when p_lat is null or b.flat is null then null else round(public.dir_haversine_km(p_lat,p_lng,b.flat::double precision,b.flng::double precision)::numeric,3) end dkm,
   round(case when b.vertical='vehiculos' then ((b.version is not null)::int+(b.mileage_km is not null)::int+(b.transmission is not null)::int
     +(b.fuel is not null)::int+(b.drivetrain is not null)::int+(b.color is not null)::int)/6.0
    else ((b.bedrooms is not null)::int+(b.bathrooms is not null)::int+(b.parking_spaces is not null)::int
     +(coalesce(b.built_m2,b.lot_m2) is not null)::int+(b.year_built is not null)::int+(cardinality(b.amenities)>0)::int)/6.0 end,4) compl,
   -- Freshness from the publication date only (editing never bumps a listing; ranking.ts freshnessBucket).
   case when now()-b.published_at<=interval '7 days' then 3 when now()-b.published_at<=interval '30 days' then 2
    when now()-b.published_at<=interval '90 days' then 1 else 0 end fr
  from base b
  where q='' or public.dir_search_text_score(p_q,b.title,b.kw)>0
   or to_tsvector('simple'::regconfig,public.dir_normalize(b.title||' '||array_to_string(b.kw,' ')))@@tsq
   or public.dir_normalize(b.title||' '||array_to_string(b.kw,' ')) like '%'||q||'%'
 )
 select 'listing'::text,'l:'||s.public_code,
  jsonb_build_object('kind','listing','key','l:'||s.public_code,'code',s.public_code,'vertical',s.vertical,'status',s.status,'title',s.title,
   'sellerKind',s.seller_kind,'sellerBusinessVerified',s.seller_ok,'placeSlug',s.place_slug,'placeName',s.place_name,
   'price',jsonb_build_object('minor',s.price_minor,'currency',s.currency,'crcNorm',s.price_crc_norm,'fxRateDate',s.fx_rate_date),
   'address',jsonb_build_object('adminArea1',s.admin_area_1,'adminArea2',s.admin_area_2,'adminArea3',s.admin_area_3,'locality',s.locality),
   'approxLocation',case when s.flat is null then null else jsonb_build_object('lat',s.flat,'lng',s.flng,'radiusM',500) end,
   'publishedAt',s.published_at,'keywords',to_jsonb(s.kw),
   'vehicle',case when s.vertical='vehiculos' then jsonb_build_object('makeSlug',s.make_slug,'makeName',s.make_name,'modelSlug',s.model_slug,'modelName',s.model_name,
     'type',s.vehicle_type,'version',s.version,'year',s.year,'condition',s.condition,'mileageKm',s.mileage_km,'transmission',s.transmission,'fuel',s.fuel,'drivetrain',s.drivetrain) end,
   'property',case when s.vertical='inmuebles' then jsonb_build_object('operation',s.operation,'type',s.property_type,'bedrooms',s.bedrooms,'bathrooms',s.bathrooms,
     'parkingSpaces',s.parking_spaces,'builtM2',s.built_m2,'lotM2',s.lot_m2,'furnished',s.furnished,'petsAllowed',s.pets_allowed) end),
  s.ts,
  case when dist is not null and public.dir_normalize(s.admin_area_3)=dist and (cant is null or public.dir_normalize(s.admin_area_2)=cant) then 3
   when cant is not null and public.dir_normalize(s.admin_area_2)=cant and (prov is null or public.dir_normalize(s.admin_area_1)=prov) then 2
   when prov is not null and public.dir_normalize(s.admin_area_1)=prov then 1 else 0 end,
  null::numeric,0,s.seller_ok,s.compl,s.fr,s.published_at,s.updated_at,s.price_crc_norm::numeric,s.dkm,
  s.vertical,s.admin_area_1,s.admin_area_2,coalesce(s.vehicle_type,s.property_type),s.make_slug,s.make_name,s.fuel,s.transmission,s.condition,
  s.operation,s.year::integer,s.bedrooms::integer,s.price_crc_norm::numeric,null::boolean,null::boolean,s.status
 from scored s
 where r is null or s.dkm<=r;
end $$;

-- ---------------------------------------------------------------- search
-- Sort keys are ascending numeric arrays (descending signals negated, nulls mapped last) + public key, so the
-- keyset cursor is a plain row comparison. Credible rating = (avg*count + 4*3)/(count+3), as compareByRating.
create or replace function public.dir_search(p_vertical text,p_q text default null,p_filters jsonb default '{}'::jsonb,
 p_lat double precision default null,p_lng double precision default null,p_radius_km double precision default null,
 p_sort text default 'relevance',p_cursor jsonb default null,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare srt text:=coalesce(p_sort,'relevance');lim integer:=coalesce(p_limit,20);cs numeric[];ck text;res jsonb;n integer;nxt jsonb;
begin
 if srt not in('relevance','best_rated','distance','price_asc','price_desc','newest') then raise exception 'Unknown sort' using errcode='22023',hint='dir_search_sort';end if;
 if lim not between 1 and 50 then raise exception 'Invalid page size' using errcode='22023',hint='dir_search_input';end if;
 if srt='distance' and p_lat is null then raise exception 'Distance needs a location' using errcode='22023',hint='dir_search_location';end if;
 -- Price sorts: listings, restaurants (menu median) and pharmacies/supermarkets WITH a product. Never fuel stations.
 if srt in('price_asc','price_desc') and p_vertical not in('vehiculos','inmuebles') and (public.dir_search_price_mode(p_vertical) is null
  or (public.dir_search_price_mode(p_vertical)='product' and nullif(btrim(coalesce(p_filters->>'product','')),'') is null)) then
  raise exception 'This section has no price order' using errcode='22023',hint='dir_search_sort';end if;
 if p_cursor is not null and jsonb_typeof(p_cursor)<>'null' then
  begin
   if jsonb_typeof(p_cursor)<>'object' or p_cursor->>'sort' is distinct from srt or jsonb_typeof(p_cursor->'s')<>'array'
    or jsonb_typeof(p_cursor->'k')<>'string' or length(p_cursor->>'k')>90 then raise exception 'bad';end if;
   select array_agg(e::text::numeric order by o) into cs from jsonb_array_elements(p_cursor->'s') with ordinality a(e,o);
   ck:=p_cursor->>'k';
  exception when others then raise exception 'Invalid cursor' using errcode='22023',hint='dir_search_cursor';end;
 end if;
 with c as(select * from public.dir_search_candidates(p_vertical,p_q,p_filters,p_lat,p_lng,p_radius_km)),
 k as(
  select c.*,round((least(5,greatest(0,coalesce(c.rating_avg,0)))*c.rating_count+12)/(c.rating_count+3.0),10) cred,
   (c.verified)::int ver,floor(extract(epoch from c.created_at)*1000) ms
  from c),
 s as(
  select k.*,case srt
   when 'relevance' then array[-k.text_score,-k.loc_rank,-k.cred,-k.rating_count,-k.ver,-k.completeness,-k.fresh]
   when 'best_rated' then array[-k.cred,-k.rating_count,-k.ver]
   when 'distance' then array[(k.distance_km is null)::int,coalesce(k.distance_km,0),-k.cred,-k.rating_count,-k.ver]
   when 'price_asc' then array[(k.price is null)::int,coalesce(k.price,0),-k.cred,-k.rating_count,-k.ver]
   when 'price_desc' then array[(k.price is null)::int,-coalesce(k.price,0),-k.cred,-k.rating_count,-k.ver]
   else array[-coalesce(k.ms,0)] end::numeric[] sk
  from k),
 page as(
  select s.* from s
  where cs is null or (s.sk,s.key collate "C")>(cs,ck collate "C")
  order by s.sk,s.key collate "C" limit lim+1),
 numbered as(select page.*,row_number() over(order by page.sk,page.key collate "C") rn from page)
 select coalesce(jsonb_agg(
   numbered.card||jsonb_build_object('distanceKm',numbered.distance_km,
    'signals',jsonb_build_object('textScore',numbered.text_score,'localityRank',numbered.loc_rank,'ratingAvg',numbered.rating_avg,
     'reviewCount',numbered.rating_count,'verificationStatus',case when numbered.verified then 'verified' end,'completeness',numbered.completeness,
     'freshness',numbered.fresh,'createdAt',numbered.created_at,'updatedAt',numbered.updated_at,'priceCrcNorm',numbered.price),
    'ranking_reason',to_jsonb(array_remove(array[
      case when numbered.text_score>=3 then 'text_exact' when numbered.text_score>=2 then 'text_prefix' when numbered.text_score>=1.5 then 'text_word'
       when numbered.text_score>=1 then 'text_partial' when numbered.text_score>0 then 'text_keyword' end,
      case numbered.loc_rank when 3 then 'locality_district' when 2 then 'locality_canton' when 1 then 'locality_province' end,
      case when numbered.rating_count>=3 then 'rating_credible' end,
      case when numbered.verified then 'verified' end,
      case when numbered.completeness>=0.8 then 'profile_complete' end,
      case when numbered.fresh>=2 then 'fresh_listing' end,
      case when srt='distance' and numbered.distance_km is not null then 'distance' end,
      case when srt='price_asc' then case when numbered.price is null then 'price_missing' else 'price_asc' end
       when srt='price_desc' then case when numbered.price is null then 'price_missing' else 'price_desc' end end,
      case when srt='newest' then 'newest' end,
      case when srt='best_rated' then 'sort_rating' end],null)),
    '_cursor',jsonb_build_object('sort',srt,'s',to_jsonb(numbered.sk),'k',numbered.key))
   order by numbered.rn) filter(where numbered.rn<=lim),'[]'::jsonb),count(*)
 into res,n from numbered;
 -- Empty ranking_reason means only the id tie break decided (mirrors reasons() in ranking.ts).
 select coalesce(jsonb_agg(case when jsonb_array_length(e->'ranking_reason')=0 then jsonb_set(e,'{ranking_reason}','["id_tiebreak"]') else e end order by o),'[]')
  into res from jsonb_array_elements(res) with ordinality a(e,o);
 nxt:=case when n>lim then res->(jsonb_array_length(res)-1)->'_cursor' end;
 select coalesce(jsonb_agg(e-'_cursor' order by o),'[]') into res from jsonb_array_elements(res) with ordinality a(e,o);
 return jsonb_build_object('vertical',p_vertical,'sort',srt,'items',res,'nextCursor',nxt,
  'priceProduct',case when public.dir_search_price_mode(p_vertical)='product' and jsonb_typeof(p_filters->'product')='string'
   then public.dir_search_price_product(p_vertical,btrim(p_filters->>'product')) end);
end $$;

-- ---------------------------------------------------------------- facets
-- Disjunctive counts: every facet is computed with its own filter removed, so a person can widen a choice.
create or replace function public.dir_facets(p_vertical text,p_q text default null,p_filters jsonb default '{}'::jsonb,
 p_lat double precision default null,p_lng double precision default null,p_radius_km double precision default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f jsonb:=coalesce(p_filters,'{}'::jsonb);out jsonb:='{}';total integer;pv text[];fv text[];prov text;cant text;open_now boolean;open24 boolean;
 pb numeric[];priced boolean:=public.dir_search_price_mode(p_vertical) is not null;kinds text[];
begin
 -- Places (thousands of imported rows): ONE candidate pass without the facet filters, then every disjunctive count is a
 -- filter over that set (same rules as dir_search_candidates: normalized province/canton, vertical list, open flags).
 -- A district filter keeps the generic path below (district is not a candidate column).
 if p_vertical not in('vehiculos','inmuebles') and jsonb_typeof(f)='object' and not f ? 'district' then
  pv:=public.dir_search_place_verticals(p_vertical);fv:=public.dir_search_list(f,'vertical');
  if pv is not null and fv is not null and exists(select 1 from unnest(fv) x where not x=any(pv)) then raise exception 'Invalid search filter vertical' using errcode='22023',hint='dir_search_filter';end if;
  prov:=nullif(public.dir_normalize((public.dir_search_list(f,'province'))[1]),'');
  cant:=nullif(public.dir_normalize((public.dir_search_list(f,'canton'))[1]),'');
  open_now:=public.dir_search_bool(f,'openNow');open24:=public.dir_search_bool(f,'open24h');
  kinds:=public.dir_search_list(f,'kind');
  pb:=public.dir_search_price_bounds(p_vertical,f);
  -- The price range is a disjunctive facet too: the candidate pass keeps `product` but not priceMin/priceMax.
  with c as materialized(
   select x.f_province,x.f_canton,x.f_vertical,x.f_open_now,x.f_open24h,x.f_price,x.f_type,
    (prov is null or public.dir_normalize(x.f_province)=prov) okp,(cant is null or public.dir_normalize(x.f_canton)=cant) okc,
    (fv is null or x.f_vertical=any(fv)) okv,(open_now is null or coalesce(x.f_open_now,false)=open_now) oko,(open24 is null or x.f_open24h=open24) ok24,
    ((pb[1] is null or x.f_price>=pb[1]*100) and (pb[2] is null or x.f_price<=pb[2]*100)) is true okpr,
    (kinds is null or x.f_type=any(kinds)) okk
   from public.dir_search_candidates(p_vertical,p_q,f-'province'-'canton'-'vertical'-'openNow'-'open24h'-'priceMin'-'priceMax'-'kind',p_lat,p_lng,p_radius_km) x)
  select (select count(*) from c where okp and okc and okv and oko and ok24 and okpr and okk),
   jsonb_build_object(
    'province',(select coalesce(jsonb_agg(jsonb_build_object('value',z.v,'count',z.n) order by z.n desc,z.v),'[]') from
      (select c.f_province v,count(*) n from c where okv and oko and ok24 and okpr and okk and c.f_province is not null group by 1) z),
    'canton',(select coalesce(jsonb_agg(jsonb_build_object('value',z.v,'count',z.n) order by z.n desc,z.v),'[]') from
      (select c.f_canton v,count(*) n from c where okp and okv and oko and ok24 and okpr and okk and c.f_canton is not null group by 1 order by 2 desc,1 limit 50) z),
    'vertical',(select coalesce(jsonb_agg(jsonb_build_object('value',z.v,'count',z.n) order by z.n desc,z.v),'[]') from
      (select c.f_vertical v,count(*) n from c where okp and okc and oko and ok24 and okpr and okk group by 1) z),
    -- Subtype of the 2026-11-17 sections (attributes.kind); empty for the older sections.
    'kind',(select coalesce(jsonb_agg(jsonb_build_object('value',z.v,'count',z.n) order by z.n desc,z.v),'[]') from
      (select c.f_type v,count(*) n from c where okp and okc and okv and oko and ok24 and okpr and c.f_type is not null group by 1) z))
   ||(select jsonb_build_object('openNow',count(*) filter(where c.f_open_now),'open24h',count(*) filter(where c.f_open24h)) from c where okp and okc and okv and okpr and okk)
   ||case when priced then (select jsonb_build_object('price',jsonb_build_object('min',floor(min(c.f_price)/100),'max',ceil(max(c.f_price)/100)),
      'withPrice',count(c.f_price)) from c where okp and okc and okv and oko and ok24 and okk) else '{}'::jsonb end
  into total,out;
  return jsonb_build_object('vertical',p_vertical,'total',total,'facets',out);
 end if;
 select count(*) into total from public.dir_search_candidates(p_vertical,p_q,f,p_lat,p_lng,p_radius_km);
 out:=out||jsonb_build_object('province',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from
   (select c.f_province v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'province'-'canton'-'district',p_lat,p_lng,p_radius_km) c where c.f_province is not null group by 1) x));
 out:=out||jsonb_build_object('canton',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from
   (select c.f_canton v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'canton'-'district',p_lat,p_lng,p_radius_km) c where c.f_canton is not null group by 1 order by 2 desc,1 limit 50) x));
 if p_vertical not in('vehiculos','inmuebles') then
  out:=out||jsonb_build_object('vertical',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from
    (select c.f_vertical v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'vertical',p_lat,p_lng,p_radius_km) c group by 1) x));
  out:=out||jsonb_build_object('kind',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from
    (select c.f_type v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'kind',p_lat,p_lng,p_radius_km) c where c.f_type is not null group by 1) x));
  out:=out||(select jsonb_build_object('openNow',count(*) filter(where c.f_open_now),'open24h',count(*) filter(where c.f_open24h))
    from public.dir_search_candidates(p_vertical,p_q,f-'openNow'-'open24h',p_lat,p_lng,p_radius_km) c);
  if priced then
   out:=out||(select jsonb_build_object('price',jsonb_build_object('min',floor(min(c.f_price)/100),'max',ceil(max(c.f_price)/100)),'withPrice',count(c.f_price))
     from public.dir_search_candidates(p_vertical,p_q,f-'priceMin'-'priceMax',p_lat,p_lng,p_radius_km) c);
  end if;
 elsif p_vertical='vehiculos' then
  out:=out||jsonb_build_object(
   'type',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from (select c.f_type v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'type',p_lat,p_lng,p_radius_km) c group by 1) x),
   'make',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'label',x.l,'count',x.n) order by x.n desc,x.v),'[]') from (select c.f_make v,c.f_make_name l,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'make'-'model',p_lat,p_lng,p_radius_km) c group by 1,2 order by 3 desc,1 limit 60) x),
   'fuel',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from (select c.f_fuel v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'fuel',p_lat,p_lng,p_radius_km) c where c.f_fuel is not null group by 1) x),
   'transmission',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from (select c.f_transmission v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'transmission',p_lat,p_lng,p_radius_km) c where c.f_transmission is not null group by 1) x),
   'condition',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from (select c.f_condition v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'condition',p_lat,p_lng,p_radius_km) c group by 1) x),
   'year',(select jsonb_build_object('min',min(c.f_year),'max',max(c.f_year)) from public.dir_search_candidates(p_vertical,p_q,f-'yearMin'-'yearMax',p_lat,p_lng,p_radius_km) c),
   'price',(select jsonb_build_object('min',floor(min(c.f_price)/100),'max',ceil(max(c.f_price)/100)) from public.dir_search_candidates(p_vertical,p_q,f-'priceMin'-'priceMax',p_lat,p_lng,p_radius_km) c));
 else
  out:=out||jsonb_build_object(
   'operation',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from (select c.f_operation v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'operation',p_lat,p_lng,p_radius_km) c group by 1) x),
   'type',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.n desc,x.v),'[]') from (select c.f_type v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'type',p_lat,p_lng,p_radius_km) c group by 1) x),
   'bedrooms',(select coalesce(jsonb_agg(jsonb_build_object('value',x.v,'count',x.n) order by x.v),'[]') from (select least(c.f_bedrooms,5) v,count(*) n from public.dir_search_candidates(p_vertical,p_q,f-'bedroomsMin',p_lat,p_lng,p_radius_km) c where c.f_bedrooms is not null group by 1) x),
   'price',(select jsonb_build_object('min',floor(min(c.f_price)/100),'max',ceil(max(c.f_price)/100)) from public.dir_search_candidates(p_vertical,p_q,f-'priceMin'-'priceMax',p_lat,p_lng,p_radius_km) c));
 end if;
 return jsonb_build_object('vertical',p_vertical,'total',total,'facets',out);
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'dir\_search%' or p.proname='dir_facets') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn);
  execute format('grant execute on function %s to service_role',fn);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
