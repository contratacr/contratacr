-- Pro area D (money, price book): catalog item kind (standard, placeholder, assembly) and the parts of an assembly.
-- A placeholder is a provisional item to price later; an assembly is an item built from other catalog items with quantities,
-- one level deep (a part cannot itself be an assembly). Side tables keyed by the catalog item (pro_products), owner only,
-- service_role only, optimistic concurrency (revision). Cost of an assembly is computed from its parts at read time.
begin;
create table if not exists public.pro_product_kind(
 owner_id uuid not null,product_id text not null,
 kind text not null default 'standard' check(kind in('standard','placeholder','assembly')),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,product_id),
 foreign key(owner_id,product_id) references public.pro_products(user_id,id) on delete cascade
);
create table if not exists public.pro_product_assembly_parts(
 owner_id uuid not null,assembly_id text not null,part_id text not null,
 qty_milli bigint not null check(qty_milli between 1 and 999999999),
 position integer not null check(position between 0 and 39),
 primary key(owner_id,assembly_id,part_id),
 check(assembly_id<>part_id),
 foreign key(owner_id,assembly_id) references public.pro_products(user_id,id) on delete cascade,
 foreign key(owner_id,part_id) references public.pro_products(user_id,id) on delete cascade
);
create index if not exists pro_product_assembly_parts_part on public.pro_product_assembly_parts(owner_id,part_id);

create or replace function public.pro_product_kind_read(p_actor uuid,p_product text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_kind text;v_rev integer;v_parts jsonb;v_cost bigint;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_product is null or length(p_product) not between 1 and 160 then raise exception 'Invalid product' using errcode='22023';end if;
 if not exists(select 1 from public.pro_products where user_id=p_actor and id=p_product) then raise exception 'Catalog item unavailable' using errcode='P0002';end if;
 select coalesce(k.kind,'standard'),coalesce(k.revision,0) into v_kind,v_rev
 from (select 1) one left join public.pro_product_kind k on k.owner_id=p_actor and k.product_id=p_product;
 select coalesce(jsonb_agg(jsonb_build_object('partId',x.part_id,'name',x.name,'sku',x.sku,'qtyMilli',x.qty_milli,'unitCostCents',x.unit_cost,
   'lineCostCents',round(x.unit_cost::numeric*x.qty_milli/1000.0)::bigint) order by x.position,x.part_id),'[]'::jsonb),
  coalesce(sum(round(x.unit_cost::numeric*x.qty_milli/1000.0)::bigint),0)::bigint
 into v_parts,v_cost
 from (select a.part_id as part_id,a.position as position,a.qty_milli as qty_milli,p.name as name,p.sku as sku,round(coalesce(p.cost,0)*100)::bigint as unit_cost
  from public.pro_product_assembly_parts a join public.pro_products p on p.user_id=a.owner_id and p.id=a.part_id
  where a.owner_id=p_actor and a.assembly_id=p_product) x;
 return jsonb_build_object('productId',p_product,'revision',v_rev,'kind',v_kind,'parts',v_parts,'costCents',case when v_kind='assembly' then v_cost else null end);
end $$;

create or replace function public.pro_product_kind_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_keys text[];v_pid text;v_rev integer;v_kind text;v_parts jsonb;v_cur public.pro_product_kind;v_item jsonb;v_pos integer:=0;v_part text;v_qty bigint;v_seen text[]:='{}';
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid item kind' using errcode='22023';end if;
 select array_agg(k order by k) into v_keys from jsonb_object_keys(p_input) as k;
 if v_keys is distinct from array['kind','parts','productId','revision']
  or jsonb_typeof(p_input->'productId') is distinct from 'string' or jsonb_typeof(p_input->'kind') is distinct from 'string'
  or jsonb_typeof(p_input->'parts') is distinct from 'array'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid item kind fields' using errcode='22023';end if;
 v_pid:=p_input->>'productId';v_rev:=(p_input->>'revision')::integer;v_kind:=p_input->>'kind';v_parts:=p_input->'parts';
 if length(v_pid) not between 1 and 160 or v_kind not in('standard','placeholder','assembly') then raise exception 'Invalid item kind' using errcode='22023';end if;
 if jsonb_array_length(v_parts)>40 or (v_kind<>'assembly' and jsonb_array_length(v_parts)>0) then raise exception 'Invalid parts' using errcode='22023';end if;
 if not exists(select 1 from public.pro_products where user_id=p_actor and id=v_pid) then raise exception 'Catalog item unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-product-kind:'||p_actor::text||':'||v_pid,0));
 if v_kind='assembly' and exists(select 1 from public.pro_product_assembly_parts where owner_id=p_actor and part_id=v_pid) then
  raise exception 'An item used in an assembly cannot be an assembly' using errcode='22023',hint='pro_assembly_nested';
 end if;
 select * into v_cur from public.pro_product_kind where owner_id=p_actor and product_id=v_pid for update;
 if not found then
  if v_rev<>0 then raise exception 'Stale item kind' using errcode='40001';end if;
  insert into public.pro_product_kind(owner_id,product_id,kind) values(p_actor,v_pid,v_kind);
 else
  if v_cur.revision<>v_rev then raise exception 'Stale item kind' using errcode='40001';end if;
  update public.pro_product_kind set kind=v_kind,revision=revision+1,updated_at=now() where owner_id=p_actor and product_id=v_pid;
 end if;
 delete from public.pro_product_assembly_parts where owner_id=p_actor and assembly_id=v_pid;
 for v_item in select value from jsonb_array_elements(v_parts) loop
  if jsonb_typeof(v_item) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(v_item) as k) is distinct from array['partId','qtyMilli']
   or jsonb_typeof(v_item->'partId') is distinct from 'string' or jsonb_typeof(v_item->'qtyMilli') is distinct from 'number'
   or not coalesce((v_item->>'qtyMilli')~'^[0-9]{1,9}$',false) then raise exception 'Invalid part' using errcode='22023';end if;
  v_part:=v_item->>'partId';v_qty:=(v_item->>'qtyMilli')::bigint;
  if v_qty<1 or v_part=v_pid or v_part=any(v_seen) then raise exception 'Invalid part' using errcode='22023';end if;
  if not exists(select 1 from public.pro_products where user_id=p_actor and id=v_part) then raise exception 'Part unavailable' using errcode='P0002';end if;
  if exists(select 1 from public.pro_product_kind where owner_id=p_actor and product_id=v_part and kind='assembly') then
   raise exception 'A part cannot be an assembly' using errcode='22023',hint='pro_assembly_nested';
  end if;
  v_seen:=v_seen||v_part;
  insert into public.pro_product_assembly_parts(owner_id,assembly_id,part_id,qty_milli,position) values(p_actor,v_pid,v_part,v_qty,v_pos);
  v_pos:=v_pos+1;
 end loop;
 return public.pro_product_kind_read(p_actor,v_pid);
end $$;

do $$declare f record;begin
 alter table public.pro_product_kind enable row level security;
 alter table public.pro_product_assembly_parts enable row level security;
 revoke all on public.pro_product_kind,public.pro_product_assembly_parts from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_product_kind,public.pro_product_assembly_parts to service_role;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_product_kind_read','pro_product_kind_set') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
