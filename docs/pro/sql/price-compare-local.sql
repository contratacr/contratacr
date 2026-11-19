-- LOCAL PRO ONLY. Multivertical round P3 (2026-11-17): price comparison for supermarkets and pharmacies (OTC only).
-- Depends on directory-core-local.sql and price-observations-local.sql (applied before it in the manifest).
-- * price_catalog: canonical product data of a price_item (brand, category, aliases, normalized search text). The
--   GTIN lives on price_items (check digit enforced there by price_gtin_ok). price_catalog_upsert creates/updates the
--   item through price_item_upsert and then the catalog row. Medicine must say rxRequired=false explicitly to be listed;
--   prescription items (rx_required) are never returned by any reader here (Decreto 36868-S).
-- * price_import_batches / price_import_rows: provenance of an official file import (source URL, publication date,
--   file name, sha256, format, survey reference). One file = one batch (unique source+sha256). Each row ends as
--   recorded (an official_meic observation, linked by id), unmatched_place, unknown_item, rx_refused, duplicate or
--   invalid. Rows of rx/unknown items NEVER keep a price. Batches and rows are append-only.
--   NOTE (2026-11-17): MEIC publishes no downloadable machine-readable file (see the research note); the importer is
--   built against a documented normalized CSV and tested with fixtures only. Nothing real is imported.
-- * Public readers (service_role only, like every directory reader; called from server code):
--   public_price_search(q, vertical, limit): catalogue items that match (name/brand/aliases/presentation, or GTIN).
--   public_price_compare(item, province, vertical, sort): one offer per visible place (best current tier, else the
--   last known price flagged stale), unit price normalized per kg / L / unit, per-province summary of current offers.
--   Optional price range (2026-11-17, owner decision «filtrar precios donde aplique»): p_price_min/p_price_max in the
--   item currency (colones), inclusive, applied to the price of the offer shown (current or last known); 22023 when
--   negative, above 100 000 000 or min > max. Offers, total and the per-province summary all follow the range.
--   Order: current before stale, then the chosen price key ascending, then place name and slug. NEVER payment,
--   claims, verification level or any commercial signal (see /como-ordenamos).
begin;

-- ---------------------------------------------------------------- helpers
-- Normalized unit for comparison: grams → kg, millilitres → litres; unit/dose stay.
create or replace function public.price_norm_unit(p_unit text) returns text
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select case p_unit when 'g' then 'kg' when 'ml' then 'l' else p_unit end $$;
create or replace function public.price_norm_qty(p_unit text,p_qty numeric) returns numeric
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select case when p_unit in('g','ml') then p_qty/1000 else p_qty end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.price_catalog(
 item_id uuid primary key references public.price_items(id),
 brand text check(length(btrim(brand)) between 1 and 80),
 category text not null check(category~'^[a-z][a-z0-9_]{1,39}$'),
 aliases text[] not null default '{}' check(cardinality(aliases)<=20),
 search_norm text not null check(length(search_norm) between 2 and 2000),
 source_id text not null references public.dir_data_sources(id),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp()
);
create index if not exists price_catalog_category on public.price_catalog(category);

create table if not exists public.price_import_batches(
 id uuid primary key,
 source_id text not null references public.dir_data_sources(id),
 source_url text not null check(source_url~'^https://[^\s"<>]{3,}$' and length(source_url)<=500),
 publication_date date not null,
 survey_ref text not null check(length(btrim(survey_ref)) between 1 and 120),
 file_name text not null check(file_name~'^[A-Za-z0-9._ -]{1,160}$'),
 file_sha256 text not null check(file_sha256~'^[a-f0-9]{64}$'),
 file_format text not null check(file_format in('csv','xlsx','json','pdf')),
 license_note text check(length(license_note)<=300),
 rows_total integer not null check(rows_total>=0),
 actor_id uuid not null,action_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(source_id,file_sha256)
);
create table if not exists public.price_import_rows(
 batch_id uuid not null references public.price_import_batches(id),
 row_no integer not null check(row_no between 1 and 100000),
 status text not null check(status in('recorded','unmatched_place','unknown_item','rx_refused','duplicate','invalid')),
 product_label text check(length(product_label)<=200),
 establishment text check(length(establishment)<=200),
 region text check(length(region)<=120),
 item_id uuid references public.price_items(id),
 place_id uuid references public.dir_places(id),
 price numeric(14,2) check(price>0),
 observation_id uuid references public.price_observations(id),
 reason text check(length(reason)<=200),
 primary key(batch_id,row_no),
 check((status='recorded')=(observation_id is not null)),
 -- Decreto 36868-S: a refused prescription row and a row of an unknown item never keep a price.
 check(status not in('rx_refused','unknown_item','invalid') or price is null)
);
create index if not exists price_import_rows_obs on public.price_import_rows(observation_id) where observation_id is not null;

