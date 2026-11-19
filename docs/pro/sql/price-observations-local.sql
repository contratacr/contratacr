-- LOCAL PRO ONLY. Multivertical round P1 (2026-11-16): price observations. Depends on directory-core-local.sql.
-- * price_items: what is priced (fuel, lpg, medicine, grocery, generic), GTIN with check digit, official code,
--   presentation and unit (unit price = price / unit_qty). rx_required only for medicine.
-- * price_observations: APPEND-ONLY evidence of a price (never deleted, no DELETE grant, TRUNCATE blocked). Only the
--   moderation columns may change, through fixed transitions (pending → published|rejected, published →
--   rejected|superseded; confidence community → community_verified). place_id null = national regulated price
--   (only ARESEP). stale_after is computed by a trigger from price_staleness_rules (any provided value is ignored).
-- * HARD RULE (Decreto 36868-S): items with rx_required=true never get observations (insert blocked by trigger, RPC
--   refuses with hint price_rx_not_public), an observation can never become 'published' while its item is rx, and
--   the public reader filters rx items (so flipping an item to rx hides its past prices at once).
-- * RPCs (service_role only, security invoker, pinned search_path, idempotent actionId receipts in price_actions):
--   price_item_upsert, price_observation_record, price_official_set_record (one ARESEP resolution = one atomic set),
--   price_observation_moderate, price_moderation_queue. User reports start 'pending'; ≥2 independent reporters
--   (distinct reporter_id) with matching prices within the rule tolerance auto-promote to community_verified.
-- * Public reader public_price_current(place_slug|null, item_slug|null): priority official → business →
--   community_verified → community; stale/expired rows are returned only as lastKnown with stale=true.
begin;

-- ---------------------------------------------------------------- sources (rows in the core table)
insert into public.dir_data_sources(id,name,kind,license,attribution,url,allows_phone,share_alike,public_attribution) values
 ('aresep','ARESEP','official','Información pública; licencia por confirmar / public information; license to be confirmed','Fuente: ARESEP, resolución tarifaria / Source: ARESEP rate resolution',null,false,false,true),
 ('meic','MEIC — MiMejorCompraCR','official','Información pública; licencia por confirmar / public information; license to be confirmed','Fuente: MEIC, estudio de precios / Source: MEIC price survey',null,false,false,true),
 ('community','Reportes de la comunidad / community reports','user','Aportado por usuarios / user contributed','Reportado por usuarios de ContrataCR / reported by ContrataCR users',null,false,false,true)
on conflict(id) do nothing;

