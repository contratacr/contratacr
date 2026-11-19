-- LOCAL PRO ONLY. Round 4A (2026-11-13): internal cost per quote line and line sections.
-- Lines may carry two OPTIONAL keys (old 8-key lines stay valid and unchanged):
--   unitCostCents – internal unit cost in cents (owner only). Margin = net (after discount, before
--                   tax) − qty × cost, computed in the editor. It never reaches a customer: every
--                   customer copy (publication snapshot, its copies, the accepted-job comparison)
--                   is built field by field in SQL without it, and the TS customer schemas omit it.
--   group         – section name; consecutive lines with the same name form a section with a
--                   subtotal in the editor, the owner preview and the owner's PDF. (Shared
--                   publications keep their existing hashed snapshot shape: see qa-review Ronda 4A.)
-- Supersedes pro_private_estimate_totals (private-estimates-local.sql: only the key check is relaxed
-- and the two keys validated; totals are unchanged) and pro_work_takeoff_line (takeoffs-local.sql:
-- a re-sent measurement keeps the line's cost and section).
begin;
create or replace function pro_private_estimate_totals(p_lines jsonb) returns jsonb language plpgsql immutable security invoker set search_path=public,pg_temp as $$declare l jsonb;b numeric;d numeric;n numeric;t numeric;s numeric:=0;ds numeric:=0;ts numeric:=0;tot numeric:=0;begin
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Invalid lines' using errcode='22023';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) then raise exception 'Duplicate line' using errcode='22023';end if;
 for l in select value from jsonb_array_elements(p_lines) loop
 if jsonb_typeof(l) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(l)key where key not in('unitCostCents','group')) is distinct from array['catalogProductId','description','discountBps','id','qtyMilli','taxBps','unit','unitPriceCents'] or l->>'id' is null or length(btrim(l->>'description')) not between 1 and 2000 or length(l->>'unit')>30 then raise exception 'Invalid line fields' using errcode='22023';end if;
 -- Round 4A optional keys: unitCostCents (owner-only internal unit cost) and group (section name).
 if l?'unitCostCents' and (jsonb_typeof(l->'unitCostCents') is distinct from 'number' or not coalesce(l->>'unitCostCents'~'^[0-9]+$',false) or (l->>'unitCostCents')::numeric>10000000000) then raise exception 'Invalid line cost' using errcode='22023';end if;
 if l?'group' and (jsonb_typeof(l->'group') is distinct from 'string' or length(btrim(l->>'group')) not between 1 and 80 or l->>'group'<>btrim(l->>'group')) then raise exception 'Invalid line group' using errcode='22023';end if;
 perform (l->>'id')::uuid;if jsonb_typeof(l->'id') is distinct from 'string' or jsonb_typeof(l->'description') is distinct from 'string' or jsonb_typeof(l->'unit') is distinct from 'string' or jsonb_typeof(l->'catalogProductId') not in('null','string') or jsonb_typeof(l->'qtyMilli') is distinct from 'number' or jsonb_typeof(l->'unitPriceCents') is distinct from 'number' or jsonb_typeof(l->'discountBps') is distinct from 'number' or jsonb_typeof(l->'taxBps') is distinct from 'number' then raise exception 'Invalid line types' using errcode='22023';end if;
 if not coalesce(l->>'qtyMilli'~'^[0-9]+$',false) or not coalesce(l->>'unitPriceCents'~'^[0-9]+$',false) or not coalesce(l->>'discountBps'~'^[0-9]+$',false) or not coalesce(l->>'taxBps'~'^[0-9]+$',false) or (l->>'qtyMilli')::numeric not between 1 and 100000000 or (l->>'unitPriceCents')::numeric not between 0 and 10000000000 or (l->>'discountBps')::numeric not between 0 and 10000 or (l->>'taxBps')::numeric not between 0 and 10000 then raise exception 'Invalid line money' using errcode='22023';end if;
 b:=round((l->>'qtyMilli')::numeric*(l->>'unitPriceCents')::numeric/1000);d:=round(b*(l->>'discountBps')::numeric/10000);n:=b-d;t:=round(n*(l->>'taxBps')::numeric/10000);s:=s+b;ds:=ds+d;ts:=ts+t;tot:=tot+n+t;
 end loop;
 if greatest(s,ds,ts,tot)>9000000000000 then raise exception 'Estimate overflow' using errcode='22023';end if;return jsonb_build_object('subtotalCents',s,'discountCents',ds,'taxCents',ts,'totalCents',tot);end $$;

