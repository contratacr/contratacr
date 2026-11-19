-- LOCAL PRO ONLY. Round 9 (2026-11-15): selection options from the company catalog (row 62).
-- «Agregar desde el catálogo» creates a normal option through the EXISTING selections writer
-- (pro_work_selections_mutate 'option_add', option id = actionId, so a retry never duplicates) with the
-- catalog item's name, price (CRC cents) and preferred vendor (as brand), and records its source:
-- product id, a snapshot of what was copied, and a private COPY of the catalog image (bucket
-- `pro-selection-catalog-images`, SHA-256 checked) so replacing the catalog image never changes an
-- option the customer saw. The customer sees that image like any option photo (same authorisation as
-- pro_work_selection_image). Approvals, allowance links and totals are unchanged (no double counting:
-- options are not costs; only the explicit allowance decision records an amount). RLS + service_role-only.
begin;
create table if not exists public.pro_work_selection_option_sources(
 owner_id uuid not null references public.profiles(id) on delete cascade,option_id uuid not null,product_id text not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 image_path text check(image_path is null or image_path~'^[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$'),
 image_sha256 text check(image_sha256 is null or image_sha256~'^[a-f0-9]{64}$'),image_size integer check(image_size is null or image_size between 1 and 20971520),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,option_id),foreign key(owner_id,option_id) references public.pro_work_selection_options(owner_id,id) on delete cascade,
 check((image_path is null)=(image_sha256 is null) and (image_path is null)=(image_size is null)),
 check(image_path is null or split_part(image_path,'/',1)=owner_id::text and split_part(image_path,'/',2)=option_id::text||'.jpg'));

-- What the server needs before copying: the catalog item (not archived), its price and vendor, and its image.
create or replace function public.pro_work_selection_catalog_prepare(p_actor uuid,p_work text,p_product text,p_option uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.pro_products;d public.pro_product_details;vendor text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_option is null or p_product is null or length(p_product) not between 1 and 160 or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Invalid catalog option' using errcode='22023';end if;
 select * into p from public.pro_products where user_id=p_actor and id=p_product and not archived;
 if not found then return null;end if;
 select * into d from public.pro_product_details where user_id=p_actor and product_id=p_product;
 select s.name into vendor from public.pro_expense_suppliers s where s.user_id=p_actor and s.id=d.preferred_vendor_id;
 return jsonb_build_object('productId',p.id,'sku',p.sku,'name',left(p.name,160),'unit',p.unit,'unitCents',round(p.price*100)::bigint,'vendor',vendor,
  'image',case when d.image_path is null then null else jsonb_build_object('objectPath',d.image_path,'sha256',d.image_sha256,'sizeBytes',d.image_size) end,
  'targetPath',case when d.image_path is null then null else p_actor::text||'/'||p_option::text||'.jpg' end);
end $$;

create or replace function public.pro_work_selection_option_from_catalog(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;prep jsonb;result jsonb;img jsonb;existing public.pro_work_selection_option_sources;
begin
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['actionId','id','image','productId','quantity','revision','workId'] or not coalesce(p_input->>'actionId','')~'^[0-9a-f-]{36}$' then raise exception 'Invalid catalog option' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('pro-selection-catalog:'||p_actor::text||':'||aid::text,0));
 select * into existing from public.pro_work_selection_option_sources where owner_id=p_actor and option_id=aid;
 if found and existing.product_id<>p_input->>'productId' then raise exception 'Action id reused' using errcode='22023';end if;
 prep:=public.pro_work_selection_catalog_prepare(p_actor,p_input->>'workId',p_input->>'productId',aid);
 if prep is null and not found then raise exception 'Catalog item unavailable' using errcode='40001';end if;
 -- The existing writer: same checks, CAS on the item revision, idempotent receipt by actionId.
 result:=public.pro_work_selections_mutate(p_actor,jsonb_build_object('action','option_add','actionId',aid,'workId',p_input->>'workId','id',p_input->>'id','revision',p_input->'revision',
  'optionId',aid,'name',coalesce(existing.snapshot->>'name',prep->>'name'),'brand',coalesce(existing.snapshot->'vendor',prep->'vendor'),'url',null,'quantity',p_input->'quantity',
  'unitCents',coalesce((existing.snapshot->>'unitCents')::bigint,(prep->>'unitCents')::bigint),'clientNotes',null,'imageFileId',null));
 if existing.option_id is null then
  img:=p_input->'image';
  if jsonb_typeof(img)='object' and (img->>'path'<>prep->>'targetPath' or not coalesce(img->>'sha256','')~'^[a-f0-9]{64}$' or not coalesce(img->>'sizeBytes','')~'^[0-9]{1,8}$') then raise exception 'Invalid image copy' using errcode='22023';end if;
  insert into public.pro_work_selection_option_sources(owner_id,option_id,product_id,snapshot,image_path,image_sha256,image_size)
   values(p_actor,aid,p_input->>'productId',prep-'image'-'targetPath',case when jsonb_typeof(img)='object' then img->>'path' end,case when jsonb_typeof(img)='object' then img->>'sha256' end,case when jsonb_typeof(img)='object' then (img->>'sizeBytes')::integer end);
 end if;
 return result; -- same answer shape as the writer (the source is read with pro_work_selection_sources_read)
end $$;
-- Owner: which options of a job came from the catalog (for the «Del catálogo» mark).
create or replace function public.pro_work_selection_sources_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('sources',coalesce((select jsonb_agg(jsonb_build_object('optionId',s.option_id,'productId',s.product_id,'sku',s.snapshot->>'sku','hasImage',s.image_path is not null) order by s.created_at)
  from public.pro_work_selection_option_sources s join public.pro_work_selection_options o on o.owner_id=s.owner_id and o.id=s.option_id where s.owner_id=p_actor and o.work_id=p_work),'[]'::jsonb));
end $$;

-- Customer view: an option with a catalog image shows it like any option photo.
create or replace function public.pro_work_selection_client_item_json(p_row public.pro_work_selection_items) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'areaId',p_row.area_id,'name',p_row.name,'dueDate',p_row.due_date,'state',public.pro_work_selection_state(p_row),
  'approvedOptionId',p_row.approved_option_id,'approvedAt',p_row.approved_at,'clientComment',p_row.client_comment,'recommendedOptionId',p_row.recommended_option_id,'revision',p_row.revision,
  'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'brand',o.brand,'url',o.url,'quantity',o.quantity,'unitCents',o.unit_cents,'totalCents',o.total_cents,
   'clientNotes',o.client_notes,'hasImage',o.image_file_id is not null or exists(select 1 from public.pro_work_selection_option_sources s where s.owner_id=o.owner_id and s.option_id=o.id and s.image_path is not null)) order by o.position) from public.pro_work_selection_options o where o.owner_id=p_row.owner_id and o.item_id=p_row.id and not o.archived),'[]'::jsonb));
