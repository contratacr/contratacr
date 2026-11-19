-- LOCAL PRO ONLY. Place features round (owner approval 2026-11-17): brand pages (/marca/<slug>) grouping the branches of a
-- chain. Depends on directory-core-local.sql, directory-import-local.sql (dir_import_ref_place), directory-claims-local.sql,
-- directory-moderation-local.sql (dir_claim_uploads, dir_mod_log, dir_mod_reason_ok) and directory-place-tools-local.sql.
-- * dir_brands: one row per chain. Built from OpenStreetMap brand / brand:wikidata of imported places (dir_brand_import,
--   key = Wikidata id when present, else the normalized brand name) and completed by normalized names
--   (dir_brand_match_names: same section as the brand's OSM branches, name equal to the brand or starting with it).
--   Staff merge two brands or split branches into a new brand (/admin/directorio, tab «Marcas»); a staff assignment is
--   never overwritten by the importer. Every change is in the immutable dir_brand_history (+ dir_moderation_log).
-- * Public page: branches that are public places, ordered by province then name (never by payment), aggregate rating =
--   review-count-weighted average of the branches. A merged brand answers with the brand it was merged into.
-- * Claiming a brand: always staff-reviewed with documents (the same private uploads as place claims,
--   dir_claim_uploads, uploaded by the claimant for that claim id); one open claim per brand; no self-approval. An
--   approved brand owner manages the common information of all branches (website, short description ES/EN), shown on
--   the brand page and on every branch page; it never changes order or visibility.
-- Tables: RLS on, service_role only, no DELETE grant. Functions security invoker, pinned search_path, service_role only.
begin;

create table if not exists public.dir_brands(
 id uuid primary key,
 slug text not null unique check(slug~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$'),
 name text not null check(length(btrim(name)) between 2 and 120),
 name_normalized text generated always as (public.dir_normalize(name)) stored,
 wikidata text unique check(wikidata~'^Q[0-9]{1,12}$'),
 status text not null default 'active' constraint dir_brands_status_check check(status in('active','merged','hidden')),
 merged_into uuid references public.dir_brands(id),
 website text check(website~'^https://[^\s"<>]{3,}$' and length(website)<=500),
 description_es text check(length(btrim(description_es)) between 1 and 500 and description_es!~*'(https?://|www\.)'),
 description_en text check(length(btrim(description_en)) between 1 and 500 and description_en!~*'(https?://|www\.)'),
 claim_status text not null default 'unclaimed' check(claim_status in('unclaimed','claim_pending','claimed')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((status='merged')=(merged_into is not null)),check(merged_into is distinct from id)
);
create index if not exists dir_brands_norm on public.dir_brands(name_normalized) where status='active';
-- Databases created before 'hidden' (generic «brands» such as «Servicentro» that are not a chain): widen the check.
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.dir_brands'::regclass and contype='c' and pg_get_constraintdef(oid) like '%merged%' and pg_get_constraintdef(oid) not like '%hidden%' loop
  execute format('alter table public.dir_brands drop constraint %I',c.conname);end loop;
 if not exists(select 1 from pg_constraint where conname='dir_brands_status_check' and conrelid='public.dir_brands'::regclass) then
  alter table public.dir_brands add constraint dir_brands_status_check check(status in('active','merged','hidden'));end if;
end $$;
create table if not exists public.dir_place_brands(
 place_id uuid primary key references public.dir_places(id),
 brand_id uuid not null references public.dir_brands(id),
 source text not null check(source in('osm','name','staff')),
 action_id uuid not null,
 assigned_at timestamptz not null default clock_timestamp()
);
create index if not exists dir_place_brands_brand on public.dir_place_brands(brand_id);
create table if not exists public.dir_brand_history(
 id bigint generated always as identity primary key,
 brand_id uuid not null references public.dir_brands(id),
 place_id uuid references public.dir_places(id),
 action text not null check(action in('create','assign','merge','split','info','claim','hide')),
 actor_id uuid not null,action_id uuid not null,
 before jsonb,after jsonb not null,
 at timestamptz not null default clock_timestamp()
);
create index if not exists dir_brand_history_brand on public.dir_brand_history(brand_id,id);
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.dir_brand_history'::regclass and contype='c' and pg_get_constraintdef(oid) like '%assign%' and pg_get_constraintdef(oid) not like '%hide%' loop
  execute format('alter table public.dir_brand_history drop constraint %I',c.conname);
  alter table public.dir_brand_history add constraint dir_brand_history_action_check check(action in('create','assign','merge','split','info','claim','hide'));
 end loop;
end $$;
create table if not exists public.dir_brand_claims(
 id uuid primary key,
 brand_id uuid not null references public.dir_brands(id),
 claimant_id uuid not null,
 documents jsonb not null check(jsonb_typeof(documents)='array' and jsonb_array_length(documents) between 1 and 5),
 note text check(length(note) between 1 and 1000),
 status text not null default 'open' check(status in('open','approved','rejected')),
 decision_reason text check(length(decision_reason) between 3 and 1000),
 reviewed_by uuid,reviewed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check((status='open')=(reviewed_at is null)),check((reviewed_by is null)=(reviewed_at is null)),
 check(reviewed_by is null or reviewed_by<>claimant_id),
 check(status<>'rejected' or decision_reason is not null)
);
create unique index if not exists dir_brand_claims_one_open on public.dir_brand_claims(brand_id) where status='open';
create table if not exists public.dir_brand_managers(
 id uuid primary key,
 brand_id uuid not null references public.dir_brands(id),
 user_id uuid not null,
 claim_id uuid not null references public.dir_brand_claims(id),
 status text not null default 'active' check(status in('active','revoked')),
 granted_by uuid not null,granted_at timestamptz not null default clock_timestamp()
);
create unique index if not exists dir_brand_managers_one on public.dir_brand_managers(brand_id) where status='active';

do $$declare t text;begin
 drop trigger if exists dir_brand_history_immutable on public.dir_brand_history;
 create trigger dir_brand_history_immutable before update or delete on public.dir_brand_history for each row execute function public.dir_immutable();
 foreach t in array array['dir_brands','dir_place_brands','dir_brand_history','dir_brand_claims','dir_brand_managers'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.dir_immutable()',t||'_no_truncate',t);
 end loop;
end $$;
create or replace function public.dir_brands_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Brands are merged, never deleted' using errcode='23514';end if;
 if tg_table_name='dir_brands' then
  if new.id<>old.id or new.created_at<>old.created_at then raise exception 'Brand identity is immutable' using errcode='23514';end if;
  if old.status in('merged','hidden') then raise exception 'A merged or hidden brand is final' using errcode='23514';end if;
  new.updated_at:=clock_timestamp();
 elsif tg_table_name='dir_brand_claims' then
  if new.id<>old.id or new.brand_id<>old.brand_id or new.claimant_id<>old.claimant_id or new.documents<>old.documents or new.created_at<>old.created_at then
   raise exception 'Claim identity is immutable' using errcode='23514';end if;
  if old.status<>'open' then raise exception 'A decided claim is final' using errcode='23514';end if;
 end if;
 return new;
end $$;
drop trigger if exists dir_brands_guard on public.dir_brands;
create trigger dir_brands_guard before update or delete on public.dir_brands for each row execute function public.dir_brands_guard();
drop trigger if exists dir_brand_claims_guard on public.dir_brand_claims;
create trigger dir_brand_claims_guard before update or delete on public.dir_brand_claims for each row execute function public.dir_brands_guard();
drop trigger if exists dir_place_brands_no_delete on public.dir_place_brands;
create trigger dir_place_brands_no_delete before delete on public.dir_place_brands for each row execute function public.dir_immutable();

-- ---------------------------------------------------------------- helpers
create or replace function public.dir_brand_slug(p_name text,p_key text) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare base text:=coalesce(nullif(left(btrim(regexp_replace(public.dir_normalize(p_name),' +','-','g'),'-'),60),''),'marca');s text:=base;i integer:=0;
begin
 if length(s)<3 then s:=s||'-cr';base:=s;end if;
 while exists(select 1 from public.dir_brands where slug=s) loop i:=i+1;s:=base||'-'||substr(md5(coalesce(p_key,'')||':'||i),1,4);end loop;
 return s;
end $$;
create or replace function public.dir_brand_snapshot(b public.dir_brands) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',b.id,'slug',b.slug,'name',b.name,'wikidata',b.wikidata,'status',b.status,'mergedInto',b.merged_into,'website',b.website,
  'descriptionEs',b.description_es,'descriptionEn',b.description_en,'claimStatus',b.claim_status,'revision',b.revision,
  'branches',(select count(*) from public.dir_place_brands pb where pb.brand_id=b.id)) $$;
-- Moves a place to a brand (history row); staff assignments are kept unless p_source='staff'.
create or replace function public.dir_brand_assign(p_actor uuid,p_action uuid,p_place uuid,p_brand uuid,p_source text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare cur public.dir_place_brands;
begin
 select * into cur from public.dir_place_brands where place_id=p_place for update;
 if found and (cur.brand_id=p_brand or (cur.source='staff' and p_source<>'staff') or (cur.source='osm' and p_source='name')) then return false;end if;
 if found then update public.dir_place_brands set brand_id=p_brand,source=p_source,action_id=p_action,assigned_at=clock_timestamp() where place_id=p_place;
 else insert into public.dir_place_brands(place_id,brand_id,source,action_id) values(p_place,p_brand,p_source,p_action);end if;
 insert into public.dir_brand_history(brand_id,place_id,action,actor_id,action_id,before,after)
 values(p_brand,p_place,'assign',p_actor,p_action,case when cur.place_id is not null then jsonb_build_object('brandId',cur.brand_id,'source',cur.source) end,jsonb_build_object('brandId',p_brand,'source',p_source));
 return true;
end $$;

-- ---------------------------------------------------------------- import (staff / importer)
-- Input: {actionId, sourceId:'osm', rows:[{ref, brand, wikidata?, via?, vertical?}]} (1..5000).
-- 2026-11-17 (chains without OSM brand tags): via 'name' (+ vertical, required) = grouped by the importer from the
-- normalized name/operator (scripts/directory/stage-brands.mjs nameBrandRows): assigned with source 'name' only to a
-- place of that section without a brand (or whose brand was hidden by staff: not a chain), and only to a brand with no
-- branches yet or with branches in that section. It never moves an existing assignment (staff, OSM or name).
create or replace function public.dir_brand_import(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;prior jsonb;r jsonb;n integer;p public.dir_places;b public.dir_brands;nm text;wd text;via text;vt text;created integer:=0;assigned integer:=0;skipped integer:=0;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'rows')<>'array' or jsonb_array_length(p_input->'rows') not between 1 and 5000
  or p_input->>'sourceId' is distinct from 'osm' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','sourceId','rows')) then raise exception 'Invalid brand import' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');if aid is null then raise exception 'Invalid brand import' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-brands',0));
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 for r,n in select x,o::integer from jsonb_array_elements(p_input->'rows') with ordinality t(x,o) loop
  nm:=btrim(regexp_replace(coalesce(r->>'brand',''),'\s+',' ','g'));wd:=nullif(r->>'wikidata','');via:=coalesce(r->>'via','osm');vt:=r->>'vertical';
  if jsonb_typeof(r)<>'object' or coalesce(r->>'ref','')!~'^[A-Za-z0-9:/._-]{1,120}$' or length(nm) not between 2 and 120 or (wd is not null and wd!~'^Q[0-9]{1,12}$')
   or via not in('osm','name') or (via='name' and coalesce(vt,'')!~'^[a-z_]{2,40}$') or (via='osm' and vt is not null) then
   raise exception 'Invalid brand row %',n using errcode='22023';end if;
  p:=public.dir_import_ref_place('osm',r->>'ref');
  if p.id is null or p.status='removed' or (via='name' and (p.vertical_id is distinct from vt or exists(select 1 from public.dir_place_brands pb
   join public.dir_brands x on x.id=pb.brand_id where pb.place_id=p.id and (x.status<>'hidden' or pb.source='staff')))) then skipped:=skipped+1;continue;end if;
  b:=null;
  if wd is not null then select * into b from public.dir_brands where wikidata=wd;end if;
  if b.id is null then select * into b from public.dir_brands where name_normalized=public.dir_normalize(nm) and status='active' and (wd is null or wikidata is null) order by created_at limit 1;end if;
  if b.id is not null and b.status='merged' then select * into b from public.dir_brands where id=b.merged_into;end if;
  if b.id is not null and b.status='hidden' then skipped:=skipped+1;continue;end if;
  if b.id is null and exists(select 1 from public.dir_brands where name_normalized=public.dir_normalize(nm) and status='hidden') then skipped:=skipped+1;continue;end if;
  -- A name grouping never joins a brand of another section.
  if via='name' and b.id is not null and exists(select 1 from public.dir_place_brands pb where pb.brand_id=b.id)
   and not exists(select 1 from public.dir_place_brands pb join public.dir_places q on q.id=pb.place_id where pb.brand_id=b.id and q.vertical_id=p.vertical_id) then
   skipped:=skipped+1;continue;end if;
  if b.id is null then
   insert into public.dir_brands(id,slug,name,wikidata) values(public.dir_derived_uuid(aid,'brand:'||coalesce(wd,public.dir_normalize(nm))),public.dir_brand_slug(nm,coalesce(wd,nm)),nm,wd) returning * into b;
   insert into public.dir_brand_history(brand_id,action,actor_id,action_id,after) values(b.id,'create',p_actor,aid,public.dir_brand_snapshot(b));created:=created+1;
  elsif wd is not null and b.wikidata is null then
   update public.dir_brands set wikidata=wd,revision=revision+1 where id=b.id returning * into b;
  end if;
  if public.dir_brand_assign(p_actor,aid,p.id,b.id,via) then assigned:=assigned+1;else skipped:=skipped+1;end if;
 end loop;
 result:=jsonb_build_object('created',created,'assigned',assigned,'skipped',skipped);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Input: {actionId}. Places without a brand whose normalized name equals a brand name or starts with it + space, in the
-- section where that brand has most of its OSM branches. Brand names shorter than 3 characters are skipped.
create or replace function public.dir_brand_match_names(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;prior jsonb;b record;pl record;assigned integer:=0;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k<>'actionId') then raise exception 'Invalid match' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');if aid is null then raise exception 'Invalid match' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-brands',0));
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 for b in select br.id,br.name_normalized norm,(select p.vertical_id from public.dir_place_brands pb join public.dir_places p on p.id=pb.place_id where pb.brand_id=br.id group by 1 order by count(*) desc,1 limit 1) vertical
  from public.dir_brands br where br.status='active' and length(br.name_normalized)>=3 loop
  if b.vertical is null then continue;end if;
  for pl in select p.id from public.dir_places p where p.vertical_id=b.vertical and p.status in('published','draft','closed_permanently')
    and (p.name_normalized=b.norm or left(p.name_normalized,length(b.norm)+1)=b.norm||' ')
    and not exists(select 1 from public.dir_place_brands pb where pb.place_id=p.id) loop
   if public.dir_brand_assign(p_actor,aid,pl.id,b.id,'name') then assigned:=assigned+1;end if;
  end loop;
 end loop;
 result:=jsonb_build_object('assigned',assigned);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- public readers
create or replace function public.dir_brand_public(p_slug text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare b public.dir_brands;tgt public.dir_brands;
begin
 if p_slug is null or p_slug!~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$' then return null;end if;
 select * into b from public.dir_brands where slug=p_slug;
 if not found then return null;end if;
 if b.status='merged' then
  select * into tgt from public.dir_brands where id=b.merged_into;
  while tgt.status='merged' loop select * into tgt from public.dir_brands where id=tgt.merged_into;end loop;
  return case when tgt.status='active' then jsonb_build_object('mergedInto',tgt.slug) end;
 end if;
 if b.status<>'active' then return null;end if;
 return (with br as(select p.* from public.dir_place_brands pb join public.dir_places p on p.id=pb.place_id where pb.brand_id=b.id and p.status='published' and public.dir_place_public(p.slug) is not null)
  select case when (select count(*) from br)=0 then null else jsonb_build_object('slug',b.slug,'name',b.name,'website',b.website,'descriptionEs',b.description_es,'descriptionEn',b.description_en,
   'claimed',b.claim_status='claimed','claimPending',b.claim_status='claim_pending','branchCount',(select count(*) from br),
   'rating',jsonb_build_object('average',(select round(sum(rating_avg*rating_count)/nullif(sum(rating_count),0),2) from br where rating_count>0),'count',(select coalesce(sum(rating_count),0) from br)),
   'verticals',(select jsonb_agg(distinct vertical_id) from br),
   'provinces',(select coalesce(jsonb_agg(distinct admin_area_1),'[]') from br where admin_area_1 is not null),
   'branches',(select jsonb_agg(jsonb_build_object('slug',slug,'name',name,'vertical',vertical_id,'province',admin_area_1,'area',concat_ws(', ',locality,admin_area_2,admin_area_1),
     'lat',lat,'lng',lng,'rating',rating_avg,'ratingCount',rating_count) order by admin_area_1 nulls last,name,slug) from br)) end);
end $$;
-- Brand of a place (for «Parte de <marca>» on the place page): only active brands with at least two public branches.
create or replace function public.dir_place_brand_public(p_slug text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('slug',b.slug,'name',b.name,'website',b.website,'descriptionEs',b.description_es,'descriptionEn',b.description_en,
  'branches',(select count(*) from public.dir_place_brands x join public.dir_places q on q.id=x.place_id where x.brand_id=b.id and q.status='published'))
 from public.dir_places p join public.dir_place_brands pb on pb.place_id=p.id join public.dir_brands b on b.id=pb.brand_id
 where p.slug=p_slug and b.status='active' and public.dir_place_public(p_slug) is not null
  and (select count(*) from public.dir_place_brands x join public.dir_places q on q.id=x.place_id where x.brand_id=b.id and q.status='published')>=2 $$;

-- ---------------------------------------------------------------- staff: merge / split / list
-- Input: {actionId, brandId, intoBrandId, reason, expectedRevision}. All branches move (source kept), brand -> merged.
create or replace function public.dir_admin_brand_merge(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;tid uuid;why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');prior jsonb;b public.dir_brands;t public.dir_brands;before jsonb;moved integer;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'expectedRevision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','brandId','intoBrandId','reason','expectedRevision')) then raise exception 'Invalid merge' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');bid:=public.dir_try_uuid(p_input->>'brandId');tid:=public.dir_try_uuid(p_input->>'intoBrandId');
 if aid is null or bid is null or tid is null or bid=tid or not public.dir_mod_reason_ok(why,false) then raise exception 'Invalid merge' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-brands',0));
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into b from public.dir_brands where id=bid for update;select * into t from public.dir_brands where id=tid for update;
 if b.id is null or t.id is null or b.status<>'active' or t.status<>'active' then raise exception 'Brand not found' using errcode='P0002';end if;
 if b.revision<>(p_input->>'expectedRevision')::integer then raise exception 'Brand changed' using errcode='40001';end if;
 if b.claim_status<>'unclaimed' then raise exception 'A claimed brand cannot be merged away' using errcode='22023',hint='dir_brand_claimed';end if;
 before:=public.dir_brand_snapshot(b);
 update public.dir_place_brands set brand_id=tid,action_id=aid,assigned_at=clock_timestamp() where brand_id=bid;get diagnostics moved=row_count;
 update public.dir_brands set status='merged',merged_into=tid,revision=revision+1 where id=bid returning * into b;
 update public.dir_brands set revision=revision+1 where id=tid returning * into t;
 insert into public.dir_brand_history(brand_id,action,actor_id,action_id,before,after) values(bid,'merge',p_actor,aid,before,public.dir_brand_snapshot(b)),(tid,'merge',p_actor,aid,null,public.dir_brand_snapshot(t));
 perform public.dir_mod_log(p_actor,aid,'brand',bid,null,'merge',why,before,public.dir_brand_snapshot(b));
 result:=jsonb_build_object('brandId',bid,'intoBrandId',tid,'moved',moved,'slug',t.slug);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
-- Input: {actionId, brandId, newBrandId, name, placeSlugs[1..500], reason, expectedRevision}. The listed branches of
-- brandId move to a NEW brand (source staff, so the importer never moves them back).
create or replace function public.dir_admin_brand_split(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;nid uuid;why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');nm text:=btrim(regexp_replace(coalesce(p_input->>'name',''),'\s+',' ','g'));
 prior jsonb;b public.dir_brands;nb public.dir_brands;s text;pid uuid;moved integer:=0;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'expectedRevision')<>'number' or jsonb_typeof(p_input->'placeSlugs')<>'array'
  or jsonb_array_length(p_input->'placeSlugs') not between 1 and 500
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','brandId','newBrandId','name','placeSlugs','reason','expectedRevision')) then raise exception 'Invalid split' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');bid:=public.dir_try_uuid(p_input->>'brandId');nid:=public.dir_try_uuid(p_input->>'newBrandId');
 if aid is null or bid is null or nid is null or length(nm) not between 2 and 120 or not public.dir_mod_reason_ok(why,false) then raise exception 'Invalid split' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-brands',0));
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into b from public.dir_brands where id=bid for update;
 if b.id is null or b.status<>'active' then raise exception 'Brand not found' using errcode='P0002';end if;
 if b.revision<>(p_input->>'expectedRevision')::integer then raise exception 'Brand changed' using errcode='40001';end if;
 if exists(select 1 from public.dir_brands where id=nid) then raise exception 'Brand id reused' using errcode='22023';end if;
 insert into public.dir_brands(id,slug,name) values(nid,public.dir_brand_slug(nm,nid::text),nm) returning * into nb;
 insert into public.dir_brand_history(brand_id,action,actor_id,action_id,after) values(nid,'create',p_actor,aid,public.dir_brand_snapshot(nb));
 for s in select jsonb_array_elements_text(p_input->'placeSlugs') loop
  select pb.place_id into pid from public.dir_place_brands pb join public.dir_places p on p.id=pb.place_id where p.slug=s and pb.brand_id=bid;
  if pid is null then raise exception 'Branch % is not in this brand',s using errcode='22023',hint='dir_brand_not_branch';end if;
  perform public.dir_brand_assign(p_actor,aid,pid,nid,'staff');moved:=moved+1;
 end loop;
 update public.dir_brands set revision=revision+1 where id=bid returning * into b;
 insert into public.dir_brand_history(brand_id,action,actor_id,action_id,after) values(bid,'split',p_actor,aid,public.dir_brand_snapshot(b));
 perform public.dir_mod_log(p_actor,aid,'brand',bid,null,'split',why,null,jsonb_build_object('newBrand',public.dir_brand_snapshot(nb),'moved',moved));
 result:=jsonb_build_object('brandId',bid,'newBrandId',nid,'slug',nb.slug,'moved',moved);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.dir_admin_brand_queue(p_query text default null,p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.n desc,x.name),'[]') from(
  select b.name,(select count(*) from public.dir_place_brands pb where pb.brand_id=b.id) n,public.dir_brand_snapshot(b)||jsonb_build_object(
   'sources',(select jsonb_object_agg(src,c) from(select source src,count(*) c from public.dir_place_brands pb where pb.brand_id=b.id group by 1) s),
   'branchList',(select coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'name',p.name,'source',pb.source,'province',p.admin_area_1) order by p.name),'[]') from(
     select * from public.dir_place_brands pb2 where pb2.brand_id=b.id limit 40) pb join public.dir_places p on p.id=pb.place_id)) j
  from public.dir_brands b where b.status='active' and (p_query is null or b.name_normalized like '%'||public.dir_normalize(p_query)||'%')
  order by 2 desc,b.name limit least(greatest(coalesce(p_limit,50),1),200)) x $$;

