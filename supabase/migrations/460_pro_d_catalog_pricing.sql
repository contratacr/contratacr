-- Pro area D (money, price book): cost type (material, labor, material and labor), suggested retail price (MSRP), product URL and
-- favorite flag per catalog item. Side table keyed by the catalog item (pro_products), same pattern as pro_product_specs (345):
-- owner only, service_role only, optimistic concurrency (revision), bounds in SQL. Product and service stay in pro_products.item_type.
begin;
create table if not exists public.pro_product_pricing(
 owner_id uuid not null,product_id text not null,
 cost_type text check(cost_type is null or cost_type in('material','labor','material_labor')),
 msrp_cents bigint check(msrp_cents is null or msrp_cents between 0 and 100000000000),
 url text check(url is null or (length(url) between 8 and 500 and url ~* '^https?://[^[:space:]]+$')),
 favorite boolean not null default false,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,product_id),
 foreign key(owner_id,product_id) references public.pro_products(user_id,id) on delete cascade
);

create or replace function public.pro_product_pricing_read(p_actor uuid,p_products text[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_products is null or cardinality(p_products)<1 or cardinality(p_products)>50 then raise exception 'Invalid products' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(p.id,jsonb_build_object('productId',p.id,'revision',coalesce(s.revision,0),'costType',s.cost_type,
   'msrpCents',s.msrp_cents,'url',s.url,'favorite',coalesce(s.favorite,false)))
  from public.pro_products p left join public.pro_product_pricing s on s.owner_id=p.user_id and s.product_id=p.id
  where p.user_id=p_actor and p.id=any(p_products)),'{}'::jsonb);
end $$;

create or replace function public.pro_product_pricing_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];pid text;rev integer;cur public.pro_product_pricing;v_type text;v_msrp bigint;v_url text;v_fav boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid pricing' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['costType','favorite','msrpCents','productId','revision','url']
  or jsonb_typeof(p_input->'productId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number'
  or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false)
  or jsonb_typeof(p_input->'favorite') is distinct from 'boolean'
  or jsonb_typeof(p_input->'costType') not in('string','null')
  or jsonb_typeof(p_input->'msrpCents') not in('number','null')
  or jsonb_typeof(p_input->'url') not in('string','null') then raise exception 'Invalid pricing fields' using errcode='22023';end if;
 pid:=p_input->>'productId';rev:=(p_input->>'revision')::integer;
 if length(pid) not between 1 and 160 then raise exception 'Invalid product' using errcode='22023';end if;
 v_type:=case when jsonb_typeof(p_input->'costType')='null' then null else p_input->>'costType' end;
 if v_type is not null and v_type not in('material','labor','material_labor') then raise exception 'Invalid cost type' using errcode='22023';end if;
 if jsonb_typeof(p_input->'msrpCents')='null' then v_msrp:=null;
 else
  if not (p_input->>'msrpCents')~'^[0-9]{1,12}$' then raise exception 'Invalid MSRP' using errcode='22023';end if;
  v_msrp:=(p_input->>'msrpCents')::bigint;
  if v_msrp>100000000000 then raise exception 'Invalid MSRP' using errcode='22023';end if;
 end if;
 v_url:=case when jsonb_typeof(p_input->'url')='null' then null else btrim(p_input->>'url') end;
 if v_url is not null and (length(v_url) not between 8 and 500 or v_url !~* '^https?://[^[:space:]]+$') then raise exception 'Invalid URL' using errcode='22023';end if;
 v_fav:=(p_input->>'favorite')::boolean;
 if not exists(select 1 from public.pro_products where user_id=p_actor and id=pid) then raise exception 'Catalog item unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-product-pricing:'||p_actor::text||':'||pid,0));
 select * into cur from public.pro_product_pricing where owner_id=p_actor and product_id=pid for update;
 if not found then
  if rev<>0 then raise exception 'Stale pricing' using errcode='40001';end if;
  insert into public.pro_product_pricing(owner_id,product_id,cost_type,msrp_cents,url,favorite) values(p_actor,pid,v_type,v_msrp,v_url,v_fav);
 else
  if cur.revision<>rev then raise exception 'Stale pricing' using errcode='40001';end if;
  update public.pro_product_pricing set cost_type=v_type,msrp_cents=v_msrp,url=v_url,favorite=v_fav,revision=revision+1,updated_at=now()
   where owner_id=p_actor and product_id=pid;
 end if;
 return public.pro_product_pricing_read(p_actor,array[pid])->pid;
end $$;

do $$declare f record;begin
 alter table public.pro_product_pricing enable row level security;
 revoke all on public.pro_product_pricing from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_product_pricing to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_product_pricing_read','pro_product_pricing_set') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
