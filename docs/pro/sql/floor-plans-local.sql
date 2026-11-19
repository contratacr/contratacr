-- LOCAL PRO ONLY. Round 6D (2026-11-13): 2D floor plans + 3D view (row 64) and room scan import (row 65).
-- * Per job: plans with walls, doors/windows, rooms and dimension lines in real units (m or ft). The DATABASE
--   computes each room's area (shoelace) and perimeter and the wall length, so the summary can be trusted.
-- * CAS revision, idempotent actionId, immutable history snapshot of every change.
-- * «Link to takeoffs»: the room areas are sent to Measurements through the existing takeoff writer (from the
--   browser); this module only records which takeoff plan / measurements were created (verified to exist).
-- * Room scans: an imported scan (JSON floor plan, OBJ, USDZ via the simulated parser, or the native RoomPlan /
--   ARCore plugin) is stored as an immutable record (hash, size, parser) and creates a plan in the same transaction.
--   The scan file itself is not stored.
-- Tables: RLS on, service_role only; history/scans/receipts immutable; functions security invoker.
begin;
create table if not exists public.pro_floor_plans(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 name text not null check(length(btrim(name)) between 1 and 120),
 unit text not null default 'm' check(unit in('m','ft')),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=262144),
 summary jsonb not null,
 source text not null default 'manual' check(source in('manual','scan')),scan_id uuid,
 takeoff_link jsonb check(takeoff_link is null or jsonb_typeof(takeoff_link)='object'),
 archived boolean not null default false,revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 check((source='scan')=(scan_id is not null))
);
create table if not exists public.pro_floor_plan_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,plan_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','save','archive','restore','link_takeoffs','import_scan')),revision integer not null,snapshot jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);
create table if not exists public.pro_floor_plan_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);
create table if not exists public.pro_room_scans(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 format text not null check(format in('json','obj','usdz','native')),
 file_name text not null check(length(file_name) between 1 and 160),size_bytes integer not null check(size_bytes between 1 and 10485760),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),parser text not null check(parser in('local','simulado','native')),
 parsed jsonb not null check(jsonb_typeof(parsed)='object' and octet_length(parsed::text)<=262144),
 created_at timestamptz not null default clock_timestamp(),primary key(owner_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create or replace function public.pro_floor_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Floor plan history, scans and receipts are immutable' using errcode='23514';end $$;
do $$declare t text;begin foreach t in array array['pro_floor_plan_history','pro_floor_plan_actions','pro_room_scans'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
 execute format('create trigger %I before update on public.%I for each row execute function public.pro_floor_immutable()',t||'_immutable',t);
end loop;end $$;

-- ---------------------------------------------------------------- geometry
create or replace function public.pro_floor_num(p jsonb) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$ select jsonb_typeof(p)='number' and abs((p#>>'{}')::numeric)<=10000 $$;
create or replace function public.pro_floor_point_ok(p jsonb) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$ select jsonb_typeof(p)='array' and jsonb_array_length(p)=2 and public.pro_floor_num(p->0) and public.pro_floor_num(p->1) $$;
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
 return true;
end $$;
-- Area (shoelace) and perimeter per room, wall length, opening counts. Three decimals of the plan unit.
create or replace function public.pro_floor_summary(c jsonb) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 with rooms as(
  select r.value->>'id' id,r.value->>'name' name,r.ordinality n,
   abs(sum(((p.value->>0)::numeric*(q.value->>1)::numeric)-((q.value->>0)::numeric*(p.value->>1)::numeric)))/2 area,
   sum(sqrt(power((q.value->>0)::numeric-(p.value->>0)::numeric,2)+power((q.value->>1)::numeric-(p.value->>1)::numeric,2))) perimeter
  from jsonb_array_elements(c->'rooms') with ordinality r
  cross join lateral jsonb_array_elements(r.value->'points') with ordinality p
  cross join lateral (select r.value->'points'->((p.ordinality::int)%jsonb_array_length(r.value->'points')) value) q
  group by r.value,r.ordinality)
 select jsonb_build_object(
  'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'area',round(area,3),'perimeter',round(perimeter,3)) order by n) from rooms),'[]'),
  'totalArea',coalesce((select round(sum(area),3) from rooms),0),
  'wallLength',coalesce((select round(sum(sqrt(power((w->'b'->>0)::numeric-(w->'a'->>0)::numeric,2)+power((w->'b'->>1)::numeric-(w->'a'->>1)::numeric,2))),3) from jsonb_array_elements(c->'walls') w),0),
  'doors',(select count(*) from jsonb_array_elements(c->'openings') o where o->>'kind'='door'),
  'windows',(select count(*) from jsonb_array_elements(c->'openings') o where o->>'kind'='window')) $$;
create or replace function public.pro_floor_json(f public.pro_floor_plans) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',f.id,'workId',f.work_id,'name',f.name,'unit',f.unit,'content',f.content,'summary',f.summary,'source',f.source,'scanId',f.scan_id,'takeoffLink',f.takeoff_link,'archived',f.archived,'revision',f.revision,'createdAt',f.created_at,'updatedAt',f.updated_at) $$;
create or replace function public.pro_floor_work(p_actor uuid,p_work text) returns void
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_mkt_owner(p_actor);
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Job unavailable' using errcode='P0002';end if;
end $$;

create or replace function public.pro_floor_plans_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_floor_work(p_actor,p_work);
 return jsonb_build_object('workId',p_work,
  'plans',coalesce((select jsonb_agg(public.pro_floor_json(f) order by f.created_at) from public.pro_floor_plans f where f.owner_id=p_actor and f.work_id=p_work),'[]'),
  'scans',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'format',s.format,'fileName',s.file_name,'sizeBytes',s.size_bytes,'sha256',s.sha256,'parser',s.parser,'createdAt',s.created_at) order by s.created_at desc) from public.pro_room_scans s where s.owner_id=p_actor and s.work_id=p_work),'[]'),
  'takeoffPlans',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title) order by t.position) from public.pro_work_takeoff_plans t where t.owner_id=p_actor and t.work_id=p_work and not t.archived),'[]'));
