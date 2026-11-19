-- LOCAL PRO ONLY. Selecciones por área con aprobación del cliente (family 62 of the
-- parity register: selection boards + selections tracker). Per job (pro_work):
-- areas → items to choose → options. The owner publishes an item explicitly; the
-- linked customer (confirmed/completed request, section turned on in the customer
-- view) approves one option or asks for changes with a comment.
-- Amounts are CRC céntimos (bigint), like allowances. Option images reuse the
-- existing private job files (pro_work_files, bucket pro-work-files); no new bucket.
-- Nothing here sends notifications, charges, invoices or calls external services.
-- An optional allowance link only stores the id: applying the approved total to the
-- allowance is an explicit owner action through the allowances API.
begin;
create table if not exists public.pro_work_selection_areas(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 position bigint generated always as identity,
 name text not null check(length(btrim(name)) between 1 and 80),
 archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create unique index if not exists pro_work_selection_area_global_id on public.pro_work_selection_areas(id);
create index if not exists pro_work_selection_area_page on public.pro_work_selection_areas(owner_id,work_id,position);
create table if not exists public.pro_work_selection_items(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,area_id uuid not null,
 position bigint generated always as identity,
 name text not null check(length(btrim(name)) between 1 and 160),
 due_date date,notes text check(notes is null or length(btrim(notes)) between 1 and 1000),
 status text not null default 'open' check(status in('open','approved','changes_requested')),
 published boolean not null default false,published_at timestamptz,
 approved_option_id uuid,approved_at timestamptz,
 client_comment text check(client_comment is null or length(btrim(client_comment)) between 1 and 1000),changes_requested_at timestamptz,
 recommended_option_id uuid,allowance_id uuid,
 archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,area_id) references public.pro_work_selection_areas(owner_id,id) on delete cascade,
 foreign key(owner_id,allowance_id) references public.pro_work_allowances(owner_id,id) on delete set null(allowance_id),
 check((status='approved')=(approved_option_id is not null and approved_at is not null)),
 check((status='changes_requested')=(client_comment is not null and changes_requested_at is not null)),
 check(published=(published_at is not null))
);
create unique index if not exists pro_work_selection_item_global_id on public.pro_work_selection_items(id);
create index if not exists pro_work_selection_item_page on public.pro_work_selection_items(owner_id,work_id,position);
create table if not exists public.pro_work_selection_options(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,item_id uuid not null,
 position bigint generated always as identity,
 name text not null check(length(btrim(name)) between 1 and 160),
 brand text check(brand is null or length(btrim(brand)) between 1 and 160),
 url text check(url is null or (length(url)<=500 and url~'^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')),
 quantity numeric(12,2) not null check(quantity between 0.01 and 1000000),
 unit_cents bigint not null check(unit_cents between 0 and 10000000000),
 total_cents bigint generated always as (round(quantity*unit_cents)::bigint) stored,
 client_notes text check(client_notes is null or length(btrim(client_notes)) between 1 and 1000),
 image_file_id uuid,
 archived boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,item_id) references public.pro_work_selection_items(owner_id,id) on delete cascade,
 -- Reuses the private job files: only an image of this same job can be attached.
 foreign key(owner_id,work_id,image_file_id) references public.pro_work_files(owner_id,work_id,id) on delete cascade,
 check(total_cents<=10000000000)
);
create unique index if not exists pro_work_selection_option_global_id on public.pro_work_selection_options(id);
create index if not exists pro_work_selection_option_page on public.pro_work_selection_options(owner_id,item_id,position);
create table if not exists public.pro_work_selection_history(
 owner_id uuid not null,work_id text not null,action_id uuid not null,actor_id uuid not null,side text not null check(side in('owner','client')),
 action text not null check(action in('area_create','area_update','area_archive','area_restore','item_create','item_update','option_add','option_update','option_remove','recommend','publish','unpublish','reopen','archive','restore','approve','request_changes')),
 target_kind text not null check(target_kind in('area','item')),target_id uuid not null,
 before_value jsonb,after_value jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_work_selection_history_page on public.pro_work_selection_history(owner_id,work_id,at desc);
create table if not exists public.pro_work_selection_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
-- Costa Rica calendar day (UTC-6, no DST) for overdue decisions.
create or replace function public.pro_work_selection_today() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (now() at time zone 'America/Costa_Rica')::date $$;
create or replace function public.pro_work_selection_area_json(p_row public.pro_work_selection_areas) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'position',p_row.position,'name',p_row.name,'archived',p_row.archived,'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at);
$$;
create or replace function public.pro_work_selection_option_json(p_row public.pro_work_selection_options) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'position',p_row.position,'name',p_row.name,'brand',p_row.brand,'url',p_row.url,'quantity',p_row.quantity,
  'unitCents',p_row.unit_cents,'totalCents',p_row.total_cents,'clientNotes',p_row.client_notes,'imageFileId',p_row.image_file_id);