create or replace function public.pro_work_takeoff_line(p_actor uuid,p_estimate uuid,p_row public.pro_work_takeoff_measurements,p_old jsonb,p_en boolean) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_work_takeoff_pages;r jsonb;qty numeric;unit_label text;product public.pro_products;price bigint;cat text;line_id uuid;
begin
 select * into g from public.pro_work_takeoff_pages where owner_id=p_actor and plan_id=p_row.plan_id and page_number=p_row.page_number;
 r:=public.pro_work_takeoff_result(p_row,g);
 if (r->>'needsScale')::boolean then raise exception 'Calibrate the page before quoting' using errcode='22023';end if;
 qty:=(r->>'totalMilli')::numeric;
 if qty not between 1 and 100000000 then raise exception 'Quantity outside the estimate range' using errcode='22023';end if;
 unit_label:=case r->>'unit' when 'm2' then 'm²' when 'ft2' then 'ft²' when 'm' then 'm' when 'ft' then 'ft' else case when p_en then 'ea' else 'unid.' end end;
 select name into cat from public.pro_catalog_organizations where user_id=p_actor and kind='product_category' and id=p_row.category_id;
 line_id:=public.pro_work_takeoff_uuid('pro-work-takeoff-line:'||p_estimate::text||':'||p_row.id::text);
 price:=coalesce((p_old->>'unitPriceCents')::bigint,0);
 if p_row.product_id is not null then
  select * into product from public.pro_products where user_id=p_actor and id=p_row.product_id;
  -- A new link (or a line never sent) takes the item price; a price already edited in the estimate is kept.
  if found and not product.archived and (p_old is null or p_old->>'catalogProductId' is distinct from p_row.product_id) then
   price:=round(product.price*100);
   if price not between 0 and 10000000000 then raise exception 'Item price outside the estimate range' using errcode='22023';end if;
  end if;
 end if;
 return jsonb_build_object('id',line_id,'description',left(case when cat is null then p_row.name else cat||' · '||p_row.name end,2000),'unit',unit_label,
  'qtyMilli',qty::bigint,'unitPriceCents',price,'discountBps',coalesce((p_old->>'discountBps')::bigint,0),'taxBps',coalesce((p_old->>'taxBps')::bigint,0),
  'catalogProductId',case when p_row.product_id is not null and exists(select 1 from public.pro_products where user_id=p_actor and id=p_row.product_id and not archived) then to_jsonb(p_row.product_id) else coalesce(p_old->'catalogProductId','null'::jsonb) end)
  -- Round 4A: a re-sent measurement keeps the line's internal cost and section.
  ||jsonb_strip_nulls(jsonb_build_object('unitCostCents',case when jsonb_typeof(p_old->'unitCostCents')='number' then p_old->'unitCostCents' end,'group',case when jsonb_typeof(p_old->'group')='string' then p_old->'group' end));
end $$;
revoke all on function pro_private_estimate_totals(jsonb),public.pro_work_takeoff_line(uuid,uuid,public.pro_work_takeoff_measurements,jsonb,boolean) from public,anon,authenticated;
grant execute on function pro_private_estimate_totals(jsonb),public.pro_work_takeoff_line(uuid,uuid,public.pro_work_takeoff_measurements,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