-- Input: {actionId, brandId, reason, expectedRevision}. A generic «brand» that is not a chain (e.g. «Servicentro») is
-- hidden: no brand page, no «Sucursal de» link, the importer and name matching skip it. Final; branches stay as places.
create or replace function public.dir_admin_brand_hide(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');prior jsonb;b public.dir_brands;before jsonb;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'expectedRevision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','brandId','reason','expectedRevision')) then raise exception 'Invalid hide' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');bid:=public.dir_try_uuid(p_input->>'brandId');
 if aid is null or bid is null or not public.dir_mod_reason_ok(why,false) then raise exception 'Invalid hide' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-brands',0));
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into b from public.dir_brands where id=bid for update;
 if b.id is null or b.status<>'active' then raise exception 'Brand not found' using errcode='P0002';end if;
 if b.revision<>(p_input->>'expectedRevision')::integer then raise exception 'Brand changed' using errcode='40001';end if;
 if b.claim_status<>'unclaimed' then raise exception 'A claimed brand cannot be hidden' using errcode='22023',hint='dir_brand_claimed';end if;
 before:=public.dir_brand_snapshot(b);
 update public.dir_brands set status='hidden',revision=revision+1 where id=bid returning * into b;
 insert into public.dir_brand_history(brand_id,action,actor_id,action_id,before,after) values(bid,'hide',p_actor,aid,before,public.dir_brand_snapshot(b));
 perform public.dir_mod_log(p_actor,aid,'brand',bid,null,'hide',why,before,public.dir_brand_snapshot(b));
 result:=jsonb_build_object('brandId',bid,'status',b.status);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- brand claims
