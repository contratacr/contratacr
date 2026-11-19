-- LOCAL PRO ONLY. Launch round (2026-11-19): read-only helpers of the redesigned /precios page. Depends on
-- price-observations-local.sql (price_items, price_observations, price_place_visible) and price-compare-local.sql
-- (price_catalog, price_norm_qty). Additive: two new readers, no table, no change to existing functions.
-- * public_price_overview(vertical, category, limit): catalogue categories with their product counts (and how many
--   have a current price), plus the products of one category (or, without a category, the products that have current
--   prices: most stores first). public_price_search needs a text query, so it cannot list a category.
-- * public_price_history(item, province, vertical, days): lowest published price of one product per day (Costa Rica
--   calendar) over the last N days (7–180, default 90) and the lowest of the last 30 days. Published and superseded
--   observations only (a superseded price counts until the price that replaced it took effect); pending/rejected never.
-- Same rules as public_price_compare: visible places only, prescription items never (Decreto 36868-S), the order of
-- products is by number of stores and name, never payment. Functions: security invoker, pinned search_path,
-- service_role only (called from server code), like every directory/price reader.
begin;

create or replace function public.public_price_overview(p_vertical text default null,p_category text default null,p_limit integer default 12) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare now_ts timestamptz:=clock_timestamp();cats jsonb;items jsonb;totals jsonb;lim integer:=greatest(1,least(coalesce(p_limit,12),60));
begin
 if p_vertical is not null and p_vertical not in('grocery','pharmacy') then return null;end if;
 if p_category is not null and p_category!~'^[a-z][a-z0-9_]{1,39}$' then return null;end if;
 with cat as (
  select i.id,i.slug,i.kind,i.name,i.presentation,i.gtin,i.unit_base,i.unit_qty,c.brand,c.category,public.price_norm_qty(i.unit_base,i.unit_qty) q
  from public.price_items i join public.price_catalog c on c.item_id=i.id
  where i.active and not i.rx_required and i.kind in('grocery','medicine','generic')
   and (p_vertical is null or (p_vertical='pharmacy')=(i.kind='medicine') or i.kind='generic')
 ),cur as (
  select o.item_id,count(distinct o.place_id)::int offers,min(o.price) min_price,round(min(o.price/k.q),2) min_unit
  from public.price_observations o join cat k on k.id=o.item_id join public.dir_places p on p.id=o.place_id
  where o.moderation_status='published' and o.currency='CRC' and o.valid_from<=now_ts and (o.valid_to is null or o.valid_to>now_ts) and o.stale_after>now_ts
   and public.price_place_visible(p.id) and (p_vertical is null or p.vertical_id=p_vertical)
  group by o.item_id
 ),j as (
  select k.*,coalesce(c.offers,0) offers,c.min_price,c.min_unit from cat k left join cur c on c.item_id=k.id
 )
 select
  (select coalesce(jsonb_agg(jsonb_build_object('category',x.category,'vertical',x.vertical,'items',x.n,'priced',x.priced)
    order by x.priced desc,x.n desc,x.category),'[]')
   from (select category,case when bool_and(kind='medicine') then 'pharmacy' when bool_and(kind='grocery') then 'grocery' else 'mixed' end vertical,
    count(*)::int n,count(*) filter(where offers>0)::int priced from j group by category) x),
  (select coalesce(jsonb_agg(jsonb_build_object('slug',y.slug,'kind',y.kind,'name',y.name,'presentation',y.presentation,'brand',y.brand,'category',y.category,
    'gtin',y.gtin,'unitBase',y.unit_base,'unitQty',y.unit_qty,'normalizedUnit',public.price_norm_unit(y.unit_base),'offers',y.offers,
    'minPrice',y.min_price,'minUnitPrice',y.min_unit) order by y.offers desc,y.name,y.slug),'[]')
   from (select * from j where (p_category is null and offers>0) or category=p_category order by offers desc,name,slug limit lim) y),
  (select jsonb_build_object('items',count(*)::int,'priced',(count(*) filter(where offers>0))::int,'offers',coalesce(sum(offers),0)::int) from j)
 into cats,items,totals;
 return jsonb_build_object('asOf',now_ts,'vertical',p_vertical,'category',p_category,'categories',cats,'items',items,'totals',totals);
end $$;

create or replace function public.public_price_history(p_item_slug text,p_province text default null,p_vertical text default null,p_days integer default 90) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i public.price_items;now_ts timestamptz:=clock_timestamp();prov text:=nullif(public.dir_normalize(p_province),'');
 n integer:=greatest(7,least(coalesce(p_days,90),180));today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;q numeric;pts jsonb;low jsonb;
begin
 if p_item_slug is null or p_item_slug!~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$' or (p_vertical is not null and p_vertical not in('grocery','pharmacy')) then return null;end if;
 select * into i from public.price_items where slug=p_item_slug and active and not rx_required and kind in('grocery','medicine','generic');
 if not found or not exists(select 1 from public.price_catalog where item_id=i.id) then return null;end if;
 q:=public.price_norm_qty(i.unit_base,i.unit_qty);
 with obs as (
  select o.price,o.valid_from,o.valid_to,o.stale_after,
   coalesce((select s.valid_from from public.price_observations s where s.id=o.superseded_by),'infinity'::timestamptz) replaced_at
  from public.price_observations o join public.dir_places p on p.id=o.place_id
  where o.item_id=i.id and o.moderation_status in('published','superseded') and o.currency='CRC' and o.place_id is not null
   and o.valid_from<=now_ts and public.price_place_visible(p.id)
   and (prov is null or public.dir_normalize(p.admin_area_1)=prov) and (p_vertical is null or p.vertical_id=p_vertical)
 ),days as (
  select d::date d,(d::date::timestamp at time zone 'America/Costa_Rica') d0,((d::date+1)::timestamp at time zone 'America/Costa_Rica') d1
  from generate_series(today-(n-1),today,interval '1 day') d
 ),pt as (
  select d.d,min(o.price) price from days d join obs o on o.valid_from<d.d1 and (o.valid_to is null or o.valid_to>d.d0) and o.stale_after>d.d0 and o.replaced_at>d.d0
  group by d.d
 )
 select (select coalesce(jsonb_agg(jsonb_build_object('day',pt.d,'price',pt.price,'unitPrice',round(pt.price/q,2)) order by pt.d),'[]') from pt),
  (select jsonb_build_object('day',x.d,'price',x.price,'unitPrice',round(x.price/q,2)) from pt x where x.d>today-30 order by x.price,x.d desc limit 1)
 into pts,low;
 return jsonb_build_object('item',i.slug,'asOf',now_ts,'days',n,'province',p_province,'vertical',p_vertical,'points',pts,'low30',low);
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('public_price_overview','public_price_history') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
