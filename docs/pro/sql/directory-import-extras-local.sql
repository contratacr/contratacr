-- LOCAL PRO ONLY. Multivertical round F2 extras (2026-11-16): OSM opening hours and website for imported places.
-- Requires directory-core-local.sql, directory-import-local.sql (dir_import_ref_place) and directory-claims-local.sql
-- (dir_places.claim_status, dir_place_managers).
-- * scripts/directory/stage-osm-extras.mjs reads the SAME local OSM dump and sends, per OSM reference, only the
--   opening_hours value (raw text + the parsed weekly slots, or no slots when the conservative parser cannot read
--   it) and the website value (raw text + the normalized http(s) URL, or no URL when rejected).
-- * dir_import_extras_stage keeps them in dir_import_extra_batches/dir_import_extra_rows (separate OSM collection,
--   like dir_import_rows) and validates again: slots must be well formed (≤ 4 a day, ≤ 28) and the URL must satisfy
--   the dir_places check; otherwise the row is kept as unparseable/rejected and never promoted.
-- * dir_import_extras_commit promotes each field to the place created from the same source reference ONLY when:
--   the place exists and is not removed, it is unclaimed (claim_status 'unclaimed' and no active manager), and the
--   current value of that field was never set by another source (its latest provenance is this source, or the field
--   is empty with no provenance). An owner's or staff edit always wins: those rows end as 'claimed'/'owner_data'.
--   Promotion goes through dir_place_mutate (action hours / update website) with source = the OSM source and the
--   reference, so provenance, history and receipts stay complete and the public page shows the OSM attribution.
-- * 2026-11-17 (claim by e-mail): the OSM `email` / `contact:email` value travels the same way (raw text + the
--   normalized lowercase address, or no address when rejected; optional emailEditedAt = upstream edit date of the
--   element). It is promoted to dir_places.email under the same rules as the website; the place page never shows it
--   (only masked, in the claim block). emailEditedAt becomes the provenance observed_at, so dir_listed_email_eligible
--   can refuse an upstream edit younger than 30 days.
-- * dir_place_hours_source(slug): source kind backing the current hours of a public place (the page shows
--   «Horario según OpenStreetMap; confírmelo con el negocio» when it is 'osm').
-- * 2026-11-17 (new place sections): dir_import_reclassify moves imported places to another vertical by source
--   reference (cafés/bakeries/bars from restaurant to cafe_bar, hotels tagged with a restaurant to lodging). Slug, id,
--   reviews, photos, hours and every other field stay; only vertical_id changes (+ the new `kind` attribute), with
--   provenance ('vertical', 'attributes': source + reference), a before/after dir_place_history row and an idempotent
--   receipt. Claimed or managed places are never moved (the owner decides: 'claimed_kept'); removed places neither.
-- Tables: RLS on, service_role only, no DELETE grant, TRUNCATE blocked; functions security invoker, pinned search_path.
begin;

-- Weekly slots as staged: [{weekday 0..6 (0 = Sunday), opens 'HH:MM' (00:00..23:59), closes 'HH:MM' or '24:00'}],
-- 1..28 items, at most 4 a day, opens <> closes, exactly those three keys.
create or replace function public.dir_import_hours_ok(p jsonb) returns boolean
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_typeof(p)='array' and jsonb_array_length(p) between 1 and 28
  and not exists(select 1 from jsonb_array_elements(p) x where case when jsonb_typeof(x)<>'object' then true else
    (select count(*) from jsonb_object_keys(x))<>3 or jsonb_typeof(x->'weekday') is distinct from 'number' or (x->>'weekday')!~'^[0-6]$'
    or coalesce(x->>'opens','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(x->>'closes','')!~'^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
    or x->>'opens'=x->>'closes' end)
  and not exists(select 1 from jsonb_array_elements(p) x where jsonb_typeof(x)='object' group by x->>'weekday' having count(*)>4),false) $$;
-- Canonical text of a slot set, to compare staged hours with the current ones.
create or replace function public.dir_import_hours_key(p jsonb) returns text
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select coalesce(string_agg((x->>'weekday')||'@'||(x->>'opens')||'-'||(x->>'closes'),',' order by (x->>'weekday')::int,x->>'opens',x->>'closes'),'')
 from jsonb_array_elements(case when jsonb_typeof(p)='array' then p else '[]'::jsonb end) x $$;