-- ---------------------------------------------------------------- helpers
create or replace function public.price_gtin_ok(p text) returns boolean
language sql immutable parallel safe security invoker set search_path=public,pg_temp as $$
 select p is not null and p~'^([0-9]{8}|[0-9]{12,14})$' and
  (10-(select sum(substr(lpad(p,14,'0'),i,1)::int*case when i%2=1 then 3 else 1 end) from generate_series(1,13) i)%10)%10=substr(lpad(p,14,'0'),14,1)::int $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.price_items(
 id uuid primary key,
 slug text not null unique check(slug~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$'),
 kind text not null check(kind in('fuel','lpg','medicine','grocery','generic')),
 gtin text unique check(gtin is null or public.price_gtin_ok(gtin)),
 official_code text check(official_code~'^[a-z0-9][a-z0-9:._-]{1,59}$'),
 name text not null check(length(btrim(name)) between 2 and 160),
 presentation text check(length(presentation) between 1 and 120),
 unit_base text not null check(unit_base in('l','ml','kg','g','unit','dose')),
 unit_qty numeric(12,4) not null check(unit_qty>0),
 rx_required boolean not null default false,
 country_code text not null default 'CR' check(country_code~'^[A-Z]{2}$'),
 active boolean not null default true,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check(not rx_required or kind='medicine'),
 unique(kind,official_code)
);

create table if not exists public.price_staleness_rules(
 source_kind text not null check(source_kind in('business','official_aresep','official_meic','user_report')),
 item_kind text not null check(item_kind in('*','fuel','lpg','medicine','grocery','generic')),
 -- valid_to: stale at valid_to (fallback base+max_age); least: earliest of valid_to and base+max_age.
 mode text not null check(mode in('valid_to','least')),
 max_age interval not null check(max_age>interval '0'),
 match_tolerance_pct numeric(5,2) check(match_tolerance_pct between 0 and 50),
 note text check(length(note)<=300),
 primary key(source_kind,item_kind)
);
insert into public.price_staleness_rules(source_kind,item_kind,mode,max_age,match_tolerance_pct,note) values
 ('official_aresep','*','valid_to','60 days',null,'Hasta valid_to de la resolución; sin valid_to, 60 días desde valid_from o hasta que otra resolución la reemplace.'),
 ('official_meic','*','least','120 days',null,'Hasta el próximo estudio (valid_to), máximo 120 días.'),
 ('business','*','least','30 days',null,'Precio del comercio: 30 días.'),
 ('user_report','grocery','least','7 days',2.00,'Reporte de usuario en supermercado: 7 días.'),
 ('user_report','medicine','least','14 days',2.00,'Reporte de usuario en farmacia (solo venta libre): 14 días.'),
 ('user_report','*','least','7 days',2.00,'Otros reportes de usuario: 7 días.')
on conflict do nothing;

create table if not exists public.price_observations(
 id uuid primary key,
 item_id uuid not null references public.price_items(id),
 place_id uuid references public.dir_places(id),
 country_code text not null default 'CR' check(country_code~'^[A-Z]{2}$'),
 currency text not null default 'CRC' check(currency~'^[A-Z]{3}$'),
 price numeric(14,2) not null check(price>0 and price<100000000),
 source_kind text not null check(source_kind in('business','official_aresep','official_meic','user_report')),
 source_id text not null references public.dir_data_sources(id),
 source_ref text check(length(source_ref) between 1 and 120),
 observed_at timestamptz not null,valid_from timestamptz not null,valid_to timestamptz,
 stale_after timestamptz not null,
 evidence_media_id uuid,evidence_sha256 text check(evidence_sha256~'^[a-f0-9]{64}$'),
 reporter_id uuid,
 action_id uuid not null,actor_id uuid not null,
 moderation_status text not null check(moderation_status in('pending','published','rejected','superseded')),
 confidence text not null check(confidence in('official','business','community_verified','community')),
 moderated_by uuid,moderated_at timestamptz,moderation_note text check(length(moderation_note)<=1000),
 superseded_by uuid references public.price_observations(id),
 created_at timestamptz not null default clock_timestamp(),
 check(valid_to is null or valid_to>valid_from),
 check((place_id is null)=(source_kind='official_aresep')),
 check((source_kind in('official_aresep','official_meic') and confidence='official') or (source_kind='business' and confidence='business')
  or (source_kind='user_report' and confidence in('community','community_verified'))),
 check((source_kind='user_report')=(reporter_id is not null)),
 check(source_kind<>'official_aresep' or source_ref is not null),
 check(evidence_media_id is null or evidence_sha256 is not null),
 check((moderation_status='superseded')=(superseded_by is not null))
);
create index if not exists price_obs_item_place on public.price_observations(item_id,place_id,moderation_status,valid_from desc);
create index if not exists price_obs_place on public.price_observations(place_id,moderation_status) where place_id is not null;
create index if not exists price_obs_national on public.price_observations(item_id,valid_from desc) where place_id is null;
create index if not exists price_obs_reporter on public.price_observations(reporter_id,created_at) where reporter_id is not null;
create index if not exists price_obs_pending on public.price_observations(created_at) where moderation_status='pending';

create table if not exists public.price_actions(
 actor_id uuid not null,action_id uuid not null,input jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);
create table if not exists public.price_moderation_events(
 id bigint generated always as identity primary key,
 observation_id uuid not null references public.price_observations(id),
 actor_id uuid,reason text not null check(reason in('moderation','auto_promote','superseded')),
 from_status text not null,to_status text not null,from_confidence text not null,to_confidence text not null,
 note text check(length(note)<=1000),at timestamptz not null default clock_timestamp()
);
create index if not exists price_moderation_events_obs on public.price_moderation_events(observation_id,id);

-- ---------------------------------------------------------------- staleness
create or replace function public.price_stale_after(p_source_kind text,p_item_kind text,p_base timestamptz,p_valid_to timestamptz) returns timestamptz
language sql stable security invoker set search_path=public,pg_temp as $$
 select case r.mode when 'valid_to' then coalesce(p_valid_to,p_base+r.max_age) else least(p_valid_to,p_base+r.max_age) end
 from public.price_staleness_rules r where r.source_kind=p_source_kind and r.item_kind in(p_item_kind,'*')
 order by (r.item_kind='*') limit 1 $$;

-- ---------------------------------------------------------------- guards
create or replace function public.price_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Price receipts, events and observations are append-only' using errcode='23514';end $$;

create or replace function public.price_observation_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.price_items;moderation_cols text[]:=array['moderation_status','confidence','moderated_by','moderated_at','moderation_note','superseded_by'];
begin
 select * into i from public.price_items where id=new.item_id;
 if tg_op='INSERT' then
  -- Decreto 36868-S: prescription medicine prices are never stored, so they can never be public.
  if i.rx_required then raise exception 'Prescription medicine prices are never public' using errcode='23514',hint='price_rx_not_public';end if;
  if i.kind='fuel' and new.source_kind<>'official_aresep' then raise exception 'Fuel prices are national (ARESEP)' using errcode='23514';end if;
  if new.source_kind='official_aresep' and i.kind not in('fuel','lpg') then raise exception 'ARESEP prices only for fuel and LPG' using errcode='23514';end if;
  new.stale_after:=public.price_stale_after(new.source_kind,i.kind,case when new.source_kind='official_aresep' then new.valid_from else new.observed_at end,new.valid_to);
  new.created_at:=clock_timestamp();
  return new;
 end if;
 if (to_jsonb(new)-moderation_cols) is distinct from (to_jsonb(old)-moderation_cols) then
  raise exception 'Price observations are append-only' using errcode='23514';end if;
 if new.moderation_status<>old.moderation_status and not(
   (old.moderation_status='pending' and new.moderation_status in('published','rejected'))
   or (old.moderation_status='published' and new.moderation_status in('rejected','superseded'))) then
  raise exception 'Invalid moderation transition' using errcode='23514';end if;
 if new.confidence<>old.confidence and not(old.confidence='community' and new.confidence='community_verified') then
  raise exception 'Invalid confidence change' using errcode='23514';end if;
 if new.moderation_status='published' and i.rx_required then
  raise exception 'Prescription medicine prices are never public' using errcode='23514',hint='price_rx_not_public';end if;
 return new;
end $$;
drop trigger if exists price_observations_guard on public.price_observations;
create trigger price_observations_guard before insert or update on public.price_observations for each row execute function public.price_observation_guard();
drop trigger if exists price_observations_no_delete on public.price_observations;
create trigger price_observations_no_delete before delete on public.price_observations for each row execute function public.price_immutable();
do $$declare t text;begin
 foreach t in array array['price_actions','price_moderation_events'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row execute function public.price_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['price_items','price_staleness_rules','price_observations','price_actions','price_moderation_events'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_no_truncate',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.price_immutable()',t||'_no_truncate',t);
 end loop;end $$;

-- ---------------------------------------------------------------- visibility
create or replace function public.price_place_visible(p_place uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.dir_places p join public.dir_verticals v on v.id=p.vertical_id
  where p.id=p_place and p.status='published' and v.active and (not v.requires_license or p.verification_level='license_verified')) $$;

-- ---------------------------------------------------------------- items (staff)
-- Input: {actionId, slug, kind, name, gtin?, officialCode?, presentation?, unitBase, unitQty, rxRequired?, active?}.
-- Medicine without rxRequired defaults to rx_required=true (safe side). Kind never changes.
create or replace function public.price_item_upsert(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.price_actions;i public.price_items;found_item boolean;result jsonb;k text:=p_input->>'kind';
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid item' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid item' using errcode='22023';end;
 if aid is null then raise exception 'Invalid item' using errcode='22023';end if;
 select * into receipt from public.price_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 if (p_input ? 'unitQty' and jsonb_typeof(p_input->'unitQty')<>'number') or (p_input ? 'rxRequired' and jsonb_typeof(p_input->'rxRequired')<>'boolean')
  or (p_input ? 'active' and jsonb_typeof(p_input->'active')<>'boolean') then raise exception 'Invalid item' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('price-item:'||coalesce(p_input->>'slug',''),0));
 select * into i from public.price_items where slug=p_input->>'slug' for update;found_item:=found;
 begin
  if found_item then
   if k is not null and k<>i.kind then raise exception 'The kind of an item cannot change' using errcode='22023';end if;
   update public.price_items set name=coalesce(btrim(p_input->>'name'),name),
    gtin=case when p_input ? 'gtin' then nullif(p_input->>'gtin','') else gtin end,
    official_code=case when p_input ? 'officialCode' then nullif(p_input->>'officialCode','') else official_code end,
    presentation=case when p_input ? 'presentation' then nullif(btrim(coalesce(p_input->>'presentation','')),'') else presentation end,
    unit_base=coalesce(p_input->>'unitBase',unit_base),unit_qty=coalesce((p_input->>'unitQty')::numeric,unit_qty),
    rx_required=coalesce((p_input->>'rxRequired')::boolean,rx_required),active=coalesce((p_input->>'active')::boolean,active),
    revision=revision+1,updated_at=clock_timestamp() where id=i.id returning * into i;
  else
   insert into public.price_items(id,slug,kind,gtin,official_code,name,presentation,unit_base,unit_qty,rx_required,active)
   values(gen_random_uuid(),p_input->>'slug',k,nullif(p_input->>'gtin',''),nullif(p_input->>'officialCode',''),btrim(p_input->>'name'),
    nullif(btrim(coalesce(p_input->>'presentation','')),''),p_input->>'unitBase',(p_input->>'unitQty')::numeric,
    coalesce((p_input->>'rxRequired')::boolean,k='medicine'),coalesce((p_input->>'active')::boolean,true)) returning * into i;
  end if;
 exception when sqlstate '22023' then raise;
  when others then raise exception 'Invalid item: %',sqlerrm using errcode='22023';end;
 result:=jsonb_build_object('itemId',i.id,'slug',i.slug,'kind',i.kind,'revision',i.revision,'rxRequired',i.rx_required,'active',i.active);
 insert into public.price_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- auto-promotion
-- ≥2 distinct reporters, same item/place/currency, not stale, not rejected, price within tolerance of the new report
-- → all matching reports become published + community_verified. Returns how many rows changed.
create or replace function public.price_try_promote(p_observation uuid) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.price_observations;k text;tol numeric;n integer:=0;r record;
begin
 select * into o from public.price_observations where id=p_observation;
 if not found or o.source_kind<>'user_report' or o.moderation_status not in('pending','published') then return 0;end if;
 select kind into k from public.price_items where id=o.item_id;
 select coalesce(match_tolerance_pct,2) into tol from public.price_staleness_rules where source_kind='user_report' and item_kind in(k,'*') order by (item_kind='*') limit 1;
 if (select count(distinct x.reporter_id) from public.price_observations x where x.item_id=o.item_id and x.place_id=o.place_id and x.source_kind='user_report' and x.currency=o.currency
   and x.moderation_status in('pending','published') and x.stale_after>clock_timestamp() and abs(x.price-o.price)<=o.price*coalesce(tol,2)/100)<2 then return 0;end if;
 for r in select x.id,x.moderation_status,x.confidence from public.price_observations x where x.item_id=o.item_id and x.place_id=o.place_id and x.source_kind='user_report' and x.currency=o.currency
   and x.moderation_status in('pending','published') and x.stale_after>clock_timestamp() and abs(x.price-o.price)<=o.price*coalesce(tol,2)/100
   and (x.moderation_status<>'published' or x.confidence<>'community_verified') for update loop
  update public.price_observations set moderation_status='published',confidence='community_verified',moderated_at=clock_timestamp(),
   moderation_note=coalesce(moderation_note,'auto: reportes independientes coinciden') where id=r.id;
  insert into public.price_moderation_events(observation_id,actor_id,reason,from_status,to_status,from_confidence,to_confidence,note)
  values(r.id,null,'auto_promote',r.moderation_status,'published',r.confidence,'community_verified','≥2 reportes independientes dentro de '||coalesce(tol,2)||' %');
  n:=n+1;
 end loop;
 return n;
end $$;

-- ---------------------------------------------------------------- record one observation (internal + RPC)
-- Input: {actionId, observationId?, itemSlug, placeId? | placeSlug?, price, currency?, sourceKind, sourceId?, sourceRef?,
--         observedAt, validFrom?, validTo?, evidence?:{mediaId?, sha256}}. user_report: reporter = actor.
create or replace function public.price_record_internal(p_actor uuid,p_input jsonb,p_aid uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare sk text:=p_input->>'sourceKind';src text;ds public.dir_data_sources;i public.price_items;pl public.dir_places;v public.dir_verticals;
 oid uuid;obs timestamptz;vf timestamptz;vt timestamptz;pr numeric;cur text;ev_id uuid;ev_sha text;o public.price_observations;promoted integer:=0;s record;
begin
 if sk is null or sk not in('business','official_aresep','official_meic','user_report') or jsonb_typeof(p_input->'price')<>'number'
  or (p_input ? 'evidence' and jsonb_typeof(p_input->'evidence') not in('object','null')) then raise exception 'Invalid observation' using errcode='22023';end if;
 begin
  oid:=coalesce((p_input->>'observationId')::uuid,public.dir_derived_uuid(p_aid,'observation'));
  obs:=(p_input->>'observedAt')::timestamptz;vf:=coalesce((p_input->>'validFrom')::timestamptz,obs);vt:=(p_input->>'validTo')::timestamptz;
  pr:=(p_input->>'price')::numeric;ev_id:=(p_input#>>'{evidence,mediaId}')::uuid;ev_sha:=lower(p_input#>>'{evidence,sha256}');
 exception when others then raise exception 'Invalid observation' using errcode='22023';end;
 if obs is null or pr is null or pr<=0 or pr>=100000000 or round(pr,2)<>pr or obs>clock_timestamp()+interval '5 minutes' or (vt is not null and vt<=vf)
  or (ev_sha is not null and ev_sha!~'^[a-f0-9]{64}$') or (ev_id is not null and ev_sha is null) then raise exception 'Invalid observation' using errcode='22023';end if;
 src:=coalesce(p_input->>'sourceId',case sk when 'official_aresep' then 'aresep' when 'official_meic' then 'meic' when 'business' then 'owner' else 'community' end);
 select * into ds from public.dir_data_sources where id=src and active;
 if not found or (sk like 'official%' and ds.kind<>'official') or (sk='business' and ds.kind not in('owner','staff','partner')) or (sk='user_report' and ds.kind<>'user') then
  raise exception 'Invalid source for this observation' using errcode='22023';end if;
 select * into i from public.price_items where slug=p_input->>'itemSlug';
 if not found or not i.active then raise exception 'Item not found' using errcode='P0002';end if;
 if i.rx_required then raise exception 'Prescription medicine prices are never public' using errcode='22023',hint='price_rx_not_public';end if;
 if (i.kind='fuel' and sk<>'official_aresep') or (sk='official_aresep' and i.kind not in('fuel','lpg')) then raise exception 'Fuel prices are national (ARESEP)' using errcode='22023',hint='price_fuel_national';end if;
 if sk='official_aresep' then
  if p_input ? 'placeId' or p_input ? 'placeSlug' then raise exception 'Regulated prices are national' using errcode='22023';end if;
  if nullif(btrim(coalesce(p_input->>'sourceRef','')),'') is null then raise exception 'Resolution number required' using errcode='22023';end if;
  cur:=coalesce(p_input->>'currency','CRC');
 else
  begin
   if p_input ? 'placeId' then select * into pl from public.dir_places where id=(p_input->>'placeId')::uuid;
   else select * into pl from public.dir_places where slug=p_input->>'placeSlug';end if;
  exception when others then raise exception 'Invalid observation' using errcode='22023';end;
  if pl.id is null or pl.status in('removed','closed_permanently') or (sk='user_report' and not public.price_place_visible(pl.id)) then
   raise exception 'Place unavailable' using errcode='P0002';end if;
  select * into v from public.dir_verticals where id=pl.vertical_id;
  if i.kind='medicine' and v.id not in('pharmacy','grocery') then raise exception 'Medicine prices only at pharmacies' using errcode='22023';end if;
  -- 2026-11-17: banks/ATMs are map points only (no rates or products) and health places carry no prices (no consultation prices).
  if v.id in('banking','health') then raise exception 'No prices in this section' using errcode='22023',hint='price_section_off';end if;
  cur:=coalesce(p_input->>'currency',pl.currency);
 end if;
 if cur!~'^[A-Z]{3}$' then raise exception 'Invalid currency' using errcode='22023';end if;
 if sk='user_report' then
  if (select count(*) from public.price_observations x where x.reporter_id=p_actor and x.created_at>clock_timestamp()-interval '1 day')>=30 then
   raise exception 'Too many price reports' using errcode='54000',hint='price_report_cap';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('price:'||i.id::text||':'||coalesce(pl.id::text,'national'),0));
 insert into public.price_observations(id,item_id,place_id,country_code,currency,price,source_kind,source_id,source_ref,observed_at,valid_from,valid_to,stale_after,
   evidence_media_id,evidence_sha256,reporter_id,action_id,actor_id,moderation_status,confidence)
 values(oid,i.id,pl.id,coalesce(pl.country_code,i.country_code),cur,pr,sk,src,nullif(btrim(coalesce(p_input->>'sourceRef','')),''),obs,vf,vt,'infinity',
   ev_id,ev_sha,case when sk='user_report' then p_actor end,p_aid,p_actor,
   case when sk='user_report' then 'pending' else 'published' end,
   case when sk like 'official%' then 'official' when sk='business' then 'business' else 'community' end) returning * into o;
 if sk='user_report' and o.stale_after<=clock_timestamp() then raise exception 'Observation already stale' using errcode='22023',hint='price_stale';end if;
 -- A newer effective official/business price supersedes older ones of the same item, place and source kind.
 if sk<>'user_report' and o.valid_from<=clock_timestamp() then
  for s in select x.id,x.moderation_status,x.confidence from public.price_observations x
   where x.item_id=o.item_id and x.place_id is not distinct from o.place_id and x.source_kind=sk and x.id<>o.id and x.moderation_status='published'
    and (case when sk='official_aresep' then x.valid_from<=o.valid_from else x.observed_at<=o.observed_at end) for update loop
   update public.price_observations set moderation_status='superseded',superseded_by=o.id where id=s.id;
   insert into public.price_moderation_events(observation_id,actor_id,reason,from_status,to_status,from_confidence,to_confidence)
   values(s.id,p_actor,'superseded','published','superseded',s.confidence,s.confidence);
  end loop;
 end if;
 if sk='user_report' then promoted:=public.price_try_promote(o.id);select * into o from public.price_observations where id=o.id;end if;
 return jsonb_build_object('observationId',o.id,'itemSlug',i.slug,'moderationStatus',o.moderation_status,'confidence',o.confidence,'staleAfter',o.stale_after,'promoted',promoted);
end $$;

create or replace function public.price_observation_record(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.price_actions;result jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid observation' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid observation' using errcode='22023';end;
 if aid is null then raise exception 'Invalid observation' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('price-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.price_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 result:=public.price_record_internal(p_actor,p_input,aid);
 insert into public.price_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Input: {actionId, sourceKind:'official_aresep'|'official_meic', sourceId?, sourceRef, observedAt, validFrom, validTo?,
--         placeId? (MEIC only), prices:[{itemSlug, price, currency?}] (1..50, distinct items)}. Atomic.
create or replace function public.price_official_set_record(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.price_actions;result jsonb;x jsonb;out jsonb:='[]';base jsonb;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or coalesce(p_input->>'sourceKind','') not in('official_aresep','official_meic')
  or jsonb_typeof(p_input->'prices')<>'array' or jsonb_array_length(p_input->'prices') not between 1 and 50
  or (select count(distinct e->>'itemSlug')<>count(*) from jsonb_array_elements(p_input->'prices') e) then raise exception 'Invalid price set' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid price set' using errcode='22023';end;
 if aid is null then raise exception 'Invalid price set' using errcode='22023';end if;
 select * into receipt from public.price_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 base:=p_input-'prices'-'actionId';
 for x in select * from jsonb_array_elements(p_input->'prices') loop
  if jsonb_typeof(x)<>'object' then raise exception 'Invalid price set' using errcode='22023';end if;
  out:=out||jsonb_build_array(public.price_record_internal(p_actor,base||(x-'observationId'),public.dir_derived_uuid(aid,coalesce(x->>'itemSlug',''))));
 end loop;
 result:=jsonb_build_object('sourceKind',p_input->>'sourceKind','sourceRef',p_input->>'sourceRef','count',jsonb_array_length(out),'observations',out);
 insert into public.price_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- moderation (staff)
-- Input: {actionId, observationId, decision: publish|reject, note?}. publish: pending user reports only.
-- reject: pending or published rows of any source (takedown). Rows are never deleted.
create or replace function public.price_observation_moderate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;oid uuid;receipt public.price_actions;o public.price_observations;dec text:=p_input->>'decision';result jsonb;promoted integer:=0;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or dec is null or dec not in('publish','reject') or length(coalesce(p_input->>'note',''))>1000 then
  raise exception 'Invalid moderation' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;oid:=(p_input->>'observationId')::uuid;exception when others then raise exception 'Invalid moderation' using errcode='22023';end;
 if aid is null or oid is null then raise exception 'Invalid moderation' using errcode='22023';end if;
 select * into receipt from public.price_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into o from public.price_observations where id=oid for update;
 if not found then raise exception 'Observation not found' using errcode='P0002';end if;
 if (dec='publish' and (o.moderation_status<>'pending' or o.source_kind<>'user_report')) or (dec='reject' and o.moderation_status not in('pending','published')) then
  raise exception 'Observation already decided' using errcode='40001';end if;
 update public.price_observations set moderation_status=case when dec='publish' then 'published' else 'rejected' end,moderated_by=p_actor,moderated_at=clock_timestamp(),
  moderation_note=nullif(btrim(coalesce(p_input->>'note','')),'') where id=oid;
 insert into public.price_moderation_events(observation_id,actor_id,reason,from_status,to_status,from_confidence,to_confidence,note)
 values(oid,p_actor,'moderation',o.moderation_status,case when dec='publish' then 'published' else 'rejected' end,o.confidence,o.confidence,nullif(btrim(coalesce(p_input->>'note','')),''));
 if dec='publish' then promoted:=public.price_try_promote(oid);end if;
 select * into o from public.price_observations where id=oid;
 result:=jsonb_build_object('observationId',oid,'moderationStatus',o.moderation_status,'confidence',o.confidence,'promoted',promoted);
 insert into public.price_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

create or replace function public.price_moderation_queue(p_actor uuid,p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(q order by q->>'createdAt'),'[]') from (
  select jsonb_build_object('observationId',o.id,'itemSlug',i.slug,'itemName',i.name,'placeSlug',p.slug,'placeName',p.name,'price',o.price,'currency',o.currency,
   'observedAt',o.observed_at,'staleAfter',o.stale_after,'hasEvidence',o.evidence_sha256 is not null,'reporterId',o.reporter_id,'createdAt',o.created_at) q
  from public.price_observations o join public.price_items i on i.id=o.item_id left join public.dir_places p on p.id=o.place_id
  where p_actor is not null and o.moderation_status='pending' and o.stale_after>clock_timestamp()
  order by o.created_at limit greatest(1,least(coalesce(p_limit,50),200))) x $$;

-- ---------------------------------------------------------------- public reader
create or replace function public.price_observation_public(p_id uuid,p_now timestamptz) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('price',o.price,'currency',o.currency,'unitPrice',round(o.price/i.unit_qty,4),'unitBase',i.unit_base,
  'sourceKind',o.source_kind,'confidence',o.confidence,'regulated',o.place_id is null,
  'source',jsonb_build_object('name',s.name,'attribution',s.attribution,'url',case when s.public_attribution then s.url end),
  'sourceRef',case when o.source_kind like 'official%' then o.source_ref end,
  'observedAt',o.observed_at,'validFrom',o.valid_from,'validTo',o.valid_to,'staleAfter',o.stale_after,'hasEvidence',o.evidence_sha256 is not null,
  'stale',not(o.valid_from<=p_now and (o.valid_to is null or o.valid_to>p_now) and o.stale_after>p_now),
  'staleReason',case when o.valid_to is not null and o.valid_to<=p_now then 'expired' when o.stale_after<=p_now then 'stale' end)
 from public.price_observations o join public.price_items i on i.id=o.item_id join public.dir_data_sources s on s.id=o.source_id where o.id=p_id $$;

-- p_place_slug null → national regulated prices. A fuel-station page also shows the national fuel/LPG prices.
-- Returns null for unknown/invisible places (drafts, removed; unlicensed places only while their vertical has
-- requires_license, which no vertical has since the owner decision of 2026-11-17). No internal ids.
create or replace function public.public_price_current(p_place_slug text,p_item_slug text default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pid uuid;pvert text;now_ts timestamptz:=clock_timestamp();items jsonb;
begin
 if p_item_slug is not null and p_item_slug!~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$' then return null;end if;
 if p_place_slug is not null then
  if p_place_slug!~'^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$' then return null;end if;
  select id,vertical_id into pid,pvert from public.dir_places where slug=p_place_slug;
  if pid is null or not public.price_place_visible(pid) then return null;end if;
 end if;
 with cand as (
  select o.id,o.item_id,o.valid_from,o.observed_at,i.slug item_slug,i.kind item_kind,i.name item_name,
   case o.confidence when 'official' then 1 when 'business' then 2 when 'community_verified' then 3 else 4 end tier,
   ((o.valid_to is null or o.valid_to>now_ts) and o.stale_after>now_ts) is_current
  from public.price_observations o join public.price_items i on i.id=o.item_id
  where o.moderation_status='published' and i.active and not i.rx_required and o.valid_from<=now_ts
   and (p_item_slug is null or i.slug=p_item_slug)
   and (case when pid is null then o.place_id is null else o.place_id=pid or (o.place_id is null and pvert='fuel' and i.kind in('fuel','lpg')) end)
 ),best as (select distinct on(item_id) * from cand where is_current order by item_id,tier,valid_from desc,observed_at desc),
 latest as (select distinct on(item_id) * from cand order by item_id,valid_from desc,observed_at desc)
 select jsonb_agg(jsonb_build_object(
   'item',(select jsonb_build_object('slug',i.slug,'kind',i.kind,'name',i.name,'presentation',i.presentation,'unitBase',i.unit_base,'unitQty',i.unit_qty,'gtin',i.gtin,'officialCode',i.official_code) from public.price_items i where i.id=l.item_id),
   'current',case when b.id is not null then public.price_observation_public(b.id,now_ts) end,
   'lastKnown',case when b.id is null then public.price_observation_public(l.id,now_ts) end) order by l.item_kind,l.item_name)
 into items from latest l left join best b on b.item_id=l.item_id;
 return jsonb_build_object('placeSlug',p_place_slug,'national',p_place_slug is null,'asOf',now_ts,'items',coalesce(items,'[]'));
end $$;

-- ---------------------------------------------------------------- privileges
do $$declare n text;begin foreach n in array array['price_items','price_staleness_rules','price_observations','price_actions','price_moderation_events'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 if n in('price_actions','price_moderation_events') then execute format('grant select,insert on public.%I to service_role',n);
 elsif n='price_staleness_rules' then execute format('grant select,update on public.%I to service_role',n);
 else execute format('grant select,insert,update on public.%I to service_role',n);end if;
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'price\_%' or p.proname='public_price_current') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'price_immutable(%' and f::text not like 'price_observation_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