-- Input: {actionId, claimId, brandSlug, documents:[{kind,path}] (1..5, uploads of this person for this claim id), note?}.
create or replace function public.dir_brand_claim_open(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;prior jsonb;b public.dir_brands;c public.dir_brand_claims;nt text:=nullif(btrim(coalesce(p_input->>'note','')),'');result jsonb;
begin
 if p_actor is null then raise exception 'Sign in to claim' using errcode='42501',hint='dir_qa_login';end if;
 if jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'documents')<>'array' or jsonb_array_length(p_input->'documents') not between 1 and 5
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId','brandSlug','documents','note')) or length(coalesce(nt,'x'))>1000 then
  raise exception 'Invalid brand claim' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');
 if aid is null or cid is null then raise exception 'Invalid brand claim' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 if exists(select 1 from jsonb_array_elements(p_input->'documents') d where jsonb_typeof(d)<>'object'
   or not exists(select 1 from public.dir_claim_uploads u where u.path=d->>'path' and u.claim_id=cid and u.uploader_id=p_actor and u.kind=d->>'kind')) then
  raise exception 'Unknown document' using errcode='22023',hint='dir_claim_evidence';end if;
 select * into b from public.dir_brands where slug=p_input->>'brandSlug' and status='active' for update;
 if not found then raise exception 'Brand not found' using errcode='P0002';end if;
 if b.claim_status='claimed' then raise exception 'Brand already claimed' using errcode='23505',hint='dir_place_already_claimed';end if;
 if exists(select 1 from public.dir_brand_claims where brand_id=b.id and status='open') then raise exception 'Claim pending' using errcode='23505',hint='dir_claim_pending';end if;
 if exists(select 1 from public.dir_brand_claims where id=cid) or exists(select 1 from public.dir_place_claims where id=cid) then raise exception 'Claim id reused' using errcode='22023';end if;
 if (select count(*) from public.dir_brand_claims where claimant_id=p_actor and created_at>clock_timestamp()-interval '1 day')>=3 then raise exception 'Too many claims' using errcode='54000',hint='dir_claim_cap';end if;
 insert into public.dir_brand_claims(id,brand_id,claimant_id,documents,note) values(cid,b.id,p_actor,p_input->'documents',nt) returning * into c;
 update public.dir_brands set claim_status='claim_pending',revision=revision+1 where id=b.id;
 insert into public.dir_brand_history(brand_id,action,actor_id,action_id,after) values(b.id,'claim',p_actor,aid,jsonb_build_object('claimId',cid,'status','open'));
 result:=jsonb_build_object('claimId',cid,'status','open');
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.dir_admin_brand_claim_queue(p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('claimId',c.id,'brandId',b.id,'slug',b.slug,'brandName',b.name,'claimantId',c.claimant_id,'documents',c.documents,'note',c.note,
  'createdAt',c.created_at,'branches',(select count(*) from public.dir_place_brands pb where pb.brand_id=b.id)) order by c.created_at),'[]')
 from(select * from public.dir_brand_claims where status='open' order by created_at limit least(greatest(coalesce(p_limit,50),1),200)) c join public.dir_brands b on b.id=c.brand_id $$;
