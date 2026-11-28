-- 546 (Pro, 2026-11-27, owner «aplica tus recomendaciones», research ~/dl/research/filtros-negocios.md): section filters
-- that have data. New place filters (dir_search_candidates, same RETURNS TABLE as 544; dir_search and dir_facets pass
-- them through unchanged):
--   restaurantes  cuisine (csv, attributes.cuisines ?| …), soda (attributes.soda), reservations (claimed + our tool on)
--   bancos        brand (csv, slug of attributes.brand), atm (attributes.atm or kind atm)
--   gasolineras   brand            supermercados  brand (slug of attributes.chain)
--   salud         public (attributes.publicService: CCSS / EBAIS)   educacion  public (attributes.publicService: MEP)
-- The values are written by scripts/directory/osm-filter-attributes.mjs (OSM cuisine, brand/operator, CCSS/MEP operator;
-- «soda» and «cabinas» by name). dir_section_filter_stats: value lists + hours coverage for the chips (cached by the app).
-- No price filter for fuel stations (ARESEP regulated). Nothing depends on payment.
begin;

update public.dir_verticals set attribute_keys=attribute_keys||'{soda}'::text[] where id='restaurant' and not 'soda'=any(attribute_keys);
update public.dir_verticals set attribute_keys=attribute_keys||'{brand}'::text[] where id='banking' and not 'brand'=any(attribute_keys);
update public.dir_verticals set attribute_keys=attribute_keys||'{publicService}'::text[] where id='education' and not 'publicService'=any(attribute_keys);

-- «Banco Nacional» → banco-nacional, «Más x Menos» → mas-x-menos (the URL value of a brand/chain filter).
create or replace function public.dir_filter_slug(p text) returns text language sql immutable parallel safe set search_path=public,pg_temp as $$
 select nullif(trim(both '-' from regexp_replace(public.dir_normalize(coalesce(p,'')),'[^a-z0-9]+','-','g')),'') $$;

