-- LOCAL PRO ONLY. Round 10 (2026-11-15), Documents and Selections (Houzz Pro parity rows 45, 62).
--  * Change order printable copy (row 45): owner read of one change with its number in the job, lines
--    (description and amount only: the internal cost/markup is never printed), totals and status.
--    Quotes print from the existing pro_private_estimate_read (no new SQL).
--  * Selections (row 62): order/delivery tracking per selection item (not ordered → ordered → delivered
--    → installed, only after the customer approved an option), internal unit cost per option and the
--    resulting margin (owner only; never in customer reads or the printed sheet), bulk tracking update,
--    customer bulk approval of several items in one transaction (each through the existing customer
--    writer, same receipts/history), and the printable selections sheet read.
-- Patterns: RLS on, service_role only, security invoker, CAS 40001, idempotent actionId receipts,
-- immutable history, CRC cents, Costa Rica dates. Nothing is sent; no third party is called.
begin;
create table if not exists public.pro_work_selection_tracking(
 owner_id uuid not null references public.profiles(id) on delete cascade,item_id uuid not null,work_id text not null,
 status text not null check(status in('not_ordered','ordered','delivered','installed')),ordered_on date,delivered_on date,
 supplier_ref text not null default '' check(length(supplier_ref)<=80),revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,item_id),foreign key(owner_id,item_id) references public.pro_work_selection_items(owner_id,id) on delete cascade,
 check(ordered_on is null or ordered_on between date'2000-01-01' and date'2100-12-31'),check(delivered_on is null or delivered_on between date'2000-01-01' and date'2100-12-31'),
 check(status='not_ordered' or ordered_on is not null),check(status not in('delivered','installed') or delivered_on is not null),check(delivered_on is null or ordered_on is not null and delivered_on>=ordered_on));
create table if not exists public.pro_work_selection_option_costs(
 owner_id uuid not null references public.profiles(id) on delete cascade,option_id uuid not null,unit_cost_cents bigint check(unit_cost_cents between 0 and 10000000000),
 revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,option_id),foreign key(owner_id,option_id) references public.pro_work_selection_options(owner_id,id) on delete cascade);
create table if not exists public.pro_work_selection_tracking_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,target_kind text not null check(target_kind in('tracking','cost')),target_id uuid not null,
 work_id text not null,before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id,target_id));
create table if not exists public.pro_work_selection_tracking_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_work_selection_bulk_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id));
do $$declare t text;begin
 foreach t in array array['pro_work_selection_tracking_history','pro_work_selection_tracking_actions','pro_work_selection_bulk_actions'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_round10_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['pro_work_selection_tracking','pro_work_selection_option_costs','pro_work_selection_tracking_history','pro_work_selection_tracking_actions','pro_work_selection_bulk_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create or replace function public.pro_work_selection_tracking_json(p_owner uuid,p_item uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('status',coalesce(t.status,'not_ordered'),'orderedOn',t.ordered_on,'deliveredOn',t.delivered_on,'supplierRef',coalesce(t.supplier_ref,''),'revision',coalesce(t.revision,0))
 from(select 1) one left join public.pro_work_selection_tracking t on t.owner_id=p_owner and t.item_id=p_item $$;

-- Owner tracker: items with approval, tracking, options with internal cost and margin; totals in cents.
create or replace function public.pro_work_selection_tracking_read(p_owner uuid,p_work text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid work' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_owner and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('itemId',i.id,'name',i.name,'areaName',a.name,'state',public.pro_work_selection_state(i),'revision',i.revision,
   'approvedOptionId',i.approved_option_id,'recommendedOptionId',i.recommended_option_id,'dueDate',i.due_date,'tracking',public.pro_work_selection_tracking_json(p_owner,i.id),
   'options',coalesce((select jsonb_agg(jsonb_build_object('optionId',o.id,'name',o.name,'quantity',o.quantity,'unitCents',o.unit_cents,'totalCents',o.total_cents,
     'unitCostCents',c.unit_cost_cents,'costRevision',coalesce(c.revision,0),'costCents',case when c.unit_cost_cents is null then null else round(o.quantity*c.unit_cost_cents)::bigint end,
     'marginCents',case when c.unit_cost_cents is null then null else o.total_cents-round(o.quantity*c.unit_cost_cents)::bigint end,
     'marginBps',case when c.unit_cost_cents is null or o.total_cents=0 then null else round((o.total_cents-round(o.quantity*c.unit_cost_cents))*10000.0/o.total_cents)::integer end) order by o.position)
    from public.pro_work_selection_options o left join public.pro_work_selection_option_costs c on c.owner_id=o.owner_id and c.option_id=o.id where o.owner_id=i.owner_id and o.item_id=i.id and not o.archived),'[]'::jsonb)) order by a.position,i.position),'[]'::jsonb)
 into items from public.pro_work_selection_items i join public.pro_work_selection_areas a on a.owner_id=i.owner_id and a.id=i.area_id
 where i.owner_id=p_owner and i.work_id=p_work and not i.archived and not a.archived;
 return jsonb_build_object('workId',p_work,'today',public.pro_work_selection_today(),'items',items,
  'totals',(select jsonb_build_object('approved',count(*) filter(where x->>'state'='approved'),
    'approvedPriceCents',coalesce(sum((o->>'totalCents')::bigint) filter(where o is not null),0),
    'approvedCostCents',coalesce(sum((o->>'costCents')::bigint),0),'approvedWithoutCost',count(*) filter(where o is not null and o->'costCents'='null'::jsonb),
    'marginCents',coalesce(sum((o->>'marginCents')::bigint),0),
    'notOrdered',count(*) filter(where x->>'state'='approved' and x->'tracking'->>'status'='not_ordered'),'ordered',count(*) filter(where x->'tracking'->>'status'='ordered'),
    'delivered',count(*) filter(where x->'tracking'->>'status' in('delivered','installed')))
   from jsonb_array_elements(items) x left join lateral(select y from jsonb_array_elements(x->'options') y where y->>'optionId'=x->>'approvedOptionId') ao(o) on true));
