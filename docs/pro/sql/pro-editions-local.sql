-- LOCAL PRO ONLY (multivertical F4, 2026-11-16). Pro editions and modules. Never applied to remote projects.
-- * pro_workspace_editions: one row per owner (edition servicios|autos|restaurantes|bienes_raices|comercio,
--   tier basico|pro|plus, source launch_free|admin|billing, active, revision). No row = implicit servicios/basico.
-- * pro_edition_default_modules(edition): IMMUTABLE table of the modules of each edition and their minimum tier
--   (mirrored in src/lib/pro/editions.ts; the PGlite test compares both).
-- * pro_workspace_modules: per-owner overrides (owner may switch an edition module off/on; admin/billing may lock
--   a module off or add an out-of-edition module).
-- * pro_billing_switches: singleton paywall_enabled (default FALSE = Pro free at launch). Only a platform admin
--   changes it, through pro_billing_switch_set (CAS + actionId). Every change is kept in an immutable history.
--   While paywall_enabled=false every module of the edition is active regardless of tier.
-- * pro_has_module(owner,module) / pro_module_require(actor,owner,module) -> 42501 hint 'module_disabled'.
-- * pro_workspace_edition_mutate(actor,input): CAS revision (40001) + idempotent actionId receipts.
-- * pro_editions_backfill_servicios(admin,dryRun,tier): servicios edition for existing owners. NOT auto-run.
-- * pro_route_module(path): module of NEW vertical /api/pro routes (existing routes -> null, never gated).
-- Depends on: profiles, pro_memberships, pro_workspaces (memberships-draft.sql); pro_role_of / pro_role_require
-- (team-roles-local.sql); pro_entitled / pro_entitled_require (pro-entitled-draft.sql).
-- Independent of the public directory: nothing here reads or writes directory tables, search or ordering.
-- Patterns: RLS on, service_role-only grants, security invoker + fixed search_path, immutable history.
begin;

create table if not exists public.pro_workspace_editions(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 edition text not null check(edition in('servicios','autos','restaurantes','bienes_raices','comercio')),
 tier text not null default 'basico' check(tier in('basico','pro','plus')),
 source text not null default 'launch_free' check(source in('launch_free','admin','billing')),
 active boolean not null default true,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());

create table if not exists public.pro_workspace_modules(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 module text not null check(module ~ '^[a-z][a-z_]{1,39}$'),
 enabled boolean not null,
 source text not null check(source in('owner','admin','billing')),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,module));

create table if not exists public.pro_billing_switches(
 id boolean primary key default true check(id),
 paywall_enabled boolean not null default false,
 revision integer not null default 1 check(revision>0),
 updated_by uuid,updated_at timestamptz not null default now());

create table if not exists public.pro_billing_switch_events(
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null,action_id uuid not null,
 before_enabled boolean not null,after_enabled boolean not null,revision integer not null,
 reason text not null check(length(reason) between 3 and 500),
 at timestamptz not null default now(),unique(actor_id,action_id));

create table if not exists public.pro_workspace_edition_events(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid not null,action_id uuid not null,
 action text not null check(action in('choose_edition','admin_set_edition','set_module','admin_set_module','backfill')),
 module text,before_state jsonb,after_state jsonb not null,reason text not null default '',
 at timestamptz not null default now());
create index if not exists pro_workspace_edition_events_owner_idx on public.pro_workspace_edition_events(owner_id,at desc);

create table if not exists public.pro_edition_actions(
 actor_id uuid not null,action_id uuid not null,
 input_hash text not null check(input_hash~'^[a-f0-9]{32}$'),result jsonb not null,
 at timestamptz not null default now(),primary key(actor_id,action_id));

-- Singleton seed: paywall OFF. Re-applying the module never changes an existing value.
insert into public.pro_billing_switches(id,paywall_enabled) values(true,false) on conflict(id) do nothing;

-- ── Catalogue (immutable) ──────────────────────────────────────────────────────────────────────
create or replace function public.pro_tier_rank(p_tier text) returns integer
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_tier when 'basico' then 1 when 'pro' then 2 when 'plus' then 3 end $$;

