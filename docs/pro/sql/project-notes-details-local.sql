-- LOCAL PRO ONLY. «Notas y llamadas del proyecto» y «Detalles del proyecto».
-- Owner-private, per job (pro_work). Two independent pieces in one module:
--
-- 1. Notes and calls (pro_project_notes): a private log per project. A note is text
--    (1..4000). A call record has a Costa Rica date/time, duration in minutes,
--    direction (inbound/outbound), optional contact and optional summary (0..4000).
--    Edit keeps an immutable version history; pin (max 10 per project), archive and
--    restore. Read: filters all/note/call, active/archived, text search, pages of 20 with
--    an opaque keyset cursor (occurred_at desc, id desc). Pinned notes come first, only
--    in the first active page, and are excluded from the stream so nothing repeats.
--
-- 2. Project details (pro_project_details): closed named colour palette (no free hex),
--    project type from an editable per-account catalogue (built-in defaults are virtual
--    until the account edits the catalogue or picks one; they have systemKey and a null
--    name so the interface localises them), optional project code unique per account
--    (case-insensitive), planned budget (CRC céntimos), up to 10 reusable per-account
--    tags, main address and default billing/shipping addresses (null = same as main), and
--    the project default IVA code (same codes as invoice-tax-local.sql). The default IVA
--    is stored and exposed; applying it to new drafts is documented as a later step
--    (project-notes-details-local.md): new estimate lines start with an empty tax and
--    invoice lines start as «pending», so there is no single neutral hook.
--
-- 3. pro_projects_page_v2: the Projects hub with colour, type, code and tags, plus type
--    and tag filters. pro_projects_page (v1) is NOT modified.
--
-- Pattern (client-dashboard-local.sql): closed RLS + revoke, security invoker RPCs for
-- service_role only, eligibility pro_private_work_tools_enabled(p_actor), optimistic
-- revision (40001 -> 409), idempotent receipts per actionId (same id + other payload ->
-- 22023), immutable history and receipts, Costa Rica wall time (UTC-6, no DST).
--
-- Lock order: action advisory -> work advisory (notes/details) -> catalogue advisory ->
-- rows. Catalogue actions take action -> catalogue -> rows and never a work lock, and a
-- details save always takes the catalogue lock BEFORE locking its details row, so the
-- order cannot invert. Reapplicable; only new objects (no existing table or function is
-- altered).
begin;
-- ===================================================================== catalogue
create table if not exists public.pro_project_catalogs(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now()
);
create table if not exists public.pro_project_types(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 system_key text check(system_key is null or system_key in('remodel','new_construction','addition','maintenance','repair','design','commercial')),
 name text check(name is null or length(btrim(name)) between 1 and 60),
 position smallint not null check(position between 1 and 100),archived boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,system_key),check(name is not null or system_key is not null)
);
create unique index if not exists pro_project_type_global_id on public.pro_project_types(id);
create unique index if not exists pro_project_type_name on public.pro_project_types(owner_id,lower(name)) where name is not null;
create table if not exists public.pro_project_tags(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 40),created_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create unique index if not exists pro_project_tag_global_id on public.pro_project_tags(id);
create unique index if not exists pro_project_tag_name on public.pro_project_tags(owner_id,lower(name));
create table if not exists public.pro_project_catalog_history(
 owner_id uuid not null,action_id uuid not null,
 action text not null check(action in('type_create','type_rename','type_archive','type_restore','tag_rename','tag_delete','tags_created')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id),foreign key(owner_id) references public.pro_project_catalogs(owner_id) on delete cascade
);
-- ===================================================================== details
create table if not exists public.pro_project_details(
 owner_id uuid not null,work_id text not null,
 color text check(color is null or color in('blue','teal','green','olive','amber','orange','red','magenta','purple','gray')),
 type_id uuid,
 code text check(code is null or code~'^[A-Za-z0-9][A-Za-z0-9._/-]{0,23}$'),
 budget_cents bigint check(budget_cents is null or budget_cents between 0 and 10000000000000),
 address text check(address is null or length(btrim(address)) between 1 and 300),
 billing_address text check(billing_address is null or length(btrim(billing_address)) between 1 and 300),
 shipping_address text check(shipping_address is null or length(btrim(shipping_address)) between 1 and 300),
 default_vat_code text check(default_vat_code is null or default_vat_code in('01','02','03','04','08','09','10','11')),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,work_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,type_id) references public.pro_project_types(owner_id,id)
);
create unique index if not exists pro_project_detail_code on public.pro_project_details(owner_id,upper(code)) where code is not null;
-- Phase 2 (2026-11-11): checked at commit (deferred) so deleting the whole account (profile -> types and
-- jobs -> details, two cascade paths in one statement) does not fail with 23503. A type in use still cannot be
-- deleted on its own (types are archived, never deleted, by the writers).
alter table public.pro_project_details drop constraint if exists pro_project_details_owner_id_type_id_fkey;
alter table public.pro_project_details add constraint pro_project_details_owner_id_type_id_fkey foreign key(owner_id,type_id) references public.pro_project_types(owner_id,id) deferrable initially deferred;
create index if not exists pro_project_detail_type on public.pro_project_details(owner_id,type_id) where type_id is not null;
create table if not exists public.pro_project_tag_links(
 owner_id uuid not null,work_id text not null,tag_id uuid not null,position smallint not null check(position between 1 and 10),
 primary key(owner_id,work_id,tag_id),unique(owner_id,work_id,position),
 foreign key(owner_id,work_id) references public.pro_project_details(owner_id,work_id) on delete cascade,
 foreign key(owner_id,tag_id) references public.pro_project_tags(owner_id,id) on delete cascade
);
create index if not exists pro_project_tag_link_tag on public.pro_project_tag_links(owner_id,tag_id,work_id);
create table if not exists public.pro_project_detail_history(
 owner_id uuid not null,work_id text not null,action_id uuid not null,action text not null check(action in('save','tag_removed')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,work_id,action_id),foreign key(owner_id,work_id) references public.pro_project_details(owner_id,work_id) on delete cascade
);
create index if not exists pro_project_detail_history_page on public.pro_project_detail_history(owner_id,work_id,at desc);
create table if not exists public.pro_project_detail_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);
-- ===================================================================== notes
create table if not exists public.pro_project_notes(
 owner_id uuid not null,work_id text not null,id uuid not null,
 kind text not null check(kind in('note','call')),
 body text check(body is null or length(btrim(body)) between 1 and 4000),
 occurred_at timestamptz not null,
 duration_minutes integer check(duration_minutes is null or duration_minutes between 0 and 1440),
 direction text check(direction is null or direction in('inbound','outbound')),
 contact text check(contact is null or length(btrim(contact)) between 1 and 160),
 pinned boolean not null default false,archived_at timestamptz,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 check(kind='call' or (body is not null and duration_minutes is null and direction is null and contact is null)),
 check(kind='note' or (duration_minutes is not null and direction is not null)),
 check(not (pinned and archived_at is not null))
);
create unique index if not exists pro_project_note_global_id on public.pro_project_notes(id);
create index if not exists pro_project_note_page on public.pro_project_notes(owner_id,work_id,occurred_at desc,id desc);
create index if not exists pro_project_note_pinned on public.pro_project_notes(owner_id,work_id) where pinned;
create table if not exists public.pro_project_note_history(
 owner_id uuid not null,work_id text not null,note_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','pin','unpin','archive','restore')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id),foreign key(owner_id,note_id) references public.pro_project_notes(owner_id,id) on delete cascade
);
create index if not exists pro_project_note_history_page on public.pro_project_note_history(owner_id,note_id,at desc);
create table if not exists public.pro_project_note_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

