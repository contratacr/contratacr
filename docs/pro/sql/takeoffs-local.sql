-- LOCAL PRO ONLY. Mediciones sobre planos (row 66 of the parity register).
-- Per job (pro_work): plans → pages → measurements (area, length, count).
-- Plan images reuse the existing private job files (pro_work_files, bucket
-- pro-work-files): no new bucket. Only JPEG files (the work-files upload
-- normalizes JPEG/PNG/WebP to JPEG) can be a plan; PDF stays pending until a
-- PDF renderer is available (see docs/pro/takeoffs-local.md).
-- Geometry is stored as integer millionths of the page (0..1000000 for 0..1)
-- plus the page size in pixels. Results are computed here, in numeric, and
-- returned as integer thousandths (milli-units). No floats are stored.
-- "Send to estimate" writes lines through the existing private estimate writer
-- (pro_private_estimate_mutate); nothing here publishes, charges, invoices or
-- notifies anyone. The customer view never reads these tables.
begin;
create table if not exists public.pro_work_takeoff_plans(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 file_id uuid not null,position bigint generated always as identity,
 title text not null check(title=btrim(title) and length(title) between 1 and 160),
 page_count integer not null default 1 check(page_count between 1 and 200),
 archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,work_id,id),unique(owner_id,file_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 -- Reuses the private job files: only a file of this same job can be a plan.
 foreign key(owner_id,work_id,file_id) references public.pro_work_files(owner_id,work_id,id) on delete cascade
);
create unique index if not exists pro_work_takeoff_plan_global_id on public.pro_work_takeoff_plans(id);
create index if not exists pro_work_takeoff_plan_page on public.pro_work_takeoff_plans(owner_id,work_id,position);
create table if not exists public.pro_work_takeoff_pages(
 owner_id uuid not null,plan_id uuid not null,page_number integer not null check(page_number between 1 and 200),
 width_px integer not null check(width_px between 1 and 20000),height_px integer not null check(height_px between 1 and 20000),
 unit text not null default 'm' check(unit in('m','ft')),
 cal_x1 integer check(cal_x1 between 0 and 1000000),cal_y1 integer check(cal_y1 between 0 and 1000000),
 cal_x2 integer check(cal_x2 between 0 and 1000000),cal_y2 integer check(cal_y2 between 0 and 1000000),
 cal_length_milli bigint check(cal_length_milli between 1 and 1000000),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),
 primary key(owner_id,plan_id,page_number),
 foreign key(owner_id,plan_id) references public.pro_work_takeoff_plans(owner_id,id) on delete cascade,
 check((cal_x1 is null and cal_y1 is null and cal_x2 is null and cal_y2 is null and cal_length_milli is null)
  or (cal_x1 is not null and cal_y1 is not null and cal_x2 is not null and cal_y2 is not null and cal_length_milli is not null))
);
create table if not exists public.pro_work_takeoff_measurements(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 plan_id uuid not null,page_number integer not null,position bigint generated always as identity,
 kind text not null check(kind in('area','length','count')),
 name text not null check(name=btrim(name) and length(name) between 1 and 120),
 category_id uuid,color text not null check(color~'^#[0-9a-f]{6}$'),hidden boolean not null default false,
 points jsonb not null default '[]'::jsonb check(jsonb_typeof(points)='array' and jsonb_array_length(points)<=400),
 manual_milli bigint check(manual_milli between 1 and 1000000000000),
 multiplier_mode text not null default 'none' check(multiplier_mode in('none','height','factor')),
 multiplier_milli bigint check(multiplier_milli between 1 and 100000000),
 waste_bps integer not null default 0 check(waste_bps between 0 and 10000),
 product_id text,archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,work_id,plan_id) references public.pro_work_takeoff_plans(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,plan_id,page_number) references public.pro_work_takeoff_pages(owner_id,plan_id,page_number) on delete cascade,
 check((multiplier_mode='none')=(multiplier_milli is null)),
 check(multiplier_mode<>'height' or kind='length'),
 -- Either drawn points or a value typed without a pointer, never both.
 check((manual_milli is null)=(jsonb_array_length(points)>0))
);
create unique index if not exists pro_work_takeoff_measurement_global_id on public.pro_work_takeoff_measurements(id);
create index if not exists pro_work_takeoff_measurement_page on public.pro_work_takeoff_measurements(owner_id,work_id,position);
create table if not exists public.pro_work_takeoff_history(
 owner_id uuid not null,work_id text not null,action_id uuid not null,actor_id uuid not null,
 action text not null check(action in('plan_create','plan_update','plan_archive','plan_restore','page_calibrate','measurement_create','measurement_update','measurement_visibility','measurement_archive','measurement_restore','send_estimate')),
 target_kind text not null check(target_kind in('plan','page','measurement','estimate')),target_id text not null,
 before_value jsonb,after_value jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_work_takeoff_history_page on public.pro_work_takeoff_history(owner_id,work_id,at desc);
create table if not exists public.pro_work_takeoff_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);

