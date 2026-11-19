-- LOCAL PRO ONLY. Fix 14 — parity register row 66: area subtraction in Mediciones.
-- An AREA measurement can be marked as an opening («hueco»: window, door, column…) of another
-- area measurement on the same plan page. The parent's quantity becomes
--   net = gross − Σ(openings)   (never below 0), then its multiplier and waste apply to the net,
-- so «Send to quote» quotes the net area through the unchanged line builder. An opening is
-- never quoted by itself. Same writer rules as the rest of Mediciones: owner with private work
-- tools, CAS on the opening's revision (40001), idempotent actionId with an immutable receipt.
-- Nothing is shared with the customer, sent, charged or invoiced.
begin;

alter table public.pro_work_takeoff_measurements add column if not exists deduct_from uuid;
do $$begin
 if not exists(select 1 from pg_constraint where conname='pro_work_takeoff_deduct_from_fk') then
  alter table public.pro_work_takeoff_measurements add constraint pro_work_takeoff_deduct_from_fk
   foreign key(owner_id,deduct_from) references public.pro_work_takeoff_measurements(owner_id,id) on delete set null (deduct_from);
 end if;
 if not exists(select 1 from pg_constraint where conname='pro_work_takeoff_deduct_not_self') then
  alter table public.pro_work_takeoff_measurements add constraint pro_work_takeoff_deduct_not_self check(deduct_from is null or deduct_from<>id);
 end if;
end $$;
create index if not exists pro_work_takeoff_measurement_deduct on public.pro_work_takeoff_measurements(owner_id,deduct_from) where deduct_from is not null;

-- The link is valid only between two AREA measurements of the same job, plan and page, one level deep.
create or replace function public.pro_work_takeoff_deduct_check() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare parent public.pro_work_takeoff_measurements;
begin
 if new.deduct_from is null then return new;end if;
 if new.kind<>'area' then raise exception 'Only an area can be subtracted' using errcode='23514';end if;
 select * into parent from public.pro_work_takeoff_measurements where owner_id=new.owner_id and id=new.deduct_from;
 if not found or parent.kind<>'area' or parent.work_id<>new.work_id or parent.plan_id<>new.plan_id or parent.page_number<>new.page_number
  then raise exception 'Subtract from an area of the same page' using errcode='23514';end if;
 if parent.deduct_from is not null then raise exception 'An opening cannot have openings' using errcode='23514';end if;
 if exists(select 1 from public.pro_work_takeoff_measurements c where c.owner_id=new.owner_id and c.deduct_from=new.id) then raise exception 'This area already has openings' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_work_takeoff_deduct_check on public.pro_work_takeoff_measurements;
create trigger pro_work_takeoff_deduct_check before insert or update of deduct_from,kind,plan_id,page_number on public.pro_work_takeoff_measurements
 for each row execute function public.pro_work_takeoff_deduct_check();

-- Gross base of one measurement (the original formula of takeoffs-local.sql, without multiplier or waste).
create or replace function public.pro_work_takeoff_base(p_row public.pro_work_takeoff_measurements,p_page public.pro_work_takeoff_pages) returns numeric
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare cal numeric;
begin
 if p_row.kind='count' then return coalesce(p_row.manual_milli,jsonb_array_length(p_row.points)*1000);end if;
 if p_row.manual_milli is not null then return p_row.manual_milli;end if;
 if p_page.cal_length_milli is null then return null;end if;
 cal:=public.pro_work_takeoff_px_distance(p_page.cal_x1,p_page.cal_y1,p_page.cal_x2,p_page.cal_y2,p_page.width_px,p_page.height_px);
 if p_row.kind='length' then return round(public.pro_work_takeoff_px_length(p_row.points,p_page.width_px,p_page.height_px)*p_page.cal_length_milli/cal);end if;
 return round(public.pro_work_takeoff_px_area(p_row.points,p_page.width_px,p_page.height_px)*p_page.cal_length_milli*p_page.cal_length_milli/(cal*cal*1000));
end $$;

-- Result with openings: the same keys as before; deductFrom only on an opening, and grossMilli/deductedMilli/openings only on an area with openings
-- (a measurement without openings keeps exactly the previous payload).
create or replace function public.pro_work_takeoff_result(p_row public.pro_work_takeoff_measurements,p_page public.pro_work_takeoff_pages) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare base numeric;gross numeric;cut numeric:=0;openings integer:=0;missing boolean:=false;total numeric;base_unit text;total_unit text;o public.pro_work_takeoff_measurements;ob numeric;
begin
 base_unit:=case p_row.kind when 'count' then 'u' when 'area' then p_page.unit||'2' else p_page.unit end;
 total_unit:=case when p_row.multiplier_mode='height' then p_page.unit||'2' else base_unit end;
 base:=public.pro_work_takeoff_base(p_row,p_page);
 if base is null then
  return jsonb_build_object('baseMilli',null,'totalMilli',null,'baseUnit',base_unit,'unit',total_unit,'needsScale',true)||case when p_row.deduct_from is null then '{}'::jsonb else jsonb_build_object('deductFrom',p_row.deduct_from) end;
 end if;
 gross:=base;
 if p_row.kind='area' and p_row.deduct_from is null then
  for o in select * from public.pro_work_takeoff_measurements where owner_id=p_row.owner_id and deduct_from=p_row.id and not archived order by position loop
   ob:=public.pro_work_takeoff_base(o,p_page);openings:=openings+1;
   if ob is null then missing:=true;else cut:=cut+ob;end if;
  end loop;
  if missing then
   return jsonb_build_object('baseMilli',null,'totalMilli',null,'baseUnit',base_unit,'unit',total_unit,'needsScale',true);
  end if;
  base:=greatest(gross-cut,0);
 end if;
 total:=base;
 if p_row.multiplier_mode<>'none' then total:=round(total*p_row.multiplier_milli/1000);end if;
 if p_row.waste_bps>0 then total:=round(total*(10000+p_row.waste_bps)/10000);end if;
 return jsonb_build_object('baseMilli',base,'totalMilli',total,'baseUnit',base_unit,'unit',total_unit,'needsScale',false)
  ||case when p_row.deduct_from is null then '{}'::jsonb else jsonb_build_object('deductFrom',p_row.deduct_from) end
  ||case when openings>0 then jsonb_build_object('grossMilli',gross,'deductedMilli',cut,'openings',openings) else '{}'::jsonb end;