-- ===================================================================== helpers
create or replace function public.pro_pnd_uuid(p_seed text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select md5(p_seed) h) x;
$$;
create or replace function public.pro_pnd_uuid_value(p_value jsonb) returns uuid
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'string' or not (p_value#>>'{}')~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'Invalid identifier' using errcode='22023';end if;
 return lower(p_value#>>'{}')::uuid;
end $$;
-- Trimmed text; null/empty -> null (or 22023 when required). Single-line unless p_multiline.
create or replace function public.pro_pnd_text(p_value jsonb,p_max integer,p_required boolean,p_multiline boolean) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare t text;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' then raise exception 'Invalid text' using errcode='22023';end if;
 t:=btrim(p_value#>>'{}',E' \t\r\n');
 if t='' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if length(t)>p_max or t~'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' or (not p_multiline and t~'[\r\n\t]') then raise exception 'Invalid text' using errcode='22023';end if;
 return t;
end $$;
create or replace function public.pro_pnd_int(p_value jsonb,p_min bigint,p_max bigint,p_required boolean) returns bigint
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing number' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'number' or not (p_value#>>'{}')~'^[0-9]{1,15}$' or (p_value#>>'{}')::numeric not between p_min and p_max then raise exception 'Invalid number' using errcode='22023';end if;
 return (p_value#>>'{}')::bigint;
end $$;
-- Costa Rica wall time 'YYYY-MM-DDTHH:MI' -> instant (America/Costa_Rica, UTC-6, no DST).
create or replace function public.pro_pnd_local_time(p_value jsonb) returns timestamptz
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s text;local_ts timestamp;
begin
 if jsonb_typeof(p_value) is distinct from 'string' then raise exception 'Invalid date' using errcode='22023';end if;
 s:=p_value#>>'{}';
 if s!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
 begin local_ts:=to_timestamp(s,'YYYY-MM-DD"T"HH24:MI')::timestamp;exception when others then raise exception 'Invalid date' using errcode='22023';end;
 if to_char(local_ts,'YYYY-MM-DD"T"HH24:MI')<>s or local_ts<timestamp '2000-01-01' then raise exception 'Invalid date' using errcode='22023';end if;
 -- A log entry cannot be in the future (one minute of clock tolerance).
 if (local_ts at time zone 'America/Costa_Rica')>now()+interval '1 minute' then raise exception 'Date in the future' using errcode='22023';end if;
 return local_ts at time zone 'America/Costa_Rica';
end $$;
create or replace function public.pro_pnd_cursor(p_at timestamptz,p_id uuid) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select to_char(p_at at time zone 'UTC','YYYYMMDDHH24MISSUS')||'_'||p_id::text;
$$;
create or replace function public.pro_pnd_note_json(p_row public.pro_project_notes) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'kind',p_row.kind,'body',p_row.body,
  'occurredAt',to_char(p_row.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'occurredLocal',to_char(p_row.occurred_at at time zone 'America/Costa_Rica','YYYY-MM-DD"T"HH24:MI'),
  'durationMinutes',p_row.duration_minutes,'direction',p_row.direction,'contact',p_row.contact,
  'pinned',p_row.pinned,'archived',p_row.archived_at is not null,'archivedAt',p_row.archived_at,
  'revision',p_row.revision,'edited',exists(select 1 from public.pro_project_note_history h where h.owner_id=p_row.owner_id and h.note_id=p_row.id and h.action='update'),
  'createdAt',p_row.created_at,'updatedAt',p_row.updated_at);
$$;
-- Built-in project types (virtual until the account edits the catalogue).
create or replace function public.pro_pnd_default_types() returns table(system_key text,type_position smallint)
language sql immutable security invoker set search_path=public,pg_temp as $$
 select k,p::smallint from unnest(array['remodel','new_construction','addition','maintenance','repair','design','commercial']) with ordinality as x(k,p);
$$;
create or replace function public.pro_pnd_types_materialize(p_owner uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into public.pro_project_catalogs(owner_id) values(p_owner) on conflict do nothing;
 if not exists(select 1 from public.pro_project_types where owner_id=p_owner) then
  insert into public.pro_project_types(owner_id,id,system_key,name,position)
   select p_owner,public.pro_pnd_uuid('pro-project-type:'||p_owner::text||':'||d.system_key),d.system_key,null,d.type_position from public.pro_pnd_default_types() d;
 end if;
end $$;
create or replace function public.pro_pnd_catalog_json(p_owner uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'revision',coalesce((select c.revision from public.pro_project_catalogs c where c.owner_id=p_owner),0),
  'types',case when exists(select 1 from public.pro_project_types t where t.owner_id=p_owner)
   then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'systemKey',t.system_key,'name',t.name,'archived',t.archived,
      'projectCount',(select count(*) from public.pro_project_details d where d.owner_id=p_owner and d.type_id=t.id)) order by t.position,t.id),'[]'::jsonb)
     from public.pro_project_types t where t.owner_id=p_owner)
   else (select jsonb_agg(jsonb_build_object('id',public.pro_pnd_uuid('pro-project-type:'||p_owner::text||':'||d.system_key),'systemKey',d.system_key,'name',null,'archived',false,'projectCount',0) order by d.type_position)
     from public.pro_pnd_default_types() d) end,
  'tags',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,
      'projectCount',(select count(*) from public.pro_project_tag_links l where l.owner_id=p_owner and l.tag_id=g.id)) order by lower(g.name),g.id),'[]'::jsonb)
     from public.pro_project_tags g where g.owner_id=p_owner));