do $$declare t text;begin
 foreach t in array array['price_import_batches','price_import_rows'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function public.price_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['price_catalog','price_import_batches','price_import_rows'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.price_immutable()',t||'_no_truncate',t);
 end loop;end $$;

-- ---------------------------------------------------------------- catalogue (staff)
-- Input: {actionId, slug, kind:'grocery'|'medicine'|'generic', name, gtin?, officialCode?, brand?, category, presentation?,
--         unitBase, unitQty, rxRequired? (medicine: must be false to be listed), aliases?:[text], sourceId?}.
create or replace function public.price_catalog_upsert(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.price_actions;item jsonb;i public.price_items;c public.price_catalog;result jsonb;al text[];src text:=coalesce(p_input->>'sourceId','contratacr');
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or coalesce(p_input->>'kind','') not in('grocery','medicine','generic')
  or coalesce(p_input->>'category','')!~'^[a-z][a-z0-9_]{1,39}$'
  or (p_input ? 'aliases' and (jsonb_typeof(p_input->'aliases')<>'array' or jsonb_array_length(p_input->'aliases')>20))
  or (p_input ? 'brand' and jsonb_typeof(p_input->'brand') not in('string','null')) then raise exception 'Invalid catalogue item' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid catalogue item' using errcode='22023';end;
 if aid is null then raise exception 'Invalid catalogue item' using errcode='22023';end if;
 select * into receipt from public.price_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 if not exists(select 1 from public.dir_data_sources where id=src and active) then raise exception 'Invalid source' using errcode='22023';end if;
 if p_input->>'kind'='medicine' and coalesce(p_input->>'rxRequired','')<>'false' then
  -- Only over-the-counter medicines enter the price catalogue; anything else is refused before it is stored.
  raise exception 'Prescription medicine prices are never public' using errcode='22023',hint='price_rx_not_public';end if;
 select coalesce(array_agg(btrim(a) order by o),'{}') into al from jsonb_array_elements_text(coalesce(p_input->'aliases','[]')) with ordinality x(a,o) where btrim(a)<>'';
 if exists(select 1 from unnest(al) a where length(a)>80) then raise exception 'Invalid catalogue item' using errcode='22023';end if;
 item:=public.price_item_upsert(p_actor,jsonb_strip_nulls(jsonb_build_object('actionId',public.dir_derived_uuid(aid,'item'),'slug',p_input->>'slug','kind',p_input->>'kind',
  'name',p_input->>'name','gtin',p_input->'gtin','officialCode',p_input->'officialCode','presentation',p_input->'presentation','unitBase',p_input->>'unitBase',
  'unitQty',p_input->'unitQty','rxRequired',case when p_input->>'kind'='medicine' then to_jsonb(false) else p_input->'rxRequired' end,'active',p_input->'active')));
 select * into i from public.price_items where id=(item->>'itemId')::uuid;
 if i.rx_required then raise exception 'Prescription medicine prices are never public' using errcode='22023',hint='price_rx_not_public';end if;
 insert into public.price_catalog as pc(item_id,brand,category,aliases,search_norm,source_id)
 values(i.id,nullif(btrim(coalesce(p_input->>'brand','')),''),p_input->>'category',al,
  left(public.dir_normalize(concat_ws(' ',i.name,i.presentation,p_input->>'brand',array_to_string(al,' '))),2000),src)
 on conflict(item_id) do update set brand=excluded.brand,category=excluded.category,aliases=excluded.aliases,search_norm=excluded.search_norm,
  source_id=excluded.source_id,revision=pc.revision+1,updated_at=clock_timestamp()
 returning * into c;
 result:=jsonb_build_object('itemId',i.id,'slug',i.slug,'kind',i.kind,'gtin',i.gtin,'category',c.category,'revision',c.revision);
 insert into public.price_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- official import (staff)
-- Input: {actionId, sourceId:'meic', sourceUrl, publicationDate:'YYYY-MM-DD', surveyRef, fileName, fileSha256, fileFormat,
--         validTo?, licenseNote?, rows:[{rowNo, itemSlug?, placeSlug?, price?, productLabel?, establishment?, region?, status?, reason?}]}
-- The offline importer (scripts/directory/import-meic-prices.mjs) resolves items (GTIN/code) and places (owner mapping
-- file) and passes rows it already refused with status invalid|unknown_item|rx_refused (never with a price). Atomic.
create or replace function public.price_official_import_record(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.price_actions;b public.price_import_batches;bid uuid;pub date;obs timestamptz;vt timestamptz;r jsonb;st text;why text;
 i public.price_items;pl public.dir_places;pr numeric;res jsonb;n_total integer;counts jsonb:='{}';seen text[]:='{}';key text;src text:=coalesce(p_input->>'sourceId','meic');
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'rows')<>'array' or jsonb_array_length(p_input->'rows') not between 1 and 5000
  or coalesce(p_input->>'fileSha256','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid import' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;pub:=(p_input->>'publicationDate')::date;vt:=(p_input->>'validTo')::timestamptz;
 exception when others then raise exception 'Invalid import' using errcode='22023';end;
 if aid is null or pub is null or coalesce(p_input->>'publicationDate','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid import' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('price-import:'||src||':'||(p_input->>'fileSha256'),0));
 select * into receipt from public.price_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 if exists(select 1 from public.price_import_batches where source_id=src and file_sha256=p_input->>'fileSha256') then
  raise exception 'This file was already imported' using errcode='23505',hint='price_import_duplicate';end if;
 if not exists(select 1 from public.dir_data_sources where id=src and kind='official' and active) or src='aresep' then raise exception 'Invalid source' using errcode='22023';end if;
 -- Publication day at noon, Costa Rica time (UTC-6, no DST). Never in the future.
 obs:=(pub::text||'T12:00:00-06:00')::timestamptz;
 if obs>clock_timestamp()+interval '5 minutes' then raise exception 'Publication date in the future' using errcode='22023';end if;
 if vt is not null and vt<=obs then raise exception 'Invalid validity' using errcode='22023';end if;
 n_total:=jsonb_array_length(p_input->'rows');bid:=public.dir_derived_uuid(aid,'batch');
 begin
  insert into public.price_import_batches(id,source_id,source_url,publication_date,survey_ref,file_name,file_sha256,file_format,license_note,rows_total,actor_id,action_id)
  values(bid,src,p_input->>'sourceUrl',pub,btrim(p_input->>'surveyRef'),p_input->>'fileName',p_input->>'fileSha256',p_input->>'fileFormat',
   nullif(btrim(coalesce(p_input->>'licenseNote','')),''),n_total,p_actor,aid);
 exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'Invalid import: %',sqlerrm using errcode='22023';end;
 for r in select * from jsonb_array_elements(p_input->'rows') loop
  st:=null;why:=null;i:=null;pl:=null;pr:=null;res:=null;
  if jsonb_typeof(r)<>'object' or jsonb_typeof(r->'rowNo')<>'number' then raise exception 'Invalid import row' using errcode='22023';end if;
  if r ? 'status' and r->>'status' not in('invalid','unknown_item','rx_refused') then raise exception 'Invalid import row' using errcode='22023';end if;
  if r ? 'status' then st:=r->>'status';why:=left(r->>'reason',200);
  else
   select * into i from public.price_items where slug=r->>'itemSlug';
   if not found or not i.active then st:='unknown_item';why:='item';
   elsif i.rx_required then st:='rx_refused';why:='rx';
   else
    begin pr:=(r->>'price')::numeric;exception when others then pr:=null;end;
    if jsonb_typeof(r->'price')<>'number' or pr is null or pr<=0 or pr>=100000000 or round(pr,2)<>pr then st:='invalid';why:='price';pr:=null;
    else
     select * into pl from public.dir_places where slug=r->>'placeSlug' and status not in('removed','closed_permanently');
     if pl.id is null then st:='unmatched_place';why:='place';
     else
      key:=i.id::text||':'||pl.id::text;
      if key=any(seen) then st:='duplicate';why:='same item and place in this file';
      else
       seen:=seen||key;
       begin
        res:=public.price_record_internal(p_actor,jsonb_strip_nulls(jsonb_build_object('sourceKind','official_meic','sourceId',src,'sourceRef',btrim(p_input->>'surveyRef'),
         'observedAt',obs,'validFrom',obs,'validTo',vt,'itemSlug',i.slug,'placeId',pl.id,'price',pr)),public.dir_derived_uuid(aid,'row:'||(r->>'rowNo')));
        st:='recorded';
       exception when sqlstate '22023' or sqlstate 'P0002' then st:='invalid';why:=left(sqlerrm,200);end;
      end if;
     end if;
    end if;
   end if;
  end if;
  insert into public.price_import_rows(batch_id,row_no,status,product_label,establishment,region,item_id,place_id,price,observation_id,reason)
  values(bid,(r->>'rowNo')::integer,st,left(r->>'productLabel',200),left(r->>'establishment',200),left(r->>'region',120),
   case when st not in('unknown_item','invalid') then i.id end,pl.id,
   case when st in('recorded','unmatched_place','duplicate') then pr end,(res->>'observationId')::uuid,why);
  counts:=jsonb_set(counts,array[st],to_jsonb(coalesce((counts->>st)::integer,0)+1));
 end loop;
 res:=jsonb_build_object('batchId',bid,'sourceId',src,'surveyRef',btrim(p_input->>'surveyRef'),'publicationDate',pub,'fileSha256',p_input->>'fileSha256','rows',n_total,'counts',counts);
 insert into public.price_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,res);
 return res;
end $$;

create or replace function public.price_import_summary(p_batch uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('batchId',b.id,'sourceId',b.source_id,'sourceUrl',b.source_url,'publicationDate',b.publication_date,'surveyRef',b.survey_ref,
  'fileName',b.file_name,'fileSha256',b.file_sha256,'fileFormat',b.file_format,'rows',b.rows_total,
  'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.price_import_rows where batch_id=b.id group by status) x))
 from public.price_import_batches b where b.id=p_batch $$;

-- ---------------------------------------------------------------- public readers
-- Catalogue search. p_vertical: 'grocery' | 'pharmacy' | null. GTIN: exact match on a valid code. Rx never.
create or replace function public.public_price_search(p_q text,p_vertical text default null,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare qn text:=public.dir_normalize(left(coalesce(p_q,''),100));digits text:=regexp_replace(coalesce(p_q,''),'\s','','g');words text[];now_ts timestamptz:=clock_timestamp();out jsonb;
begin
 if p_vertical is not null and p_vertical not in('grocery','pharmacy') then return null;end if;
 if length(qn)<2 and not public.price_gtin_ok(digits) then return jsonb_build_object('q',p_q,'items','[]'::jsonb);end if;
 words:=array_remove(string_to_array(qn,' '),'');
 select coalesce(jsonb_agg(x.j order by x.exact desc,x.offers desc,x.name,x.slug),'[]') into out from (
  select i.slug,i.name,(public.price_gtin_ok(digits) and i.gtin=digits) or public.dir_normalize(i.name)=qn exact,
   (select count(distinct o.place_id) from public.price_observations o join public.dir_places p on p.id=o.place_id
     where o.item_id=i.id and o.moderation_status='published' and o.valid_from<=now_ts and (o.valid_to is null or o.valid_to>now_ts) and o.stale_after>now_ts
      and public.price_place_visible(p.id) and (p_vertical is null or p.vertical_id=p_vertical)) offers,
   jsonb_build_object('slug',i.slug,'kind',i.kind,'name',i.name,'presentation',i.presentation,'brand',c.brand,'category',c.category,'gtin',i.gtin,
    'unitBase',i.unit_base,'unitQty',i.unit_qty,'normalizedUnit',public.price_norm_unit(i.unit_base),
    'offers',(select count(distinct o.place_id) from public.price_observations o join public.dir_places p on p.id=o.place_id
     where o.item_id=i.id and o.moderation_status='published' and o.valid_from<=now_ts and (o.valid_to is null or o.valid_to>now_ts) and o.stale_after>now_ts
      and public.price_place_visible(p.id) and (p_vertical is null or p.vertical_id=p_vertical))) j
  from public.price_items i join public.price_catalog c on c.item_id=i.id
  where i.active and not i.rx_required and i.kind in('grocery','medicine','generic')
   and (p_vertical is null or (p_vertical='pharmacy')=(i.kind='medicine') or i.kind='generic')
   and ((public.price_gtin_ok(digits) and i.gtin=digits)
    or (cardinality(words)>0 and (select bool_and(position(w in ' '||c.search_norm||' ')>0) from unnest(words) w)))
  order by 3 desc,i.name,i.slug limit greatest(1,least(coalesce(p_limit,20),50))) x;
 return jsonb_build_object('q',p_q,'vertical',p_vertical,'items',out);
end $$;

-- Offers of one item. p_sort: 'unit_price' (default) | 'price' | 'place'. p_province: admin_area_1 (accent-insensitive).
-- The 5-argument version (before the price range) is dropped so named calls stay unambiguous.
drop function if exists public.public_price_compare(text,text,text,text,integer);
create or replace function public.public_price_compare(p_item_slug text,p_province text default null,p_vertical text default null,p_sort text default 'unit_price',p_limit integer default 60,
 p_price_min numeric default null,p_price_max numeric default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i public.price_items;c public.price_catalog;now_ts timestamptz:=clock_timestamp();prov text:=nullif(public.dir_normalize(p_province),'');srt text:=coalesce(p_sort,'unit_price');
 q numeric;offers jsonb;regions jsonb;total integer;
begin
 if p_price_min<0 or p_price_max<0 or p_price_min>=100000000 or p_price_max>=100000000 or p_price_min>p_price_max then
  raise exception 'Invalid price range' using errcode='22023',hint='price_compare_range';end if;
 if p_item_slug is null or p_item_slug!~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$' or srt not in('unit_price','price','place')
  or (p_vertical is not null and p_vertical not in('grocery','pharmacy')) then return null;end if;
 select * into i from public.price_items where slug=p_item_slug and active and not rx_required and kind in('grocery','medicine','generic');
 if not found then return null;end if;
 select * into c from public.price_catalog where item_id=i.id;
 if not found then return null;end if;
 q:=public.price_norm_qty(i.unit_base,i.unit_qty);
 with best_any as (
  select distinct on(o.place_id) o.place_id,o.id obs_id,((o.valid_to is null or o.valid_to>now_ts) and o.stale_after>now_ts) is_current,o.price,o.currency,
   round(o.price/q,2) unit_price,p.name pname,p.name_normalized pnorm,p.slug pslug,p.vertical_id vertical,p.admin_area_1 area1,p.admin_area_2 area2,p.locality
  from public.price_observations o join public.dir_places p on p.id=o.place_id
  where o.item_id=i.id and o.moderation_status='published' and o.valid_from<=now_ts and o.place_id is not null and public.price_place_visible(p.id)
   and (prov is null or public.dir_normalize(p.admin_area_1)=prov) and (p_vertical is null or p.vertical_id=p_vertical)
  order by o.place_id,((o.valid_to is null or o.valid_to>now_ts) and o.stale_after>now_ts) desc,
   case when ((o.valid_to is null or o.valid_to>now_ts) and o.stale_after>now_ts) then case o.confidence when 'official' then 1 when 'business' then 2 when 'community_verified' then 3 else 4 end else 0 end,
   o.valid_from desc,o.observed_at desc
 ),best as (
  select * from best_any b where (p_price_min is null or b.price>=p_price_min) and (p_price_max is null or b.price<=p_price_max)
 ),ranked as (
  select b.*,row_number() over(order by b.is_current desc,b.currency,case srt when 'price' then b.price when 'unit_price' then b.unit_price end nulls last,b.pnorm,b.pslug) rn from best b
 )
 select (select count(*) from best),
  (select coalesce(jsonb_agg(jsonb_build_object(
    'place',jsonb_build_object('slug',b.pslug,'name',b.pname,'vertical',b.vertical,'province',b.area1,'canton',b.area2,'locality',b.locality),
    'unitPrice',b.unit_price,'observation',public.price_observation_public(b.obs_id,now_ts),
    'provenance',(select jsonb_build_object('sourceUrl',x.source_url,'publicationDate',x.publication_date,'surveyRef',x.survey_ref,'fileSha256',x.file_sha256)
      from public.price_import_rows r join public.price_import_batches x on x.id=r.batch_id where r.observation_id=b.obs_id limit 1)) order by b.rn),'[]')
   from ranked b where b.rn<=greatest(1,least(coalesce(p_limit,60),200))),
  (select coalesce(jsonb_agg(jsonb_build_object('province',coalesce(r.area1,''),'offers',r.n,'minUnitPrice',r.mn,'medianUnitPrice',r.md,'maxUnitPrice',r.mx) order by coalesce(r.area1,'')),'[]')
   from (select area1,count(*) n,min(unit_price) mn,round(percentile_cont(0.5) within group(order by unit_price)::numeric,2) md,max(unit_price) mx
    from best where is_current and currency='CRC' group by area1) r)
 into total,offers,regions;
 return jsonb_build_object('item',jsonb_build_object('slug',i.slug,'kind',i.kind,'name',i.name,'presentation',i.presentation,'brand',c.brand,'category',c.category,'gtin',i.gtin,
   'unitBase',i.unit_base,'unitQty',i.unit_qty,'normalizedUnit',public.price_norm_unit(i.unit_base),'normalizedQty',q),
  'asOf',now_ts,'province',p_province,'vertical',p_vertical,'sort',srt,'priceMin',p_price_min,'priceMax',p_price_max,'total',total,'offers',offers,'regions',regions);
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['price_catalog','price_import_batches','price_import_rows'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n='price_catalog' then execute format('grant select,insert,update on public.%I to service_role',n);
 else execute format('grant select,insert on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('price_norm_unit','price_norm_qty','price_catalog_upsert','price_official_import_record','price_import_summary','public_price_search','public_price_compare') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