-- Deterministic id with the RFC 4122 version-4 layout (accepted by strict uuid validators).
create or replace function public.pro_work_takeoff_uuid(p_seed text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select md5(p_seed) h) x;
$$;
-- Normalized point list: [[x,y],...] with 0<=x,y<=1 and at most 6 decimals → integer millionths.
create or replace function public.pro_work_takeoff_points(p_value jsonb,p_min integer,p_max integer) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare p jsonb;x numeric;y numeric;out_points jsonb:='[]'::jsonb;
begin
 if jsonb_typeof(p_value) is distinct from 'array' or jsonb_array_length(p_value) not between p_min and p_max then raise exception 'Invalid points' using errcode='22023';end if;
 for p in select value from jsonb_array_elements(p_value) loop
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)<>2 or jsonb_typeof(p->0) is distinct from 'number' or jsonb_typeof(p->1) is distinct from 'number' then raise exception 'Invalid point' using errcode='22023';end if;
  x:=(p->>0)::numeric;y:=(p->>1)::numeric;
  if x not between 0 and 1 or y not between 0 and 1 or x*1000000<>round(x*1000000) or y*1000000<>round(y*1000000) then raise exception 'Invalid point' using errcode='22023';end if;
  out_points:=out_points||jsonb_build_array(jsonb_build_array((x*1000000)::integer,(y*1000000)::integer));
 end loop;
 return out_points;
end $$;
-- Pixel distance between two stored points of a page of width×height pixels.
create or replace function public.pro_work_takeoff_px_distance(p_x1 integer,p_y1 integer,p_x2 integer,p_y2 integer,p_w integer,p_h integer) returns numeric
language sql immutable security invoker set search_path=public,pg_temp as $$
 select sqrt(power((p_x2-p_x1)::numeric*p_w/1000000,2)+power((p_y2-p_y1)::numeric*p_h/1000000,2));
$$;
-- Sum of segment lengths (open polyline) in pixels.
create or replace function public.pro_work_takeoff_px_length(p_points jsonb,p_w integer,p_h integer) returns numeric
language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(sum(public.pro_work_takeoff_px_distance(a.x,a.y,a.nx,a.ny,p_w,p_h)),0) from (
  select (e.value->>0)::integer x,(e.value->>1)::integer y,
   lead((e.value->>0)::integer) over(order by e.ord) nx,lead((e.value->>1)::integer) over(order by e.ord) ny
  from jsonb_array_elements(p_points) with ordinality e(value,ord)
 ) a where a.nx is not null;
$$;
-- Polygon area in square pixels (shoelace formula, closed automatically).
create or replace function public.pro_work_takeoff_px_area(p_points jsonb,p_w integer,p_h integer) returns numeric
language sql immutable security invoker set search_path=public,pg_temp as $$
 select abs(coalesce(sum(a.x::numeric*a.ny-a.nx::numeric*a.y),0))/2*p_w*p_h/1000000000000 from (
  select (e.value->>0)::integer x,(e.value->>1)::integer y,
   coalesce(lead((e.value->>0)::integer) over(order by e.ord),first_value((e.value->>0)::integer) over(order by e.ord)) nx,
   coalesce(lead((e.value->>1)::integer) over(order by e.ord),first_value((e.value->>1)::integer) over(order by e.ord)) ny
  from jsonb_array_elements(p_points) with ordinality e(value,ord)
 ) a;
$$;
-- Result of one measurement on its page, in thousandths of the unit.
-- unit: m, m2, ft, ft2 or u (units). A drawn area/length needs a calibrated page.
create or replace function public.pro_work_takeoff_result(p_row public.pro_work_takeoff_measurements,p_page public.pro_work_takeoff_pages) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare base numeric;total numeric;cal numeric;base_unit text;total_unit text;
begin
 base_unit:=case p_row.kind when 'count' then 'u' when 'area' then p_page.unit||'2' else p_page.unit end;
 total_unit:=case when p_row.multiplier_mode='height' then p_page.unit||'2' else base_unit end;
 if p_row.kind='count' then base:=coalesce(p_row.manual_milli,jsonb_array_length(p_row.points)*1000);
 elsif p_row.manual_milli is not null then base:=p_row.manual_milli;
 elsif p_page.cal_length_milli is null then
  return jsonb_build_object('baseMilli',null,'totalMilli',null,'baseUnit',base_unit,'unit',total_unit,'needsScale',true);
 else
  cal:=public.pro_work_takeoff_px_distance(p_page.cal_x1,p_page.cal_y1,p_page.cal_x2,p_page.cal_y2,p_page.width_px,p_page.height_px);
  if p_row.kind='length' then base:=round(public.pro_work_takeoff_px_length(p_row.points,p_page.width_px,p_page.height_px)*p_page.cal_length_milli/cal);
  else base:=round(public.pro_work_takeoff_px_area(p_row.points,p_page.width_px,p_page.height_px)*p_page.cal_length_milli*p_page.cal_length_milli/(cal*cal*1000));end if;
 end if;
 total:=base;
 if p_row.multiplier_mode<>'none' then total:=round(total*p_row.multiplier_milli/1000);end if;
 if p_row.waste_bps>0 then total:=round(total*(10000+p_row.waste_bps)/10000);end if;
 return jsonb_build_object('baseMilli',base,'totalMilli',total,'baseUnit',base_unit,'unit',total_unit,'needsScale',false);
end $$;
create or replace function public.pro_work_takeoff_norm(p_points jsonb) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_array(round((e.value->>0)::numeric/1000000,6),round((e.value->>1)::numeric/1000000,6)) order by e.ord),'[]'::jsonb)
 from jsonb_array_elements(p_points) with ordinality e(value,ord);