$$;
create or replace function public.pro_pnd_detail_json(p_owner uuid,p_work text,p_row public.pro_project_details) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('workId',p_work,'color',p_row.color,'typeId',p_row.type_id,'code',p_row.code,'budgetCents',p_row.budget_cents,
  'address',p_row.address,'billingAddress',p_row.billing_address,'shippingAddress',p_row.shipping_address,
  'billingSameAsAddress',p_row.billing_address is null,'shippingSameAsAddress',p_row.shipping_address is null,
  'effectiveBillingAddress',coalesce(p_row.billing_address,p_row.address),'effectiveShippingAddress',coalesce(p_row.shipping_address,p_row.address),
  'defaultVatCode',p_row.default_vat_code,
  'tags',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by l.position),'[]'::jsonb)
    from public.pro_project_tag_links l join public.pro_project_tags g on g.owner_id=l.owner_id and g.id=l.tag_id where l.owner_id=p_owner and l.work_id=p_work),
  'revision',coalesce(p_row.revision,0),'updatedAt',p_row.updated_at);
$$;
create or replace function public.pro_pnd_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Project notes/details history and receipts are immutable' using errcode='23514';end $$;

-- ===================================================================== notes read
create or replace function public.pro_project_notes_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v text;keys text[];wid text;w public.pro_work;v_kind text;v_state text;needle text;after_at timestamptz;after_id uuid;c text;
 items jsonb;pinned jsonb:='[]'::jsonb;next_cursor text;counts jsonb;receipt public.pro_project_note_actions;nid uuid;n public.pro_project_notes;versions jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or jsonb_typeof(p_query->'view') is distinct from 'string' then raise exception 'Invalid notes query' using errcode='22023';end if;
 v:=p_query->>'view';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_query) key;
 if v='action' then
  if keys is distinct from array['actionId','view'] then raise exception 'Invalid notes query' using errcode='22023';end if;
  select * into receipt from public.pro_project_note_actions where actor_id=p_actor and action_id=public.pro_pnd_uuid_value(p_query->'actionId');
  return case when found then receipt.result end;
 end if;
 if v='list' and keys is distinct from array['after','kind','q','state','view','workId'] or v='history' and keys is distinct from array['id','view','workId'] or v not in('list','history') then
  raise exception 'Invalid notes query' using errcode='22023';end if;
 if jsonb_typeof(p_query->'workId') is distinct from 'string' or length(p_query->>'workId') not between 1 and 160 then raise exception 'Invalid notes query' using errcode='22023';end if;
 wid:=p_query->>'workId';
 select * into w from public.pro_work where user_id=p_actor and id=wid;
 if not found then return null;end if;
 if v='history' then
  nid:=public.pro_pnd_uuid_value(p_query->'id');
  select * into n from public.pro_project_notes where owner_id=p_actor and work_id=wid and id=nid;
  if not found then return null;end if;
  select coalesce(jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_value,'after',h.after_value) order by h.at desc,h.action_id),'[]'::jsonb) into versions
   from (select * from public.pro_project_note_history where owner_id=p_actor and note_id=nid order by at desc,action_id limit 50) h;
  return jsonb_build_object('note',public.pro_pnd_note_json(n),'versions',versions);
 end if;
 v_kind:=p_query->>'kind';v_state:=p_query->>'state';
 if jsonb_typeof(p_query->'kind') is distinct from 'string' or v_kind not in('all','note','call') or jsonb_typeof(p_query->'state') is distinct from 'string' or v_state not in('active','archived')
  or jsonb_typeof(p_query->'q') is distinct from 'string' or length(p_query->>'q')>160 or jsonb_typeof(p_query->'after') not in('string','null') then raise exception 'Invalid notes query' using errcode='22023';end if;
 needle:=nullif(btrim(p_query->>'q'),'');
 if jsonb_typeof(p_query->'after')='string' then
  c:=p_query->>'after';
  if c!~'^[0-9]{20}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid cursor' using errcode='22023';end if;
  begin after_at:=to_timestamp(substr(c,1,20),'YYYYMMDDHH24MISSUS')::timestamp at time zone 'UTC';exception when others then raise exception 'Invalid cursor' using errcode='22023';end;
  after_id:=substr(c,22)::uuid;
 end if;
 select jsonb_build_object('all',count(*) filter(where archived_at is null),'note',count(*) filter(where archived_at is null and kind='note'),
  'call',count(*) filter(where archived_at is null and kind='call'),'archived',count(*) filter(where archived_at is not null))
  into counts from public.pro_project_notes where owner_id=p_actor and work_id=wid;
 if after_at is null and v_state='active' then
  select coalesce(jsonb_agg(public.pro_pnd_note_json(x) order by x.occurred_at desc,x.id desc),'[]'::jsonb) into pinned from public.pro_project_notes x
   where x.owner_id=p_actor and x.work_id=wid and x.pinned and (v_kind='all' or x.kind=v_kind)
    and (needle is null or strpos(lower(coalesce(x.body,'')),lower(needle))>0 or strpos(lower(coalesce(x.contact,'')),lower(needle))>0);
 end if;
 select coalesce(jsonb_agg(public.pro_pnd_note_json(x) order by x.occurred_at desc,x.id desc),'[]'::jsonb) into items from (
  select * from public.pro_project_notes x
  where x.owner_id=p_actor and x.work_id=wid and (v_kind='all' or x.kind=v_kind)
   and (case when v_state='active' then x.archived_at is null and not x.pinned else x.archived_at is not null end)
   and (needle is null or strpos(lower(coalesce(x.body,'')),lower(needle))>0 or strpos(lower(coalesce(x.contact,'')),lower(needle))>0)
   and (after_at is null or (x.occurred_at,x.id)<(after_at,after_id))
  order by x.occurred_at desc,x.id desc limit 21) x;
 if jsonb_array_length(items)>20 then
  next_cursor:=public.pro_pnd_cursor((items->19->>'occurredAt')::timestamptz,(items->19->>'id')::uuid);
  items:=items-20;
 end if;
 return jsonb_build_object('items',items,'pinned',pinned,'nextCursor',next_cursor,'counts',counts,
  'project',jsonb_build_object('workId',w.id,'name',w.service,'client',w.client,'status',public.pro_project_status(w)));
