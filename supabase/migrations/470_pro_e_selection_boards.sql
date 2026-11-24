-- Pro area E (selections): per-room budget and assignee, owner board templates (a named list of items to choose),
-- saved tracker views stored on the server, and the owner's global tracker across all jobs.
-- Side tables keyed by the existing selection areas (pro_work_selection_areas); owner only, service_role only, revision CAS, bounds in SQL.
begin;

create table if not exists public.pro_work_selection_area_meta(
 owner_id uuid not null,area_id uuid not null,
 budget_cents bigint check(budget_cents is null or budget_cents between 0 and 100000000000),
 assignee text check(assignee is null or (length(assignee) between 1 and 80 and assignee=btrim(assignee))),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,area_id),
 foreign key(owner_id,area_id) references public.pro_work_selection_areas(owner_id,id) on delete cascade
);

create table if not exists public.pro_selection_board_templates(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(name) between 1 and 80 and name=btrim(name)),
 items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=40),
 created_at timestamptz not null default now(),
 primary key(owner_id,id)
);

create table if not exists public.pro_selection_tracker_views(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(name) between 1 and 40 and name=btrim(name)),
 columns jsonb not null check(jsonb_typeof(columns)='array' and jsonb_array_length(columns) between 1 and 40),
 created_at timestamptz not null default now(),
 primary key(owner_id,id)
);

-- Rooms of a job with budget, assignee and the approval counters / approved total.
create or replace function public.pro_work_selection_meta_read(p_owner uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid work' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work w where w.user_id=p_owner and w.id=p_work) then return null;end if;
 return jsonb_build_object('workId',p_work,'areas',coalesce((
  select jsonb_agg(jsonb_build_object('areaId',a.id,'budgetCents',m.budget_cents,'assignee',m.assignee,'revision',coalesce(m.revision,0),
    'approvedCents',coalesce((select sum(o.total_cents) from public.pro_work_selection_items i join public.pro_work_selection_options o on o.owner_id=i.owner_id and o.id=i.approved_option_id
      where i.owner_id=a.owner_id and i.area_id=a.id and not i.archived and i.status='approved'),0)::bigint,
    'pending',(select count(*) from public.pro_work_selection_items i where i.owner_id=a.owner_id and i.area_id=a.id and not i.archived and i.published and i.status='open'),
    'declined',(select count(*) from public.pro_work_selection_items i where i.owner_id=a.owner_id and i.area_id=a.id and not i.archived and i.status='changes_requested'),
    'approved',(select count(*) from public.pro_work_selection_items i where i.owner_id=a.owner_id and i.area_id=a.id and not i.archived and i.status='approved')) order by a.position)
  from public.pro_work_selection_areas a left join public.pro_work_selection_area_meta m on m.owner_id=a.owner_id and m.area_id=a.id
  where a.owner_id=p_owner and a.work_id=p_work and not a.archived),'[]'::jsonb));
end $$;

create or replace function public.pro_work_selection_meta_set(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;rev integer;v_budget bigint;v_assignee text;cur public.pro_work_selection_area_meta;wid text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid room' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['areaId','assignee','budgetCents','revision']
  or jsonb_typeof(p_input->'areaId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number'
  or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false)
  or jsonb_typeof(p_input->'budgetCents') not in('number','null') or jsonb_typeof(p_input->'assignee') not in('string','null')
  or not coalesce((p_input->>'areaId')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then raise exception 'Invalid room fields' using errcode='22023';end if;
 aid:=(p_input->>'areaId')::uuid;rev:=(p_input->>'revision')::integer;
 if jsonb_typeof(p_input->'budgetCents')='null' then v_budget:=null;
 else
  if not (p_input->>'budgetCents')~'^[0-9]{1,12}$' then raise exception 'Invalid budget' using errcode='22023';end if;
  v_budget:=(p_input->>'budgetCents')::bigint;
  if v_budget>100000000000 then raise exception 'Invalid budget' using errcode='22023';end if;
 end if;
 v_assignee:=case when jsonb_typeof(p_input->'assignee')='null' then null else nullif(btrim(p_input->>'assignee'),'') end;
 if v_assignee is not null and length(v_assignee)>80 then raise exception 'Invalid assignee' using errcode='22023';end if;
 select a.work_id into wid from public.pro_work_selection_areas a where a.owner_id=p_owner and a.id=aid;
 if wid is null then raise exception 'Room unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('selection-area-meta:'||p_owner::text||':'||aid::text,0));
 select * into cur from public.pro_work_selection_area_meta m where m.owner_id=p_owner and m.area_id=aid for update;
 if not found then
  if rev<>0 then raise exception 'Stale room' using errcode='40001';end if;
  insert into public.pro_work_selection_area_meta(owner_id,area_id,budget_cents,assignee) values(p_owner,aid,v_budget,v_assignee);
 else
  if cur.revision<>rev then raise exception 'Stale room' using errcode='40001';end if;
  update public.pro_work_selection_area_meta set budget_cents=v_budget,assignee=v_assignee,revision=revision+1,updated_at=now() where owner_id=p_owner and area_id=aid;
 end if;
 return (select r from jsonb_array_elements(public.pro_work_selection_meta_read(p_owner,wid)->'areas') r where r->>'areaId'=aid::text);
end $$;

-- Board templates (owner).
create or replace function public.pro_selection_board_templates_read(p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'items',t.items) order by t.created_at,t.id)
  from public.pro_selection_board_templates t where t.owner_id=p_owner),'[]'::jsonb));
end $$;