-- Input: {actionId, claimId, decision: approve|reject, reason (required to reject)}.
create or replace function public.dir_admin_brand_claim_decide(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;cid uuid;dec text:=p_input->>'decision';why text:=nullif(btrim(coalesce(p_input->>'reason','')),'');prior jsonb;c public.dir_brand_claims;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','claimId','decision','reason')) then raise exception 'Invalid decision' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');cid:=public.dir_try_uuid(p_input->>'claimId');
 if aid is null or cid is null or dec is null or dec not in('approve','reject') or not public.dir_mod_reason_ok(why,dec='approve') then raise exception 'Invalid decision' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into c from public.dir_brand_claims where id=cid for update;
 if not found then raise exception 'Claim not found' using errcode='P0002';end if;
 if c.status<>'open' then raise exception 'Claim closed' using errcode='40001',hint='dir_claim_closed';end if;
 if c.claimant_id=p_actor then raise exception 'No self-approval' using errcode='42501',hint='dir_claim_self_review';end if;
 update public.dir_brand_claims set status=case dec when 'approve' then 'approved' else 'rejected' end,decision_reason=why,reviewed_by=p_actor,reviewed_at=clock_timestamp() where id=cid returning * into c;
 if dec='approve' then
  insert into public.dir_brand_managers(id,brand_id,user_id,claim_id,granted_by) values(public.dir_derived_uuid(cid,'brand-manager'),c.brand_id,c.claimant_id,cid,p_actor);
  update public.dir_brands set claim_status='claimed',revision=revision+1 where id=c.brand_id;
 else update public.dir_brands set claim_status='unclaimed',revision=revision+1 where id=c.brand_id;end if;
 insert into public.dir_brand_history(brand_id,action,actor_id,action_id,after) values(c.brand_id,'claim',p_actor,aid,jsonb_build_object('claimId',cid,'status',c.status));
 perform public.dir_mod_log(p_actor,aid,'brand_claim',cid,null,dec,why,jsonb_build_object('status','open'),jsonb_build_object('status',c.status));
 result:=jsonb_build_object('claimId',cid,'status',c.status);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- brand owner