end $$;
create or replace function public.pro_floor_plan_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;pid uuid;h text;prior public.pro_floor_plan_actions;f public.pro_floor_plans;rev integer;result jsonb;sid uuid;m jsonb;
begin
 perform public.pro_mkt_owner(p_actor);
 if jsonb_typeof(p_input)<>'object' or act not in('create','save','archive','restore','link_takeoffs','import_scan') then raise exception 'Invalid floor plan action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;pid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid ids' using errcode='22023';end;
 if aid is null or pid is null then raise exception 'Missing ids' using errcode='22023';end if;
 h:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('pro-floor:'||p_actor::text,0));
 select * into prior from public.pro_floor_plan_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>h then raise exception 'Action id reused' using errcode='22023';end if;return prior.result;end if;
 rev:=case when jsonb_typeof(p_input->'revision')='number' then (p_input->>'revision')::integer else 0 end;
 if act in('create','import_scan') then
  perform public.pro_floor_work(p_actor,p_input->>'workId');
  if exists(select 1 from public.pro_floor_plans where owner_id=p_actor and id=pid) then raise exception 'Plan identity used' using errcode='40001';end if;
  if (select count(*) from public.pro_floor_plans where owner_id=p_actor and work_id=p_input->>'workId')>=50 then raise exception 'Plan limit reached' using errcode='54000';end if;
  if not public.pro_floor_content_ok(p_input->'content') then raise exception 'Invalid plan content' using errcode='22023';end if;
  if act='import_scan' then
   sid:=(p_input->'scan'->>'id')::uuid;
   insert into public.pro_room_scans(owner_id,id,work_id,format,file_name,size_bytes,sha256,parser,parsed)
   values(p_actor,sid,p_input->>'workId',p_input->'scan'->>'format',p_input->'scan'->>'fileName',(p_input->'scan'->>'sizeBytes')::integer,p_input->'scan'->>'sha256',p_input->'scan'->>'parser',p_input->'content');
  end if;
  insert into public.pro_floor_plans(owner_id,id,work_id,name,unit,content,summary,source,scan_id)
  values(p_actor,pid,p_input->>'workId',btrim(p_input->>'name'),coalesce(p_input->>'unit','m'),p_input->'content',public.pro_floor_summary(p_input->'content'),case when sid is null then 'manual' else 'scan' end,sid) returning * into f;
 else
  select * into f from public.pro_floor_plans where owner_id=p_actor and id=pid for update;
  if not found then raise exception 'Plan unavailable' using errcode='P0002';end if;
  if f.revision<>rev then raise exception 'Plan changed' using errcode='40001';end if;
  if act='save' then
   if f.archived then raise exception 'Restore before editing' using errcode='40001';end if;
   if not public.pro_floor_content_ok(p_input->'content') then raise exception 'Invalid plan content' using errcode='22023';end if;
   update public.pro_floor_plans set name=btrim(p_input->>'name'),unit=coalesce(p_input->>'unit',unit),content=p_input->'content',summary=public.pro_floor_summary(p_input->'content'),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=pid returning * into f;
  elsif act in('archive','restore') then
   if f.archived=(act='archive') then raise exception 'Archive state changed' using errcode='40001';end if;
   update public.pro_floor_plans set archived=(act='archive'),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=pid returning * into f;
  else
   if not exists(select 1 from public.pro_work_takeoff_plans where owner_id=p_actor and work_id=f.work_id and id=(p_input->'link'->>'planId')::uuid) then raise exception 'Takeoff plan unavailable' using errcode='P0002';end if;
   for m in select * from jsonb_array_elements(coalesce(p_input->'link'->'measurements','[]')) loop
    if not exists(select 1 from public.pro_work_takeoff_measurements where owner_id=p_actor and work_id=f.work_id and plan_id=(p_input->'link'->>'planId')::uuid and id=(m->>'measurementId')::uuid) then raise exception 'Measurement unavailable' using errcode='P0002';end if;
   end loop;
   update public.pro_floor_plans set takeoff_link=jsonb_build_object('planId',p_input->'link'->>'planId','measurements',coalesce(p_input->'link'->'measurements','[]'),'at',clock_timestamp()),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=pid returning * into f;
  end if;
 end if;
 result:=jsonb_build_object('action',act,'plan',public.pro_floor_json(f));
 insert into public.pro_floor_plan_history(owner_id,plan_id,action_id,action,revision,snapshot) values(p_actor,f.id,aid,act,f.revision,public.pro_floor_json(f));
 insert into public.pro_floor_plan_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,h,result);
 return result;
end $$;
create or replace function public.pro_floor_plan_history_read(p_actor uuid,p_plan uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_mkt_owner(p_actor);
 if not exists(select 1 from public.pro_floor_plans where owner_id=p_actor and id=p_plan) then raise exception 'Plan unavailable' using errcode='P0002';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('action',h.action,'revision',h.revision,'at',h.at) order by h.at desc) from public.pro_floor_plan_history h where h.owner_id=p_actor and h.plan_id=p_plan),'[]');
end $$;
do $$declare n text;begin foreach n in array array['pro_floor_plans','pro_floor_plan_history','pro_floor_plan_actions','pro_room_scans'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_floor\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_floor_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
