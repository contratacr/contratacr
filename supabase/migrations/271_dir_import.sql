-- LOCAL PRO ONLY. Multivertical round F2 (2026-11-16): seed import with provenance. Requires directory-core-local.sql.
-- * scripts/directory/stage-import.mjs turns a LOCAL OSM-style GeoJSON/Overpass JSON file into a staging payload
--   (no network). dir_import_stage stores it as a batch of dir_import_rows: only name, vertical, address,
--   coordinates and the business phone (only when the source license allows it). Raw OSM tags are never stored.
-- * Each row is classified when staged and again at commit: staged / rejected (invalid, outside the country,
--   removed by request) / duplicate (same source reference already imported, or same normalized name within 75 m
--   of an existing place or of an earlier row of the batch, measured with dir_haversine_km).
-- * dir_import_commit creates the places through dir_place_mutate (verification 'imported', provenance per field
--   with source id + reference, history, receipts), so OSM data keeps its attribution on the public page.
--   dir_import_rows stays as the separate source collection (ODbL: attribution; lawyer review pending on whether
--   the derived directory is share-alike).
-- * Removal requests use dir_reports (kind removal_request). Once accepted the place is 'removed' and the same
--   source reference is rejected on every later import ('removed_by_request'), so the seed never re-creates it.
-- * 2026-11-17 (new place sections): a row may carry `attributes` ({kind, …} derived from OSM category tags by
--   stage-import.mjs classifyTags). Staged only when dir_attributes_ok accepts them for the row's vertical (otherwise
--   the row is staged without attributes); dir_import_commit passes them to dir_place_mutate (provenance 'attributes').
-- Tables: RLS on, service_role only, no DELETE grant; functions security invoker with a pinned search_path.
begin;

create or replace function public.dir_haversine_km(p_lat1 double precision,p_lng1 double precision,p_lat2 double precision,p_lng2 double precision) returns double precision
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select 2*6371.0088*asin(least(1,sqrt(power(sin(radians(p_lat2-p_lat1)/2),2)+cos(radians(p_lat1))*cos(radians(p_lat2))*power(sin(radians(p_lng2-p_lng1)/2),2)))) $$;

create table if not exists public.dir_import_batches(
 id uuid primary key,source_id text not null references public.dir_data_sources(id),
 file_name text not null check(length(file_name) between 1 and 200),
 file_sha256 text not null check(file_sha256~'^[a-f0-9]{64}$'),part integer not null default 1 check(part between 1 and 1000),
 status text not null default 'staged' check(status in('staged','committed','cancelled')),
 row_count integer not null check(row_count between 1 and 5000),
 created_by uuid not null,action_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 committed_by uuid,committed_at timestamptz,check((status='committed')=(committed_at is not null)),
 unique(source_id,file_sha256,part)
);
create table if not exists public.dir_import_rows(
 batch_id uuid not null references public.dir_import_batches(id),row_no integer not null check(row_no>0),
 source_ref text not null check(source_ref~'^[A-Za-z0-9:/._-]{1,120}$'),
 vertical_id text check(length(vertical_id)<=40),
 name text check(length(name)<=300),
 name_normalized text generated always as (public.dir_normalize(name)) stored,
 admin_area_1 text check(length(admin_area_1)<=80),admin_area_2 text check(length(admin_area_2)<=80),admin_area_3 text check(length(admin_area_3)<=80),
 locality text check(length(locality)<=80),address_line text check(length(address_line)<=300),
 lat numeric(9,6) check(lat between -90 and 90),lng numeric(9,6) check(lng between -180 and 180),
 location_precision text not null default 'exact' check(location_precision in('exact','street','locality','area')),
 phone text check(phone~'^\+?[0-9][0-9 ()-]{6,22}$'),
 status text not null check(status in('staged','accepted','rejected','duplicate')),
 reason text check(reason in('invalid_name','unknown_vertical','invalid_location','outside_country','removed_by_request','already_imported','near_same_name','same_ref_in_batch','manual')),
 duplicate_of_place uuid references public.dir_places(id),duplicate_of_row integer,place_id uuid references public.dir_places(id),
 decided_at timestamptz,
 primary key(batch_id,row_no),
 check((status='accepted')=(place_id is not null)),check(status in('staged','accepted') or reason is not null)
);
create index if not exists dir_import_rows_ref on public.dir_import_rows(source_ref);
alter table public.dir_import_rows add column if not exists attributes jsonb check(attributes is null or (jsonb_typeof(attributes)='object' and octet_length(attributes::text)<=2048));
do $$begin
 drop trigger if exists dir_import_batches_no_truncate on public.dir_import_batches;
 create trigger dir_import_batches_no_truncate before truncate on public.dir_import_batches for each statement execute function public.dir_immutable();
 drop trigger if exists dir_import_rows_no_truncate on public.dir_import_rows;
 create trigger dir_import_rows_no_truncate before truncate on public.dir_import_rows for each statement execute function public.dir_immutable();
