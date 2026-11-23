-- Pro family 63 (design): library of custom 3D objects per owner (name, width/depth/height in metres, colour, origin: manual, OBJ
-- bounding box or catalog item) and custom objects inside a floor plan ({kind:'custom', label, h, libraryId?, color?}).
-- pro_floor_content_ok is redefined here (create or replace) to accept the optional keys; migrations already applied stay untouched.
-- Library: owner-only, service_role only, optimistic concurrency (revision), limit 200 active entries, name unique among active ones.
begin;
create or replace function public.pro_floor_content_ok(c jsonb) returns boolean
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare x jsonb;p jsonb;
begin
 if jsonb_typeof(c)<>'object' or jsonb_typeof(c->'walls')<>'array' or jsonb_typeof(c->'openings')<>'array' or jsonb_typeof(c->'rooms')<>'array' or jsonb_typeof(c->'dimensions')<>'array'
  or jsonb_array_length(c->'walls')>500 or jsonb_array_length(c->'openings')>300 or jsonb_array_length(c->'rooms')>100 or jsonb_array_length(c->'dimensions')>200
  or not public.pro_floor_num(c->'wallHeight') or (c->>'wallHeight')::numeric<=0 then return false;end if;
 for x in select * from jsonb_array_elements(c->'walls') loop
  if jsonb_typeof(x->'id')<>'string' or not public.pro_floor_point_ok(x->'a') or not public.pro_floor_point_ok(x->'b') or not public.pro_floor_num(x->'thickness') then return false;end if;end loop;
 for x in select * from jsonb_array_elements(c->'openings') loop
  if x->>'kind' not in('door','window') or jsonb_typeof(x->'wallId')<>'string' or not public.pro_floor_num(x->'offset') or not public.pro_floor_num(x->'width')
   or not exists(select 1 from jsonb_array_elements(c->'walls') w where w->>'id'=x->>'wallId') then return false;end if;end loop;
 for x in select * from jsonb_array_elements(c->'rooms') loop
  if jsonb_typeof(x->'id')<>'string' or coalesce(length(btrim(x->>'name')),0) not between 1 and 80 or jsonb_typeof(x->'points')<>'array' or jsonb_array_length(x->'points') not between 3 and 100 then return false;end if;
  for p in select * from jsonb_array_elements(x->'points') loop if not public.pro_floor_point_ok(p) then return false;end if;end loop;end loop;
 for x in select * from jsonb_array_elements(c->'dimensions') loop
  if not public.pro_floor_point_ok(x->'a') or not public.pro_floor_point_ok(x->'b') then return false;end if;end loop;
 -- Round 12 (row 63): optional level {name 1..60, order -5..50} and furniture/fixture objects (≤300).
 if c ? 'level' and (jsonb_typeof(c->'level')<>'object' or (select array_agg(k order by k) from jsonb_object_keys(c->'level') k) is distinct from array['name','order']
  or coalesce(length(btrim(c->'level'->>'name')),0) not between 1 and 60 or jsonb_typeof(c->'level'->'order')<>'number' or (c->'level'->>'order')!~'^-?[0-9]+$' or (c->'level'->>'order')::integer not between -5 and 50) then return false;end if;
 if c ? 'objects' then
  if jsonb_typeof(c->'objects')<>'array' or jsonb_array_length(c->'objects')>300 then return false;end if;
  for x in select * from jsonb_array_elements(c->'objects') loop
   if jsonb_typeof(x)<>'object' or not (select coalesce(bool_and(k in('d','id','kind','rotation','w','x','y','h','label','libraryId','color')),true) from jsonb_object_keys(x) k)
    or not (x ? 'd' and x ? 'id' and x ? 'kind' and x ? 'rotation' and x ? 'w' and x ? 'x' and x ? 'y')
    or jsonb_typeof(x->'id')<>'string' or x->>'kind' not in('bed','sofa','table','chair','desk','wardrobe','cabinet','stove','fridge','sink','toilet','shower','bathtub','washer','stairs','custom')
    or not public.pro_floor_num(x->'x') or not public.pro_floor_num(x->'y') or not public.pro_floor_num(x->'w') or not public.pro_floor_num(x->'d')
    or (x->>'w')::numeric not between 0.1 and 50 or (x->>'d')::numeric not between 0.1 and 50 or x->>'rotation' not in('0','90','180','270') then return false;end if;
   -- Row 63 (library): a custom object carries its own name and height (and optionally the library entry and a colour); catalogue kinds carry none of those.
   if x->>'kind'='custom' then
    if jsonb_typeof(x->'label')<>'string' or length(btrim(x->>'label')) not between 1 and 60 or not public.pro_floor_num(x->'h') or (x->>'h')::numeric not between 0.05 and 20 then return false;end if;
    if x ? 'libraryId' and (jsonb_typeof(x->'libraryId')<>'string' or (x->>'libraryId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return false;end if;
    if x ? 'color' and (jsonb_typeof(x->'color')<>'string' or (x->>'color')!~'^#[0-9a-fA-F]{6}$') then return false;end if;
   elsif x ? 'h' or x ? 'label' or x ? 'libraryId' or x ? 'color' then return false;end if;
  end loop;
 end if;
 return true;
end $$;
revoke all on function public.pro_floor_content_ok(jsonb) from public,anon,authenticated;
grant execute on function public.pro_floor_content_ok(jsonb) to service_role;

create table if not exists public.pro_floor_object_library(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 60),
 w numeric(8,3) not null check(w between 0.05 and 50),d numeric(8,3) not null check(d between 0.05 and 50),h numeric(8,3) not null check(h between 0.05 and 20),
 color text not null default '#8a6d3b' check(color~'^#[0-9a-fA-F]{6}$'),
 source text not null check(source in('manual','obj','catalog')),
 product_id text check(product_id is null or length(product_id) between 1 and 160),
 file_sha256 text check(file_sha256 is null or file_sha256~'^[a-f0-9]{64}$'),
 check((source='catalog')=(product_id is not null)),check((source='obj')=(file_sha256 is not null)),
 archived boolean not null default false,revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id)
);
create unique index if not exists pro_floor_object_library_name on public.pro_floor_object_library(owner_id,lower(btrim(name))) where not archived;
create or replace function public.pro_floor_library_json(l public.pro_floor_object_library) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',l.id,'name',l.name,'w',l.w,'d',l.d,'h',l.h,'color',l.color,'source',l.source,'productId',l.product_id,'fileSha256',l.file_sha256,'archived',l.archived,'revision',l.revision,'updatedAt',l.updated_at) $$;
create or replace function public.pro_floor_library_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_mkt_owner(p_actor);
 return jsonb_build_object('items',coalesce((select jsonb_agg(public.pro_floor_library_json(l) order by l.archived,lower(l.name)) from (select * from public.pro_floor_object_library where owner_id=p_actor order by archived,lower(name) limit 300) l),'[]'));