end $$;

create or replace function public.pro_work_selection_tracking_mutate(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;wid text;receipt public.pro_work_selection_tracking_actions;answer jsonb;ref jsonb;item public.pro_work_selection_items;tr public.pro_work_selection_tracking;
 opt public.pro_work_selection_options;cost public.pro_work_selection_option_costs;before_json jsonb;v_status text;v_ordered date;v_delivered date;v_ref text;today date:=public.pro_work_selection_today();n integer:=0;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid tracking action' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from (case act when 'tracking_set' then array['action','actionId','deliveredOn','itemId','orderedOn','revision','status','supplierRef','workId'] when 'bulk_track' then array['action','actionId','items','status','workId'] when 'cost_set' then array['action','actionId','optionId','revision','unitCostCents','workId'] end)
  or jsonb_typeof(p_input->'workId') is distinct from 'string' then raise exception 'Unexpected tracking fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 wid:=p_input->>'workId';if not exists(select 1 from public.pro_work where user_id=p_owner and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-selection-tracking:'||p_owner::text||':'||aid::text,0));
 select * into receipt from public.pro_work_selection_tracking_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-selection:'||p_owner::text||':'||wid,0));
 if act='cost_set' then
  begin select * into opt from public.pro_work_selection_options where owner_id=p_owner and work_id=wid and id=(p_input->>'optionId')::uuid and not archived;exception when others then raise exception 'Invalid option' using errcode='22023';end;
  if opt.id is null then raise exception 'Option unavailable' using errcode='P0002';end if;
  if jsonb_typeof(p_input->'unitCostCents') not in('number','null') or p_input->'unitCostCents'<>'null'::jsonb and((p_input->>'unitCostCents')!~'^[0-9]{1,11}$' or(p_input->>'unitCostCents')::bigint>10000000000) or jsonb_typeof(p_input->'revision') is distinct from 'number' then raise exception 'Invalid cost' using errcode='22023';end if;
  select * into cost from public.pro_work_selection_option_costs where owner_id=p_owner and option_id=opt.id for update;
  if coalesce(cost.revision,0)<>(p_input->>'revision')::integer then raise exception 'Cost changed' using errcode='40001';end if;
  before_json:=jsonb_build_object('unitCostCents',cost.unit_cost_cents);
  insert into public.pro_work_selection_option_costs(owner_id,option_id,unit_cost_cents,revision) values(p_owner,opt.id,(p_input->>'unitCostCents')::bigint,1)
   on conflict(owner_id,option_id) do update set unit_cost_cents=excluded.unit_cost_cents,revision=public.pro_work_selection_option_costs.revision+1,updated_at=clock_timestamp() returning * into cost;
  insert into public.pro_work_selection_tracking_history(owner_id,action_id,target_kind,target_id,work_id,before_value,after_value) values(p_owner,aid,'cost',opt.id,wid,before_json,jsonb_build_object('unitCostCents',cost.unit_cost_cents));
  answer:=jsonb_build_object('action',act,'optionId',opt.id,'unitCostCents',cost.unit_cost_cents,'revision',cost.revision);
 else
  v_status:=p_input->>'status';if v_status not in('not_ordered','ordered','delivered','installed') then raise exception 'Invalid status' using errcode='22023';end if;
  if act='bulk_track' then
   if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 100 then raise exception 'Invalid items' using errcode='22023';end if;
  end if;
  for ref in select case when act='bulk_track' then value else jsonb_build_object('itemId',p_input->'itemId','revision',p_input->'revision') end from jsonb_array_elements(case when act='bulk_track' then p_input->'items' else '[0]'::jsonb end) loop
   if jsonb_typeof(ref->'revision') is distinct from 'number' or not coalesce(ref->>'revision'~'^[0-9]{1,10}$',false) then raise exception 'Invalid revision' using errcode='22023';end if;
   begin select * into item from public.pro_work_selection_items where owner_id=p_owner and work_id=wid and id=(ref->>'itemId')::uuid and not archived for update;exception when others then raise exception 'Invalid item' using errcode='22023';end;
   if item.id is null then raise exception 'Item unavailable' using errcode='P0002';end if;
   if v_status<>'not_ordered' and item.status<>'approved' then raise exception 'Only approved selections can be ordered' using errcode='22023';end if;
   select * into tr from public.pro_work_selection_tracking where owner_id=p_owner and item_id=item.id for update;
   if coalesce(tr.revision,0)<>(ref->>'revision')::integer then raise exception 'Tracking changed' using errcode='40001';end if;
   if act='tracking_set' then
    if jsonb_typeof(p_input->'orderedOn') not in('string','null') or jsonb_typeof(p_input->'deliveredOn') not in('string','null') or jsonb_typeof(p_input->'supplierRef') is distinct from 'string' or length(btrim(p_input->>'supplierRef'))>80 then raise exception 'Invalid tracking' using errcode='22023';end if;
    begin v_ordered:=(p_input->>'orderedOn')::date;v_delivered:=(p_input->>'deliveredOn')::date;exception when others then raise exception 'Invalid date' using errcode='22023';end;
    v_ref:=btrim(p_input->>'supplierRef');
   else
    v_ordered:=case when v_status='not_ordered' then null else coalesce(tr.ordered_on,today) end;v_delivered:=case when v_status in('delivered','installed') then coalesce(tr.delivered_on,today) end;v_ref:=coalesce(tr.supplier_ref,'');
   end if;
   if v_status='not_ordered' then v_ordered:=null;v_delivered:=null;elsif v_status='ordered' then v_delivered:=null;end if;
   before_json:=public.pro_work_selection_tracking_json(p_owner,item.id);
   begin
    insert into public.pro_work_selection_tracking(owner_id,item_id,work_id,status,ordered_on,delivered_on,supplier_ref,revision) values(p_owner,item.id,wid,v_status,v_ordered,v_delivered,v_ref,1)
     on conflict(owner_id,item_id) do update set status=excluded.status,ordered_on=excluded.ordered_on,delivered_on=excluded.delivered_on,supplier_ref=excluded.supplier_ref,revision=public.pro_work_selection_tracking.revision+1,updated_at=clock_timestamp();
   exception when check_violation then raise exception 'Invalid tracking dates' using errcode='22023';end;
   insert into public.pro_work_selection_tracking_history(owner_id,action_id,target_kind,target_id,work_id,before_value,after_value) values(p_owner,aid,'tracking',item.id,wid,before_json,public.pro_work_selection_tracking_json(p_owner,item.id));
   n:=n+1;
  end loop;
  answer:=jsonb_build_object('action',act,'updated',n,'status',v_status);
 end if;
 insert into public.pro_work_selection_tracking_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