end $$;

-- Places a source reference already produced (any status). Used for "already imported" and "removed by request".
create or replace function public.dir_import_ref_place(p_source text,p_ref text) returns public.dir_places
language sql stable security invoker set search_path=public,pg_temp as $$
 select p.* from public.dir_field_provenance f join public.dir_places p on p.id=f.place_id
 where f.source_id=p_source and f.source_ref=p_ref and f.field='name' order by (p.status='removed') desc,f.id limit 1 $$;
-- Nearest place (any status) with the same normalized name within 75 m; a removed one blocks the row.
create or replace function public.dir_import_near_place(p_name_norm text,p_lat numeric,p_lng numeric) returns public.dir_places
language sql stable security invoker set search_path=public,pg_temp as $$
 select p.* from public.dir_places p where p.name_normalized=p_name_norm and p.lat is not null
  and p.lat between p_lat-0.001 and p_lat+0.001 and p.lng between p_lng-0.0012 and p_lng+0.0012
  and public.dir_haversine_km(p.lat,p.lng,p_lat,p_lng)<0.075 order by (p.status='removed') desc,public.dir_haversine_km(p.lat,p.lng,p_lat,p_lng),p.id limit 1 $$;
create or replace function public.dir_import_slug(p_name text,p_source text,p_ref text,p_extra integer) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(nullif(left(btrim(regexp_replace(public.dir_normalize(p_name),' +','-','g'),'-'),60),''),'lugar')||'-'||substr(md5(p_source||':'||p_ref||':'||p_extra),1,6+p_extra) $$;