end $$;

-- ===================================================================== notes mutate
create or replace function public.pro_project_notes_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];expected text[];wid text;aid uuid;nid uuid;rev integer;receipt public.pro_project_note_actions;n public.pro_project_notes;
 v_kind text;v_body text;v_at timestamptz;v_duration integer;v_direction text;v_contact text;before_json jsonb;after_json jsonb;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid note' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'create' then array['action','actionId','body','contact','direction','durationMinutes','id','kind','occurredAt','workId']
  when 'update' then array['action','actionId','body','contact','direction','durationMinutes','id','occurredAt','revision','workId']
  when 'pin' then array['action','actionId','id','revision','workId']
  when 'unpin' then array['action','actionId','id','revision','workId']
  when 'archive' then array['action','actionId','id','revision','workId']
  when 'restore' then array['action','actionId','id','revision','workId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid note fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=public.pro_pnd_uuid_value(p_input->'actionId');nid:=public.pro_pnd_uuid_value(p_input->'id');
 if act<>'create' then rev:=public.pro_pnd_int(p_input->'revision',1,2147483646,true);end if;
 -- Shape validation without state (22023 -> 400).
 if act='create' then
  if jsonb_typeof(p_input->'kind') is distinct from 'string' or p_input->>'kind' not in('note','call') then raise exception 'Invalid note kind' using errcode='22023';end if;
  v_kind:=p_input->>'kind';
 end if;
 if act in('create','update') then
  if jsonb_typeof(p_input->'occurredAt') not in('string','null') or jsonb_typeof(p_input->'direction') not in('string','null') then raise exception 'Invalid note fields' using errcode='22023';end if;
  v_at:=case when jsonb_typeof(p_input->'occurredAt')='string' then public.pro_pnd_local_time(p_input->'occurredAt') end;
  v_duration:=public.pro_pnd_int(p_input->'durationMinutes',0,1440,false);
  v_direction:=p_input->>'direction';
  if v_direction is not null and v_direction not in('inbound','outbound') then raise exception 'Invalid call direction' using errcode='22023';end if;
  v_contact:=public.pro_pnd_text(p_input->'contact',160,false,false);
 end if;
 select * into n from public.pro_project_notes where owner_id=p_actor and id=nid;
 if act<>'create' then
  if not found or n.work_id<>wid then
   if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
  end if;
  v_kind:=coalesce(n.kind,v_kind);
 end if;
 if act in('create','update') then
  if v_kind='note' then
   v_body:=public.pro_pnd_text(p_input->'body',4000,true,true);
   if v_duration is not null or v_direction is not null or v_contact is not null then raise exception 'Notes have no call fields' using errcode='22023';end if;
  elsif v_kind='call' then
   v_body:=public.pro_pnd_text(p_input->'body',4000,false,true);
   if v_at is null or v_duration is null or v_direction is null then raise exception 'Call date, duration and direction are required' using errcode='22023';end if;
  end if;
 end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-project-note-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_project_note_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-project-note-work:'||p_actor::text||':'||wid,0));
 perform 1 from public.pro_work where user_id=p_actor and id=wid;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if act='create' then
  if exists(select 1 from public.pro_project_notes where id=nid) then raise exception 'Note id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_project_notes where owner_id=p_actor and work_id=wid)>=5000 then raise exception 'Note limit' using errcode='54000';end if;
  insert into public.pro_project_notes(owner_id,work_id,id,kind,body,occurred_at,duration_minutes,direction,contact)
   values(p_actor,wid,nid,v_kind,v_body,coalesce(v_at,date_trunc('minute',now())),v_duration,v_direction,v_contact) returning * into n;
  before_json:=null;
 else
  select * into n from public.pro_project_notes where owner_id=p_actor and work_id=wid and id=nid for update;
  if not found then raise exception 'Note not found' using errcode='P0002';end if;
  if n.revision<>rev then raise exception 'Note changed' using errcode='40001';end if;
  before_json:=public.pro_pnd_note_json(n);
  if act='update' then
   if n.archived_at is not null then raise exception 'Restore the note first' using errcode='22023';end if;
   v_at:=coalesce(v_at,n.occurred_at);
   if n.body is not distinct from v_body and n.occurred_at=v_at and n.duration_minutes is not distinct from v_duration and n.direction is not distinct from v_direction and n.contact is not distinct from v_contact then
    raise exception 'No note changes' using errcode='22023';end if;
   update public.pro_project_notes set body=v_body,occurred_at=v_at,duration_minutes=v_duration,direction=v_direction,contact=v_contact,revision=revision+1,updated_at=now()
    where owner_id=p_actor and id=nid returning * into n;
  elsif act='pin' then
   if n.archived_at is not null or n.pinned then raise exception 'Note cannot be pinned' using errcode='22023';end if;
   if (select count(*) from public.pro_project_notes where owner_id=p_actor and work_id=wid and pinned)>=10 then raise exception 'Pinned limit' using errcode='22023';end if;
   update public.pro_project_notes set pinned=true,revision=revision+1,updated_at=now() where owner_id=p_actor and id=nid returning * into n;
  elsif act='unpin' then
   if not n.pinned then raise exception 'Note is not pinned' using errcode='22023';end if;
   update public.pro_project_notes set pinned=false,revision=revision+1,updated_at=now() where owner_id=p_actor and id=nid returning * into n;
  elsif act='archive' then
   if n.archived_at is not null then raise exception 'Note already archived' using errcode='22023';end if;
   update public.pro_project_notes set archived_at=now(),pinned=false,revision=revision+1,updated_at=now() where owner_id=p_actor and id=nid returning * into n;
  elsif act='restore' then
   if n.archived_at is null then raise exception 'Note is not archived' using errcode='22023';end if;
   update public.pro_project_notes set archived_at=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=nid returning * into n;
  end if;
 end if;
 insert into public.pro_project_note_history(owner_id,work_id,note_id,action_id,action,before_value,after_value) values(p_actor,wid,nid,aid,act,before_json,public.pro_pnd_note_json(n));
 after_json:=public.pro_pnd_note_json(n);
 result:=jsonb_build_object('note',after_json);
 insert into public.pro_project_note_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ===================================================================== details read
create or replace function public.pro_project_details_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v text;keys text[];wid text;w public.pro_work;d public.pro_project_details;receipt public.pro_project_detail_actions;hist jsonb;suggested text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or jsonb_typeof(p_query->'view') is distinct from 'string' then raise exception 'Invalid details query' using errcode='22023';end if;
 v:=p_query->>'view';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_query) key;
 if v='action' then
  if keys is distinct from array['actionId','view'] then raise exception 'Invalid details query' using errcode='22023';end if;
  select * into receipt from public.pro_project_detail_actions where actor_id=p_actor and action_id=public.pro_pnd_uuid_value(p_query->'actionId');
  return case when found then receipt.result end;
 elsif v='catalog' then
  if keys is distinct from array['view'] then raise exception 'Invalid details query' using errcode='22023';end if;
  return jsonb_build_object('catalog',public.pro_pnd_catalog_json(p_actor));
 elsif v<>'detail' or keys is distinct from array['view','workId'] or jsonb_typeof(p_query->'workId') is distinct from 'string' or length(p_query->>'workId') not between 1 and 160 then
  raise exception 'Invalid details query' using errcode='22023';
 end if;
 wid:=p_query->>'workId';
 select * into w from public.pro_work where user_id=p_actor and id=wid;
 if not found then return null;end if;
 select * into d from public.pro_project_details where owner_id=p_actor and work_id=wid;
 select coalesce(jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_value,'after',h.after_value) order by h.at desc,h.action_id),'[]'::jsonb) into hist
  from (select * from public.pro_project_detail_history where owner_id=p_actor and work_id=wid order by at desc,action_id limit 20) h;
 -- Suggestion only (never saved automatically): the customer's visit location, else the customer address.
 select nullif(btrim(r.location_text),'') into suggested from public.pro_appointment_requests r
  where r.owner_id=p_actor and r.work_id=wid and r.location_kind='customer' order by r.updated_at desc,r.id desc limit 1;
 if suggested is null then select nullif(btrim(c.address),'') into suggested from public.pro_clients c where c.user_id=p_actor and c.id=w."clientId";end if;
 return jsonb_build_object('details',public.pro_pnd_detail_json(p_actor,wid,d),'history',hist,'catalog',public.pro_pnd_catalog_json(p_actor),
  'project',jsonb_build_object('workId',w.id,'name',w.service,'client',w.client,'status',public.pro_project_status(w),'suggestedAddress',left(suggested,300)));