create table if not exists public.dir_import_extra_batches(
 id uuid primary key,source_id text not null references public.dir_data_sources(id),
 file_name text not null check(length(file_name) between 1 and 200),
 file_sha256 text not null check(file_sha256~'^[a-f0-9]{64}$'),part integer not null default 1 check(part between 1 and 1000),
 status text not null default 'staged' check(status in('staged','committed')),
 row_count integer not null check(row_count between 1 and 5000),
 created_by uuid not null,action_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 committed_by uuid,committed_at timestamptz,check((status='committed')=(committed_at is not null)),
 unique(source_id,file_sha256,part)
);
create table if not exists public.dir_import_extra_rows(
 batch_id uuid not null references public.dir_import_extra_batches(id),row_no integer not null check(row_no>0),
 source_ref text not null check(source_ref~'^[A-Za-z0-9:/._-]{1,120}$'),
 hours_raw text check(length(hours_raw) between 1 and 255),
 hours jsonb check(hours is null or public.dir_import_hours_ok(hours)),
 website_raw text check(length(website_raw) between 1 and 500),
 website text check(website~'^https?://[^\s"<>]{3,}$' and length(website)<=500),
 place_id uuid references public.dir_places(id),
 hours_status text not null check(hours_status in('none','unparseable','staged','applied','unchanged','no_place','removed','claimed','owner_data')),
 website_status text not null check(website_status in('none','rejected','staged','applied','unchanged','no_place','removed','claimed','owner_data')),
 email_raw text check(length(email_raw) between 1 and 254),
 email text check(email~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' and length(email)<=254),
 email_edited_at timestamptz,
 email_status text not null default 'none' check(email_status in('none','rejected','staged','applied','unchanged','no_place','removed','claimed','owner_data')),
 decided_at timestamptz,
 primary key(batch_id,row_no),
 check(hours is null or hours_raw is not null),check(website is null or website_raw is not null),
 check((hours_status='none')=(hours_raw is null)),check((website_status='none')=(website_raw is null)),
 check((hours is null)=(hours_status in('none','unparseable'))),check((website is null)=(website_status in('none','rejected')))
);
create index if not exists dir_import_extra_rows_ref on public.dir_import_extra_rows(source_ref);
-- Databases created before the e-mail extras (idempotent).
alter table public.dir_import_extra_rows add column if not exists email_raw text,add column if not exists email text,
 add column if not exists email_edited_at timestamptz,add column if not exists email_status text not null default 'none';
do $$begin
 if not exists(select 1 from pg_constraint where conname='dir_import_extra_rows_email_shape' and conrelid='public.dir_import_extra_rows'::regclass) then
  alter table public.dir_import_extra_rows add constraint dir_import_extra_rows_email_shape check(
   (email_raw is null or length(email_raw) between 1 and 254)
   and (email is null or (email~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' and length(email)<=254))
   and email_status in('none','rejected','staged','applied','unchanged','no_place','removed','claimed','owner_data')
   and (email is null or email_raw is not null) and (email_status='none')=(email_raw is null) and (email is null)=(email_status in('none','rejected')));
 end if;
end $$;
do $$begin
 drop trigger if exists dir_import_extra_batches_no_truncate on public.dir_import_extra_batches;
 create trigger dir_import_extra_batches_no_truncate before truncate on public.dir_import_extra_batches for each statement execute function public.dir_immutable();
 drop trigger if exists dir_import_extra_rows_no_truncate on public.dir_import_extra_rows;
 create trigger dir_import_extra_rows_no_truncate before truncate on public.dir_import_extra_rows for each statement execute function public.dir_immutable();
end $$;

create or replace function public.dir_import_extras_summary(p_batch uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('batchId',b.id,'sourceId',b.source_id,'status',b.status,'rows',b.row_count,
  'hours',coalesce((select jsonb_object_agg(hours_status,c) from (select hours_status,count(*) c from public.dir_import_extra_rows r where r.batch_id=b.id group by 1) z),'{}'),
  'website',coalesce((select jsonb_object_agg(website_status,c) from (select website_status,count(*) c from public.dir_import_extra_rows r where r.batch_id=b.id group by 1) z),'{}'),
  'email',coalesce((select jsonb_object_agg(email_status,c) from (select email_status,count(*) c from public.dir_import_extra_rows r where r.batch_id=b.id group by 1) z),'{}'))
 from public.dir_import_extra_batches b where b.id=p_batch $$;

-- ---------------------------------------------------------------- stage
-- Input: {actionId, batchId, sourceId (kind osm), fileName, fileSha256, part?,
--         rows:[{ref, hoursRaw?, hours?, websiteRaw?, website?, emailRaw?, email?, emailEditedAt?}]}.
create or replace function public.dir_import_extras_stage(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;receipt public.dir_place_actions;ds public.dir_data_sources;r jsonb;n integer;ref text;
 hraw text;h jsonb;wraw text;w text;hst text;wst text;result jsonb;eraw text;e text;est text;eat timestamptz;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'rows')<>'array' or jsonb_array_length(p_input->'rows') not between 1 and 5000 then
  raise exception 'Invalid import batch' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;bid:=(p_input->>'batchId')::uuid;exception when others then raise exception 'Invalid import batch' using errcode='22023';end;
 if aid is null or bid is null then raise exception 'Invalid import batch' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-import',0));
 select * into receipt from public.dir_place_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into ds from public.dir_data_sources where id=p_input->>'sourceId' and active and kind='osm';
 if not found then raise exception 'Unknown import source' using errcode='22023';end if;
 insert into public.dir_import_extra_batches(id,source_id,file_name,file_sha256,part,row_count,created_by,action_id)
 values(bid,ds.id,p_input->>'fileName',p_input->>'fileSha256',coalesce((p_input->>'part')::integer,1),jsonb_array_length(p_input->'rows'),p_actor,aid);
 for r,n in select x,o::integer from jsonb_array_elements(p_input->'rows') with ordinality t(x,o) loop
  if jsonb_typeof(r)<>'object' then raise exception 'Invalid import row %',n using errcode='22023';end if;
  ref:=r->>'ref';
  if ref is null or ref!~'^[A-Za-z0-9:/._-]{1,120}$' then raise exception 'Invalid source reference in row %',n using errcode='22023';end if;
  if exists(select 1 from public.dir_import_extra_rows x where x.batch_id=bid and x.source_ref=ref) then raise exception 'Repeated source reference in row %',n using errcode='22023';end if;
  hraw:=left(nullif(btrim(coalesce(r->>'hoursRaw','')),''),255);wraw:=left(nullif(btrim(coalesce(r->>'websiteRaw','')),''),500);
  -- Parsed slots / URL are kept only with their raw value and only when they pass the database checks again.
  h:=case when hraw is not null and public.dir_import_hours_ok(r->'hours') then r->'hours' end;
  w:=case when wraw is not null and jsonb_typeof(r->'website')='string' and r->>'website'~'^https?://[^\s"<>]{3,}$' and length(r->>'website')<=500 then r->>'website' end;
  eraw:=left(nullif(btrim(coalesce(r->>'emailRaw','')),''),254);
  e:=case when eraw is not null and jsonb_typeof(r->'email')='string' and r->>'email'~'^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$' and length(r->>'email')<=254 then r->>'email' end;
  begin eat:=case when jsonb_typeof(r->'emailEditedAt')='string' then (r->>'emailEditedAt')::timestamptz end;
  exception when others then raise exception 'Invalid emailEditedAt in row %',n using errcode='22023';end;
  hst:=case when hraw is null then 'none' when h is null then 'unparseable' else 'staged' end;
  wst:=case when wraw is null then 'none' when w is null then 'rejected' else 'staged' end;
  est:=case when eraw is null then 'none' when e is null then 'rejected' else 'staged' end;
  if hraw is null and wraw is null and eraw is null then raise exception 'Empty import row %',n using errcode='22023';end if;
  insert into public.dir_import_extra_rows(batch_id,row_no,source_ref,hours_raw,hours,website_raw,website,email_raw,email,email_edited_at,hours_status,website_status,email_status,decided_at)
  values(bid,n,ref,hraw,h,wraw,w,eraw,e,case when e is not null then eat end,hst,wst,est,case when hst<>'staged' and wst<>'staged' and est<>'staged' then clock_timestamp() end);
 end loop;
 result:=public.dir_import_extras_summary(bid);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- True when the current value of a field may be replaced by p_source: never claimed/managed (checked by the caller),
-- and the latest provenance of the field is p_source itself, or there is no provenance and the field is empty.
create or replace function public.dir_import_field_is_ours(p_place uuid,p_field text,p_source text,p_has_value boolean) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select f.source_id=p_source from public.dir_field_provenance f where f.place_id=p_place and f.field=p_field order by f.id desc limit 1),not p_has_value) $$;

-- ---------------------------------------------------------------- commit (promote to places)
-- Input: {actionId, batchId}. Never overwrites a claimed/managed place or a field last set by another source.
create or replace function public.dir_import_extras_commit(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;bid uuid;receipt public.dir_place_actions;b public.dir_import_extra_batches;x public.dir_import_extra_rows;prior public.dir_places;
 p public.dir_places;blocked text;hst text;wst text;est text;cur jsonb;mut jsonb;rev integer;src jsonb;result jsonb;
begin
 begin aid:=(p_input->>'actionId')::uuid;bid:=(p_input->>'batchId')::uuid;exception when others then raise exception 'Invalid commit' using errcode='22023';end;
 if p_actor is null or aid is null or bid is null then raise exception 'Invalid commit' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-import',0));
 select * into receipt from public.dir_place_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into b from public.dir_import_extra_batches where id=bid for update;
 if not found then raise exception 'Batch not found' using errcode='P0002';end if;
 if b.status<>'staged' then raise exception 'Batch already decided' using errcode='40001';end if;
 for x in select * from public.dir_import_extra_rows where batch_id=bid and (hours_status='staged' or website_status='staged' or email_status='staged') order by row_no for update loop
  hst:=x.hours_status;wst:=x.website_status;est:=x.email_status;blocked:=null;
  prior:=public.dir_import_ref_place(b.source_id,x.source_ref);
  if prior.id is null then blocked:='no_place';
  else
   select * into p from public.dir_places where id=prior.id for update;
   if p.status='removed' then blocked:='removed';
   elsif p.claim_status<>'unclaimed' or exists(select 1 from public.dir_place_managers m where m.place_id=p.id and m.status='active') then blocked:='claimed';
   end if;
  end if;
  if blocked is not null then
   hst:=case when hst='staged' then blocked else hst end;wst:=case when wst='staged' then blocked else wst end;est:=case when est='staged' then blocked else est end;
  else
   rev:=p.revision;src:=jsonb_build_object('id',b.source_id,'ref',x.source_ref,'observedAt',b.created_at);
   if hst='staged' then
    cur:=coalesce((select jsonb_agg(jsonb_build_object('weekday',h.weekday,'opens',to_char(h.opens,'HH24:MI'),'closes',to_char(h.closes,'HH24:MI'))) from public.dir_place_hours h where h.place_id=p.id),'[]');
    if not public.dir_import_field_is_ours(p.id,'hours',b.source_id,jsonb_array_length(cur)>0) then hst:='owner_data';
    elsif public.dir_import_hours_key(cur)=public.dir_import_hours_key(x.hours) then hst:='unchanged';
    else
     mut:=public.dir_place_mutate(p_actor,jsonb_build_object('action','hours','actionId',public.dir_derived_uuid(bid,'hours:'||x.row_no),'placeId',p.id,'revision',rev,'hours',x.hours,'source',src));
     rev:=(mut->>'revision')::integer;hst:='applied';
    end if;
   end if;
   if wst='staged' then
    if not public.dir_import_field_is_ours(p.id,'website',b.source_id,p.website is not null) then wst:='owner_data';
    elsif p.website is not distinct from x.website then wst:='unchanged';
    else
     mut:=public.dir_place_mutate(p_actor,jsonb_build_object('action','update','actionId',public.dir_derived_uuid(bid,'website:'||x.row_no),'placeId',p.id,'revision',rev,
      'place',jsonb_build_object('website',x.website),'source',src));
     rev:=(mut->>'revision')::integer;wst:='applied';
    end if;
   end if;
   if est='staged' then
    if not public.dir_import_field_is_ours(p.id,'email',b.source_id,p.email is not null) then est:='owner_data';
    elsif p.email is not distinct from x.email then est:='unchanged';
    else
     -- observed_at = upstream edit date of the element when known (never the batch date): see dir_listed_email_eligible.
     perform public.dir_place_mutate(p_actor,jsonb_build_object('action','update','actionId',public.dir_derived_uuid(bid,'email:'||x.row_no),'placeId',p.id,'revision',rev,
      'place',jsonb_build_object('email',x.email),'source',jsonb_strip_nulls(jsonb_build_object('id',b.source_id,'ref',x.source_ref,'observedAt',x.email_edited_at))));
     est:='applied';
    end if;
   end if;
  end if;
  update public.dir_import_extra_rows set hours_status=hst,website_status=wst,email_status=est,place_id=prior.id,decided_at=clock_timestamp() where batch_id=bid and row_no=x.row_no;
 end loop;
 update public.dir_import_extra_batches set status='committed',committed_by=p_actor,committed_at=clock_timestamp() where id=bid;
 result:=public.dir_import_extras_summary(bid);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- public helper
-- Kind of the source behind the current hours of a public place ('osm', 'owner', 'staff'…), or null.
create or replace function public.dir_place_hours_source(p_slug text) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select s.kind from public.dir_places p join public.dir_field_provenance f on f.place_id=p.id and f.field='hours'
  join public.dir_data_sources s on s.id=f.source_id
 where p.slug=p_slug and p.status in('published','closed_permanently') and exists(select 1 from public.dir_place_hours h where h.place_id=p.id)
 order by f.id desc limit 1 $$;

-- ---------------------------------------------------------------- reclassify by source reference (staff/import)
-- Input: {actionId, sourceId, from, to, rows:[{ref, attributes?}]} (1..5000). Result: {moved, skipped:{reason:n}}.
-- attributes (e.g. {kind:'cafe'}) are merged over the place's attributes that the target vertical accepts; keys the
-- target vertical does not accept are dropped from the snapshot (they stay in dir_place_history.before).
create or replace function public.dir_import_reclassify(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;prior jsonb;ds public.dir_data_sources;vf public.dir_verticals;vt public.dir_verticals;r jsonb;p public.dir_places;n integer;
 before jsonb;attrs jsonb;given jsonb;moved integer:=0;skipped jsonb:='{}';why text;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'rows')<>'array' or jsonb_array_length(p_input->'rows') not between 1 and 5000
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','sourceId','from','to','rows')) then
  raise exception 'Invalid reclassification' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');
 if aid is null then raise exception 'Invalid reclassification' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-import',0));
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into ds from public.dir_data_sources where id=p_input->>'sourceId' and active and kind in('osm','official','partner');
 if not found then raise exception 'Unknown import source' using errcode='22023';end if;
 select * into vf from public.dir_verticals where id=p_input->>'from';
 select * into vt from public.dir_verticals where id=p_input->>'to' and active;
 if vf.id is null or vt.id is null or vf.id=vt.id then raise exception 'Invalid vertical' using errcode='22023';end if;
 for r,n in select x,o::integer from jsonb_array_elements(p_input->'rows') with ordinality t(x,o) loop
  if jsonb_typeof(r)<>'object' or coalesce(r->>'ref','')!~'^[A-Za-z0-9:/._-]{1,120}$' then raise exception 'Invalid reclassification row %',n using errcode='22023';end if;
  given:=case when jsonb_typeof(r->'attributes')='object' then r->'attributes' else '{}'::jsonb end;
  if not public.dir_attributes_ok(vt.id,given) then raise exception 'Invalid attributes in row %',n using errcode='22023';end if;
  p:=public.dir_import_ref_place(ds.id,r->>'ref');why:=null;
  if p.id is null then why:='not_found';
  elsif p.status='removed' then why:='removed';
  elsif p.vertical_id=vt.id then why:='already_moved';
  elsif p.vertical_id<>vf.id then why:='other_vertical';
  elsif p.claim_status<>'unclaimed' or exists(select 1 from public.dir_place_managers m where m.place_id=p.id and m.status='active') then why:='claimed_kept';
  end if;
  if why is not null then skipped:=jsonb_set(skipped,array[why],to_jsonb(coalesce((skipped->>why)::integer,0)+1));continue;end if;
  perform pg_advisory_xact_lock(hashtextextended('dir-place:'||p.id::text,0));
  before:=public.dir_place_snapshot(p.id);
  select coalesce(jsonb_object_agg(k,val),'{}') into attrs from jsonb_each(p.attributes) e(k,val) where k=any(vt.attribute_keys);
  attrs:=attrs||given;
  update public.dir_places set vertical_id=vt.id,attributes=attrs,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
  insert into public.dir_field_provenance(place_id,field,source_id,source_ref,action_id) values(p.id,'vertical',ds.id,r->>'ref',aid);
  if given<>'{}'::jsonb then insert into public.dir_field_provenance(place_id,field,source_id,source_ref,action_id) values(p.id,'attributes',ds.id,r->>'ref',aid);end if;
  insert into public.dir_place_history(place_id,action_id,actor_id,action,revision,before,after) values(p.id,aid,p_actor,'update',p.revision,before,public.dir_place_snapshot(p.id));
  moved:=moved+1;
 end loop;
 result:=jsonb_build_object('from',vf.id,'to',vt.id,'moved',moved,'skipped',skipped);
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

do $$declare n text;begin foreach n in array array['dir_import_extra_batches','dir_import_extra_rows'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in('dir_import_hours_ok','dir_import_hours_key','dir_import_extras_summary','dir_import_extras_stage','dir_import_field_is_ours','dir_import_extras_commit','dir_place_hours_source','dir_import_reclassify') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