-- ---------------------------------------------------------------- stage
-- Input: {actionId, batchId, sourceId, fileName, fileSha256, part?, rows:[{ref, vertical, name, addressLine?,
--   locality?, adminArea1..3?, lat, lng, locationPrecision?, phone?, attributes?}]} (1..5000 rows).
create or replace function public.dir_import_stage(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;receipt public.dir_place_actions;ds public.dir_data_sources;r jsonb;n integer;st text;why text;dplace uuid;drow integer;
 nm text;nn text;v_lat numeric;v_lng numeric;ph text;ref text;prior public.dir_places;result jsonb;prec text;attrs jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'rows')<>'array' or jsonb_array_length(p_input->'rows') not between 1 and 5000 then
  raise exception 'Invalid import batch' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;bid:=(p_input->>'batchId')::uuid;exception when others then raise exception 'Invalid import batch' using errcode='22023';end;
 if aid is null or bid is null then raise exception 'Invalid import batch' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-import',0));
 select * into receipt from public.dir_place_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into ds from public.dir_data_sources where id=p_input->>'sourceId' and active and kind in('osm','official','partner');
 if not found then raise exception 'Unknown import source' using errcode='22023';end if;
 insert into public.dir_import_batches(id,source_id,file_name,file_sha256,part,row_count,created_by,action_id)
 values(bid,ds.id,p_input->>'fileName',p_input->>'fileSha256',coalesce((p_input->>'part')::integer,1),jsonb_array_length(p_input->'rows'),p_actor,aid);
 for r,n in select x,o::integer from jsonb_array_elements(p_input->'rows') with ordinality t(x,o) loop
  st:='staged';why:=null;dplace:=null;drow:=null;v_lat:=null;v_lng:=null;
  if jsonb_typeof(r)<>'object' then raise exception 'Invalid import row %',n using errcode='22023';end if;
  ref:=r->>'ref';nm:=btrim(coalesce(r->>'name',''));nn:=public.dir_normalize(nm);
  if ref is null or ref!~'^[A-Za-z0-9:/._-]{1,120}$' then raise exception 'Invalid source reference in row %',n using errcode='22023';end if;
  prec:=coalesce(r->>'locationPrecision','exact');
  if prec not in('exact','street','locality','area') then raise exception 'Invalid location precision in row %',n using errcode='22023';end if;
  ph:=case when ds.allows_phone and btrim(coalesce(r->>'phone',''))~'^\+?[0-9][0-9 ()-]{6,22}$' then btrim(r->>'phone') end;
  attrs:=case when jsonb_typeof(r->'attributes')='object' and r->'attributes'<>'{}'::jsonb and octet_length((r->'attributes')::text)<=2048
   and public.dir_attributes_ok(r->>'vertical',r->'attributes') then r->'attributes' end;
  if length(nm) not between 2 and 160 or nn='' then st:='rejected';why:='invalid_name';
  elsif not exists(select 1 from public.dir_verticals v where v.id=r->>'vertical' and v.active) then st:='rejected';why:='unknown_vertical';
  elsif jsonb_typeof(r->'lat')<>'number' or jsonb_typeof(r->'lng')<>'number' or abs((r->>'lat')::numeric)>90 or abs((r->>'lng')::numeric)>180 then st:='rejected';why:='invalid_location';
  else
   v_lat:=round((r->>'lat')::numeric,6);v_lng:=round((r->>'lng')::numeric,6);
   if not(v_lat between 5.0 and 11.5 and v_lng between -87.5 and -82.5) then st:='rejected';why:='outside_country';end if;
  end if;
  if st='staged' then
   prior:=public.dir_import_ref_place(ds.id,ref);
   if prior.id is not null and prior.status='removed' then st:='rejected';why:='removed_by_request';
   elsif prior.id is not null then st:='duplicate';why:='already_imported';dplace:=prior.id;
   elsif exists(select 1 from public.dir_import_rows x where x.batch_id=bid and x.source_ref=ref) then st:='duplicate';why:='same_ref_in_batch';
    drow:=(select min(x.row_no) from public.dir_import_rows x where x.batch_id=bid and x.source_ref=ref);
   else
    prior:=public.dir_import_near_place(nn,v_lat,v_lng);
    if prior.id is not null and prior.status='removed' then st:='rejected';why:='removed_by_request';
    elsif prior.id is not null then st:='duplicate';why:='near_same_name';dplace:=prior.id;
    else
     drow:=(select x.row_no from public.dir_import_rows x where x.batch_id=bid and x.status='staged' and x.name_normalized=nn
      and public.dir_haversine_km(x.lat,x.lng,v_lat,v_lng)<0.075 order by x.row_no limit 1);
     if drow is not null then st:='duplicate';why:='near_same_name';end if;
    end if;
   end if;
  end if;
  insert into public.dir_import_rows(batch_id,row_no,source_ref,vertical_id,name,admin_area_1,admin_area_2,admin_area_3,locality,address_line,lat,lng,location_precision,phone,attributes,status,reason,duplicate_of_place,duplicate_of_row,decided_at)
  values(bid,n,ref,left(r->>'vertical',40),left(nullif(nm,''),300),left(nullif(btrim(r->>'adminArea1'),''),80),left(nullif(btrim(r->>'adminArea2'),''),80),left(nullif(btrim(r->>'adminArea3'),''),80),
   left(nullif(btrim(r->>'locality'),''),80),left(nullif(btrim(r->>'addressLine'),''),300),v_lat,v_lng,prec,ph,attrs,st,why,dplace,drow,case when st<>'staged' then clock_timestamp() end);
 end loop;
 result:=public.dir_import_summary(bid);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

