-- LOCAL PRO ONLY. Owner decision 2026-11-17 ("farmacias quiero mostrar todo y en todo donde aplique filtrar precios,
-- solo gasolineras no porque todo es igual"): place prices for the directory search (dir_search / dir_facets).
-- Depends on: directory-search-local.sql (stubs replaced here), price-observations-local.sql, price-compare-local.sql
--             (public_price_search, price_catalog), pro-menu-local.sql (pro_menu_*). Applied after all of them.
-- * dir_search_price_product(vertical, product): farmacias → 'pharmacy', supermercados → 'grocery'. The product text is
--   resolved to ONE catalogue item: an exact active slug first, else the first result of public_price_search (same
--   order as /precios: exact name/GTIN, then most stores with a current price, then name). Never Rx (both paths skip
--   rx_required items, Decreto 36868-S). Null for other sections or no match.
-- * dir_search_place_prices(vertical, item):
--   restaurantes → one row per claimed, published restaurant with a published menu in CRC: price = MEDIAN final price
--     (pro_menu_price total: IVA + service as the public menu shows it) of its published, not unavailable dishes in
--     active sections, rounded to whole colones; info {kind:'menu', amount, currency, dishes, updatedAt}.
--   farmacias/supermercados + item → one row per place with a CURRENT published CRC observation of that item: best
--     tier (official > business > community_verified > community), newest valid_from/observed_at; stale or expired
--     prices never filter or sort. info {kind:'product', item, observation (price_observation_public: source, date,
--     confidence, validity)}.
--   anything else (gasolineras: national ARESEP price; agencias; lugares) → no rows.
--   Prices are returned in céntimos (same unit as listings' price_crc_norm); dir_search compares whole colones × 100.
-- * 2026-11-17 (new place sections): cafes → menu median like restaurants (cafe_bar places with a published menu);
--   pulperias (convenience), ferreterias (hardware) and veterinarias (vet_pets: pet-shop products) → product like
--   supermarkets, resolved among grocery + generic items (never medicine there, never Rx). No prices for hospedaje,
--   salud, talleres, belleza, gimnasios, tours or bancos.
-- Order never depends on payment: the only inputs are published menu prices and price observations.
-- Functions security invoker, pinned search_path, executable only by service_role.
begin;

create or replace function public.dir_search_price_product(p_vertical text,p_product text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v text:=case p_vertical when 'farmacias' then 'pharmacy' when 'supermercados' then 'grocery'
  when 'pulperias' then 'convenience' when 'ferreterias' then 'hardware' when 'veterinarias' then 'vet_pets' end;txt text:=btrim(coalesce(p_product,''));
 i public.price_items;c public.price_catalog;found_slug text;
begin
 if v is null or length(txt) not between 2 and 80 then return null;end if;
 if txt~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$' then
  select x.slug into found_slug from public.price_items x join public.price_catalog k on k.item_id=x.id
  where x.slug=txt and x.active and not x.rx_required and x.kind in('grocery','medicine','generic')
   and case when v='pharmacy' then x.kind in('medicine','generic') when v='grocery' then x.kind in('grocery','generic') else x.kind in('grocery','generic') end;
 end if;
 -- New product sections resolve like supermarkets (grocery + generic, never medicine).
 if found_slug is null then found_slug:=public.public_price_search(txt,case when v='pharmacy' then 'pharmacy' else 'grocery' end,1)->'items'->0->>'slug';end if;
 if found_slug is null then return null;end if;
 select * into i from public.price_items where slug=found_slug and active and not rx_required;
 if not found then return null;end if;
 select * into c from public.price_catalog where item_id=i.id;
 return jsonb_build_object('slug',i.slug,'name',i.name,'presentation',i.presentation,'brand',c.brand,'unitBase',i.unit_base,'unitQty',i.unit_qty);
end $$;

create or replace function public.dir_search_place_prices(p_vertical text,p_item_slug text)
returns table(place_id uuid,price numeric,info jsonb)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
#variable_conflict use_column
declare now_ts timestamptz:=clock_timestamp();v text:=case p_vertical when 'farmacias' then 'pharmacy' when 'supermercados' then 'grocery'
  when 'pulperias' then 'convenience' when 'ferreterias' then 'hardware' when 'veterinarias' then 'vet_pets' end;it public.price_items;
begin
 if p_vertical in('restaurantes','cafes') then
  return query
  with dishes as(
   select i.place_id pid,(public.pro_menu_price(i.price_minor,coalesce(s.prices_include_iva,true),coalesce(s.prices_include_service,false),coalesce(s.iva_bps,1300),
     case when coalesce(s.service_charge,true) then coalesce(s.service_bps,1000) else 0 end)->>'total')::numeric total,
    greatest(i.updated_at,s.updated_at) upd
   from public.pro_menu_items i
   join public.pro_menu_sections sec on sec.id=i.section_id and sec.status='active'
   join public.pro_menu_settings s on s.place_id=i.place_id
   join public.dir_places p on p.id=i.place_id
   where i.status='published' and i.availability<>'unavailable' and p.vertical_id=case p_vertical when 'cafes' then 'cafe_bar' else 'restaurant' end and p.status='published'
    and p.claim_status in('claimed','disputed') and p.currency='CRC'
  )
  select d.pid,round(percentile_cont(0.5) within group(order by d.total)::numeric/100)*100,
   jsonb_build_object('kind','menu','amount',round(percentile_cont(0.5) within group(order by d.total)::numeric/100),'currency','CRC',
    'dishes',count(*),'updatedAt',max(d.upd))
  from dishes d group by d.pid;
  return;
 end if;
 if v is null or p_item_slug is null then return;end if;
 select * into it from public.price_items where slug=p_item_slug and active and not rx_required;
 if not found or (v not in('pharmacy','grocery') and it.kind='medicine') then return;end if;
 return query
 with best as(
  select distinct on(o.place_id) o.place_id pid,o.id oid,o.price oprice
  from public.price_observations o join public.dir_places p on p.id=o.place_id
  where o.item_id=it.id and o.moderation_status='published' and o.currency='CRC' and o.place_id is not null and p.vertical_id=v
   and o.valid_from<=now_ts and (o.valid_to is null or o.valid_to>now_ts) and o.stale_after>now_ts
  order by o.place_id,case o.confidence when 'official' then 1 when 'business' then 2 when 'community_verified' then 3 else 4 end,o.valid_from desc,o.observed_at desc
 )
 select b.pid,b.oprice*100,
  jsonb_build_object('kind','product','item',jsonb_build_object('slug',it.slug,'name',it.name,'presentation',it.presentation),
   'observation',public.price_observation_public(b.oid,now_ts))
 from best b;
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('dir_search_price_product','dir_search_place_prices') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn);
  execute format('grant execute on function %s to service_role',fn);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
