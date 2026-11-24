-- Pro area E (reports): saved custom reports. A saved report remembers a report type and a period (fixed dates or a rolling range)
-- under a name, so the owner reopens it with one click. It stores no financial data, only the filter.
begin;
create table if not exists public.pro_saved_reports(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(name) between 1 and 80 and name=btrim(name)),
 report text not null check(report in('financial','customers','payments','vat','payables','cashflow','income','jobs','timeMember','timeProject','selections')),
 range_kind text not null check(range_kind in('all','fixed','this_month','last_month','this_year','last_30','last_90')),
 date_from date,date_to date,
 created_at timestamptz not null default now(),
 primary key(owner_id,id),
 check((range_kind='fixed')=(date_from is not null or date_to is not null)),
 check(date_from is null or date_to is null or date_from<=date_to)
);
create unique index if not exists pro_saved_reports_name on public.pro_saved_reports(owner_id,lower(name));

create or replace function public.pro_saved_reports_read(p_actor uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('reports',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'report',r.report,'range',r.range_kind,'from',r.date_from,'to',r.date_to) order by r.created_at,r.id),'[]'::jsonb))
 from public.pro_saved_reports r where r.owner_id=p_actor $$;

create or replace function public.pro_saved_reports_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;rid uuid;v_name text;v_from date;v_to date;v_kind text;keys text[];
begin
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid report action' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from case act when 'save' then array['action','from','id','name','range','report','to'] when 'delete' then array['action','id'] end then raise exception 'Invalid report fields' using errcode='22023';end if;
 if jsonb_typeof(p_input->'id') is distinct from 'string' or not (p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid report id' using errcode='22023';end if;
 rid:=(p_input->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('saved-reports:'||p_actor::text,0));
 if act='save' then
  if jsonb_typeof(p_input->'name') is distinct from 'string' then raise exception 'Invalid report name' using errcode='22023';end if;
  v_name:=btrim(p_input->>'name');if length(v_name) not between 1 and 80 then raise exception 'Invalid report name' using errcode='22023';end if;
  v_kind:=p_input->>'range';
  if jsonb_typeof(p_input->'report') is distinct from 'string' or jsonb_typeof(p_input->'range') is distinct from 'string' then raise exception 'Invalid report' using errcode='22023';end if;
  if jsonb_typeof(p_input->'from') not in('string','null') or jsonb_typeof(p_input->'to') not in('string','null') then raise exception 'Invalid dates' using errcode='22023';end if;
  v_from:=case when jsonb_typeof(p_input->'from')='string' then (p_input->>'from')::date end;
  v_to:=case when jsonb_typeof(p_input->'to')='string' then (p_input->>'to')::date end;
  if (select count(*) from public.pro_saved_reports where owner_id=p_actor and id<>rid)>=30 then raise exception 'Report limit' using errcode='54000';end if;
  insert into public.pro_saved_reports(owner_id,id,name,report,range_kind,date_from,date_to) values(p_actor,rid,v_name,p_input->>'report',v_kind,v_from,v_to)
   on conflict(owner_id,id) do update set name=excluded.name,report=excluded.report,range_kind=excluded.range_kind,date_from=excluded.date_from,date_to=excluded.date_to;
 elsif act='delete' then
  delete from public.pro_saved_reports where owner_id=p_actor and id=rid;if not found then raise exception 'Report unavailable' using errcode='P0002';end if;
 else raise exception 'Invalid report action' using errcode='22023';end if;
 return public.pro_saved_reports_read(p_actor);
end $$;

do $$declare f record;begin
 alter table public.pro_saved_reports enable row level security;
 revoke all on public.pro_saved_reports from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_saved_reports to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_saved_reports_read','pro_saved_reports_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
