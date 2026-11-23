-- Pro family 52 (order tracking): carrier, tracking guide, ship / ETA / installation dates and a custom state label per
-- line, one record per purchase order with optimistic concurrency (revision). Owner-only, service_role only, like 300.
begin;
create table if not exists public.pro_purchase_order_tracking(
 owner_id uuid not null,order_id uuid not null,
 carrier text check(carrier is null or length(btrim(carrier)) between 1 and 80),
 tracking_number text check(tracking_number is null or length(btrim(tracking_number)) between 1 and 80),
 shipped_on date,eta_on date,install_on date,
 note text check(note is null or length(btrim(note)) between 1 and 300),
 line_states jsonb not null default '{}'::jsonb check(jsonb_typeof(line_states)='object'),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,order_id),
 foreign key(owner_id,order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade,
 check(eta_on is null or shipped_on is null or eta_on>=shipped_on),
 check(install_on is null or shipped_on is null or install_on>=shipped_on)
);

create or replace function public.pro_purchase_order_tracking_read(p_actor uuid,p_work text,p_order uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare t public.pro_purchase_order_tracking;o public.pro_purchase_orders;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_order is null then raise exception 'Invalid tracking query' using errcode='22023';end if;
 select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=p_work and id=p_order;
 if not found then return null;end if;
 select * into t from public.pro_purchase_order_tracking where owner_id=p_actor and order_id=p_order;
 if not found then return jsonb_build_object('orderId',p_order,'revision',0,'carrier',null,'trackingNumber',null,'shippedOn',null,'etaOn',null,'installOn',null,'note',null,'lineStates','{}'::jsonb);end if;
 return jsonb_build_object('orderId',p_order,'revision',t.revision,'carrier',t.carrier,'trackingNumber',t.tracking_number,'shippedOn',t.shipped_on,'etaOn',t.eta_on,'installOn',t.install_on,'note',t.note,'lineStates',t.line_states,'updatedAt',t.updated_at);
end $$;

create or replace function public.pro_purchase_order_tracking_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];wid text;oid uuid;rev integer;o public.pro_purchase_orders;cur public.pro_purchase_order_tracking;w record;
 v_carrier text;v_guide text;v_ship date;v_eta date;v_inst date;v_note text;states jsonb:='{}'::jsonb;k text;val text;lines_ok integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid tracking' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['carrier','etaOn','id','installOn','lineStates','note','revision','shippedOn','trackingNumber','workId']
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or jsonb_typeof(p_input->'lineStates') is distinct from 'object'
  or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid tracking fields' using errcode='22023';end if;
 wid:=p_input->>'workId';oid:=(p_input->>'id')::uuid;rev:=(p_input->>'revision')::integer;
 if length(wid) not between 1 and 160 then raise exception 'Invalid tracking identity' using errcode='22023';end if;
 v_carrier:=public.pro_purchase_order_text(p_input->'carrier',80,false);v_guide:=public.pro_purchase_order_text(p_input->'trackingNumber',80,false);
 v_note:=public.pro_purchase_order_text(p_input->'note',300,false);
 v_ship:=public.pro_purchase_order_day(p_input->'shippedOn',false);v_eta:=public.pro_purchase_order_day(p_input->'etaOn',false);v_inst:=public.pro_purchase_order_day(p_input->'installOn',false);
 if v_ship is not null and ((v_eta is not null and v_eta<v_ship) or (v_inst is not null and v_inst<v_ship)) then raise exception 'Dates before the shipping date' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(p_input->'lineStates'))>100 then raise exception 'Too many line states' using errcode='22023';end if;
 for k,val in select key,value from jsonb_each_text(p_input->'lineStates') loop
  if k !~ '^[0-9a-f-]{36}$' then raise exception 'Invalid line' using errcode='22023';end if;
  if jsonb_typeof(p_input->'lineStates'->k) not in('string','null') then raise exception 'Invalid line state' using errcode='22023';end if;
  if val is not null and btrim(val)<>'' then
   if length(btrim(val))>40 then raise exception 'Line state too long' using errcode='22023';end if;
   select count(*) into lines_ok from public.pro_purchase_order_lines l where l.owner_id=p_actor and l.order_id=oid and l.id=k::uuid;
   if lines_ok=0 then raise exception 'Line not in this order' using errcode='22023';end if;
   states:=states||jsonb_build_object(k,btrim(val));
  end if;
 end loop;
 select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=wid and id=oid for update;
 if not found then raise exception 'Order not found' using errcode='22023';end if;
 select cancelled into w from public.pro_work where user_id=p_actor and id=wid;
 if coalesce(w.cancelled,false) then raise exception 'Cancelled work' using errcode='22023';end if;
 if o.status not in('issued','partial','received') then raise exception 'Only issued orders can be tracked' using errcode='22023';end if;
 select * into cur from public.pro_purchase_order_tracking where owner_id=p_actor and order_id=oid for update;
 if not found then
  if rev<>0 then raise exception 'Stale tracking' using errcode='40001';end if;
  insert into public.pro_purchase_order_tracking(owner_id,order_id,carrier,tracking_number,shipped_on,eta_on,install_on,note,line_states)
   values(p_actor,oid,v_carrier,v_guide,v_ship,v_eta,v_inst,v_note,states);
 else
  if cur.revision<>rev then raise exception 'Stale tracking' using errcode='40001';end if;
  update public.pro_purchase_order_tracking set carrier=v_carrier,tracking_number=v_guide,shipped_on=v_ship,eta_on=v_eta,install_on=v_inst,note=v_note,
   line_states=states,revision=revision+1,updated_at=now() where owner_id=p_actor and order_id=oid;
 end if;
 return public.pro_purchase_order_tracking_read(p_actor,wid,oid);
end $$;

do $$declare f record;begin
 alter table public.pro_purchase_order_tracking enable row level security;
 revoke all on public.pro_purchase_order_tracking from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_purchase_order_tracking to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_purchase_order_tracking_read','pro_purchase_order_tracking_set') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
