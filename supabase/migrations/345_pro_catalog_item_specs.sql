-- Pro family 59 (catalog): visual/technical specifications per catalog item (brand, model, finish, dimensions, material, color,
-- warranty). A side table keyed by the catalog item (pro_products), like the image/vendor side table of 7C, so the generic catalog
-- writer stays untouched. Owner-only, service_role only, optimistic concurrency (revision), text bounds in SQL.
begin;
create table if not exists public.pro_product_specs(
 owner_id uuid not null,product_id text not null,
 brand text check(brand is null or length(btrim(brand)) between 1 and 80),
 model text check(model is null or length(btrim(model)) between 1 and 80),
 finish text check(finish is null or length(btrim(finish)) between 1 and 80),
 color text check(color is null or length(btrim(color)) between 1 and 80),
 material text check(material is null or length(btrim(material)) between 1 and 80),
 dimensions text check(dimensions is null or length(btrim(dimensions)) between 1 and 120),
 warranty text check(warranty is null or length(btrim(warranty)) between 1 and 120),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,product_id),
 foreign key(owner_id,product_id) references public.pro_products(user_id,id) on delete cascade
);

create or replace function public.pro_product_specs_read(p_actor uuid,p_products text[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_products is null or cardinality(p_products)<1 or cardinality(p_products)>50 then raise exception 'Invalid products' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(p.id,jsonb_build_object('productId',p.id,'revision',coalesce(s.revision,0),'brand',s.brand,'model',s.model,
   'finish',s.finish,'color',s.color,'material',s.material,'dimensions',s.dimensions,'warranty',s.warranty))
  from public.pro_products p left join public.pro_product_specs s on s.owner_id=p.user_id and s.product_id=p.id
  where p.user_id=p_actor and p.id=any(p_products)),'{}'::jsonb);
end $$;

create or replace function public.pro_product_specs_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];pid text;rev integer;cur public.pro_product_specs;
 v_brand text;v_model text;v_finish text;v_color text;v_material text;v_dim text;v_warranty text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid specs' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['brand','color','dimensions','finish','material','model','productId','revision','warranty']
  or jsonb_typeof(p_input->'productId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number'
  or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Invalid specs fields' using errcode='22023';end if;
 pid:=p_input->>'productId';rev:=(p_input->>'revision')::integer;
 if length(pid) not between 1 and 160 then raise exception 'Invalid product' using errcode='22023';end if;
 v_brand:=public.pro_purchase_order_text(p_input->'brand',80,false);v_model:=public.pro_purchase_order_text(p_input->'model',80,false);
 v_finish:=public.pro_purchase_order_text(p_input->'finish',80,false);v_color:=public.pro_purchase_order_text(p_input->'color',80,false);
 v_material:=public.pro_purchase_order_text(p_input->'material',80,false);v_dim:=public.pro_purchase_order_text(p_input->'dimensions',120,false);
 v_warranty:=public.pro_purchase_order_text(p_input->'warranty',120,false);
 if not exists(select 1 from public.pro_products where user_id=p_actor and id=pid) then raise exception 'Catalog item unavailable' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-product-specs:'||p_actor::text||':'||pid,0));
 select * into cur from public.pro_product_specs where owner_id=p_actor and product_id=pid for update;
 if not found then
  if rev<>0 then raise exception 'Stale specs' using errcode='40001';end if;
  insert into public.pro_product_specs(owner_id,product_id,brand,model,finish,color,material,dimensions,warranty)
   values(p_actor,pid,v_brand,v_model,v_finish,v_color,v_material,v_dim,v_warranty);
 else
  if cur.revision<>rev then raise exception 'Stale specs' using errcode='40001';end if;
  update public.pro_product_specs set brand=v_brand,model=v_model,finish=v_finish,color=v_color,material=v_material,dimensions=v_dim,warranty=v_warranty,
   revision=revision+1,updated_at=now() where owner_id=p_actor and product_id=pid;
 end if;
 return public.pro_product_specs_read(p_actor,array[pid])->pid;
end $$;

do $$declare f record;begin
 alter table public.pro_product_specs enable row level security;
 revoke all on public.pro_product_specs from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_product_specs to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_product_specs_read','pro_product_specs_set') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