$$;
-- Image of a catalog option (same authorisation as pro_work_selection_image).
create or replace function public.pro_work_selection_catalog_image(p_actor uuid,p_option uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare o public.pro_work_selection_options;i public.pro_work_selection_items;s public.pro_work_selection_option_sources;allowed boolean:=false;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into o from public.pro_work_selection_options where id=p_option and not archived and image_file_id is null;
 if not found then return null;end if;
 select * into i from public.pro_work_selection_items where owner_id=o.owner_id and id=o.item_id;
 if o.owner_id=p_actor then
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
  allowed:=true;
 else
  allowed:=i.published and not i.archived
   and exists(select 1 from public.pro_work_selection_areas a where a.owner_id=i.owner_id and a.id=i.area_id and not a.archived)
   and exists(select 1 from public.pro_appointment_requests r join public.pro_client_dashboards d on d.owner_id=r.owner_id and d.work_id=r.work_id
    where r.owner_id=o.owner_id and r.work_id=o.work_id and r.client_user_id=p_actor and r.status in('confirmed','completed') and d.show_selections);
 end if;
 if not allowed then return null;end if;
 select * into s from public.pro_work_selection_option_sources where owner_id=o.owner_id and option_id=o.id and image_path is not null;
 if not found then return null;end if;
 return jsonb_build_object('objectPath',s.image_path,'mimeType','image/jpeg','sizeBytes',s.image_size,'sha256',s.image_sha256);
end $$;

create or replace function public.pro_work_selection_sources_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Selection catalog sources are immutable' using errcode='23514';end $$;
do $$declare f record;begin
 alter table public.pro_work_selection_option_sources enable row level security;
 revoke all on public.pro_work_selection_option_sources from public,anon,authenticated;grant select,insert,update,delete on public.pro_work_selection_option_sources to service_role;
 drop trigger if exists pro_work_selection_sources_immutable on public.pro_work_selection_option_sources;
 create trigger pro_work_selection_sources_immutable before update on public.pro_work_selection_option_sources for each row execute function public.pro_work_selection_sources_immutable();
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_work_selection_catalog_prepare','pro_work_selection_option_from_catalog','pro_work_selection_sources_read','pro_work_selection_catalog_image','pro_work_selection_client_item_json','pro_work_selection_sources_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-selection-catalog-images','pro-selection-catalog-images',false,20971520,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  if not exists(select 1 from storage.buckets where id='pro-selection-catalog-images' and not public) then raise exception 'Selection catalog images bucket configuration';end if;
 end if;
end $$;
commit;
notify pgrst,'reload schema';