end $$;

-- ===================================================================== details mutate
create or replace function public.pro_project_details_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];expected text[];aid uuid;wid text;rev integer;receipt public.pro_project_detail_actions;d public.pro_project_details;
 v_color text;v_type uuid;v_code text;v_budget bigint;v_address text;v_billing text;v_shipping text;v_vat text;tag_names text[]:=array[]::text[];tag_ids uuid[]:=array[]::uuid[];
 t jsonb;v_name text;tid uuid;i integer;created_tags integer:=0;before_json jsonb;after_json jsonb;result jsonb;cat_before jsonb;cat_rev integer;cur_cat integer;
 ty public.pro_project_types;tg public.pro_project_tags;affected record;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid details' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'save' then array['action','actionId','address','billingAddress','budgetCents','code','color','defaultVatCode','revision','shippingAddress','tags','typeId','workId']
  when 'type_create' then array['action','actionId','catalogRevision','id','name']
  when 'type_rename' then array['action','actionId','catalogRevision','name','typeId']
  when 'type_archive' then array['action','actionId','catalogRevision','typeId']
  when 'type_restore' then array['action','actionId','catalogRevision','typeId']
  when 'tag_rename' then array['action','actionId','catalogRevision','name','tagId']
  when 'tag_delete' then array['action','actionId','catalogRevision','tagId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected then raise exception 'Invalid details fields' using errcode='22023';end if;
 aid:=public.pro_pnd_uuid_value(p_input->'actionId');
 if act='save' then
  if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid details identity' using errcode='22023';end if;
  wid:=p_input->>'workId';rev:=public.pro_pnd_int(p_input->'revision',0,2147483646,true);
  if jsonb_typeof(p_input->'color') not in('string','null') or jsonb_typeof(p_input->'defaultVatCode') not in('string','null') or jsonb_typeof(p_input->'typeId') not in('string','null') or jsonb_typeof(p_input->'tags') is distinct from 'array' then
   raise exception 'Invalid details fields' using errcode='22023';end if;
  v_color:=p_input->>'color';
  if v_color is not null and v_color not in('blue','teal','green','olive','amber','orange','red','magenta','purple','gray') then raise exception 'Invalid colour' using errcode='22023';end if;
  v_vat:=p_input->>'defaultVatCode';
  if v_vat is not null and v_vat not in('01','02','03','04','08','09','10','11') then raise exception 'Invalid IVA code' using errcode='22023';end if;
  v_type:=case when jsonb_typeof(p_input->'typeId')='string' then public.pro_pnd_uuid_value(p_input->'typeId') end;
  v_code:=public.pro_pnd_text(p_input->'code',24,false,false);
  if v_code is not null and v_code!~'^[A-Za-z0-9][A-Za-z0-9._/-]{0,23}$' then raise exception 'Invalid project code' using errcode='22023';end if;
  v_budget:=public.pro_pnd_int(p_input->'budgetCents',0,10000000000000,false);
  v_address:=public.pro_pnd_text(p_input->'address',300,false,true);
  v_billing:=public.pro_pnd_text(p_input->'billingAddress',300,false,true);
  v_shipping:=public.pro_pnd_text(p_input->'shippingAddress',300,false,true);
  -- A default address equal to the main address is stored as «same as main».
  if v_billing is not distinct from v_address then v_billing:=null;end if;
  if v_shipping is not distinct from v_address then v_shipping:=null;end if;
  if jsonb_array_length(p_input->'tags')>10 then raise exception 'Too many tags' using errcode='22023';end if;
  for t in select value from jsonb_array_elements(p_input->'tags') loop
   v_name:=public.pro_pnd_text(t,40,true,false);
   if lower(v_name)=any(select lower(x) from unnest(tag_names) x) then raise exception 'Duplicated tag' using errcode='22023';end if;
   tag_names:=tag_names||v_name;
  end loop;
  if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 else
  cat_rev:=public.pro_pnd_int(p_input->'catalogRevision',0,2147483646,true);
  if act in('type_create','type_rename','tag_rename') then v_name:=public.pro_pnd_text(p_input->'name',case when act='tag_rename' then 40 else 60 end,true,false);end if;
  if act='type_create' then tid:=public.pro_pnd_uuid_value(p_input->'id');
  elsif act like 'type_%' then tid:=public.pro_pnd_uuid_value(p_input->'typeId');
  else tid:=public.pro_pnd_uuid_value(p_input->'tagId');end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-project-detail-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_project_detail_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 if act='save' then
  perform pg_advisory_xact_lock(hashtextextended('pro-project-detail-work:'||p_actor::text||':'||wid,0));
  perform 1 from public.pro_work where user_id=p_actor and id=wid;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  -- Catalogue lock before the details row lock (see lock order at the top).
  perform pg_advisory_xact_lock(hashtextextended('pro-project-catalog:'||p_actor::text,0));
  select * into d from public.pro_project_details where owner_id=p_actor and work_id=wid for update;
  if coalesce(d.revision,0)<>rev then raise exception 'Project details changed' using errcode='40001';end if;
  before_json:=case when d.work_id is null then null else public.pro_pnd_detail_json(p_actor,wid,d) end;
  if v_type is not null then
   if not exists(select 1 from public.pro_project_types where owner_id=p_actor) and v_type in(select public.pro_pnd_uuid('pro-project-type:'||p_actor::text||':'||x.system_key) from public.pro_pnd_default_types() x) then
    perform public.pro_pnd_types_materialize(p_actor);
   end if;
   select * into ty from public.pro_project_types where owner_id=p_actor and id=v_type;
   if not found or (ty.archived and d.type_id is distinct from v_type) then raise exception 'Unknown project type' using errcode='22023';end if;
  end if;
  if v_code is not null and exists(select 1 from public.pro_project_details where owner_id=p_actor and work_id<>wid and upper(code)=upper(v_code)) then
   raise exception 'Project code already used' using errcode='23505',detail='code';end if;
  -- Tags by name: reuse case-insensitively, create the missing ones (max 200 per account).
  cat_before:=public.pro_pnd_catalog_json(p_actor);
  if array_length(tag_names,1) is not null then
   for i in 1..array_length(tag_names,1) loop
    select * into tg from public.pro_project_tags where owner_id=p_actor and lower(pro_project_tags.name)=lower(tag_names[i]);
    if not found then
     if (select count(*) from public.pro_project_tags where owner_id=p_actor)>=200 then raise exception 'Tag limit' using errcode='54000';end if;
     insert into public.pro_project_catalogs(owner_id) values(p_actor) on conflict do nothing;
     insert into public.pro_project_tags(owner_id,id,name) values(p_actor,public.pro_pnd_uuid('pro-project-tag:'||aid::text||':'||i),tag_names[i]) returning * into tg;
     created_tags:=created_tags+1;
    end if;
    tag_ids:=tag_ids||tg.id;
   end loop;
  end if;
  if d.work_id is null then
   insert into public.pro_project_details(owner_id,work_id,color,type_id,code,budget_cents,address,billing_address,shipping_address,default_vat_code)
    values(p_actor,wid,v_color,v_type,v_code,v_budget,v_address,v_billing,v_shipping,v_vat) returning * into d;
  else
   if d.color is not distinct from v_color and d.type_id is not distinct from v_type and d.code is not distinct from v_code and d.budget_cents is not distinct from v_budget
    and d.address is not distinct from v_address and d.billing_address is not distinct from v_billing and d.shipping_address is not distinct from v_shipping and d.default_vat_code is not distinct from v_vat
    and array(select l.tag_id from public.pro_project_tag_links l where l.owner_id=p_actor and l.work_id=wid order by l.position)=tag_ids then
    raise exception 'No details changes' using errcode='22023';end if;
   update public.pro_project_details set color=v_color,type_id=v_type,code=v_code,budget_cents=v_budget,address=v_address,billing_address=v_billing,shipping_address=v_shipping,
    default_vat_code=v_vat,revision=revision+1,updated_at=now() where owner_id=p_actor and work_id=wid returning * into d;
  end if;
  delete from public.pro_project_tag_links where owner_id=p_actor and work_id=wid;
  if array_length(tag_ids,1) is not null then
   insert into public.pro_project_tag_links(owner_id,work_id,tag_id,position) select p_actor,wid,x.id,x.n::smallint from unnest(tag_ids) with ordinality x(id,n);
  end if;
  if created_tags>0 then
   update public.pro_project_catalogs set revision=revision+1,updated_at=now() where owner_id=p_actor;
   insert into public.pro_project_catalog_history(owner_id,action_id,action,before_value,after_value) values(p_actor,aid,'tags_created',cat_before,public.pro_pnd_catalog_json(p_actor));
  end if;
  after_json:=public.pro_pnd_detail_json(p_actor,wid,d);
  insert into public.pro_project_detail_history(owner_id,work_id,action_id,action,before_value,after_value) values(p_actor,wid,aid,'save',before_json,after_json);
  result:=jsonb_build_object('details',after_json,'catalog',public.pro_pnd_catalog_json(p_actor));
 else
  perform pg_advisory_xact_lock(hashtextextended('pro-project-catalog:'||p_actor::text,0));
  select revision into cur_cat from public.pro_project_catalogs where owner_id=p_actor;
  if coalesce(cur_cat,0)<>cat_rev then raise exception 'Catalogue changed' using errcode='40001';end if;
  cat_before:=public.pro_pnd_catalog_json(p_actor);
  if act like 'type_%' then perform public.pro_pnd_types_materialize(p_actor);end if;
  if act='type_create' then
   if exists(select 1 from public.pro_project_types where id=tid) then raise exception 'Type id already used' using errcode='23505';end if;
   if (select count(*) from public.pro_project_types where owner_id=p_actor)>=50 then raise exception 'Type limit' using errcode='54000';end if;
   if exists(select 1 from public.pro_project_types where owner_id=p_actor and lower(pro_project_types.name)=lower(v_name)) then raise exception 'Duplicated type' using errcode='22023';end if;
   insert into public.pro_project_types(owner_id,id,system_key,name,position) values(p_actor,tid,null,v_name,(select coalesce(max(position),0)+1 from public.pro_project_types where owner_id=p_actor));
  elsif act like 'type_%' then
   select * into ty from public.pro_project_types where owner_id=p_actor and id=tid for update;
   if not found then raise exception 'Unknown project type' using errcode='P0002';end if;
   if act='type_rename' then
    if ty.name is not distinct from v_name then raise exception 'No catalogue changes' using errcode='22023';end if;
    if exists(select 1 from public.pro_project_types x where x.owner_id=p_actor and x.id<>tid and lower(x.name)=lower(v_name)) then raise exception 'Duplicated type' using errcode='22023';end if;
    update public.pro_project_types set name=v_name,updated_at=now() where owner_id=p_actor and id=tid;
   elsif act='type_archive' then
    if ty.archived then raise exception 'Type already archived' using errcode='22023';end if;
    update public.pro_project_types set archived=true,updated_at=now() where owner_id=p_actor and id=tid;
   else
    if not ty.archived then raise exception 'Type is not archived' using errcode='22023';end if;
    update public.pro_project_types set archived=false,updated_at=now() where owner_id=p_actor and id=tid;
   end if;
  else
   select * into tg from public.pro_project_tags where owner_id=p_actor and id=tid for update;
   if not found then raise exception 'Unknown tag' using errcode='P0002';end if;
   if act='tag_rename' then
    if tg.name=v_name then raise exception 'No catalogue changes' using errcode='22023';end if;
    if exists(select 1 from public.pro_project_tags x where x.owner_id=p_actor and x.id<>tid and lower(x.name)=lower(v_name)) then raise exception 'Duplicated tag' using errcode='22023';end if;
    update public.pro_project_tags set name=v_name where owner_id=p_actor and id=tid;
   else
    -- Deleting a tag removes it from every project: each affected project gets a new revision and history row.
    for affected in select dd.* from public.pro_project_details dd join public.pro_project_tag_links l on l.owner_id=dd.owner_id and l.work_id=dd.work_id
      where dd.owner_id=p_actor and l.tag_id=tid order by dd.work_id for update of dd loop
     before_json:=public.pro_pnd_detail_json(p_actor,affected.work_id,(select x from public.pro_project_details x where x.owner_id=p_actor and x.work_id=affected.work_id));
     -- Re-insert the remaining tags with dense positions (1..n), keeping their order.
     tag_ids:=array(select l.tag_id from public.pro_project_tag_links l where l.owner_id=p_actor and l.work_id=affected.work_id and l.tag_id<>tid order by l.position);
     delete from public.pro_project_tag_links where owner_id=p_actor and work_id=affected.work_id;
     insert into public.pro_project_tag_links(owner_id,work_id,tag_id,position) select p_actor,affected.work_id,x.id,x.n::smallint from unnest(tag_ids) with ordinality x(id,n);
     update public.pro_project_details set revision=revision+1,updated_at=now() where owner_id=p_actor and work_id=affected.work_id returning * into d;
     insert into public.pro_project_detail_history(owner_id,work_id,action_id,action,before_value,after_value) values(p_actor,affected.work_id,aid,'tag_removed',before_json,public.pro_pnd_detail_json(p_actor,affected.work_id,d));
    end loop;
    delete from public.pro_project_tags where owner_id=p_actor and id=tid;
   end if;
  end if;
  insert into public.pro_project_catalogs(owner_id) values(p_actor) on conflict do nothing;
  update public.pro_project_catalogs set revision=revision+case when cur_cat is null then 0 else 1 end,updated_at=now() where owner_id=p_actor;
  insert into public.pro_project_catalog_history(owner_id,action_id,action,before_value,after_value) values(p_actor,aid,act,cat_before,public.pro_pnd_catalog_json(p_actor));
  result:=jsonb_build_object('catalog',public.pro_pnd_catalog_json(p_actor));
 end if;
 insert into public.pro_project_detail_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ===================================================================== hub v2
-- Same contract as pro_projects_page (status, search, cursor, counts) plus colour, type,
-- code and tags per row, filters by type and tag, search by code, and the filter options.
create or replace function public.pro_projects_page_v2(p_actor uuid,p_status text default 'active',p_search text default '',p_after bigint default null,p_type uuid default null,p_tag uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;next_cursor bigint;counts jsonb;needle text;catalog jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status is null or p_status not in('active','open','in_progress','completed','cancelled','all') or p_search is null or length(p_search)>160 or p_after is not null and p_after<1 then
  raise exception 'Invalid project query' using errcode='22023';end if;
 needle:=nullif(btrim(p_search),'');
 select jsonb_build_object('open',count(*) filter(where s='open'),'in_progress',count(*) filter(where s='in_progress'),'completed',count(*) filter(where s='completed'),'cancelled',count(*) filter(where s='cancelled'),'all',count(*))
  into counts from (select public.pro_project_status(w) s from public.pro_work w where w.user_id=p_actor) x;
 select coalesce(jsonb_agg(x.content order by x.position desc),'[]'::jsonb) into items from (
  select w.position,jsonb_build_object('id',w.id,'name',w.service,'client',w.client,'clientId',w."clientId",'status',public.pro_project_status(w),
   'start',nullif(w."start",''),'end',nullif(w."end",''),'hasQuote',w."quoteId" is not null or w."externalQuoteId" is not null,
   'linkedCustomer',exists(select 1 from public.pro_appointment_requests r join public.profiles c on c.id=r.client_user_id
     where r.owner_id=w.user_id and r.work_id=w.id and r.status in('confirmed','completed') and not coalesce(c.is_disabled,false)),
   'customView',exists(select 1 from public.pro_client_dashboards cd where cd.owner_id=w.user_id and cd.work_id=w.id),
   'color',d.color,'code',d.code,
   'type',case when t.id is null then null else jsonb_build_object('id',t.id,'systemKey',t.system_key,'name',t.name) end,
   'tags',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by l.position),'[]'::jsonb)
     from public.pro_project_tag_links l join public.pro_project_tags g on g.owner_id=l.owner_id and g.id=l.tag_id where l.owner_id=w.user_id and l.work_id=w.id)) as content
  from public.pro_work w
  left join public.pro_project_details d on d.owner_id=w.user_id and d.work_id=w.id
  left join public.pro_project_types t on t.owner_id=d.owner_id and t.id=d.type_id
  where w.user_id=p_actor and (p_after is null or w.position<p_after)
   and (p_status='all' or p_status='active' and public.pro_project_status(w) in('open','in_progress') or public.pro_project_status(w)=p_status)
   and (needle is null or strpos(lower(w.service),lower(needle))>0 or strpos(lower(w.client),lower(needle))>0 or strpos(lower(coalesce(d.code,'')),lower(needle))>0)
   and (p_type is null or d.type_id=p_type)
   and (p_tag is null or exists(select 1 from public.pro_project_tag_links l where l.owner_id=w.user_id and l.work_id=w.id and l.tag_id=p_tag))
  order by w.position desc limit 21
 ) x;
 if jsonb_array_length(items)>20 then
  select w.position into next_cursor from public.pro_work w where w.user_id=p_actor and w.id=items->19->>'id';
  items:=items-20;
 end if;
 catalog:=public.pro_pnd_catalog_json(p_actor);
 return jsonb_build_object('items',items,'nextCursor',next_cursor,'counts',counts,'filters',jsonb_build_object('types',catalog->'types','tags',catalog->'tags'));