$$;
create or replace function public.pro_work_takeoff_page_json(p_page public.pro_work_takeoff_pages) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('pageNumber',p_page.page_number,'widthPx',p_page.width_px,'heightPx',p_page.height_px,'unit',p_page.unit,
  'calibration',case when p_page.cal_length_milli is null then null else jsonb_build_object(
   'points',public.pro_work_takeoff_norm(jsonb_build_array(jsonb_build_array(p_page.cal_x1,p_page.cal_y1),jsonb_build_array(p_page.cal_x2,p_page.cal_y2))),
   'lengthMilli',p_page.cal_length_milli) end,
  'revision',p_page.revision,'updatedAt',p_page.updated_at);
$$;
create or replace function public.pro_work_takeoff_plan_json(p_row public.pro_work_takeoff_plans) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'fileId',p_row.file_id,'position',p_row.position,'title',p_row.title,'pageCount',p_row.page_count,
  'fileName',f.name,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,
  'uploadedOn',to_char(p_row.created_at at time zone 'America/Costa_Rica','YYYY-MM-DD'),
  'pages',coalesce((select jsonb_agg(public.pro_work_takeoff_page_json(g) order by g.page_number) from public.pro_work_takeoff_pages g where g.owner_id=p_row.owner_id and g.plan_id=p_row.id),'[]'::jsonb),
  'archived',p_row.archived,'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at)
 from public.pro_work_files f where f.owner_id=p_row.owner_id and f.work_id=p_row.work_id and f.id=p_row.file_id;
$$;
create or replace function public.pro_work_takeoff_measurement_json(p_row public.pro_work_takeoff_measurements) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'planId',p_row.plan_id,'pageNumber',p_row.page_number,'position',p_row.position,
  'kind',p_row.kind,'name',p_row.name,'categoryId',p_row.category_id,
  'categoryName',(select c.name from public.pro_catalog_organizations c where c.user_id=p_row.owner_id and c.kind='product_category' and c.id=p_row.category_id),
  'color',p_row.color,'hidden',p_row.hidden,'points',public.pro_work_takeoff_norm(p_row.points),'manualMilli',p_row.manual_milli,
  'multiplierMode',p_row.multiplier_mode,'multiplierMilli',p_row.multiplier_milli,'wasteBps',p_row.waste_bps,
  'productId',p_row.product_id,'productName',(select p.name from public.pro_products p where p.user_id=p_row.owner_id and p.id=p_row.product_id),
  'result',public.pro_work_takeoff_result(p_row,g),
  'archived',p_row.archived,'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at)
 from public.pro_work_takeoff_pages g where g.owner_id=p_row.owner_id and g.plan_id=p_row.plan_id and g.page_number=p_row.page_number;
$$;
-- Project estimates that can receive measurement lines: linked to this job and never shared.
create or replace function public.pro_work_takeoff_estimates(p_actor uuid,p_work public.pro_work) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'currency',d.currency,'revision',d.revision,'totalCents',d.total_cents,
  'lineCount',(select count(*) from public.pro_private_estimate_items i where i.owner_id=d.owner_id and i.estimate_id=d.id)) order by d.created_at desc,d.id desc),'[]'::jsonb)
 from public.pro_project_estimate_rows(p_actor,p_work) r join public.pro_private_estimates d on d.owner_id=p_actor and d.id=r.estimate_id
 where r.relation='project' and not d.archived and not exists(select 1 from public.pro_private_estimate_publications v where v.owner_id=p_actor and v.estimate_id=d.id);
$$;
create or replace function public.pro_work_takeoffs_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;plans jsonb;measurements jsonb;categories jsonb;hist jsonb;can_quote boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid takeoff query' using errcode='22023';end if;
 select * into w from public.pro_work where user_id=p_actor and id=p_work;
 if not found then return null;end if;
 select coalesce(jsonb_agg(public.pro_work_takeoff_plan_json(p) order by p.archived,p.position),'[]'::jsonb) into plans from public.pro_work_takeoff_plans p where p.owner_id=p_actor and p.work_id=p_work;
 select coalesce(jsonb_agg(public.pro_work_takeoff_measurement_json(m) order by m.archived,m.position),'[]'::jsonb) into measurements from public.pro_work_takeoff_measurements m where m.owner_id=p_actor and m.work_id=p_work;
 -- Company › Categories (product and service categories) are the reusable groups.
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'archived',c.archived) order by c.position),'[]'::jsonb) into categories
  from public.pro_catalog_organizations c where c.user_id=p_actor and c.kind='product_category'
  and (not c.archived or exists(select 1 from public.pro_work_takeoff_measurements m where m.owner_id=p_actor and m.work_id=p_work and m.category_id=c.id));
 select coalesce(jsonb_agg(x.content order by x.at desc,x.action_id),'[]'::jsonb) into hist from (
  select h.at,h.action_id,jsonb_build_object('actionId',h.action_id,'action',h.action,'targetKind',h.target_kind,'targetId',h.target_id,'at',h.at) as content
  from public.pro_work_takeoff_history h where h.owner_id=p_actor and h.work_id=p_work order by h.at desc,h.action_id limit 100
 ) x;
 can_quote:=not coalesce(w.cancelled,false) and exists(select 1 from public.pro_clients c where c.user_id=p_actor and c.id=w."clientId" and not coalesce(c.archived,false));
 return jsonb_build_object('workId',p_work,'today',to_char(now() at time zone 'America/Costa_Rica','YYYY-MM-DD'),'canQuote',can_quote,
  'plans',plans,'measurements',measurements,'categories',categories,'estimates',public.pro_work_takeoff_estimates(p_actor,w),'history',hist);