$$;
-- Derived state: archived, approved, changes_requested, no_options, pending_client (published) or draft.
create or replace function public.pro_work_selection_state(p_row public.pro_work_selection_items) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_row.archived then 'archived' when p_row.status<>'open' then p_row.status
  when not exists(select 1 from public.pro_work_selection_options o where o.owner_id=p_row.owner_id and o.item_id=p_row.id and not o.archived) then 'no_options'
  when p_row.published then 'pending_client' else 'draft' end;
$$;
create or replace function public.pro_work_selection_item_json(p_row public.pro_work_selection_items) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'areaId',p_row.area_id,'position',p_row.position,'name',p_row.name,'dueDate',p_row.due_date,'notes',p_row.notes,
  'status',p_row.status,'state',public.pro_work_selection_state(p_row),'published',p_row.published,'publishedAt',p_row.published_at,
  'approvedOptionId',p_row.approved_option_id,'approvedAt',p_row.approved_at,'clientComment',p_row.client_comment,'changesRequestedAt',p_row.changes_requested_at,
  'recommendedOptionId',p_row.recommended_option_id,'allowanceId',p_row.allowance_id,'archived',p_row.archived,
  'overdue',p_row.status<>'approved' and not p_row.archived and p_row.due_date is not null and p_row.due_date<public.pro_work_selection_today(),
  'options',coalesce((select jsonb_agg(public.pro_work_selection_option_json(o) order by o.position) from public.pro_work_selection_options o where o.owner_id=p_row.owner_id and o.item_id=p_row.id and not o.archived),'[]'::jsonb),
  'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at);
$$;
create or replace function public.pro_work_selections_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare areas jsonb;items jsonb;hist jsonb;allowances jsonb;visible boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid selection query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(public.pro_work_selection_area_json(a) order by a.archived,a.position),'[]'::jsonb) into areas from public.pro_work_selection_areas a where a.owner_id=p_actor and a.work_id=p_work;
 select coalesce(jsonb_agg(public.pro_work_selection_item_json(i) order by i.archived,i.position),'[]'::jsonb) into items from public.pro_work_selection_items i where i.owner_id=p_actor and i.work_id=p_work;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'category',a.category,'status',a.status,'plannedCents',a.planned_cents,'actualCents',a.actual_cents,'revision',a.revision) order by a.position),'[]'::jsonb) into allowances
  from public.pro_work_allowances a where a.owner_id=p_actor and a.work_id=p_work and not a.archived;
 select coalesce(show_selections,false) into visible from public.pro_client_dashboards where owner_id=p_actor and work_id=p_work;
 select coalesce(jsonb_agg(x.content order by x.at desc,x.action_id),'[]'::jsonb) into hist from (
  select h.at,h.action_id,jsonb_build_object('actionId',h.action_id,'side',h.side,'action',h.action,'targetKind',h.target_kind,'targetId',h.target_id,'at',h.at,'before',h.before_value,'after',h.after_value) as content
  from public.pro_work_selection_history h where h.owner_id=p_actor and h.work_id=p_work order by h.at desc,h.action_id limit 100
 ) x;
 return jsonb_build_object('workId',p_work,'today',public.pro_work_selection_today(),'clientVisible',coalesce(visible,false),'areas',areas,'items',items,'allowances',allowances,'history',hist);
