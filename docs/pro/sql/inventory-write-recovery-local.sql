-- LOCAL PRO ONLY. Additive one-product/stock receipts; no backfill or legacy contract change.
begin;
create table if not exists public.pro_inventory_write_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input jsonb not null,result jsonb not null,
 primary key(actor_id,action_id)
);
alter table public.pro_inventory_write_actions enable row level security;
revoke all on public.pro_inventory_write_actions from public,anon,authenticated;
grant all on public.pro_inventory_write_actions to service_role;
create or replace function public.pro_inventory_write_record(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior pro_inventory_write_actions;aid uuid;r jsonb;m jsonb;field text;v integer;result jsonb;mode text;movement_id uuid;
begin
 if p_actor is null then raise exception 'Missing actor' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object'
 or (p_input-array['kind','revision','rows','movements','importing','inventoryActionId','inventoryWriteMode'])<>'{}'::jsonb
 or not(p_input ?& array['kind','revision','rows','movements','importing','inventoryActionId','inventoryWriteMode'])
 or p_input->'kind' is distinct from '"products"'::jsonb or p_input->'importing' is distinct from 'false'::jsonb
 or jsonb_typeof(p_input->'movements') is distinct from 'array'
 or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]{1,10}$'
 or jsonb_typeof(p_input->'rows') is distinct from 'array' then raise exception 'Invalid inventory write' using errcode='22023';end if;
 if (p_input->>'revision')::bigint>2147483646 or jsonb_array_length(p_input->'rows')<>1 or jsonb_array_length(p_input->'movements')>1
 or jsonb_typeof(p_input->'inventoryActionId') is distinct from 'string'
 or jsonb_typeof(p_input->'inventoryWriteMode') is distinct from 'string'
 or p_input->>'inventoryWriteMode' not in ('create','edit','movement') then raise exception 'Invalid inventory write' using errcode='22023';end if;
 aid:=(p_input->>'inventoryActionId')::uuid;
 if aid is null then raise exception 'Missing action' using errcode='22023';end if;
 r:=p_input->'rows'->0;mode:=p_input->>'inventoryWriteMode';
 if jsonb_typeof(r) is distinct from 'object' or (r-array['id','sku','name','stock','minimum','cost','price','archived','category','unit','cabys','itemType'])<>'{}'::jsonb
 or not(r ?& array['id','sku','name','stock','minimum','cost','price','archived']) or jsonb_typeof(r->'archived') is distinct from 'boolean' then raise exception 'Invalid inventory row' using errcode='22023';end if;
 foreach field in array array['id','sku','name','category','unit','cabys','itemType'] loop
  if (field=any(array['id','sku','name']) or r ? field) and
  (jsonb_typeof(r->field) is distinct from 'string' or length(r->>field)>(case field when 'unit' then 30 when 'cabys' then 13 else 160 end)) then raise exception 'Invalid inventory field' using errcode='22023';end if;
 end loop;
 foreach field in array array['stock','minimum','cost','price'] loop
  if jsonb_typeof(r->field) is distinct from 'number' or (r->>field)::numeric<0 then raise exception 'Invalid inventory amount' using errcode='22023';end if;
 end loop;
 if length(btrim(r->>'id'))=0 or btrim(r->>'id')<>r->>'id' or length(btrim(r->>'sku'))=0 or btrim(r->>'sku')<>r->>'sku' or length(btrim(r->>'name'))=0 or btrim(r->>'name')<>r->>'name'
 or r ? 'cabys' and (r->>'cabys')!~'^(|[0-9]{13})$'
 or r ? 'itemType' and r->>'itemType' not in ('product','service')
 or mode='create' and ((r->>'id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or r->'archived'<>'false'::jsonb)
 or (mode='movement') is distinct from (jsonb_array_length(p_input->'movements')=1)
 then raise exception 'Invalid inventory identity' using errcode='22023';end if;
 if mode='movement' then
  m:=p_input->'movements'->0;
  if jsonb_typeof(m) is distinct from 'object' or (m-array['id','productId','delta','reason','at'])<>'{}'::jsonb
  or not(m ?& array['id','productId','delta','reason','at'])
  or jsonb_typeof(m->'id') is distinct from 'string' or jsonb_typeof(m->'productId') is distinct from 'string' or m->'productId' is distinct from r->'id'
  or jsonb_typeof(m->'delta') is distinct from 'number' or (m->>'delta')::numeric=0
  or jsonb_typeof(m->'reason') is distinct from 'string' or length(btrim(m->>'reason')) not between 1 and 160 or btrim(m->>'reason')<>m->>'reason'
  or jsonb_typeof(m->'at') is distinct from 'string' or length(m->>'at')>40 or (m->>'at')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$'
  or r->'archived'<>'false'::jsonb or r->>'itemType'='service' then raise exception 'Invalid inventory movement' using errcode='22023';end if;
  movement_id:=(m->>'id')::uuid;
  if movement_id is null or not isfinite((m->>'at')::timestamptz) then raise exception 'Invalid movement identity' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 -- Replay wins before current stock, archive, row existence and global revision.
 select * into prior from pro_inventory_write_actions where actor_id=p_actor and action_id=aid;
 if found then
  if prior.input is distinct from p_input then raise exception 'Inventory action changed' using errcode='40001';end if;
  return prior.result;
 end if;
 if mode='create' and exists(select 1 from pro_products where user_id=p_actor and id=r->>'id')
 or mode<>'create' and not exists(select 1 from pro_products where user_id=p_actor and id=r->>'id') then raise exception 'Inventory changed' using errcode='40001';end if;
 -- The established writer owns all stock equality/rounding, immutable type,
 -- service/no-stock, unique SKU, movement history and nonnegative constraints.
 v:=pro_mutate_catalog(p_actor,'products',p_input->'rows',(p_input->>'revision')::integer,p_input->'movements',false);
 result:=jsonb_build_object('id',r->>'id','revision',v,'movementId',movement_id);
 insert into pro_inventory_write_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
revoke all on function public.pro_inventory_write_record(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_inventory_write_record(uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