create or replace function public.dir_brand_manager_read(p_actor uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(public.dir_brand_snapshot(b) order by b.name),'[]') from public.dir_brand_managers m join public.dir_brands b on b.id=m.brand_id
 where m.user_id=p_actor and m.status='active' and b.status='active' $$;
-- Input: {actionId, brandId, revision, website (https or null), descriptionEs (or null), descriptionEn (or null)}.
create or replace function public.dir_brand_info_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;rev integer;prior jsonb;b public.dir_brands;before jsonb;w text:=nullif(btrim(coalesce(p_input->>'website','')),'');
 de text:=nullif(btrim(coalesce(p_input->>'descriptionEs','')),'');dn text:=nullif(btrim(coalesce(p_input->>'descriptionEn','')),'');result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'revision')<>'number'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','brandId','revision','website','descriptionEs','descriptionEn')) then raise exception 'Invalid brand info' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');bid:=public.dir_try_uuid(p_input->>'brandId');
 begin rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid brand info' using errcode='22023';end;
 if aid is null or bid is null or (w is not null and (w!~'^https://[^\s"<>]{3,}$' or length(w)>500))
  or length(coalesce(de,'x'))>500 or length(coalesce(dn,'x'))>500 or concat_ws(' ',de,dn)~*'(https?://|www\.)' then raise exception 'Invalid brand info' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 if not exists(select 1 from public.dir_brand_managers where brand_id=bid and user_id=p_actor and status='active') then raise exception 'Only the brand owner' using errcode='42501',hint='dir_tool_not_manager';end if;
 select * into b from public.dir_brands where id=bid for update;
 if b.status<>'active' then raise exception 'Brand not found' using errcode='P0002';end if;
 if b.revision<>rev then raise exception 'Brand changed' using errcode='40001';end if;
 before:=public.dir_brand_snapshot(b);
 update public.dir_brands set website=w,description_es=de,description_en=dn,revision=revision+1 where id=bid returning * into b;
 insert into public.dir_brand_history(brand_id,action,actor_id,action_id,before,after) values(bid,'info',p_actor,aid,before,public.dir_brand_snapshot(b));
 result:=public.dir_brand_snapshot(b);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

do $$declare n text;begin foreach n in array array['dir_brands','dir_place_brands','dir_brand_history','dir_brand_claims','dir_brand_managers'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n='dir_brand_history' then execute format('grant select,insert on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and (p.proname like 'dir\_brand%' or p.proname like 'dir\_admin\_brand%' or p.proname='dir_place_brand_public') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if (select prorettype from pg_proc where oid=f)<>'trigger'::regtype then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
