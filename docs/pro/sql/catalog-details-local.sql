-- LOCAL PRO ONLY. Round 7C (2026-11-13): catalog item image and preferred vendor.
-- A side table keyed by the catalog item (pro_products) so the generic catalog writer and its rows
-- stay unchanged. The preferred vendor comes from the vendor directory (pro_expense_suppliers, the
-- same list as Proveedores). The image is a private JPEG normalized on the server (same pattern as
-- the company files: base64 body → sharp → private bucket <owner>/<image>.jpg, SHA-256 checked on
-- read); the size limit is the shared Pro file limit (see file-size-limits-local.sql).
-- Patterns: RLS, service_role-only, security invoker, CAS revision (40001), idempotent actionId,
-- immutable history.
begin;
create table if not exists public.pro_product_details(
 user_id uuid not null,product_id text not null,
 preferred_vendor_id uuid,
 image_id uuid,image_path text check(image_path is null or image_path~'^[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$'),
 image_sha256 text check(image_sha256 is null or image_sha256~'^[a-f0-9]{64}$'),image_size integer check(image_size is null or image_size between 1 and 20971520),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 primary key(user_id,product_id),
 foreign key(user_id,product_id) references public.pro_products(user_id,id) on delete cascade,
 foreign key(user_id,preferred_vendor_id) references public.pro_expense_suppliers(user_id,id) on delete set null (preferred_vendor_id),
 check((image_id is null)=(image_path is null) and (image_id is null)=(image_sha256 is null) and (image_id is null)=(image_size is null)),
 check(image_path is null or split_part(image_path,'/',1)=user_id::text and split_part(image_path,'/',2)=image_id::text||'.jpg'));
create table if not exists public.pro_product_detail_history(
 user_id uuid not null,product_id text not null,action_id uuid not null,action text not null check(action in('set_vendor','set_image','remove_image')),
 before_state jsonb,after_state jsonb not null,at timestamptz not null default now(),primary key(user_id,action_id));
create table if not exists public.pro_product_detail_actions(
 user_id uuid not null,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default now(),primary key(user_id,action_id));

create or replace function public.pro_product_detail_json(p_user uuid,p_product text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('productId',p_product,'revision',coalesce(d.revision,0),'vendorId',d.preferred_vendor_id,
  'vendorName',(select s.name from public.pro_expense_suppliers s where s.user_id=p_user and s.id=d.preferred_vendor_id),
  'imageId',d.image_id,'imageSize',d.image_size)
 from (select 1) one left join public.pro_product_details d on d.user_id=p_user and d.product_id=p_product
$$;
create or replace function public.pro_product_details_read(p_user uuid,p_products text[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_user),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_products is null or cardinality(p_products)>50 then raise exception 'Invalid products' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(p.id,public.pro_product_detail_json(p_user,p.id)) from public.pro_products p where p.user_id=p_user and p.id=any(p_products)),'{}'::jsonb);
end $$;
create or replace function public.pro_product_image_read(p_user uuid,p_product text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d public.pro_product_details;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_user),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into d from public.pro_product_details where user_id=p_user and product_id=p_product and image_id is not null;
 if not found then return null;end if;
 return jsonb_build_object('objectPath',d.image_path,'sha256',d.image_sha256,'sizeBytes',d.image_size,'imageId',d.image_id);