end $$;
-- Linked customer context: request of this actor, with a job, confirmed/completed,
-- and the section turned on in the customer view. Returns null owner when not visible.
create or replace function public.pro_work_selection_client_context(p_actor uuid,p_request uuid,out owner uuid,out wid text,out found_request boolean,out visible boolean)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare req_status text;enabled boolean;
begin
 found_request:=false;visible:=false;
 select r.owner_id,r.work_id,r.status into owner,wid,req_status from public.pro_appointment_requests r where r.id=p_request and r.client_user_id=p_actor and r.work_id is not null;
 if not found then owner:=null;wid:=null;return;end if;
 found_request:=true;
 select coalesce(d.show_selections,false) into enabled from public.pro_client_dashboards d where d.owner_id=owner and d.work_id=wid;
 visible:=req_status in('confirmed','completed') and coalesce(enabled,false);
end $$;
-- Customer view of one published item: no internal notes, allowance link, history or image file ids.
create or replace function public.pro_work_selection_client_item_json(p_row public.pro_work_selection_items) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'areaId',p_row.area_id,'name',p_row.name,'dueDate',p_row.due_date,'state',public.pro_work_selection_state(p_row),
  'approvedOptionId',p_row.approved_option_id,'approvedAt',p_row.approved_at,'clientComment',p_row.client_comment,'recommendedOptionId',p_row.recommended_option_id,'revision',p_row.revision,
  'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'brand',o.brand,'url',o.url,'quantity',o.quantity,'unitCents',o.unit_cents,'totalCents',o.total_cents,
   'clientNotes',o.client_notes,'hasImage',o.image_file_id is not null) order by o.position) from public.pro_work_selection_options o where o.owner_id=p_row.owner_id and o.item_id=p_row.id and not o.archived),'[]'::jsonb));
$$;
create or replace function public.pro_work_selections_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ctx record;areas jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into ctx from public.pro_work_selection_client_context(p_actor,p_request);
 if not ctx.found_request then return null;end if;
 if not ctx.visible then return jsonb_build_object('visible',false);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'items',x.items) order by a.position),'[]'::jsonb) into areas
  from public.pro_work_selection_areas a
  join lateral (select jsonb_agg(public.pro_work_selection_client_item_json(i) order by i.position) as items from public.pro_work_selection_items i
   where i.owner_id=a.owner_id and i.area_id=a.id and i.published and not i.archived) x on x.items is not null
  where a.owner_id=ctx.owner and a.work_id=ctx.wid and not a.archived;
 return jsonb_build_object('visible',true,'today',public.pro_work_selection_today(),'areas',areas);
