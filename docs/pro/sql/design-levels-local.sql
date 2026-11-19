-- LOCAL PRO ONLY. Round 12 (2026-11-15): design tools (Houzz Pro parity row 63).
--  * Floor plans: a plan may name the LEVEL (storey) it draws ({name, order}; the editor lists plans by level and
--    starts a new level from the walls of the current one) and carry furniture/fixture OBJECTS (footprint, kind,
--    size, quarter-turn rotation). The content validator below accepts both optional keys, strictly; the stored
--    summary (rooms, area, perimeter, walls, openings) is unchanged and objects never count as area.
-- Patterns: same writer (CAS, actionId, immutable history) as floor-plans-local.sql; service_role only.
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
   if jsonb_typeof(x)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(x) k) is distinct from array['d','id','kind','rotation','w','x','y']
    or jsonb_typeof(x->'id')<>'string' or x->>'kind' not in('bed','sofa','table','chair','desk','wardrobe','cabinet','stove','fridge','sink','toilet','shower','bathtub','washer','stairs')
    or not public.pro_floor_num(x->'x') or not public.pro_floor_num(x->'y') or not public.pro_floor_num(x->'w') or not public.pro_floor_num(x->'d')
    or (x->>'w')::numeric not between 0.1 and 50 or (x->>'d')::numeric not between 0.1 and 50 or x->>'rotation' not in('0','90','180','270') then return false;end if;
  end loop;
 end if;
 return true;
end $$;
revoke all on function public.pro_floor_content_ok(jsonb) from public,anon,authenticated;
grant execute on function public.pro_floor_content_ok(jsonb) to service_role;
commit;