create or replace function public.dir_import_summary(p_batch uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('batchId',b.id,'sourceId',b.source_id,'status',b.status,'rows',b.row_count,
  'counts',(select jsonb_build_object('staged',count(*) filter(where status='staged'),'accepted',count(*) filter(where status='accepted'),
    'rejected',count(*) filter(where status='rejected'),'duplicate',count(*) filter(where status='duplicate')) from public.dir_import_rows r where r.batch_id=b.id),
  'reasons',coalesce((select jsonb_object_agg(reason,c) from (select reason,count(*) c from public.dir_import_rows r where r.batch_id=b.id and reason is not null group by reason) z),'{}'))
 from public.dir_import_batches b where b.id=p_batch $$;

-- ---------------------------------------------------------------- review (manual reject) and commit
create or replace function public.dir_import_reject(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;rn integer;receipt public.dir_place_actions;b public.dir_import_batches;result jsonb;
begin
 begin aid:=(p_input->>'actionId')::uuid;bid:=(p_input->>'batchId')::uuid;rn:=(p_input->>'rowNo')::integer;exception when others then raise exception 'Invalid review' using errcode='22023';end;
 if p_actor is null or aid is null or bid is null or rn is null then raise exception 'Invalid review' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-import',0));
 select * into receipt from public.dir_place_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into b from public.dir_import_batches where id=bid for update;
 if not found then raise exception 'Batch not found' using errcode='P0002';end if;
 if b.status<>'staged' then raise exception 'Batch already decided' using errcode='40001';end if;
 update public.dir_import_rows set status='rejected',reason='manual',decided_at=clock_timestamp() where batch_id=bid and row_no=rn and status='staged';
 if not found then raise exception 'Row not staged' using errcode='40001';end if;
 result:=public.dir_import_summary(bid);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
-- Input: {actionId, batchId, publish?:boolean}. Re-checks duplicates against places created since staging.
create or replace function public.dir_import_commit(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;receipt public.dir_place_actions;b public.dir_import_batches;x public.dir_import_rows;prior public.dir_places;dplace uuid;pid uuid;
 v_slug text;k integer;mut jsonb;pub boolean;result jsonb;
begin
 begin aid:=(p_input->>'actionId')::uuid;bid:=(p_input->>'batchId')::uuid;pub:=coalesce((p_input->>'publish')::boolean,false);exception when others then raise exception 'Invalid commit' using errcode='22023';end;
 if p_actor is null or aid is null or bid is null then raise exception 'Invalid commit' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-import',0));
 select * into receipt from public.dir_place_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into b from public.dir_import_batches where id=bid for update;
 if not found then raise exception 'Batch not found' using errcode='P0002';end if;
 if b.status<>'staged' then raise exception 'Batch already decided' using errcode='40001';end if;
 for x in select * from public.dir_import_rows where batch_id=bid and status='staged' order by row_no for update loop
  prior:=public.dir_import_ref_place(b.source_id,x.source_ref);
  if prior.id is not null then
   update public.dir_import_rows set status=case when prior.status='removed' then 'rejected' else 'duplicate' end,reason=case when prior.status='removed' then 'removed_by_request' else 'already_imported' end,
    duplicate_of_place=case when prior.status='removed' then null else prior.id end,decided_at=clock_timestamp() where batch_id=bid and row_no=x.row_no;
   continue;
  end if;
  prior:=public.dir_import_near_place(x.name_normalized,x.lat,x.lng);
  if prior.id is not null then
   update public.dir_import_rows set status=case when prior.status='removed' then 'rejected' else 'duplicate' end,reason=case when prior.status='removed' then 'removed_by_request' else 'near_same_name' end,
    duplicate_of_place=case when prior.status='removed' then null else prior.id end,decided_at=clock_timestamp() where batch_id=bid and row_no=x.row_no;continue;
  end if;
  pid:=public.dir_derived_uuid(bid,'row:'||x.row_no);k:=0;v_slug:=public.dir_import_slug(x.name,b.source_id,x.source_ref,0);
  while exists(select 1 from public.dir_places where dir_places.slug=v_slug) and k<6 loop k:=k+1;v_slug:=public.dir_import_slug(x.name,b.source_id,x.source_ref,k);end loop;
  mut:=public.dir_place_mutate(p_actor,jsonb_strip_nulls(jsonb_build_object('action','create','actionId',public.dir_derived_uuid(bid,'create:'||x.row_no),'placeId',pid,'revision',0,
   'verificationLevel','imported','source',jsonb_build_object('id',b.source_id,'ref',x.source_ref,'observedAt',b.created_at),
   'place',jsonb_build_object('slug',v_slug,'vertical',x.vertical_id,'name',x.name,'adminArea1',x.admin_area_1,'adminArea2',x.admin_area_2,'adminArea3',x.admin_area_3,
     'locality',x.locality,'addressLine',x.address_line,'lat',x.lat,'lng',x.lng,'locationPrecision',x.location_precision,'phone',x.phone,'attributes',x.attributes))));
  if pub then
   perform public.dir_place_mutate(p_actor,jsonb_build_object('action','status','status','published','placeId',pid,'revision',(mut->>'revision')::integer,
    'actionId',public.dir_derived_uuid(bid,'publish:'||x.row_no),'source',jsonb_build_object('id',b.source_id,'ref',x.source_ref)));
  end if;
  update public.dir_import_rows set status='accepted',reason=null,place_id=pid,decided_at=clock_timestamp() where batch_id=bid and row_no=x.row_no;
 end loop;
 update public.dir_import_batches set status='committed',committed_by=p_actor,committed_at=clock_timestamp() where id=bid;
 result:=public.dir_import_summary(bid);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

do $$declare n text;begin foreach n in array array['dir_import_batches','dir_import_rows'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'dir\_import\_%' or p.proname='dir_haversine_km') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