create or replace function public.pro_selection_board_template_save(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];v_name text;v_items jsonb;v_id uuid:=gen_random_uuid();e jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid template' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['items','name'] or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'Invalid template fields' using errcode='22023';end if;
 v_name:=btrim(p_input->>'name');v_items:=p_input->'items';
 if length(v_name) not between 1 and 80 or jsonb_array_length(v_items)>40 then raise exception 'Invalid template' using errcode='22023';end if;
 for e in select x from jsonb_array_elements(v_items) x loop
  if jsonb_typeof(e) is distinct from 'string' or length(btrim(e#>>'{}')) not between 1 and 160 then raise exception 'Invalid template item' using errcode='22023';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('selection-board-templates:'||p_owner::text,0));
 if (select count(*) from public.pro_selection_board_templates where owner_id=p_owner)>=30 then raise exception 'Template limit' using errcode='54000';end if;
 insert into public.pro_selection_board_templates(owner_id,id,name,items) values(p_owner,v_id,v_name,
  (select coalesce(jsonb_agg(to_jsonb(btrim(x#>>'{}'))),'[]'::jsonb) from jsonb_array_elements(v_items) x));
 return jsonb_build_object('id',v_id,'name',v_name,'items',(select t.items from public.pro_selection_board_templates t where t.owner_id=p_owner and t.id=v_id));
end $$;

create or replace function public.pro_selection_board_template_delete(p_owner uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 delete from public.pro_selection_board_templates where owner_id=p_owner and id=p_id;
 if not found then raise exception 'Template unavailable' using errcode='P0002';end if;
 return jsonb_build_object('deleted',true);
end $$;

-- Saved tracker views (owner).
create or replace function public.pro_selection_tracker_views_read(p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('views',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'columns',v.columns) order by v.created_at,v.id)
  from public.pro_selection_tracker_views v where v.owner_id=p_owner),'[]'::jsonb));
end $$;

create or replace function public.pro_selection_tracker_view_save(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];v_name text;v_cols jsonb;v_id uuid:=gen_random_uuid();e jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid view' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['columns','name'] or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'columns') is distinct from 'array' then raise exception 'Invalid view fields' using errcode='22023';end if;
 v_name:=btrim(p_input->>'name');v_cols:=p_input->'columns';
 if length(v_name) not between 1 and 40 or jsonb_array_length(v_cols) not between 1 and 40 then raise exception 'Invalid view' using errcode='22023';end if;
 for e in select x from jsonb_array_elements(v_cols) x loop
  if jsonb_typeof(e) is distinct from 'string' or not (e#>>'{}')~'^[A-Za-z]{1,24}$' then raise exception 'Invalid column' using errcode='22023';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('selection-tracker-views:'||p_owner::text,0));
 if (select count(*) from public.pro_selection_tracker_views where owner_id=p_owner)>=20 then raise exception 'View limit' using errcode='54000';end if;
 insert into public.pro_selection_tracker_views(owner_id,id,name,columns) values(p_owner,v_id,v_name,v_cols);
 return jsonb_build_object('id',v_id,'name',v_name,'columns',v_cols);
end $$;

create or replace function public.pro_selection_tracker_view_delete(p_owner uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 delete from public.pro_selection_tracker_views where owner_id=p_owner and id=p_id;
 if not found then raise exception 'View unavailable' using errcode='P0002';end if;
 return jsonb_build_object('deleted',true);
end $$;

-- Global tracker: every non-archived item of every job of the owner (at most 1000 rows, newest jobs first).
create or replace function public.pro_selections_global_read(p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare rows_json jsonb;total integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select count(*) into total from public.pro_work_selection_items i join public.pro_work_selection_areas a on a.owner_id=i.owner_id and a.id=i.area_id
  where i.owner_id=p_owner and not i.archived and not a.archived;
 select coalesce(jsonb_agg(r.j order by r.ord),'[]'::jsonb) into rows_json from (
  select jsonb_build_object('workId',i.work_id,'workName',coalesce(w.service,''),'areaName',a.name,'itemId',i.id,'name',i.name,
    'state',public.pro_work_selection_state(i),'dueDate',i.due_date,
    'optionName',o.name,'brand',o.brand,'url',o.url,'quantity',o.quantity,'unitCents',o.unit_cents,'totalCents',o.total_cents,
    'order',coalesce(t.status,'not_ordered'),'orderedOn',t.ordered_on,'deliveredOn',t.delivered_on,'supplierRef',coalesce(t.supplier_ref,'')) j,
   row_number() over(order by coalesce(w.start,'') desc,i.work_id,a.position,i.position) ord
  from public.pro_work_selection_items i
  join public.pro_work_selection_areas a on a.owner_id=i.owner_id and a.id=i.area_id
  join public.pro_work w on w.user_id=i.owner_id and w.id=i.work_id
  left join public.pro_work_selection_options o on o.owner_id=i.owner_id and o.id=coalesce(i.approved_option_id,i.recommended_option_id)
  left join public.pro_work_selection_tracking t on t.owner_id=i.owner_id and t.item_id=i.id
  where i.owner_id=p_owner and not i.archived and not a.archived
  order by coalesce(w.start,'') desc,i.work_id,a.position,i.position limit 1000) r;
 return jsonb_build_object('items',rows_json,'total',total,'truncated',total>1000);
end $$;

do $$declare f record;t text;begin
 foreach t in array array['pro_work_selection_area_meta','pro_selection_board_templates','pro_selection_tracker_views'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_work_selection_meta_read','pro_work_selection_meta_set','pro_selection_board_templates_read','pro_selection_board_template_save',
   'pro_selection_board_template_delete','pro_selection_tracker_views_read','pro_selection_tracker_view_save','pro_selection_tracker_view_delete','pro_selections_global_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