-- Customer: approve several items at once (each through the existing customer writer; all or nothing).
create or replace function public.pro_work_selections_client_bulk(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.pro_work_selection_bulk_actions;ref jsonb;keys text[];n integer:=0;answer jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from array['action','actionId','items','requestId'] or p_input->>'action'<>'approve_many' or jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 50 or jsonb_typeof(p_input->'requestId') is distinct from 'string' then raise exception 'Invalid bulk approval' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-selection-bulk:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_selection_bulk_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 for ref in select value from jsonb_array_elements(p_input->'items') loop
  select array_agg(x order by x) into keys from jsonb_object_keys(ref) x;
  if keys is distinct from array['id','optionId','revision'] then raise exception 'Invalid bulk item' using errcode='22023';end if;
  perform public.pro_work_selections_client_mutate(p_actor,jsonb_build_object('action','approve','actionId',public.pro_lead_import_uuid('pro-selection-bulk:'||aid::text||':'||(ref->>'id')),'requestId',p_input->>'requestId','id',ref->>'id','optionId',ref->>'optionId','revision',ref->'revision'));
  n:=n+1;
 end loop;
 answer:=jsonb_build_object('action','approve_many','approved',n);
 insert into public.pro_work_selection_bulk_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,answer);
 return answer;
end $$;

