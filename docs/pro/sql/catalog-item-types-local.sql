-- LOCAL ONLY: additive item type, without reclassifying or rewriting existing records.
begin;
alter table public.pro_products add column if not exists "itemType" text;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='pro_products'::regclass and conname='pro_products_item_type_valid') then
 alter table pro_products add constraint pro_products_item_type_valid check("itemType" is null or "itemType" in ('product','service'));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='pro_products'::regclass and conname='pro_products_service_no_stock') then
 alter table pro_products add constraint pro_products_service_no_stock check("itemType" is distinct from 'service' or stock=0 and minimum=0);
 end if;
end $$;
create index if not exists pro_products_type_page on pro_products(user_id,coalesce("itemType",'product'),archived,id);
create or replace function public.pro_upsert_catalog(p_user uuid,p_document jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into pro_clients(user_id,"id","name","email","phone","notes","archived","identification","tradeName","group","address")
 select p_user,"id","name","email","phone","notes","archived","identification","tradeName","group","address" from jsonb_to_recordset(coalesce(p_document->'clients','[]')) as r("id" text,"name" text,"email" text,"phone" text,"notes" text,"archived" boolean,"identification" text,"tradeName" text,"group" text,"address" text)
 on conflict(user_id,id) do update set
 "name"=excluded."name","email"=excluded."email","phone"=excluded."phone","notes"=excluded."notes","archived"=excluded."archived","identification"=excluded."identification","tradeName"=excluded."tradeName","group"=excluded."group","address"=excluded."address"
 where (to_jsonb(pro_clients)-'position') is distinct from (to_jsonb(excluded)-'position');
 insert into pro_products(user_id,"id","sku","name","stock","minimum","cost","price","archived","category","unit","cabys","itemType")
 select p_user,"id","sku","name","stock","minimum","cost","price","archived","category","unit","cabys","itemType" from jsonb_to_recordset(coalesce(p_document->'products','[]')) as r("id" text,"sku" text,"name" text,"stock" numeric,"minimum" numeric,"cost" numeric,"price" numeric,"archived" boolean,"category" text,"unit" text,"cabys" text,"itemType" text)
 on conflict(user_id,id) do update set
 "sku"=excluded."sku","name"=excluded."name","stock"=excluded."stock","minimum"=excluded."minimum","cost"=excluded."cost","price"=excluded."price","archived"=excluded."archived","category"=excluded."category","unit"=excluded."unit","cabys"=excluded."cabys","itemType"=coalesce(excluded."itemType",pro_products."itemType")
 where (to_jsonb(pro_products)-'position') is distinct from (to_jsonb(excluded)-'position');
 insert into pro_movements(user_id,"id","productId","delta","reason","at")
 select p_user,"id","productId","delta","reason","at" from jsonb_to_recordset(coalesce(p_document->'movements','[]')) as r("id" text,"productId" text,"delta" numeric,"reason" text,"at" text)
 on conflict(user_id,id) do update set
 "productId"=excluded."productId","delta"=excluded."delta","reason"=excluded."reason","at"=excluded."at"
 where (to_jsonb(pro_movements)-'position') is distinct from (to_jsonb(excluded)-'position');
end $$;

create or replace function public.pro_keep_catalog_type() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
  -- Null is how pre-discriminator writers represent omission. Preserve an existing explicit type.
  if new."itemType" is null then new."itemType":=old."itemType";end if;
  if coalesce(new."itemType",'product')<>coalesce(old."itemType",'product') then raise exception 'Catalog item type is immutable' using errcode='22023';end if;
 end if;
 if new."itemType"='service' and (new.stock<>0 or new.minimum<>0) then raise exception 'Services have no stock' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists pro_keep_catalog_type on pro_products;
create trigger pro_keep_catalog_type before insert or update on pro_products for each row execute function pro_keep_catalog_type();
create or replace function public.pro_require_stock_item() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare item text;
begin
 if tg_table_name='pro_movements' then item:=new."productId";else item:=new.product_id;end if;
 if item is not null and exists(select 1 from pro_products where user_id=new.user_id and id=item and "itemType"='service') then raise exception 'A service cannot reference stock' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists pro_require_stock_item on pro_movements;
create trigger pro_require_stock_item before insert or update on pro_movements for each row execute function pro_require_stock_item();
-- On a fresh preparation invoice tables appear later; the preparer reapplies this file at the end.
do $$ begin
 if to_regclass('public.pro_invoice_edited_lines') is not null then
 execute 'drop trigger if exists pro_require_stock_item on pro_invoice_edited_lines';
 execute 'create trigger pro_require_stock_item before insert or update on pro_invoice_edited_lines for each row execute function pro_require_stock_item()';
 end if;
end $$;
revoke all on function pro_keep_catalog_type(),pro_require_stock_item(),pro_upsert_catalog(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_keep_catalog_type(),pro_require_stock_item(),pro_upsert_catalog(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