end $$;
-- Returns {result, previousPath} so the route can delete a replaced image's bytes after commit.
create or replace function public.pro_product_details_mutate(p_user uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;pid text:=p_input->>'productId';keys text[];hash text:=md5(p_input::text);prior public.pro_product_detail_actions;d public.pro_product_details;before_state jsonb;answer jsonb;previous text;vendor uuid;img uuid;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_user),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if act='set_vendor' and keys is distinct from array['action','actionId','productId','revision','vendorId']
  or act='set_image' and keys is distinct from array['action','actionId','imageId','objectPath','productId','revision','sha256','sizeBytes']
  or act='remove_image' and keys is distinct from array['action','actionId','productId','revision']
  or act is null or act not in('set_vendor','set_image','remove_image') or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid catalog item details' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-product-details:'||p_user::text||':'||coalesce(pid,''),0));
 select * into prior from public.pro_product_detail_actions where user_id=p_user and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if not exists(select 1 from public.pro_products where user_id=p_user and id=pid) then raise exception 'Catalog item unavailable' using errcode='P0002';end if;
 select * into d from public.pro_product_details where user_id=p_user and product_id=pid for update;
 if coalesce(d.revision,0)<>(p_input->>'revision')::integer then raise exception 'Catalog item changed' using errcode='40001';end if;
 before_state:=public.pro_product_detail_json(p_user,pid);
 if act='set_vendor' then
  begin vendor:=nullif(p_input->>'vendorId','')::uuid;exception when others then raise exception 'Invalid vendor' using errcode='22023';end;
  if vendor is not null and not exists(select 1 from public.pro_expense_suppliers where user_id=p_user and id=vendor and not coalesce(archived,false)) then raise exception 'Vendor unavailable' using errcode='22023';end if;
  insert into public.pro_product_details(user_id,product_id,preferred_vendor_id) values(p_user,pid,vendor)
  on conflict(user_id,product_id) do update set preferred_vendor_id=excluded.preferred_vendor_id,revision=public.pro_product_details.revision+1,updated_at=now();
 elsif act='set_image' then
  begin img:=(p_input->>'imageId')::uuid;exception when others then raise exception 'Invalid image' using errcode='22023';end;
  if p_input->>'objectPath'<>p_user::text||'/'||img::text||'.jpg' or coalesce(p_input->>'sha256','')!~'^[a-f0-9]{64}$' or jsonb_typeof(p_input->'sizeBytes')<>'number' or (p_input->>'sizeBytes')::integer not between 1 and 20971520 then raise exception 'Invalid image' using errcode='22023';end if;
  previous:=d.image_path;
  insert into public.pro_product_details(user_id,product_id,image_id,image_path,image_sha256,image_size) values(p_user,pid,img,p_input->>'objectPath',p_input->>'sha256',(p_input->>'sizeBytes')::integer)
  on conflict(user_id,product_id) do update set image_id=excluded.image_id,image_path=excluded.image_path,image_sha256=excluded.image_sha256,image_size=excluded.image_size,revision=public.pro_product_details.revision+1,updated_at=now();
 else
  if d.image_id is null then raise exception 'No image' using errcode='22023';end if;previous:=d.image_path;
  update public.pro_product_details set image_id=null,image_path=null,image_sha256=null,image_size=null,revision=revision+1,updated_at=now() where user_id=p_user and product_id=pid;
 end if;
 answer:=jsonb_build_object('detail',public.pro_product_detail_json(p_user,pid),'previousPath',previous);
 insert into public.pro_product_detail_history(user_id,product_id,action_id,action,before_state,after_state) values(p_user,pid,aid,act,before_state,answer->'detail');
 insert into public.pro_product_detail_actions(user_id,action_id,input_hash,result) values(p_user,aid,hash,answer);
 return answer;
end $$;
create or replace function public.pro_product_details_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Immutable catalog item history' using errcode='23514';end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_product_details','pro_product_detail_history','pro_product_detail_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_product_detail_history','pro_product_detail_actions'] loop
  execute format('drop trigger if exists pro_product_details_immutable on public.%I',t);execute format('create trigger pro_product_details_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_product_details_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_product_detail_json','pro_product_details_read','pro_product_image_read','pro_product_details_mutate','pro_product_details_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-catalog-images','pro-catalog-images',false,20971520,array['image/jpeg']) on conflict(id) do update set file_size_limit=excluded.file_size_limit;
  if not exists(select 1 from storage.buckets where id='pro-catalog-images' and not public and file_size_limit=20971520 and allowed_mime_types=array['image/jpeg']) then raise exception 'Catalog image bucket is not private JPEG 20 MiB';end if;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