-- Printable selections sheet (customer-facing content: no internal cost or margin).
create or replace function public.pro_work_selection_print_read(p_owner uuid,p_work text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into w from public.pro_work where user_id=p_owner and id=p_work;if not found then return null;end if;
 return jsonb_build_object('workId',w.id,'service',w.service,'client',coalesce(w.client,''),'today',public.pro_work_selection_today(),
  'areas',coalesce((select jsonb_agg(jsonb_build_object('name',a.name,'items',x.items) order by a.position) from public.pro_work_selection_areas a
   join lateral(select jsonb_agg(jsonb_build_object('name',i.name,'state',public.pro_work_selection_state(i),'dueDate',i.due_date,'approvedAt',i.approved_at,'tracking',public.pro_work_selection_tracking_json(p_owner,i.id)->>'status',
     'option',(select jsonb_build_object('name',o.name,'brand',o.brand,'quantity',o.quantity,'unitCents',o.unit_cents,'totalCents',o.total_cents,'approved',o.id=i.approved_option_id) from public.pro_work_selection_options o where o.owner_id=i.owner_id and o.id=coalesce(i.approved_option_id,i.recommended_option_id)),
     'optionCount',(select count(*) from public.pro_work_selection_options o where o.owner_id=i.owner_id and o.item_id=i.id and not o.archived)) order by i.position) items
    from public.pro_work_selection_items i where i.owner_id=a.owner_id and i.area_id=a.id and not i.archived) x on x.items is not null
   where a.owner_id=p_owner and a.work_id=p_work and not a.archived),'[]'::jsonb));
end $$;

-- Printable change order (owner): number in the job, customer lines (no internal cost/markup), totals.
create or replace function public.pro_work_change_print_read(p_owner uuid,p_change uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare c public.pro_work_changes;w public.pro_work;
begin
 if not coalesce(public.pro_work_changes_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into c from public.pro_work_changes where owner_id=p_owner and id=p_change;if not found then return null;end if;
 select * into w from public.pro_work where user_id=p_owner and id=c.work_id;
 return jsonb_build_object('id',c.id,'number',(select count(*) from public.pro_work_changes x where x.owner_id=p_owner and x.work_id=c.work_id and x.position<=c.position),
  'workId',c.work_id,'service',coalesce(w.service,''),'client',coalesce(w.client,''),'reason',c.reason,'status',c.status,'recordedBy',c.recorded_by,'acceptanceNote',c.acceptance_note,
  'lines',(select jsonb_agg(jsonb_build_object('description',l->>'description','amountCents',(l->>'amountCents')::bigint) order by n) from jsonb_array_elements(c.lines) with ordinality y(l,n)),
  'baseCents',c.base_cents,'deltaCents',c.delta_cents,'totalCents',c.total_cents,'scheduleDays',c.schedule_days,'createdAt',c.created_at,'updatedAt',c.updated_at);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_work_selection_tracking_json','pro_work_selection_tracking_read','pro_work_selection_tracking_mutate','pro_work_selections_client_bulk','pro_work_selection_print_read','pro_work_change_print_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