create or replace function public.pro_edition_default_modules(p_edition text) returns table(module text,min_tier text)
language sql immutable security invoker set search_path=public,pg_temp as $$
 select d.module,d.min_tier from (
  select e.edition,c.module,c.min_tier,c.o from unnest(array['servicios','autos','restaurantes','bienes_raices','comercio']) e(edition)
   cross join (values('clients','basico',1),('leads','basico',2),('quotes','basico',3),('agenda','basico',4),('payments','basico',5),
    ('catalog','basico',6),('site','basico',7),('statistics','pro',8),('expenses','pro',9),('team','pro',10),
    ('marketing','plus',11),('ai_plus','plus',12)) c(module,min_tier,o)
  union all select v.edition,v.module,v.min_tier,v.o from (values
   ('servicios','projects','basico',20),('servicios','tasks','basico',21),('servicios','timesheets','pro',22),
   ('servicios','visit_prep','pro',23),('servicios','invoice_drafts','pro',24),('servicios','bids','plus',25),
   ('autos','auto_inventory','basico',20),('autos','listings','basico',21),('autos','test_drives','basico',22),
   ('autos','auto_finance_calc','pro',23),('autos','listing_metrics','plus',24),
   ('restaurantes','menu','basico',20),('restaurantes','table_reservations','pro',21),('restaurantes','menu_from_photo','plus',22),
   ('bienes_raices','property_inventory','basico',20),('bienes_raices','listings','basico',21),('bienes_raices','property_visits','basico',22),
   ('bienes_raices','listing_metrics','plus',23),
   ('comercio','inventory','basico',20),('comercio','price_list','basico',21),('comercio','stock_alerts','pro',22)
  ) v(edition,module,min_tier,o)) d
 where d.edition=p_edition order by d.o $$;

create or replace function public.pro_module_catalog() returns setof text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select distinct d.module from unnest(array['servicios','autos','restaurantes','bienes_raices','comercio']) e
  cross join lateral public.pro_edition_default_modules(e) d order by 1 $$;

-- Module of a NEW vertical /api/pro route. Existing routes return null and are never module-gated.
create or replace function public.pro_route_module(p_path text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case
  when s ~ '^auto-inventory$' then 'auto_inventory'
  when s ~ '^(auto-listings|listings)$' then 'listings'
  when s ~ '^test-drives$' then 'test_drives'
  when s ~ '^auto-finance$' then 'auto_finance_calc'
  when s ~ '^listing-metrics$' then 'listing_metrics'
  when s ~ '^menu(-items|-sections)?$' then 'menu'
  when s ~ '^menu-from-photo$' then 'menu_from_photo'
  when s ~ '^table-reservations$' then 'table_reservations'
  when s ~ '^property-inventory$' then 'property_inventory'
  when s ~ '^property-visits$' then 'property_visits'
  when s ~ '^(inventory|inventory-items|inventory-movements)$' then 'inventory'
  when s ~ '^(price-list|prices)$' then 'price_list'
  when s ~ '^stock-alerts$' then 'stock_alerts'
  else null end
 from (select split_part(regexp_replace(coalesce(p_path,''),'^/api/pro/?',''),'/',1) s) x $$;

-- ── Effective state ────────────────────────────────────────────────────────────────────────────
create or replace function public.pro_paywall_enabled() returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select paywall_enabled from public.pro_billing_switches where id),false) $$;

-- True when the owner's workspace has the module. Rules (same order in editions.ts hasModule):
-- owner not entitled to Pro -> false; edition row inactive -> false; override enabled=false -> false;
-- module of the edition: paywall off -> true, paywall on -> tier >= min_tier or an admin/billing grant;
-- module outside the edition: only an enabled admin/billing grant (add-on).
create or replace function public.pro_has_module(p_owner uuid,p_module text) returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ed text;t text;act boolean;ov public.pro_workspace_modules;has_ov boolean;minimum text;
begin
 if p_owner is null or p_module is null or not public.pro_entitled(p_owner) then return false;end if;
 select e.edition,e.tier,e.active into ed,t,act from public.pro_workspace_editions e where e.owner_id=p_owner;
 if not found then ed:='servicios';t:='basico';act:=true;end if;
 if not act then return false;end if;
 select * into ov from public.pro_workspace_modules m where m.owner_id=p_owner and m.module=p_module;has_ov:=found;
 if has_ov and not ov.enabled then return false;end if;
 select d.min_tier into minimum from public.pro_edition_default_modules(ed) d where d.module=p_module;
 if minimum is null then return has_ov and ov.enabled and ov.source in('admin','billing');end if;
 if not public.pro_paywall_enabled() then return true;end if;
 return public.pro_tier_rank(t)>=public.pro_tier_rank(minimum) or (has_ov and ov.enabled and ov.source in('admin','billing'));
