-- LOCAL ONLY: atomic, bounded catalog writes sharing the legacy workspace revision.
begin;
create or replace function public.pro_mutate_catalog(p_user uuid,p_kind text,p_rows jsonb,p_revision integer,p_movements jsonb default '[]',p_importing boolean default false) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integer; changed_row jsonb; old_stock numeric; old_type text; adjustment numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into v from pro_workspace_core where user_id=p_user for update;
 if coalesce(v,0)<>p_revision then raise exception 'revision conflict' using errcode='40001'; end if;
 if p_kind not in ('clients','products') or jsonb_array_length(p_rows) not between 1 and 500 or jsonb_array_length(p_movements)>1 then raise exception 'Invalid catalog mutation' using errcode='22023'; end if;
 if (select count(*)<>count(distinct r->>'id') from jsonb_array_elements(p_rows) r) then raise exception 'Duplicate IDs' using errcode='22023'; end if;
 if p_kind='clients' and jsonb_array_length(p_movements)>0 or p_importing and jsonb_array_length(p_movements)>0 then raise exception 'Invalid movement' using errcode='22023'; end if;
 if p_importing and exists(select 1 from jsonb_array_elements(p_rows) r where
 (p_kind='clients' and exists(select 1 from pro_clients where user_id=p_user and id=r->>'id')) or
 (p_kind='products' and exists(select 1 from pro_products where user_id=p_user and id=r->>'id'))) then raise exception 'Import cannot overwrite existing rows' using errcode='23505'; end if;
 if (select count(*) from jsonb_array_elements(p_rows) r where not exists(select 1 from pro_clients where user_id=p_user and id=r->>'id')) + (select count(*) from pro_clients where user_id=p_user)>10000 and p_kind='clients' then raise exception 'Catalog limit' using errcode='22023'; end if;
 if (select count(*) from jsonb_array_elements(p_rows) r where not exists(select 1 from pro_products where user_id=p_user and id=r->>'id')) + (select count(*) from pro_products where user_id=p_user)>10000 and p_kind='products' then raise exception 'Catalog limit' using errcode='22023'; end if;
 for changed_row in select * from jsonb_array_elements(p_movements) loop
 if exists(select 1 from pro_movements where user_id=p_user and id=changed_row->>'id') or not exists(select 1 from jsonb_array_elements(p_rows) p join pro_products old on old.user_id=p_user and old.id=p->>'id' where p->>'id'=changed_row->>'productId' and not old.archived and not (p->>'archived')::boolean and coalesce(old."itemType",'product')='product' and coalesce(p->>'itemType',old."itemType",'product')='product') then raise exception 'Invalid stock history' using errcode='22023'; end if;
 end loop;
 if p_kind='products' then
 for changed_row in select * from jsonb_array_elements(p_rows) loop
 select stock,"itemType" into old_stock,old_type from pro_products where user_id=p_user and id=changed_row->>'id';
 if old_stock is not null and changed_row ? 'itemType' and coalesce(changed_row->>'itemType',old_type,'product')<>coalesce(old_type,'product') then raise exception 'Catalog item type is immutable' using errcode='22023';end if;
 if coalesce(changed_row->>'itemType',old_type,'product')='service' and ((changed_row->>'stock')::numeric<>0 or (changed_row->>'minimum')::numeric<>0) then raise exception 'Services have no stock' using errcode='22023';end if;
 select coalesce(sum((m->>'delta')::numeric),0) into adjustment from jsonb_array_elements(p_movements) m where m->>'productId'=changed_row->>'id';
 if old_stock is not null and (changed_row->>'stock')::numeric<>(case when exists(select 1 from jsonb_array_elements(p_movements) m where m->>'productId'=changed_row->>'id') then round(old_stock+adjustment,3) else old_stock end) then raise exception 'Stock requires a matching movement' using errcode='22023'; end if;
 end loop;
 end if;
 v:=coalesce(v,0)+1;
 insert into pro_workspace_core(user_id,document,revision) values(p_user,'{"version":1,"social":[]}',v)
 on conflict(user_id) do update set revision=v,updated_at=now();
 perform pro_upsert_catalog(p_user,jsonb_build_object(p_kind,p_rows,'movements',p_movements));
 return v;
end $$;
revoke all on function public.pro_upsert_catalog(uuid,jsonb),public.pro_mutate_catalog(uuid,text,jsonb,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pro_upsert_catalog(uuid,jsonb),public.pro_mutate_catalog(uuid,text,jsonb,integer,jsonb,boolean) to service_role;
revoke all on public.pro_workspaces from public,anon,authenticated;
grant select on public.pro_workspaces to authenticated;
notify pgrst,'reload schema';
commit;