end $$;

-- ===================================================================== immutability and access
drop trigger if exists pro_project_note_history_immutable on public.pro_project_note_history;
create trigger pro_project_note_history_immutable before update on public.pro_project_note_history for each row execute function public.pro_pnd_immutable();
drop trigger if exists pro_project_note_action_immutable on public.pro_project_note_actions;
create trigger pro_project_note_action_immutable before update on public.pro_project_note_actions for each row execute function public.pro_pnd_immutable();
drop trigger if exists pro_project_detail_history_immutable on public.pro_project_detail_history;
create trigger pro_project_detail_history_immutable before update on public.pro_project_detail_history for each row execute function public.pro_pnd_immutable();
drop trigger if exists pro_project_detail_action_immutable on public.pro_project_detail_actions;
create trigger pro_project_detail_action_immutable before update on public.pro_project_detail_actions for each row execute function public.pro_pnd_immutable();
drop trigger if exists pro_project_catalog_history_immutable on public.pro_project_catalog_history;
create trigger pro_project_catalog_history_immutable before update on public.pro_project_catalog_history for each row execute function public.pro_pnd_immutable();

do $$declare t text;f record;begin
 foreach t in array array['pro_project_catalogs','pro_project_types','pro_project_tags','pro_project_catalog_history','pro_project_details','pro_project_tag_links',
  'pro_project_detail_history','pro_project_detail_actions','pro_project_notes','pro_project_note_history','pro_project_note_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'pro\_pnd\_%' or p.proname in('pro_project_notes_read','pro_project_notes_mutate','pro_project_details_read','pro_project_details_mutate','pro_projects_page_v2')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'pro_pnd_immutable' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