end $$;
-- Storage metadata of a ready job file of this owner (used to read the image size before creating a plan).
create or replace function public.pro_work_takeoff_file(p_actor uuid,p_work text,p_file uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f public.pro_work_files;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_file is null then raise exception 'Invalid file' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into f from public.pro_work_files where owner_id=p_actor and work_id=p_work and id=p_file and ready;
 if not found then return null;end if;
 return jsonb_build_object('objectPath',f.object_path,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);
end $$;
-- Plan image for the owner only (the customer never sees takeoffs).
create or replace function public.pro_work_takeoff_image(p_actor uuid,p_plan uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.pro_work_takeoff_plans;f public.pro_work_files;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into p from public.pro_work_takeoff_plans where owner_id=p_actor and id=p_plan;
 if not found then return null;end if;
 select * into f from public.pro_work_files where owner_id=p_actor and work_id=p.work_id and id=p.file_id and ready and mime_type='image/jpeg';
 if not found then return null;end if;
 return jsonb_build_object('objectPath',f.object_path,'mimeType',f.mime_type,'sizeBytes',f.size_bytes,'sha256',f.sha256);
end $$;
create or replace function public.pro_work_takeoff_text(p_value jsonb,p_max integer) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v text;
begin
 if jsonb_typeof(p_value) is distinct from 'string' then raise exception 'Invalid takeoff text' using errcode='22023';end if;
 v:=nullif(btrim(p_value#>>'{}'),'');
 if v is null or length(v)>p_max then raise exception 'Invalid takeoff text' using errcode='22023';end if;
 return v;
end $$;
create or replace function public.pro_work_takeoff_int(p_value jsonb,p_min numeric,p_max numeric) returns bigint
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'number' or not coalesce((p_value#>>'{}')~'^[0-9]{1,15}$',false) or (p_value#>>'{}')::numeric not between p_min and p_max then raise exception 'Invalid takeoff number' using errcode='22023';end if;
 return (p_value#>>'{}')::bigint;
end $$;
-- Lines written into the private estimate: the measurement total as quantity (milli),
-- its unit, and the price of the linked item of My items (or the price already typed).
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
  'catalogProductId',case when p_row.product_id is not null and exists(select 1 from public.pro_products where user_id=p_actor and id=p_row.product_id and not archived) then to_jsonb(p_row.product_id) else coalesce(p_old->'catalogProductId','null'::jsonb) end);
end $$;
create or replace function public.pro_work_takeoffs_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;aid uuid;tid uuid;rev integer;keys text[];expected text[];receipt public.pro_work_takeoff_actions;sendable boolean;
 plan public.pro_work_takeoff_plans;pg public.pro_work_takeoff_pages;m public.pro_work_takeoff_measurements;w public.pro_work;
 before_json jsonb;after_json jsonb;result jsonb;tkind text;target text;
 v_title text;v_name text;v_kind text;v_points jsonb;v_manual bigint;v_mode text;v_mult bigint;v_waste integer;v_color text;v_cat uuid;v_product text;v_plan uuid;v_page integer;
 v_unit text;v_cal jsonb;v_len bigint;v_w integer;v_h integer;v_file uuid;
 ids uuid[];mid uuid;est public.pro_private_estimates;eid uuid;ctx jsonb;issuer jsonb;lines jsonb;old_line jsonb;new_line jsonb;line_ids jsonb:='[]'::jsonb;estimate_input jsonb;answer jsonb;created boolean;en boolean;idx integer;
 measurement_fields text[]:=array['categoryId','color','manualMilli','multiplierMilli','multiplierMode','name','points','productId','wasteBps'];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid takeoff' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'plan_create' then array['action','actionId','fileId','heightPx','id','title','widthPx','workId']
  when 'plan_update' then array['action','actionId','id','revision','title','workId']
  when 'plan_archive' then array['action','actionId','id','revision','workId'] when 'plan_restore' then array['action','actionId','id','revision','workId']
  when 'page_calibrate' then array['action','actionId','calibration','id','pageNumber','revision','unit','workId']
  when 'measurement_create' then (select array_agg(k order by k) from unnest(measurement_fields||array['action','actionId','id','kind','pageNumber','planId','workId']) k)
  when 'measurement_update' then (select array_agg(k order by k) from unnest(measurement_fields||array['action','actionId','id','revision','workId']) k)
  when 'measurement_visibility' then array['action','actionId','hidden','id','revision','workId']
  when 'measurement_archive' then array['action','actionId','id','revision','workId'] when 'measurement_restore' then array['action','actionId','id','revision','workId']
  when 'send_estimate' then array['action','actionId','estimateId','estimateRevision','language','measurementIds','workId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
  or act<>'send_estimate' and jsonb_typeof(p_input->'id') is distinct from 'string' then raise exception 'Invalid takeoff fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;
 if length(wid) not between 1 and 160 then raise exception 'Invalid takeoff identity' using errcode='22023';end if;
 if act<>'send_estimate' then tid:=(p_input->>'id')::uuid;end if;
 if p_input?'revision' then rev:=public.pro_work_takeoff_int(p_input->'revision',1,2147483646)::integer;end if;
 tkind:=case when act like 'plan_%' then 'plan' when act='page_calibrate' then 'page' when act='send_estimate' then 'estimate' else 'measurement' end;
 -- Field validation before any lock.
 if act in('plan_create','plan_update') then
  v_title:=public.pro_work_takeoff_text(p_input->'title',160);
  if act='plan_create' then
   if jsonb_typeof(p_input->'fileId') is distinct from 'string' then raise exception 'Invalid file' using errcode='22023';end if;
   v_file:=(p_input->>'fileId')::uuid;v_w:=public.pro_work_takeoff_int(p_input->'widthPx',1,20000);v_h:=public.pro_work_takeoff_int(p_input->'heightPx',1,20000);
  end if;
 elsif act='page_calibrate' then
  v_page:=public.pro_work_takeoff_int(p_input->'pageNumber',1,200);
  if jsonb_typeof(p_input->'unit') is distinct from 'string' or p_input->>'unit' not in('m','ft') then raise exception 'Invalid unit' using errcode='22023';end if;v_unit:=p_input->>'unit';
  v_cal:=p_input->'calibration';
  if jsonb_typeof(v_cal)='object' then
   if (select array_agg(key order by key) from jsonb_object_keys(v_cal) key) is distinct from array['lengthMilli','points'] then raise exception 'Invalid calibration' using errcode='22023';end if;
   v_points:=public.pro_work_takeoff_points(v_cal->'points',2,2);v_len:=public.pro_work_takeoff_int(v_cal->'lengthMilli',1,1000000);
  elsif jsonb_typeof(v_cal) is distinct from 'null' then raise exception 'Invalid calibration' using errcode='22023';end if;
 elsif act in('measurement_create','measurement_update') then
  v_name:=public.pro_work_takeoff_text(p_input->'name',120);
  if jsonb_typeof(p_input->'color') is distinct from 'string' or not coalesce(p_input->>'color'~'^#[0-9a-f]{6}$',false) then raise exception 'Invalid color' using errcode='22023';end if;v_color:=p_input->>'color';
  if jsonb_typeof(p_input->'categoryId') not in('string','null') or jsonb_typeof(p_input->'productId') not in('string','null') or jsonb_typeof(p_input->'multiplierMode') is distinct from 'string'
   or jsonb_typeof(p_input->'multiplierMilli') not in('number','null') or jsonb_typeof(p_input->'manualMilli') not in('number','null') then raise exception 'Invalid measurement fields' using errcode='22023';end if;
  v_cat:=(p_input->>'categoryId')::uuid;v_product:=p_input->>'productId';
  if v_product is not null and length(v_product) not between 1 and 160 then raise exception 'Invalid item' using errcode='22023';end if;
  v_mode:=p_input->>'multiplierMode';if v_mode not in('none','height','factor') then raise exception 'Invalid multiplier' using errcode='22023';end if;
  if (v_mode='none')<>(jsonb_typeof(p_input->'multiplierMilli')='null') then raise exception 'Invalid multiplier' using errcode='22023';end if;
  if v_mode<>'none' then v_mult:=public.pro_work_takeoff_int(p_input->'multiplierMilli',1,100000000);end if;
  v_waste:=public.pro_work_takeoff_int(p_input->'wasteBps',0,10000);
  if jsonb_typeof(p_input->'manualMilli')='number' then v_manual:=public.pro_work_takeoff_int(p_input->'manualMilli',1,1000000000000);end if;
  if act='measurement_create' then
   if jsonb_typeof(p_input->'kind') is distinct from 'string' or p_input->>'kind' not in('area','length','count') or jsonb_typeof(p_input->'planId') is distinct from 'string' then raise exception 'Invalid measurement kind' using errcode='22023';end if;
   v_kind:=p_input->>'kind';v_plan:=(p_input->>'planId')::uuid;v_page:=public.pro_work_takeoff_int(p_input->'pageNumber',1,200);
  end if;
 elsif act='measurement_visibility' then
  if jsonb_typeof(p_input->'hidden') is distinct from 'boolean' then raise exception 'Invalid visibility' using errcode='22023';end if;
 elsif act='send_estimate' then
  if jsonb_typeof(p_input->'measurementIds') is distinct from 'array' or jsonb_array_length(p_input->'measurementIds') not between 1 and 100
   or exists(select 1 from jsonb_array_elements(p_input->'measurementIds') e where jsonb_typeof(e.value) is distinct from 'string')
   or jsonb_typeof(p_input->'estimateId') not in('string','null') or (jsonb_typeof(p_input->'estimateId')='null')<>(jsonb_typeof(p_input->'estimateRevision')='null')
   or jsonb_typeof(p_input->'language') is distinct from 'string' or p_input->>'language' not in('es','en') then raise exception 'Invalid estimate request' using errcode='22023';end if;
  select array_agg((e.value#>>'{}')::uuid order by e.ord) into ids from jsonb_array_elements(p_input->'measurementIds') with ordinality e(value,ord);
  if (select count(distinct x) from unnest(ids) x)<>cardinality(ids) then raise exception 'Duplicate measurement' using errcode='22023';end if;
  eid:=(p_input->>'estimateId')::uuid;en:=p_input->>'language'='en';
  if eid is not null then rev:=public.pro_work_takeoff_int(p_input->'estimateRevision',1,2147483646)::integer;end if;
 end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-takeoff-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_takeoff_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-takeoff:'||p_actor::text||':'||wid,0));
 select * into w from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 target:=tid::text;
 if act='plan_create' then
  if exists(select 1 from public.pro_work_takeoff_plans where id=tid) then raise exception 'Plan id already used' using errcode='23505';end if;
  if not exists(select 1 from public.pro_work_files where owner_id=p_actor and work_id=wid and id=v_file and ready and mime_type='image/jpeg') then raise exception 'Unknown plan image' using errcode='22023';end if;
  if exists(select 1 from public.pro_work_takeoff_plans where owner_id=p_actor and file_id=v_file) then raise exception 'File already used as a plan' using errcode='23505';end if;
  if (select count(*) from public.pro_work_takeoff_plans where owner_id=p_actor and work_id=wid)>=50 then raise exception 'Plan limit' using errcode='54000';end if;
  insert into public.pro_work_takeoff_plans(owner_id,id,work_id,file_id,title) values(p_actor,tid,wid,v_file,v_title) returning * into plan;
  insert into public.pro_work_takeoff_pages(owner_id,plan_id,page_number,width_px,height_px) values(p_actor,tid,1,v_w,v_h);
  before_json:=null;after_json:=public.pro_work_takeoff_plan_json(plan);
 elsif tkind='plan' then
  select * into plan from public.pro_work_takeoff_plans where owner_id=p_actor and id=tid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if plan.revision<>rev then raise exception 'Plan changed' using errcode='40001';end if;
  before_json:=public.pro_work_takeoff_plan_json(plan);
  if act='plan_update' then
   if plan.archived then raise exception 'Restore before editing' using errcode='22023';end if;
   if plan.title=v_title then raise exception 'No plan changes' using errcode='22023';end if;
   update public.pro_work_takeoff_plans set title=v_title,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into plan;
  elsif act='plan_archive' then
   if plan.archived then raise exception 'Already archived' using errcode='22023';end if;
   update public.pro_work_takeoff_plans set archived=true,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into plan;
  else
   if not plan.archived then raise exception 'Not archived' using errcode='22023';end if;
   update public.pro_work_takeoff_plans set archived=false,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into plan;
  end if;
  after_json:=public.pro_work_takeoff_plan_json(plan);
 elsif act='page_calibrate' then
  select * into plan from public.pro_work_takeoff_plans where owner_id=p_actor and id=tid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if plan.archived then raise exception 'Restore before editing' using errcode='22023';end if;
  select * into pg from public.pro_work_takeoff_pages where owner_id=p_actor and plan_id=tid and page_number=v_page for update;
  if not found then raise exception 'Unknown page' using errcode='22023';end if;
  if pg.revision<>rev then raise exception 'Page changed' using errcode='40001';end if;
  target:=tid::text||':'||v_page;before_json:=public.pro_work_takeoff_page_json(pg);
  if v_points is not null and public.pro_work_takeoff_px_distance((v_points->0->>0)::integer,(v_points->0->>1)::integer,(v_points->1->>0)::integer,(v_points->1->>1)::integer,pg.width_px,pg.height_px)<5 then
   raise exception 'Reference line too short' using errcode='22023';end if;
  if pg.unit=v_unit and pg.cal_length_milli is not distinct from v_len and pg.cal_x1 is not distinct from (v_points->0->>0)::integer and pg.cal_y1 is not distinct from (v_points->0->>1)::integer
   and pg.cal_x2 is not distinct from (v_points->1->>0)::integer and pg.cal_y2 is not distinct from (v_points->1->>1)::integer then raise exception 'No page changes' using errcode='22023';end if;
  update public.pro_work_takeoff_pages set unit=v_unit,cal_x1=(v_points->0->>0)::integer,cal_y1=(v_points->0->>1)::integer,cal_x2=(v_points->1->>0)::integer,cal_y2=(v_points->1->>1)::integer,
   cal_length_milli=v_len,revision=revision+1,updated_at=now() where owner_id=p_actor and plan_id=tid and page_number=v_page returning * into pg;
  -- Recalibrating recomputes every drawn measurement of the page: keep them in range.
  if exists(select 1 from public.pro_work_takeoff_measurements x where x.owner_id=p_actor and x.plan_id=tid and x.page_number=v_page and not x.archived
   and coalesce((public.pro_work_takeoff_result(x,pg)->>'totalMilli')::numeric,0)>1000000000000) then raise exception 'Result too large' using errcode='22023';end if;
  after_json:=public.pro_work_takeoff_page_json(pg);
 elsif act='send_estimate' then
  if coalesce(w.cancelled,false) then raise exception 'Cancelled job' using errcode='22023';end if;
  -- Closing round (security review B2): «an opening is never quoted on its own» is checked here, under the
  -- per-job lock that pro_work_takeoff_deduction_mutate also takes (module takeoff-deductions-local.sql;
  -- called dynamically so this module still installs before it).
  if to_regprocedure('public.pro_work_takeoff_send_check(uuid,text,uuid[])') is not null then
   execute 'select public.pro_work_takeoff_send_check($1,$2,$3)' into sendable using p_actor,wid,ids;
   if sendable is not true then raise exception 'An opening is not quoted on its own' using errcode='22023',hint='pro_takeoff_opening';end if;
  end if;
  -- New draft estimate for this job (deterministic id from the action) or an unshared draft of this job.
  if eid is null then
   eid:=public.pro_work_takeoff_uuid('pro-work-takeoff-estimate:'||p_actor::text||':'||aid::text);created:=true;
   ctx:=public.pro_private_estimate_context(p_actor,null,'work',wid);
   issuer:=ctx->'issuer';
   if coalesce(btrim(issuer->>'issuerName'),'')='' then
    issuer:=jsonb_set(issuer,'{issuerName}',to_jsonb(left(coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=p_actor limit 1),(select nullif(btrim(full_name),'') from public.profiles where id=p_actor),'ContrataCR Pro'),160)));
   end if;
   lines:='[]'::jsonb;
  else
   created:=false;
   select * into est from public.pro_private_estimates where owner_id=p_actor and id=eid for update;
   if not found or est.archived or not exists(select 1 from public.pro_project_estimate_rows(p_actor,w) r where r.estimate_id=eid and r.relation='project') then raise exception 'Forbidden' using errcode='42501';end if;
   if exists(select 1 from public.pro_private_estimate_publications v where v.owner_id=p_actor and v.estimate_id=eid) then raise exception 'Estimate already shared' using errcode='22023';end if;
   if est.revision<>rev then raise exception 'Estimate changed' using errcode='40001';end if;
   select coalesce(jsonb_agg(content order by position),'[]'::jsonb) into lines from public.pro_private_estimate_items where owner_id=p_actor and estimate_id=eid;
  end if;
  foreach mid in array ids loop
   select * into m from public.pro_work_takeoff_measurements where owner_id=p_actor and work_id=wid and id=mid;
   if not found then raise exception 'Unknown measurement' using errcode='22023';end if;
   if m.archived or exists(select 1 from public.pro_work_takeoff_plans where owner_id=p_actor and id=m.plan_id and archived) then raise exception 'Archived measurement' using errcode='22023';end if;
   idx:=null;old_line:=null;
   select e.ord-1,e.value into idx,old_line from jsonb_array_elements(lines) with ordinality e(value,ord) where e.value->>'id'=public.pro_work_takeoff_uuid('pro-work-takeoff-line:'||eid::text||':'||mid::text)::text;
   new_line:=public.pro_work_takeoff_line(p_actor,eid,m,old_line,en);
   -- Sending again updates the same line (quantity, unit, description) instead of duplicating it.
   if idx is null then lines:=lines||jsonb_build_array(new_line);else lines:=jsonb_set(lines,array[idx::text],new_line);end if;
   line_ids:=line_ids||jsonb_build_array(new_line->>'id');
  end loop;
  if jsonb_array_length(lines)>100 then raise exception 'Estimate line limit' using errcode='54000';end if;
  if created then
   estimate_input:=jsonb_build_object('action','save','actionId',public.pro_work_takeoff_uuid('pro-work-takeoff-estimate-action:'||aid::text),'estimateId',eid,'revision',0,
    'clientId',ctx->'client'->>'id','refreshClient',false,'clientFingerprint',ctx->>'clientFingerprint','source',ctx->'source','issuer',issuer,
    'title',left(coalesce(nullif(btrim(ctx->>'title'),''),case when en then 'Plan measurements' else 'Mediciones sobre planos' end),160),
    'notes','','currency','CRC','validUntil',null,'lines',lines);
  else
   estimate_input:=jsonb_build_object('action','save','actionId',public.pro_work_takeoff_uuid('pro-work-takeoff-estimate-action:'||aid::text),'estimateId',eid,'revision',est.revision,
    'clientId',est.client_id,'refreshClient',false,'clientFingerprint',md5(est.client_snapshot::text),'source',coalesce(est.source,'null'::jsonb),'issuer',est.issuer,
    'title',est.title,'notes',est.notes,'currency',est.currency,'validUntil',to_jsonb(est.valid_until),'lines',lines);
  end if;
  -- Reuses the private estimate writer: same validation, totals, receipts and history.
  answer:=public.pro_private_estimate_mutate(p_actor,estimate_input);
  target:=eid::text;before_json:=null;
  after_json:=jsonb_build_object('estimateId',eid,'created',created,'estimateRevision',answer->'estimate'->'revision','title',answer->'estimate'->>'title',
   'lineIds',line_ids,'measurementIds',to_jsonb(ids),'lineCount',jsonb_array_length(answer->'estimate'->'lines'),'totalCents',answer->'estimate'->'totalCents','currency',answer->'estimate'->>'currency');
 elsif act='measurement_create' then
  if exists(select 1 from public.pro_work_takeoff_measurements where id=tid) then raise exception 'Measurement id already used' using errcode='23505';end if;
  select * into plan from public.pro_work_takeoff_plans where owner_id=p_actor and id=v_plan and work_id=wid;
  if not found or plan.archived then raise exception 'Unknown plan' using errcode='22023';end if;
  select * into pg from public.pro_work_takeoff_pages where owner_id=p_actor and plan_id=v_plan and page_number=v_page;
  if not found then raise exception 'Unknown page' using errcode='22023';end if;
  if (select count(*) from public.pro_work_takeoff_measurements where owner_id=p_actor and work_id=wid)>=1000 then raise exception 'Measurement limit' using errcode='54000';end if;
  v_kind:=p_input->>'kind';
 else
  select * into m from public.pro_work_takeoff_measurements where owner_id=p_actor and id=tid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if m.revision<>rev then raise exception 'Measurement changed' using errcode='40001';end if;
  if m.archived and act<>'measurement_restore' then raise exception 'Restore before editing' using errcode='22023';end if;
  if act<>'measurement_restore' and exists(select 1 from public.pro_work_takeoff_plans where owner_id=p_actor and id=m.plan_id and archived) then raise exception 'Restore the plan first' using errcode='22023';end if;
  select * into pg from public.pro_work_takeoff_pages where owner_id=p_actor and plan_id=m.plan_id and page_number=m.page_number;
  before_json:=public.pro_work_takeoff_measurement_json(m);v_kind:=m.kind;
 end if;
 if act in('measurement_create','measurement_update') then
  -- Points: area 3+, length 2+, count 1+; or a value typed by hand (no points).
  if v_manual is not null then
   if jsonb_typeof(p_input->'points') is distinct from 'array' or jsonb_array_length(p_input->'points')<>0 then raise exception 'Manual value without points' using errcode='22023';end if;v_points:='[]'::jsonb;
  else
   v_points:=public.pro_work_takeoff_points(p_input->'points',case v_kind when 'area' then 3 when 'length' then 2 else 1 end,400);
   if v_kind='area' and public.pro_work_takeoff_px_area(v_points,pg.width_px,pg.height_px)=0 then raise exception 'Empty area' using errcode='22023';end if;
  end if;
  if v_mode='height' and v_kind<>'length' then raise exception 'Height only applies to lengths' using errcode='22023';end if;
  if v_cat is not null and v_cat is distinct from m.category_id and not exists(select 1 from public.pro_catalog_organizations where user_id=p_actor and kind='product_category' and id=v_cat and not archived) then raise exception 'Unknown category' using errcode='22023';end if;
  if v_product is not null and v_product is distinct from m.product_id and not exists(select 1 from public.pro_products where user_id=p_actor and id=v_product and not archived) then raise exception 'Unknown item' using errcode='22023';end if;
  if act='measurement_create' then
   insert into public.pro_work_takeoff_measurements(owner_id,id,work_id,plan_id,page_number,kind,name,category_id,color,points,manual_milli,multiplier_mode,multiplier_milli,waste_bps,product_id)
    values(p_actor,tid,wid,v_plan,v_page,v_kind,v_name,v_cat,v_color,v_points,v_manual,v_mode,v_mult,v_waste,v_product) returning * into m;
  else
   if m.name=v_name and m.category_id is not distinct from v_cat and m.color=v_color and m.points=v_points and m.manual_milli is not distinct from v_manual and m.multiplier_mode=v_mode
    and m.multiplier_milli is not distinct from v_mult and m.waste_bps=v_waste and m.product_id is not distinct from v_product then raise exception 'No measurement changes' using errcode='22023';end if;
   update public.pro_work_takeoff_measurements set name=v_name,category_id=v_cat,color=v_color,points=v_points,manual_milli=v_manual,multiplier_mode=v_mode,multiplier_milli=v_mult,
    waste_bps=v_waste,product_id=v_product,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into m;
  end if;
  if coalesce((public.pro_work_takeoff_result(m,pg)->>'totalMilli')::numeric,0)>1000000000000 then raise exception 'Result too large' using errcode='22023';end if;
  after_json:=public.pro_work_takeoff_measurement_json(m);
 elsif act='measurement_visibility' then
  if m.hidden=(p_input->>'hidden')::boolean then raise exception 'No visibility change' using errcode='22023';end if;
  update public.pro_work_takeoff_measurements set hidden=(p_input->>'hidden')::boolean,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into m;
  after_json:=public.pro_work_takeoff_measurement_json(m);
 elsif act='measurement_archive' then
  update public.pro_work_takeoff_measurements set archived=true,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into m;
  after_json:=public.pro_work_takeoff_measurement_json(m);
 elsif act='measurement_restore' then
  if not m.archived then raise exception 'Not archived' using errcode='22023';end if;
  if exists(select 1 from public.pro_work_takeoff_plans where owner_id=p_actor and id=m.plan_id and archived) then raise exception 'Restore the plan first' using errcode='22023';end if;
  update public.pro_work_takeoff_measurements set archived=false,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into m;
  after_json:=public.pro_work_takeoff_measurement_json(m);
 end if;
 result:=jsonb_build_object(tkind,after_json);
 insert into public.pro_work_takeoff_history(owner_id,work_id,action_id,actor_id,action,target_kind,target_id,before_value,after_value) values(p_actor,wid,aid,p_actor,act,tkind,target,before_json,after_json);
 insert into public.pro_work_takeoff_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.pro_work_takeoff_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Takeoff history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_work_takeoff_history_immutable on public.pro_work_takeoff_history;
create trigger pro_work_takeoff_history_immutable before update on public.pro_work_takeoff_history for each row execute function public.pro_work_takeoff_immutable();
drop trigger if exists pro_work_takeoff_action_immutable on public.pro_work_takeoff_actions;
create trigger pro_work_takeoff_action_immutable before update on public.pro_work_takeoff_actions for each row execute function public.pro_work_takeoff_immutable();
do $$declare t text;f record;begin
 foreach t in array array['pro_work_takeoff_plans','pro_work_takeoff_pages','pro_work_takeoff_measurements','pro_work_takeoff_history','pro_work_takeoff_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 grant usage,select on sequence public.pro_work_takeoff_plans_position_seq,public.pro_work_takeoff_measurements_position_seq to service_role;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'pro_work_takeoff%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'pro_work_takeoff_immutable' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