end $$;

-- THE module helper: the actor must work in the owner's company (any role) and the module must be active.
create or replace function public.pro_module_require(p_actor uuid,p_owner uuid,p_module text) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if p_module is null or not exists(select 1 from public.pro_module_catalog() c where c=p_module) then raise exception 'Unknown module' using errcode='22023';end if;
 if public.pro_role_of(p_actor,p_owner) is null then raise exception 'Forbidden' using errcode='42501';end if;
 if not public.pro_has_module(p_owner,p_module) then raise exception 'module_disabled' using errcode='42501',hint='module_disabled',detail=p_module;end if;
 return p_module;
end $$;

create or replace function public.pro_billing_switch_read() returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select jsonb_build_object('paywallEnabled',paywall_enabled,'revision',revision,'updatedAt',updated_at) from public.pro_billing_switches where id),
  jsonb_build_object('paywallEnabled',false,'revision',0,'updatedAt',null)) $$;

create or replace function public.pro_workspace_edition_read(p_actor uuid,p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare e public.pro_workspace_editions;implicit boolean;ed text;mods jsonb;
begin
 perform public.pro_role_require(p_actor,p_owner,'read');
 select * into e from public.pro_workspace_editions where owner_id=p_owner;implicit:=not found;ed:=coalesce(e.edition,'servicios');
 select coalesce(jsonb_agg(jsonb_build_object('module',c.m,'minTier',d.min_tier,'inEdition',d.module is not null,
   'override',case when o.module is null then null else jsonb_build_object('enabled',o.enabled,'source',o.source,'revision',o.revision) end,
   'active',public.pro_has_module(p_owner,c.m)) order by c.m),'[]'::jsonb) into mods
 from public.pro_module_catalog() c(m) left join public.pro_edition_default_modules(ed) d on d.module=c.m
  left join public.pro_workspace_modules o on o.owner_id=p_owner and o.module=c.m;
 return jsonb_build_object('ownerId',p_owner,'edition',ed,'tier',coalesce(e.tier,'basico'),'source',coalesce(e.source,'launch_free'),
  'active',coalesce(e.active,true),'revision',coalesce(e.revision,0),'implicit',implicit,'paywallEnabled',public.pro_paywall_enabled(),
  'entitled',public.pro_entitled(p_owner),'modules',mods);
end $$;

-- ── Mutations ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.pro_edition_is_admin(p_actor uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where id=p_actor and role='admin' and not coalesce(is_disabled,false)) $$;

-- Inputs (exact key sets; revision = current row revision, 0 when the row does not exist):
--  choose_edition   {action,actionId,edition,ownerId,revision}                        owner / settings.write
--  set_module       {action,actionId,enabled,module,ownerId,revision}                  owner / settings.write
--  admin_set_edition{action,actionId,active,edition,ownerId,reason,revision,source,tier} platform admin
--  admin_set_module {action,actionId,enabled,module,ownerId,reason,revision,source}    platform admin (source admin|billing)
create or replace function public.pro_workspace_edition_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;own uuid;rev integer;keys text[];hash text;prior public.pro_edition_actions;
 cur public.pro_workspace_editions;has_cur boolean;m public.pro_workspace_modules;has_m boolean;
 ed text;mod text;src text;why text:='';before jsonb;after jsonb;answer jsonb;
begin
 if p_actor is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid edition action' using errcode='22023';end if;
 act:=p_input->>'action';
 if act is null or act not in('choose_edition','set_module','admin_set_edition','admin_set_module') or jsonb_typeof(p_input->'actionId') is distinct from 'string'
  or jsonb_typeof(p_input->'ownerId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' then raise exception 'Invalid edition action' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act='choose_edition' and keys<>array['action','actionId','edition','ownerId','revision']
  or act='set_module' and keys<>array['action','actionId','enabled','module','ownerId','revision']
  or act='admin_set_edition' and keys<>array['action','actionId','active','edition','ownerId','reason','revision','source','tier']
  or act='admin_set_module' and keys<>array['action','actionId','enabled','module','ownerId','reason','revision','source'] then raise exception 'Invalid fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;own:=(p_input->>'ownerId')::uuid;rev:=(p_input->>'revision')::integer;
 exception when others then raise exception 'Invalid edition action' using errcode='22023';end;
 if rev<0 or (p_input->>'revision')::numeric<>rev then raise exception 'Invalid revision' using errcode='22023';end if;
 hash:=md5(p_input::text);
 perform pg_advisory_xact_lock(hashtextextended('pro-edition-action:'||p_actor::text||':'||aid::text,0));
 select * into prior from public.pro_edition_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;

 if act like 'admin\_%' then
  if not public.pro_edition_is_admin(p_actor) then raise exception 'admin required' using errcode='42501';end if;
  why:=btrim(coalesce(p_input->>'reason',''));
  if length(why) not between 3 and 500 then raise exception 'Reason required' using errcode='22023';end if;
  if not exists(select 1 from public.profiles where id=own) then raise exception 'Owner unavailable' using errcode='P0002';end if;
 else
  perform public.pro_role_require(p_actor,own,'settings.write');
  perform public.pro_entitled_require(own);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-edition:'||own::text,0));
 select * into cur from public.pro_workspace_editions where owner_id=own for update;has_cur:=found;

 if act in('choose_edition','admin_set_edition') then
  ed:=p_input->>'edition';
  if ed is null or ed not in('servicios','autos','restaurantes','bienes_raices','comercio') then raise exception 'Invalid edition' using errcode='22023';end if;
  if coalesce(cur.revision,0)<>rev then raise exception 'Edition changed' using errcode='40001';end if;
  before:=case when has_cur then jsonb_build_object('edition',cur.edition,'tier',cur.tier,'source',cur.source,'active',cur.active,'revision',cur.revision) end;
  if act='choose_edition' then
   if has_cur and not cur.active then raise exception 'Edition suspended' using errcode='42501',hint='edition_inactive';end if;
   if has_cur then update public.pro_workspace_editions set edition=ed,revision=revision+1,updated_at=now() where owner_id=own returning * into cur;
   else insert into public.pro_workspace_editions(owner_id,edition,tier,source,active) values(own,ed,'basico',case when public.pro_paywall_enabled() then 'billing' else 'launch_free' end,true) returning * into cur;end if;
  else
   if p_input->>'tier' is null or p_input->>'tier' not in('basico','pro','plus') or p_input->>'source' is null or p_input->>'source' not in('launch_free','admin','billing')
    or jsonb_typeof(p_input->'active')<>'boolean' then raise exception 'Invalid edition' using errcode='22023';end if;
   insert into public.pro_workspace_editions(owner_id,edition,tier,source,active) values(own,ed,p_input->>'tier',p_input->>'source',(p_input->>'active')::boolean)
   on conflict(owner_id) do update set edition=excluded.edition,tier=excluded.tier,source=excluded.source,active=excluded.active,
    revision=public.pro_workspace_editions.revision+1,updated_at=now() returning * into cur;
  end if;
  after:=jsonb_build_object('edition',cur.edition,'tier',cur.tier,'source',cur.source,'active',cur.active,'revision',cur.revision);
  answer:=jsonb_build_object('ownerId',own,'action',act)||after;
 else
  mod:=p_input->>'module';
  if mod is null or not exists(select 1 from public.pro_module_catalog() c where c=mod) then raise exception 'Unknown module' using errcode='22023';end if;
  if jsonb_typeof(p_input->'enabled')<>'boolean' then raise exception 'Invalid module' using errcode='22023';end if;
  select * into m from public.pro_workspace_modules where owner_id=own and module=mod for update;has_m:=found;
  if coalesce(m.revision,0)<>rev then raise exception 'Module changed' using errcode='40001';end if;
  if act='set_module' then
   if has_cur and not cur.active then raise exception 'Edition suspended' using errcode='42501',hint='edition_inactive';end if;
   if not exists(select 1 from public.pro_edition_default_modules(coalesce(cur.edition,'servicios')) d where d.module=mod) then raise exception 'Module not in edition' using errcode='22023',hint='module_not_in_edition';end if;
   if has_m and m.source<>'owner' then raise exception 'Module locked' using errcode='42501',hint='module_locked';end if;
   src:='owner';
  else
   src:=p_input->>'source';
   if src is null or src not in('admin','billing') then raise exception 'Invalid source' using errcode='22023';end if;
  end if;
  before:=case when has_m then jsonb_build_object('enabled',m.enabled,'source',m.source,'revision',m.revision) end;
  insert into public.pro_workspace_modules(owner_id,module,enabled,source) values(own,mod,(p_input->>'enabled')::boolean,src)
  on conflict(owner_id,module) do update set enabled=excluded.enabled,source=excluded.source,revision=public.pro_workspace_modules.revision+1,updated_at=now()
  returning * into m;
  after:=jsonb_build_object('enabled',m.enabled,'source',m.source,'revision',m.revision);
  answer:=jsonb_build_object('ownerId',own,'action',act,'module',mod,'active',public.pro_has_module(own,mod))||after;
 end if;
 insert into public.pro_workspace_edition_events(owner_id,actor_id,action_id,action,module,before_state,after_state,reason)
 values(own,p_actor,aid,act,mod,before,after,why);
 insert into public.pro_edition_actions(actor_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer||jsonb_build_object('replayed',false);
end $$;

-- Paywall switch. Input {actionId,paywallEnabled,reason,revision}. Platform admin only.
create or replace function public.pro_billing_switch_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare aid uuid;rev integer;keys text[];hash text;prior public.pro_edition_actions;s public.pro_billing_switches;was boolean;why text;answer jsonb;
begin
 if p_actor is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'Invalid switch action' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys<>array['actionId','paywallEnabled','reason','revision'] or jsonb_typeof(p_input->'paywallEnabled')<>'boolean'
  or jsonb_typeof(p_input->'revision')<>'number' or jsonb_typeof(p_input->'actionId')<>'string' then raise exception 'Invalid fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;exception when others then raise exception 'Invalid switch action' using errcode='22023';end;
 hash:=md5(p_input::text);
 if not public.pro_edition_is_admin(p_actor) then raise exception 'admin required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-edition-action:'||p_actor::text||':'||aid::text,0));
 select * into prior from public.pro_edition_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 why:=btrim(coalesce(p_input->>'reason',''));
 if length(why) not between 3 and 500 then raise exception 'Reason required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-billing-switch',0));
 select * into s from public.pro_billing_switches where id for update;
 if not found then raise exception 'Switch unavailable' using errcode='P0002';end if;
 if s.revision<>rev then raise exception 'Switch changed' using errcode='40001';end if;
 was:=s.paywall_enabled;
 perform set_config('pro.billing_switch_write','1',true);
 update public.pro_billing_switches set paywall_enabled=(p_input->>'paywallEnabled')::boolean,revision=revision+1,updated_by=p_actor,updated_at=now() where id returning * into s;
 perform set_config('pro.billing_switch_write','',true);
 insert into public.pro_billing_switch_events(actor_id,action_id,before_enabled,after_enabled,revision,reason) values(p_actor,aid,was,s.paywall_enabled,s.revision,why);
 answer:=jsonb_build_object('paywallEnabled',s.paywall_enabled,'revision',s.revision);
 insert into public.pro_edition_actions(actor_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer||jsonb_build_object('replayed',false);
end $$;

-- Servicios edition for existing Pro owners (any pro_memberships or pro_workspaces row) without an edition.
-- NOT run by this module. Dry run by default; idempotent (never touches existing rows).
create or replace function public.pro_editions_backfill_servicios(p_actor uuid,p_dry_run boolean default true,p_tier text default 'pro') returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare total integer;ids uuid[];n integer:=0;o uuid;
begin
 if not public.pro_edition_is_admin(p_actor) then raise exception 'admin required' using errcode='42501';end if;
 if p_dry_run is null or p_tier is null or p_tier not in('basico','pro','plus') then raise exception 'Invalid backfill' using errcode='22023';end if;
 select coalesce(array_agg(p.id order by p.id),'{}') into ids from public.profiles p
  where (exists(select 1 from public.pro_memberships m where m.user_id=p.id) or exists(select 1 from public.pro_workspaces w where w.user_id=p.id))
   and not exists(select 1 from public.pro_workspace_editions e where e.owner_id=p.id);
 total:=coalesce(array_length(ids,1),0);
 if p_dry_run then return jsonb_build_object('dryRun',true,'candidates',total,'inserted',0,'sample',to_jsonb(ids[1:50]));end if;
 foreach o in array ids loop
  insert into public.pro_workspace_editions(owner_id,edition,tier,source,active) values(o,'servicios',p_tier,'launch_free',true) on conflict(owner_id) do nothing;
  if found then n:=n+1;
   insert into public.pro_workspace_edition_events(owner_id,actor_id,action_id,action,after_state,reason)
   values(o,p_actor,md5('pro-edition-backfill:'||o::text)::uuid,'backfill',jsonb_build_object('edition','servicios','tier',p_tier,'source','launch_free','active',true,'revision',1),'servicios backfill');
  end if;
 end loop;
 return jsonb_build_object('dryRun',false,'candidates',total,'inserted',n,'sample',to_jsonb(ids[1:50]));
end $$;

-- ── Immutability, RLS, grants ──────────────────────────────────────────────────────────────────
create or replace function public.pro_edition_history_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 -- Account deletion: the owner's profile is already gone, so the ON DELETE CASCADE of its edition events may proceed
 -- (same rule as the other immutable Pro histories, e.g. work-budget-local.sql). Anything else stays immutable.
 if tg_op='DELETE' and tg_table_name='pro_workspace_edition_events' then
  if not exists(select 1 from public.profiles where id=old.owner_id) then return old;end if;
 end if;
 raise exception 'Immutable edition history' using errcode='23514';
end $$;
create or replace function public.pro_billing_switch_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and current_setting('pro.billing_switch_write',true)='1' and new.id then return new;end if;
 raise exception 'Billing switch changes only through pro_billing_switch_set' using errcode='23514';
end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_workspace_editions','pro_workspace_modules','pro_billing_switches','pro_billing_switch_events','pro_workspace_edition_events','pro_edition_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;
 grant select,insert,update on public.pro_workspace_editions,public.pro_workspace_modules to service_role;
 grant select,update on public.pro_billing_switches to service_role;
 grant select,insert on public.pro_billing_switch_events,public.pro_workspace_edition_events,public.pro_edition_actions to service_role;
 foreach t in array array['pro_billing_switch_events','pro_workspace_edition_events','pro_edition_actions'] loop
  execute format('drop trigger if exists pro_edition_history_immutable on public.%I',t);
  execute format('create trigger pro_edition_history_immutable before update or delete on public.%I for each row execute function public.pro_edition_history_immutable()',t);
  execute format('drop trigger if exists pro_edition_history_no_truncate on public.%I',t);
  execute format('create trigger pro_edition_history_no_truncate before truncate on public.%I for each statement execute function public.pro_edition_history_immutable()',t);end loop;
 drop trigger if exists pro_billing_switch_guard on public.pro_billing_switches;
 create trigger pro_billing_switch_guard before update or delete on public.pro_billing_switches for each row execute function public.pro_billing_switch_guard();
 drop trigger if exists pro_billing_switch_no_truncate on public.pro_billing_switches;
 create trigger pro_billing_switch_no_truncate before truncate on public.pro_billing_switches for each statement execute function public.pro_edition_history_immutable();
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_tier_rank','pro_edition_default_modules','pro_module_catalog','pro_route_module','pro_paywall_enabled','pro_has_module','pro_module_require','pro_billing_switch_read','pro_workspace_edition_read','pro_edition_is_admin','pro_workspace_edition_mutate','pro_billing_switch_set','pro_editions_backfill_servicios','pro_edition_history_immutable','pro_billing_switch_guard') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