end $$;

create table if not exists public.pro_work_takeoff_deduction_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 work_id text not null,measurement_id uuid not null,input jsonb not null,result jsonb not null,at timestamptz not null default now(),
 primary key(actor_id,action_id)
);
create or replace function public.pro_work_takeoff_deduction_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Takeoff deduction receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_work_takeoff_deduction_action_immutable on public.pro_work_takeoff_deduction_actions;
create trigger pro_work_takeoff_deduction_action_immutable before update on public.pro_work_takeoff_deduction_actions for each row execute function public.pro_work_takeoff_deduction_immutable();

-- {action:'deduction_set', actionId, workId, id, revision, parentId}  /  {action:'deduction_clear', actionId, workId, id, revision}
create or replace function public.pro_work_takeoff_deduction_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;wid text;mid uuid;pid uuid;rev integer;keys text[];receipt public.pro_work_takeoff_deduction_actions;m public.pro_work_takeoff_measurements;p public.pro_work_takeoff_measurements;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid deduction' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if act='deduction_set' and keys is distinct from array['action','actionId','id','parentId','revision','workId']
  or act='deduction_clear' and keys is distinct from array['action','actionId','id','revision','workId']
  or act is null or act not in('deduction_set','deduction_clear') then raise exception 'Invalid deduction fields' using errcode='22023';end if;
 if jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string'
  or act='deduction_set' and jsonb_typeof(p_input->'parentId') is distinct from 'string' then raise exception 'Invalid deduction fields' using errcode='22023';end if;
 wid:=p_input->>'workId';if length(wid) not between 1 and 160 then raise exception 'Invalid deduction identity' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;mid:=(p_input->>'id')::uuid;if act='deduction_set' then pid:=(p_input->>'parentId')::uuid;end if;
 rev:=public.pro_work_takeoff_int(p_input->'revision',1,2147483646)::integer;
 -- Replay: the same actionId returns its receipt; a different body with that id is a conflict.
 select * into receipt from public.pro_work_takeoff_deduction_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action reused' using errcode='22023';end if;return receipt.result;end if;
 -- Closing round (security review B2): same per-job lock as pro_work_takeoffs_mutate, whose send_estimate
 -- branch checks pro_work_takeoff_send_check under it; an opening cannot be marked while its area is being quoted.
 perform pg_advisory_xact_lock(hashtextextended('pro-work-takeoff:'||p_actor::text||':'||wid,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-takeoff-deduction:'||p_actor::text||':'||wid,0));
 select * into m from public.pro_work_takeoff_measurements where owner_id=p_actor and work_id=wid and id=mid for update;
 if not found then raise exception 'Unknown measurement' using errcode='P0002';end if;
 if m.archived then raise exception 'Archived measurement' using errcode='22023';end if;
 if m.revision<>rev then raise exception 'Measurement changed' using errcode='40001';end if;
 if act='deduction_set' then
  select * into p from public.pro_work_takeoff_measurements where owner_id=p_actor and work_id=wid and id=pid;
  if not found or p.archived then raise exception 'Unknown area' using errcode='22023';end if;
  update public.pro_work_takeoff_measurements set deduct_from=pid,revision=revision+1,updated_at=now() where owner_id=p_actor and id=mid returning * into m;
 else
  update public.pro_work_takeoff_measurements set deduct_from=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=mid returning * into m;
 end if;
 result:=jsonb_build_object('measurement',public.pro_work_takeoff_measurement_json(m));
 insert into public.pro_work_takeoff_deduction_actions(actor_id,action_id,work_id,measurement_id,input,result) values(p_actor,aid,wid,mid,p_input,result);
 return result;
end $$;

-- An opening is never quoted on its own (its area is already taken off its parent).
create or replace function public.pro_work_takeoff_send_check(p_actor uuid,p_work text,p_ids uuid[]) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select not exists(select 1 from public.pro_work_takeoff_measurements where owner_id=p_actor and work_id=p_work and id=any(p_ids) and deduct_from is not null);
$$;

do $$declare f record;begin
 alter table public.pro_work_takeoff_deduction_actions enable row level security;
 revoke all on public.pro_work_takeoff_deduction_actions from public,anon,authenticated;
 grant select,insert on public.pro_work_takeoff_deduction_actions to service_role;
 -- Closing round (security review B1): receipts are never deleted by server code; account deletion still cascades.
 revoke update,delete,truncate on public.pro_work_takeoff_deduction_actions from service_role;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_work_takeoff_deduct_check','pro_work_takeoff_base','pro_work_takeoff_result','pro_work_takeoff_deduction_immutable','pro_work_takeoff_deduction_mutate','pro_work_takeoff_send_check') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname not in('pro_work_takeoff_deduct_check','pro_work_takeoff_deduction_immutable') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
