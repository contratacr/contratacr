-- LOCAL ONLY. Apply through the guarded local preparation script, never remotely.
-- Atomic backfill with immutable original snapshots and a compatibility view.
begin;
lock table public.pro_workspaces in access exclusive mode;
alter table public.pro_workspaces rename to pro_workspace_core;
create table public.pro_workspace_legacy_backup (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 document jsonb not null, revision integer not null, saved_at timestamptz not null default now()
);
insert into public.pro_workspace_legacy_backup(user_id,document,revision)
 select user_id,document,revision from public.pro_workspace_core;
create table public.pro_clients (
 user_id uuid not null references public.pro_workspace_core(user_id) on delete cascade,
 position bigint generated always as identity,
 "id" text not null,
 "name" text not null,
 "email" text not null,
 "phone" text not null,
 "notes" text not null,
 "archived" boolean not null,
 "identification" text,
 "tradeName" text,
 "group" text,
 "address" text,
 primary key(user_id,id)
);
create index pro_clients_page on public.pro_clients(user_id,archived,id);
create table public.pro_products (
 user_id uuid not null references public.pro_workspace_core(user_id) on delete cascade,
 position bigint generated always as identity,
 "id" text not null,
 "sku" text not null,
 "name" text not null,
 "stock" numeric not null,
 "minimum" numeric not null,
 "cost" numeric not null,
 "price" numeric not null,
 "archived" boolean not null,
 "category" text,
 "unit" text,
 "cabys" text,
 "itemType" text check("itemType" in ('product','service')),
 check("itemType" is distinct from 'service' or stock=0 and minimum=0),
 primary key(user_id,id),
 check(stock>=0 and minimum>=0 and cost>=0 and price>=0)
);
create index pro_products_page on public.pro_products(user_id,archived,id);
create table public.pro_movements (
 user_id uuid not null references public.pro_workspace_core(user_id) on delete cascade,
 position bigint generated always as identity,
 "id" text not null,
 "productId" text not null,
 "delta" numeric not null,
 "reason" text not null,
 "at" text not null,
 primary key(user_id,id),
 foreign key(user_id,"productId") references public.pro_products(user_id,id),
 check(delta<>0)
);
create index pro_movements_product_page on public.pro_movements(user_id,"productId",id);
create unique index pro_clients_identification on public.pro_clients(user_id,identification) where identification is not null and identification<>'';
create unique index pro_products_sku on public.pro_products(user_id,lower(sku));
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
create function public.pro_store_catalog(p_user uuid,p_document jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from pro_clients old where user_id=p_user and not exists(select 1 from jsonb_array_elements(coalesce(p_document->'clients','[]')) r where r->>'id'=old.id)) then
 raise exception 'Catalog history cannot be deleted'; end if;
 if exists(select 1 from pro_products old where user_id=p_user and not exists(select 1 from jsonb_array_elements(coalesce(p_document->'products','[]')) r where r->>'id'=old.id)) then
 raise exception 'Catalog history cannot be deleted'; end if;
 if exists(select 1 from pro_movements old where user_id=p_user and not exists(select 1 from jsonb_array_elements(coalesce(p_document->'movements','[]')) r where r->>'id'=old.id)) then
 raise exception 'Catalog history cannot be deleted'; end if;
 if exists(select 1 from pro_movements old join jsonb_array_elements(coalesce(p_document->'movements','[]')) r on r->>'id'=old.id where old.user_id=p_user and (to_jsonb(old)-'user_id'-'position')<>r) then raise exception 'Immutable stock history'; end if;
 perform pro_upsert_catalog(p_user,p_document);
end $$;
-- Backfill before removing arrays; any error rolls the entire migration back.
do $$ declare r record; begin
 for r in select user_id,document from pro_workspace_core loop
 perform pro_store_catalog(r.user_id,r.document);
 end loop;
end $$;
update public.pro_workspace_core set document=document-'clients'-'products'-'movements';
create view public.pro_workspaces with (security_invoker=true) as
 select w.user_id,w.document || jsonb_build_object(
 'clients',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_clients r where r.user_id=w.user_id),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_products r where r.user_id=w.user_id),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') order by position) from public.pro_movements r where r.user_id=w.user_id),'[]'::jsonb) ) as document,w.revision,w.updated_at from public.pro_workspace_core w;
-- Exact JSONB equality includes IDs, optional fields, array order and all history.
do $$ begin
 if exists(select 1 from pro_workspace_legacy_backup b join pro_workspaces w using(user_id) where b.document<>w.document or b.revision<>w.revision) then
 raise exception 'Backfill verification failed; originals retained by rollback'; end if;
end $$;
create or replace function public.pro_save_workspace(p_user uuid,p_document jsonb,p_revision integer) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into v from pro_workspace_core where user_id=p_user for update;
 if coalesce(v,0)<>p_revision then raise exception 'revision conflict' using errcode='40001'; end if;
 v:=coalesce(v,0)+1;
 insert into pro_workspace_core(user_id,document,revision) values(p_user,p_document-'clients'-'products'-'movements',v)
 on conflict(user_id) do update set document=excluded.document,revision=excluded.revision,updated_at=now();
 perform pro_store_catalog(p_user,p_document);
 return v;
end $$;
-- Preserve service-role fixture/legacy INSERT semantics; never enable client writes.
create function public.pro_workspace_compat_insert() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.revision<>1 then raise exception 'Initial revision must be 1'; end if;
 perform pro_save_workspace(new.user_id,new.document,0);
 return new;
end $$;
create trigger pro_workspace_insert instead of insert on public.pro_workspaces
 for each row execute function public.pro_workspace_compat_insert();
alter table public.pro_clients enable row level security;
revoke all on public.pro_clients from public,anon,authenticated;
grant all on public.pro_clients to service_role;
grant select on public.pro_clients to authenticated;
create policy pro_clients_owner on public.pro_clients for select to authenticated using(user_id=(select auth.uid()));
alter table public.pro_products enable row level security;
revoke all on public.pro_products from public,anon,authenticated;
grant all on public.pro_products to service_role;
grant select on public.pro_products to authenticated;
create policy pro_products_owner on public.pro_products for select to authenticated using(user_id=(select auth.uid()));
alter table public.pro_movements enable row level security;
revoke all on public.pro_movements from public,anon,authenticated;
grant all on public.pro_movements to service_role;
grant select on public.pro_movements to authenticated;
create policy pro_movements_owner on public.pro_movements for select to authenticated using(user_id=(select auth.uid()));
alter table public.pro_workspace_legacy_backup enable row level security;
revoke all on public.pro_workspace_legacy_backup from public,anon,authenticated;
grant all on public.pro_workspace_legacy_backup to service_role;
grant usage,select on sequence public.pro_clients_position_seq,public.pro_products_position_seq,public.pro_movements_position_seq to service_role;
revoke all on public.pro_workspaces from public,anon,authenticated;
grant select on public.pro_workspaces to authenticated;
grant select,insert on public.pro_workspaces to service_role;
revoke all on function public.pro_upsert_catalog(uuid,jsonb),public.pro_store_catalog(uuid,jsonb),public.pro_workspace_compat_insert() from public,anon,authenticated;
grant execute on function public.pro_upsert_catalog(uuid,jsonb),public.pro_store_catalog(uuid,jsonb),public.pro_workspace_compat_insert() to service_role;
notify pgrst,'reload schema';
commit;