end $$;
create or replace function public.pro_floor_library_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';lid uuid;l public.pro_floor_object_library;rev integer;
begin
 perform public.pro_mkt_owner(p_actor);
 if jsonb_typeof(p_input)<>'object' or act not in('create','update','archive','restore') then raise exception 'Invalid library action' using errcode='22023';end if;
 begin lid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-floor-library:'||p_actor::text,0));
 if act='create' then
  select * into l from public.pro_floor_object_library where owner_id=p_actor and id=lid;
  if found then
   -- Same id + same data = the retry of a request that already succeeded.
   if l.name=btrim(p_input->>'name') and l.w=(p_input->>'w')::numeric and l.d=(p_input->>'d')::numeric and l.h=(p_input->>'h')::numeric then return jsonb_build_object('item',public.pro_floor_library_json(l));end if;
   raise exception 'Library identity used' using errcode='40001';end if;
  if (select count(*) from public.pro_floor_object_library where owner_id=p_actor and not archived)>=200 then raise exception 'Library limit reached' using errcode='54000';end if;
  if p_input->>'source'='catalog' and not exists(select 1 from public.pro_products where user_id=p_actor and id=p_input->>'productId') then raise exception 'Catalog item unavailable' using errcode='P0002';end if;
  insert into public.pro_floor_object_library(owner_id,id,name,w,d,h,color,source,product_id,file_sha256)
  values(p_actor,lid,btrim(p_input->>'name'),(p_input->>'w')::numeric,(p_input->>'d')::numeric,(p_input->>'h')::numeric,coalesce(p_input->>'color','#8a6d3b'),p_input->>'source',p_input->>'productId',p_input->>'fileSha256') returning * into l;
 else
  select * into l from public.pro_floor_object_library where owner_id=p_actor and id=lid for update;
  if not found then raise exception 'Library entry unavailable' using errcode='P0002';end if;
  rev:=case when jsonb_typeof(p_input->'revision')='number' then (p_input->>'revision')::integer else -1 end;
  if l.revision<>rev then raise exception 'Library entry changed' using errcode='40001';end if;
  if act='update' then
   if l.archived then raise exception 'Restore before editing' using errcode='40001';end if;
   update public.pro_floor_object_library set name=btrim(p_input->>'name'),w=(p_input->>'w')::numeric,d=(p_input->>'d')::numeric,h=(p_input->>'h')::numeric,color=coalesce(p_input->>'color',color),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=lid returning * into l;
  else
   if l.archived=(act='archive') then raise exception 'Archive state changed' using errcode='40001';end if;
   update public.pro_floor_object_library set archived=(act='archive'),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=lid returning * into l;
  end if;
 end if;
 return jsonb_build_object('item',public.pro_floor_library_json(l));
end $$;
alter table public.pro_floor_object_library enable row level security;
revoke all on public.pro_floor_object_library from public,anon,authenticated,service_role;
grant select,insert,update on public.pro_floor_object_library to service_role;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_floor\_library\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