CREATE OR REPLACE FUNCTION public.dir_search_candidates(p_vertical text, p_q text, p_filters jsonb, p_lat double precision, p_lng double precision, p_radius_km double precision)
 RETURNS TABLE(kind text, key text, card jsonb, text_score numeric, loc_rank integer, rating_avg numeric, rating_count integer, verified boolean, completeness numeric, fresh integer, created_at timestamp with time zone, updated_at timestamp with time zone, price numeric, distance_km numeric, f_vertical text, f_province text, f_canton text, f_type text, f_make text, f_make_name text, f_fuel text, f_transmission text, f_condition text, f_operation text, f_year integer, f_bedrooms integer, f_price numeric, f_open_now boolean, f_open24h boolean, f_status text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare f jsonb:=coalesce(p_filters,'{}'::jsonb);q text:=public.dir_normalize(p_q);tsq tsquery;pv text[];allowed text[];k text;
 dlat double precision;dlng double precision;r double precision:=p_radius_km;
 fv text[];prov text;cant text;dist text;open_now boolean;open24 boolean;pb numeric[];product text;item_slug text;kinds text[];
 types text[];makes text[];models text[];fuels text[];trans text[];conds text[];ops text[];
 ymin numeric;ymax numeric;pmin numeric;pmax numeric;kmax numeric;bmin numeric;m2min numeric;m2max numeric;pf text[];
 cuis text[];brands text[];want_soda boolean;want_atm boolean;want_public boolean;want_res boolean;
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
  when 'restaurantes' then array['vertical','province','canton','district','openNow','open24h','priceMin','priceMax','cuisine','soda','reservations']
  when 'farmacias' then array['vertical','province','canton','district','openNow','open24h','product','priceMin','priceMax']
  when 'supermercados' then array['vertical','province','canton','district','openNow','open24h','product','priceMin','priceMax','brand']
  when 'gasolineras' then array['vertical','province','canton','district','openNow','open24h','brand']
  when 'cafes' then array['vertical','province','canton','district','openNow','open24h','kind','priceMin','priceMax']
  when 'pulperias' then array['vertical','province','canton','district','openNow','open24h','kind','product','priceMin','priceMax']
  when 'ferreterias' then array['vertical','province','canton','district','openNow','open24h','kind','product','priceMin','priceMax']
  when 'veterinarias' then array['vertical','province','canton','district','openNow','open24h','kind','product','priceMin','priceMax']
  when 'hospedaje' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'salud' then array['vertical','province','canton','district','openNow','open24h','kind','public']
  when 'talleres' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'belleza' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'gimnasios' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'tours' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'bancos' then array['vertical','province','canton','district','openNow','open24h','kind','brand','atm']
  when 'parqueos' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'lavacar' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'atracciones' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'tiendas' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'centros-comerciales' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'mercados-y-carnicerias' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'tramites' then array['vertical','province','canton','district','openNow','open24h','kind']
  when 'educacion' then array['vertical','province','canton','district','openNow','open24h','kind','public']
  when 'transporte' then array['vertical','province','canton','district','openNow','open24h','kind']
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
  -- 546: section filters from imported OSM data (cuisine, brand/chain, ATM, CCSS/MEP) and our own tools (reservations).
  cuis:=public.dir_search_list(f,'cuisine');brands:=public.dir_search_list(f,'brand');
  if exists(select 1 from unnest(coalesce(cuis,'{}')||coalesce(brands,'{}')) x where x!~'^[a-z0-9]+(-[a-z0-9]+)*$' or length(x)>40) then
   raise exception 'Invalid search filter value' using errcode='22023',hint='dir_search_filter';end if;
  want_soda:=public.dir_search_bool(f,'soda');want_atm:=public.dir_search_bool(f,'atm');
  want_public:=public.dir_search_bool(f,'public');want_res:=public.dir_search_bool(f,'reservations');
  pb:=public.dir_search_price_bounds(p_vertical,f);
  product:=(public.dir_search_list(f,'product'))[1];
  if product is not null and length(product)<2 then raise exception 'Invalid search filter product' using errcode='22023',hint='dir_search_filter';end if;
  if product is not null then item_slug:=public.dir_search_price_product(p_vertical,product)->>'slug';end if;
  -- 544: cheap prefilter before the per-row scoring. Every way a place can match (text score, tsvector, keyword LIKE)
  -- needs each query word inside the name/locality/canton/address/brand/chain/cuisines (search_haystack) or inside a
  -- section name. So the words that are in no section name must all be in search_haystack (plain LIKE, no extension).
  select array_agg('%'||w||'%') into pf from unnest(string_to_array(q,' ')) w
   where w<>'' and not exists(select 1 from public.dir_verticals v
    where position(w in public.dir_normalize(v.name_es))>0 or position(w in public.dir_normalize(v.name_en))>0);
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
    and (pf is null or p.search_haystack like all(pf))
    and (pb[1] is null or pr.price>=pb[1]*100) and (pb[2] is null or pr.price<=pb[2]*100)
    and (not v.requires_license or p.verification_level='license_verified')
    and (prov is null or public.dir_normalize(p.admin_area_1)=prov)
    and (cant is null or public.dir_normalize(p.admin_area_2)=cant)
    and (dist is null or public.dir_normalize(p.admin_area_3)=dist)
    and (kinds is null or p.attributes->>'kind'=any(kinds))
    and (cuis is null or (jsonb_typeof(p.attributes->'cuisines')='array' and p.attributes->'cuisines' ?| cuis))
    and (brands is null or public.dir_filter_slug(coalesce(p.attributes->>'brand',p.attributes->>'chain'))=any(brands))
    and (not coalesce(want_soda,false) or p.attributes @> '{"soda":true}')
    and (not coalesce(want_atm,false) or p.attributes @> '{"atm":true}' or p.attributes->>'kind'='atm')
    and (not coalesce(want_public,false) or p.attributes @> '{"publicService":true}')
    and (not coalesce(want_res,false) or (p.claim_status='claimed' and public.dir_reservation_vertical_ok(p.vertical_id)
     and exists(select 1 from public.dir_reservation_settings rs where rs.place_id=p.id and rs.enabled)))
    and (r is null or (p.lat between p_lat-dlat and p_lat+dlat and p.lng between p_lng-dlng and p_lng+dlng))
  ),matched as(
   -- 544: the text score once per row (it was evaluated in the filter and again in the select list).
   select b.*,t.ts from base b cross join lateral(select public.dir_search_text_score(p_q,b.name,b.kw) ts offset 0) t
   where (r is null or b.dkm<=r)
    and (q='' or t.ts>0 or b.search_tsv@@tsq
     or (b.name_normalized||' '||public.dir_normalize(array_to_string(b.kw,' '))) like '%'||q||'%')
  ),scored as(
   select m.*,x.is24,
    case when x.is24 then true when x.hh then public.dir_search_open_at(m.id,now()) end isopen,
    round(((m.address_line is not null)::int+(m.phone is not null)::int+(m.website is not null)::int
     +x.hh::int
     +exists(select 1 from public.dir_place_media pm where pm.place_id=m.id and pm.status='active')::int
     +(m.location_precision in('exact','street'))::int)/6.0,4) compl
   from matched m cross join lateral(select public.dir_search_is_24h(m.id,m.attributes) is24,
    exists(select 1 from public.dir_place_hours h where h.place_id=m.id) hh offset 0) x
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
end $function$;

-- Chip data of one place section: published places, places with hours (for «Abierto ahora»), and the value lists of the
-- 546 filters (count order). Cheap (one pass over the section), cached ~10 min by the app (section-filters.ts).
create or replace function public.dir_section_filter_stats(p_vertical text) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare pv text[]:=public.dir_search_place_verticals(p_vertical);out jsonb;
begin
 if pv is null then raise exception 'Unknown search vertical' using errcode='22023',hint='dir_search_vertical';end if;
 with p as materialized(
  select p.id,p.attributes a,p.claim_status,p.vertical_id from public.dir_places p join public.dir_verticals v on v.id=p.vertical_id
  where p.status='published' and v.active and p.vertical_id=any(pv) and (not v.requires_license or p.verification_level='license_verified'))
 select jsonb_build_object(
  'total',(select count(*) from p),
  'withHours',(select count(*) from p where exists(select 1 from public.dir_place_hours h where h.place_id=p.id)),
  'cuisines',(select coalesce(jsonb_agg(jsonb_build_object('value',z.v,'count',z.n) order by z.n desc,z.v),'[]') from
    (select c v,count(*) n from p cross join lateral jsonb_array_elements_text(case when jsonb_typeof(p.a->'cuisines')='array' then p.a->'cuisines' else '[]' end) c group by 1) z),
  'brands',(select coalesce(jsonb_agg(jsonb_build_object('value',z.v,'label',z.l,'count',z.n) order by z.n desc,z.v),'[]') from
    (select public.dir_filter_slug(coalesce(p.a->>'brand',p.a->>'chain')) v,mode() within group(order by coalesce(p.a->>'brand',p.a->>'chain')) l,count(*) n
     from p where public.dir_filter_slug(coalesce(p.a->>'brand',p.a->>'chain')) is not null group by 1) z),
  'soda',(select count(*) from p where p.a @> '{"soda":true}'),
  'atm',(select count(*) from p where p.a @> '{"atm":true}' or p.a->>'kind'='atm'),
  'public',(select count(*) from p where p.a @> '{"publicService":true}'),
  'reservations',(select count(*) from p where p.claim_status='claimed' and public.dir_reservation_vertical_ok(p.vertical_id)
    and exists(select 1 from public.dir_reservation_settings rs where rs.place_id=p.id and rs.enabled))) into out;
 return out;
end $$;
revoke all on function public.dir_section_filter_stats(text) from public,anon,authenticated;
grant execute on function public.dir_section_filter_stats(text) to service_role;

commit;