end $$;
-- Image access for an option: the owner, or the linked customer while the item is
-- published and visible to them. Returns storage metadata of the reused job file.
create or replace function public.pro_work_selection_image(p_actor uuid,p_option uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare o public.pro_work_selection_options;i public.pro_work_selection_items;f public.pro_work_files;allowed boolean:=false;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into o from public.pro_work_selection_options where id=p_option and not archived and image_file_id is not null;
 if not found then return null;end if;
 select * into i from public.pro_work_selection_items where owner_id=o.owner_id and id=o.item_id;
 if o.owner_id=p_actor then
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
  allowed:=true;
 else
  allowed:=i.published and not i.archived
   and exists(select 1 from public.pro_work_selection_areas a where a.owner_id=i.owner_id and a.id=i.area_id and not a.archived)
   and exists(select 1 from public.pro_appointment_requests r join public.pro_client_dashboards d on d.owner_id=r.owner_id and d.work_id=r.work_id
    where r.owner_id=o.owner_id and r.work_id=o.work_id and r.client_user_id=p_actor and r.status in('confirmed','completed') and d.show_selections);
 end if;
 if not allowed then return null;end if;
 select * into f from public.pro_work_files where owner_id=o.owner_id and work_id=o.work_id and id=o.image_file_id and ready and mime_type='image/jpeg';
 if not found then return null;end if;
 return jsonb_build_object('objectPath',f.object_path,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);
end $$;
create or replace function public.pro_work_selection_text(p_value jsonb,p_max integer) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v text;
begin
 if jsonb_typeof(p_value)='null' then return null;end if;
 if jsonb_typeof(p_value) is distinct from 'string' then raise exception 'Invalid selection text' using errcode='22023';end if;
 v:=nullif(btrim(p_value#>>'{}'),'');
 if v is not null and length(v)>p_max then raise exception 'Selection text too long' using errcode='22023';end if;
 return v;
end $$;
create or replace function public.pro_work_selections_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;aid uuid;tid uuid;rev integer;keys text[];expected text[];receipt public.pro_work_selection_actions;
 area public.pro_work_selection_areas;item public.pro_work_selection_items;opt public.pro_work_selection_options;
 before_json jsonb;after_json jsonb;result jsonb;kind text;
 v_name text;v_notes text;v_due date;v_area uuid;v_allowance uuid;v_option uuid;v_brand text;v_url text;v_qty numeric;v_unit numeric;v_client text;v_image uuid;
 option_keys text[]:=array['action','actionId','brand','clientNotes','id','imageFileId','name','optionId','quantity','revision','unitCents','url','workId'];
 item_keys text[]:=array['action','actionId','allowanceId','areaId','dueDate','id','name','notes','workId'];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid selection' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'area_create' then array['action','actionId','id','name','workId']
  when 'area_update' then array['action','actionId','id','name','revision','workId']
  when 'area_archive' then array['action','actionId','id','revision','workId'] when 'area_restore' then array['action','actionId','id','revision','workId']
  when 'item_create' then item_keys
  when 'item_update' then array['action','actionId','allowanceId','areaId','dueDate','id','name','notes','revision','workId']
  when 'option_add' then option_keys when 'option_update' then option_keys
  when 'option_remove' then array['action','actionId','id','optionId','revision','workId']
  when 'recommend' then array['action','actionId','id','optionId','revision','workId']
  when 'publish' then array['action','actionId','id','revision','workId'] when 'unpublish' then array['action','actionId','id','revision','workId']
  when 'reopen' then array['action','actionId','id','revision','workId'] when 'archive' then array['action','actionId','id','revision','workId']
  when 'restore' then array['action','actionId','id','revision','workId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
  or jsonb_typeof(p_input->'id') is distinct from 'string' then raise exception 'Invalid selection fields' using errcode='22023';end if;
 if act not in('area_create','item_create') and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;tid:=(p_input->>'id')::uuid;rev:=case when act not in('area_create','item_create') then (p_input->>'revision')::integer end;
 if length(wid) not between 1 and 160 then raise exception 'Invalid selection identity' using errcode='22023';end if;
 kind:=case when act like 'area_%' then 'area' else 'item' end;
 if act in('area_create','area_update') then
  v_name:=public.pro_work_selection_text(p_input->'name',80);if v_name is null then raise exception 'Invalid area name' using errcode='22023';end if;
 elsif act in('item_create','item_update') then
  v_name:=public.pro_work_selection_text(p_input->'name',160);v_notes:=public.pro_work_selection_text(p_input->'notes',1000);
  if v_name is null or jsonb_typeof(p_input->'areaId') is distinct from 'string' or jsonb_typeof(p_input->'dueDate') not in('string','null') or jsonb_typeof(p_input->'allowanceId') not in('string','null') then raise exception 'Invalid item fields' using errcode='22023';end if;
  v_area:=(p_input->>'areaId')::uuid;v_allowance:=(p_input->>'allowanceId')::uuid;
  if p_input->>'dueDate' is not null then
   if not (p_input->>'dueDate')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid due date' using errcode='22023';end if;
   v_due:=(p_input->>'dueDate')::date;if to_char(v_due,'YYYY-MM-DD')<>p_input->>'dueDate' then raise exception 'Invalid due date' using errcode='22023';end if;
  end if;
 elsif act in('option_add','option_update') then
  v_name:=public.pro_work_selection_text(p_input->'name',160);v_brand:=public.pro_work_selection_text(p_input->'brand',160);
  v_url:=public.pro_work_selection_text(p_input->'url',500);v_client:=public.pro_work_selection_text(p_input->'clientNotes',1000);
  if v_name is null or jsonb_typeof(p_input->'optionId') is distinct from 'string' or jsonb_typeof(p_input->'quantity') is distinct from 'number' or jsonb_typeof(p_input->'unitCents') is distinct from 'number'
   or jsonb_typeof(p_input->'imageFileId') not in('string','null') then raise exception 'Invalid option fields' using errcode='22023';end if;
  v_option:=(p_input->>'optionId')::uuid;v_image:=(p_input->>'imageFileId')::uuid;v_qty:=(p_input->>'quantity')::numeric;v_unit:=(p_input->>'unitCents')::numeric;
  if v_qty<>round(v_qty,2) or v_qty not between 0.01 and 1000000 or v_unit<>round(v_unit) or v_unit not between 0 and 10000000000 or round(v_qty*v_unit)>10000000000 then raise exception 'Invalid option amounts' using errcode='22023';end if;
  if v_url is not null and not (length(v_url)<=500 and v_url~'^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$') then raise exception 'Invalid option link' using errcode='22023';end if;
 elsif act='option_remove' then
  if jsonb_typeof(p_input->'optionId') is distinct from 'string' then raise exception 'Invalid option' using errcode='22023';end if;v_option:=(p_input->>'optionId')::uuid;
 elsif act='recommend' then
  if jsonb_typeof(p_input->'optionId') not in('string','null') then raise exception 'Invalid option' using errcode='22023';end if;v_option:=(p_input->>'optionId')::uuid;
 end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-selection-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_selection_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-selection:'||p_actor::text||':'||wid,0));
 perform 1 from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if act in('item_create','item_update') then
  if not exists(select 1 from public.pro_work_selection_areas where owner_id=p_actor and id=v_area and work_id=wid and not archived) then raise exception 'Unknown area' using errcode='22023';end if;
  if v_allowance is not null and not exists(select 1 from public.pro_work_allowances where owner_id=p_actor and id=v_allowance and work_id=wid and not archived) then raise exception 'Unknown allowance' using errcode='22023';end if;
 end if;
 if act='area_create' then
  if exists(select 1 from public.pro_work_selection_areas where id=tid) then raise exception 'Area id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_work_selection_areas where owner_id=p_actor and work_id=wid)>=50 then raise exception 'Area limit' using errcode='54000';end if;
  insert into public.pro_work_selection_areas(owner_id,id,work_id,name) values(p_actor,tid,wid,v_name) returning * into area;
  before_json:=null;after_json:=public.pro_work_selection_area_json(area);
 elsif kind='area' then
  select * into area from public.pro_work_selection_areas where owner_id=p_actor and id=tid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if area.revision<>rev then raise exception 'Area changed' using errcode='40001';end if;
  before_json:=public.pro_work_selection_area_json(area);
  if act='area_update' then
   if area.archived then raise exception 'Restore before editing' using errcode='22023';end if;
   if area.name=v_name then raise exception 'No area changes' using errcode='22023';end if;
   update public.pro_work_selection_areas set name=v_name,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into area;
  elsif act='area_archive' then
   if area.archived then raise exception 'Already archived' using errcode='22023';end if;
   -- An area is archived only once its items are archived or moved, so nothing published disappears silently.
   if exists(select 1 from public.pro_work_selection_items where owner_id=p_actor and area_id=tid and not archived) then raise exception 'Area has active items' using errcode='22023';end if;
   update public.pro_work_selection_areas set archived=true,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into area;
  else
   if not area.archived then raise exception 'Not archived' using errcode='22023';end if;
   update public.pro_work_selection_areas set archived=false,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into area;
  end if;
  after_json:=public.pro_work_selection_area_json(area);
 elsif act='item_create' then
  if exists(select 1 from public.pro_work_selection_items where id=tid) then raise exception 'Item id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_work_selection_items where owner_id=p_actor and work_id=wid)>=300 then raise exception 'Item limit' using errcode='54000';end if;
  insert into public.pro_work_selection_items(owner_id,id,work_id,area_id,name,due_date,notes,allowance_id) values(p_actor,tid,wid,v_area,v_name,v_due,v_notes,v_allowance) returning * into item;
  before_json:=null;after_json:=public.pro_work_selection_item_json(item);
 else
  select * into item from public.pro_work_selection_items where owner_id=p_actor and id=tid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if item.revision<>rev then raise exception 'Item changed' using errcode='40001';end if;
  before_json:=public.pro_work_selection_item_json(item);
  if item.archived and act<>'restore' then raise exception 'Restore before editing' using errcode='22023';end if;
  if act='item_update' then
   if item.area_id=v_area and item.name=v_name and item.due_date is not distinct from v_due and item.notes is not distinct from v_notes and item.allowance_id is not distinct from v_allowance then raise exception 'No item changes' using errcode='22023';end if;
   update public.pro_work_selection_items set area_id=v_area,name=v_name,due_date=v_due,notes=v_notes,allowance_id=v_allowance,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into item;
  elsif act in('option_add','option_update','option_remove','recommend') then
   -- An approved item is locked: reopen it first (the approval stays in the history).
   if item.status='approved' then raise exception 'Reopen before changing options' using errcode='22023';end if;
   if act='option_add' then
    if exists(select 1 from public.pro_work_selection_options where id=v_option) then raise exception 'Option id already used' using errcode='23505';end if;
    if (select count(*) from public.pro_work_selection_options where owner_id=p_actor and item_id=tid and not archived)>=12 or (select count(*) from public.pro_work_selection_options where owner_id=p_actor and item_id=tid)>=60 then raise exception 'Option limit' using errcode='54000';end if;
    if v_image is not null and not exists(select 1 from public.pro_work_files where owner_id=p_actor and work_id=wid and id=v_image and ready and mime_type='image/jpeg') then raise exception 'Unknown image' using errcode='22023';end if;
    insert into public.pro_work_selection_options(owner_id,id,work_id,item_id,name,brand,url,quantity,unit_cents,client_notes,image_file_id) values(p_actor,v_option,wid,tid,v_name,v_brand,v_url,v_qty,v_unit::bigint,v_client,v_image);
   elsif act='option_update' then
    select * into opt from public.pro_work_selection_options where owner_id=p_actor and id=v_option and item_id=tid and not archived for update;
    if not found then raise exception 'Unknown option' using errcode='22023';end if;
    if v_image is not null and v_image is distinct from opt.image_file_id and not exists(select 1 from public.pro_work_files where owner_id=p_actor and work_id=wid and id=v_image and ready and mime_type='image/jpeg') then raise exception 'Unknown image' using errcode='22023';end if;
    if opt.name=v_name and opt.brand is not distinct from v_brand and opt.url is not distinct from v_url and opt.quantity=v_qty and opt.unit_cents=v_unit::bigint and opt.client_notes is not distinct from v_client and opt.image_file_id is not distinct from v_image then raise exception 'No option changes' using errcode='22023';end if;
    update public.pro_work_selection_options set name=v_name,brand=v_brand,url=v_url,quantity=v_qty,unit_cents=v_unit::bigint,client_notes=v_client,image_file_id=v_image,updated_at=now() where owner_id=p_actor and id=v_option;
   elsif act='option_remove' then
    select * into opt from public.pro_work_selection_options where owner_id=p_actor and id=v_option and item_id=tid and not archived for update;
    if not found then raise exception 'Unknown option' using errcode='22023';end if;
    if item.published and (select count(*) from public.pro_work_selection_options where owner_id=p_actor and item_id=tid and not archived)=1 then raise exception 'Unpublish before removing the last option' using errcode='22023';end if;
    -- Soft removal: the option stays in the history snapshots.
    update public.pro_work_selection_options set archived=true,updated_at=now() where owner_id=p_actor and id=v_option;
    if item.recommended_option_id=v_option then update public.pro_work_selection_items set recommended_option_id=null where owner_id=p_actor and id=tid;end if;
   else
    if v_option is not null and not exists(select 1 from public.pro_work_selection_options where owner_id=p_actor and id=v_option and item_id=tid and not archived) then raise exception 'Unknown option' using errcode='22023';end if;
    if item.recommended_option_id is not distinct from v_option then raise exception 'No recommendation change' using errcode='22023';end if;
    update public.pro_work_selection_items set recommended_option_id=v_option where owner_id=p_actor and id=tid;
   end if;
   update public.pro_work_selection_items set revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into item;
  elsif act='publish' then
   if item.published then raise exception 'Already published' using errcode='22023';end if;
   if not exists(select 1 from public.pro_work_selection_options where owner_id=p_actor and item_id=tid and not archived) then raise exception 'Add an option before publishing' using errcode='22023';end if;
   update public.pro_work_selection_items set published=true,published_at=now(),revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into item;
  elsif act='unpublish' then
   if not item.published then raise exception 'Not published' using errcode='22023';end if;
   update public.pro_work_selection_items set published=false,published_at=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into item;
  elsif act='reopen' then
   -- Approved or with changes requested → open again (pending the customer if still published).
   if item.status='open' then raise exception 'Nothing to reopen' using errcode='22023';end if;
   update public.pro_work_selection_items set status='open',approved_option_id=null,approved_at=null,client_comment=null,changes_requested_at=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into item;
  elsif act='archive' then
   update public.pro_work_selection_items set archived=true,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into item;
  elsif act='restore' then
   if not item.archived then raise exception 'Not archived' using errcode='22023';end if;
   if not exists(select 1 from public.pro_work_selection_areas where owner_id=p_actor and id=item.area_id and not archived) then raise exception 'Restore the area first' using errcode='22023';end if;
   update public.pro_work_selection_items set archived=false,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into item;
  end if;
  after_json:=public.pro_work_selection_item_json(item);
 end if;
 result:=jsonb_build_object(kind,after_json);
 insert into public.pro_work_selection_history(owner_id,work_id,action_id,actor_id,side,action,target_kind,target_id,before_value,after_value) values(p_actor,wid,aid,p_actor,'owner',act,kind,tid,before_json,after_json);
 insert into public.pro_work_selection_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
-- Customer decision on a published item: approve one option or ask for changes with a comment.
create or replace function public.pro_work_selections_client_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;rid uuid;tid uuid;rev integer;keys text[];receipt public.pro_work_selection_actions;ctx record;item public.pro_work_selection_items;
 before_json jsonb;after_json jsonb;result jsonb;v_option uuid;v_comment text;expected text[];
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid decision' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 expected:=case act when 'approve' then array['action','actionId','id','optionId','requestId','revision'] when 'request_changes' then array['action','actionId','comment','id','requestId','revision'] end;
 if expected is null or keys is distinct from expected
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'requestId') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646 then raise exception 'Invalid decision fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'requestId')::uuid;tid:=(p_input->>'id')::uuid;rev:=(p_input->>'revision')::integer;
 if act='approve' then
  if jsonb_typeof(p_input->'optionId') is distinct from 'string' then raise exception 'Invalid option' using errcode='22023';end if;v_option:=(p_input->>'optionId')::uuid;
 else
  v_comment:=public.pro_work_selection_text(p_input->'comment',1000);if v_comment is null then raise exception 'Comment required' using errcode='22023';end if;
 end if;
 select * into ctx from public.pro_work_selection_client_context(p_actor,rid);
 if not ctx.found_request or not ctx.visible then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-selection-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_selection_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-selection:'||ctx.owner::text||':'||ctx.wid,0));
 select * into item from public.pro_work_selection_items where owner_id=ctx.owner and work_id=ctx.wid and id=tid for update;
 -- An unpublished, archived or unknown item does not exist for the customer.
 if not found or not item.published or item.archived or not exists(select 1 from public.pro_work_selection_areas a where a.owner_id=item.owner_id and a.id=item.area_id and not a.archived) then raise exception 'Forbidden' using errcode='42501';end if;
 if item.revision<>rev then raise exception 'Item changed' using errcode='40001';end if;
 before_json:=public.pro_work_selection_item_json(item);
 if act='approve' then
  if item.status='approved' then raise exception 'Already approved' using errcode='22023';end if;
  if not exists(select 1 from public.pro_work_selection_options where owner_id=item.owner_id and item_id=tid and id=v_option and not archived) then raise exception 'Unknown option' using errcode='22023';end if;
  update public.pro_work_selection_items set status='approved',approved_option_id=v_option,approved_at=now(),client_comment=null,changes_requested_at=null,revision=revision+1,updated_at=now() where owner_id=item.owner_id and id=tid returning * into item;
 else
  if item.status<>'open' then raise exception 'Changes can only be requested on a pending item' using errcode='22023';end if;
  update public.pro_work_selection_items set status='changes_requested',client_comment=v_comment,changes_requested_at=now(),revision=revision+1,updated_at=now() where owner_id=item.owner_id and id=tid returning * into item;
 end if;
 after_json:=public.pro_work_selection_item_json(item);
 result:=jsonb_build_object('item',public.pro_work_selection_client_item_json(item));
 insert into public.pro_work_selection_history(owner_id,work_id,action_id,actor_id,side,action,target_kind,target_id,before_value,after_value) values(item.owner_id,item.work_id,aid,p_actor,'client',act,'item',tid,before_json,after_json);
 insert into public.pro_work_selection_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.pro_work_selection_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Selection history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_work_selection_history_immutable on public.pro_work_selection_history;
create trigger pro_work_selection_history_immutable before update on public.pro_work_selection_history for each row execute function public.pro_work_selection_immutable();
drop trigger if exists pro_work_selection_action_immutable on public.pro_work_selection_actions;
create trigger pro_work_selection_action_immutable before update on public.pro_work_selection_actions for each row execute function public.pro_work_selection_immutable();
alter table public.pro_work_selection_areas enable row level security;
alter table public.pro_work_selection_items enable row level security;
alter table public.pro_work_selection_options enable row level security;
alter table public.pro_work_selection_history enable row level security;
alter table public.pro_work_selection_actions enable row level security;
revoke all on public.pro_work_selection_areas,public.pro_work_selection_items,public.pro_work_selection_options,public.pro_work_selection_history,public.pro_work_selection_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_selection_areas,public.pro_work_selection_items,public.pro_work_selection_options,public.pro_work_selection_history,public.pro_work_selection_actions to service_role;
grant usage,select on sequence public.pro_work_selection_areas_position_seq,public.pro_work_selection_items_position_seq,public.pro_work_selection_options_position_seq to service_role;
revoke all on function public.pro_work_selection_today(),public.pro_work_selection_area_json(public.pro_work_selection_areas),public.pro_work_selection_option_json(public.pro_work_selection_options),
 public.pro_work_selection_state(public.pro_work_selection_items),public.pro_work_selection_item_json(public.pro_work_selection_items),public.pro_work_selections_read(uuid,text),
 public.pro_work_selection_client_context(uuid,uuid),public.pro_work_selection_client_item_json(public.pro_work_selection_items),public.pro_work_selections_client_read(uuid,uuid),
 public.pro_work_selection_image(uuid,uuid),public.pro_work_selection_text(jsonb,integer),public.pro_work_selections_mutate(uuid,jsonb),public.pro_work_selections_client_mutate(uuid,jsonb),
 public.pro_work_selection_immutable() from public,anon,authenticated;
grant execute on function public.pro_work_selection_today(),public.pro_work_selection_area_json(public.pro_work_selection_areas),public.pro_work_selection_option_json(public.pro_work_selection_options),
 public.pro_work_selection_state(public.pro_work_selection_items),public.pro_work_selection_item_json(public.pro_work_selection_items),public.pro_work_selections_read(uuid,text),
 public.pro_work_selection_client_context(uuid,uuid),public.pro_work_selection_client_item_json(public.pro_work_selection_items),public.pro_work_selections_client_read(uuid,uuid),
 public.pro_work_selection_image(uuid,uuid),public.pro_work_selection_text(jsonb,integer),public.pro_work_selections_mutate(uuid,jsonb),public.pro_work_selections_client_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
