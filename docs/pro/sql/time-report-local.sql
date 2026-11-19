-- LOCAL PRO ONLY. Round 9 (2026-11-15): global hours view across jobs (read only).
-- One ledger: stopped time entries (Horas, cronómetro por persona) with their LIVE job-cost line
-- (edits in Costos follow the chain; voided lines are excluded) plus time lines recorded directly in
-- «Costos y pagos» (source 'ledger'), exactly as the per-job Horas view counts them, so totals never
-- disagree. Filters: period (≤ 366 days, America/Costa_Rica dates), job, person, billable.
-- Person: the person timer's person, else the person recorded for the entry (pro_time_entry_people),
-- else the account owner. Nothing is written. RLS + service_role-only; security invoker.
begin;
create or replace function public.pro_time_report_rows(p_actor uuid,p_from date,p_to date) returns table(
 id uuid,work_id text,work_title text,recorded_on date,minutes integer,billable boolean,rate_cents bigint,billable_cents bigint,cost_cents bigint,
 activity_name text,person_key text,person_name text,source text,note text,created_at timestamptz)
language sql stable security invoker set search_path=public,pg_temp as $$
 with mine as(
  select e.*,l.minutes live_minutes,l.hourly_cost_cents line_cost,l.amount_cents line_amount,l.id live_id
  from public.pro_time_entries e join public.pro_work_cost_entries l on l.user_id=e.owner_id and l.id=public.pro_time_live_line(e.owner_id,e.cost_entry_id)
  where e.owner_id=p_actor and e.status='stopped' and e.recorded_on between p_from and p_to)
 select m.id,m.work_id,w.service,m.recorded_on,m.live_minutes,m.billable,m.rate_cents,
  case when m.billable and m.rate_cents is not null then round(m.live_minutes::numeric*m.rate_cents/60)::bigint end,
  case when m.line_cost is not null then m.line_amount end,
  a.name,
  coalesce('person:'||t.person_id::text,case when pp.grant_id is not null then 'grant:'||pp.grant_id::text end,case when pp.name is not null and pp.name<>'Propietario' then 'name:'||pp.name end,'owner'),
  coalesce(nullif(t.person_name,''),pp.name,'Propietario'),m.source,m.note,m.created_at
 from mine m join public.pro_work w on w.user_id=m.owner_id and w.id=m.work_id
 left join public.pro_time_activities a on a.owner_id=m.owner_id and a.id=m.activity_id
 left join public.pro_time_entry_people pp on pp.owner_id=m.owner_id and pp.entry_id=m.id
 left join lateral(select x.person_id,x.person_name from public.pro_work_timers x where x.owner_id=m.owner_id and x.time_entry_id=m.id limit 1) t on true
 union all
 select l.id,l.work_id,w.service,l.recorded_on,l.minutes,false,null::bigint,null::bigint,case when l.hourly_cost_cents is not null then l.amount_cents end,
  null::text,'owner','Propietario','ledger',l.note,l.created_at
 from public.pro_work_cost_entries l join public.pro_work w on w.user_id=l.user_id and w.id=l.work_id
 where l.user_id=p_actor and l.kind='time' and l.recorded_on between p_from and p_to
  and not exists(select 1 from public.pro_work_cost_entries r where r.user_id=l.user_id and r.reversal_id=l.id)
  and not exists(select 1 from public.pro_time_entries e where e.owner_id=p_actor and e.cost_entry_id is not null and (e.cost_entry_id=l.id or public.pro_time_live_line(e.owner_id,e.cost_entry_id)=l.id));
$$;

create or replace function public.pro_time_report_read(p_actor uuid,p_filters jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare first_day date;last_day date;v_work text;v_person text;v_billable text;all_rows jsonb;filtered jsonb;rows_json jsonb;totals jsonb;by_person jsonb;by_work jsonb;people jsonb;jobs jsonb;total_rows bigint;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or not coalesce(p_filters->>'from','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not coalesce(p_filters->>'to','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid report query' using errcode='22023';end if;
 first_day:=(p_filters->>'from')::date;last_day:=(p_filters->>'to')::date;
 if first_day<date'1900-01-01' or last_day>date'2100-12-31' or last_day-first_day not between 0 and 366 then raise exception 'Invalid report period' using errcode='22023';end if;
 v_work:=nullif(p_filters->>'workId','');v_person:=nullif(p_filters->>'person','');v_billable:=coalesce(nullif(p_filters->>'billable',''),'all');
 if v_billable not in('all','billable','nonbillable') or length(coalesce(v_work,''))>160 or length(coalesce(v_person,''))>200 then raise exception 'Invalid report filter' using errcode='22023';end if;
 -- One pass over the ledger of the period (no temporary tables: the read stays read-only).
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into all_rows from public.pro_time_report_rows(p_actor,first_day,last_day) r;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into filtered from jsonb_array_elements(all_rows) x
  where (v_work is null or x->>'work_id'=v_work) and (v_person is null or x->>'person_key'=v_person)
   and (v_billable='all' or v_billable='billable' and (x->>'billable')::boolean or v_billable='nonbillable' and not (x->>'billable')::boolean);
 total_rows:=jsonb_array_length(filtered);
 select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','workId',x->>'work_id','workTitle',x->>'work_title','date',x->>'recorded_on','minutes',(x->>'minutes')::int,
   'billable',(x->>'billable')::boolean,'billableCents',(x->>'billable_cents')::bigint,'costCents',(x->>'cost_cents')::bigint,'activity',x->>'activity_name','personKey',x->>'person_key','personName',x->>'person_name','source',x->>'source','note',x->>'note')
   order by x->>'recorded_on' desc,x->>'created_at' desc,x->>'id'),'[]'::jsonb) into rows_json
  from (select x from jsonb_array_elements(filtered) x order by x->>'recorded_on' desc,x->>'created_at' desc,x->>'id' limit 1000) y;
 select jsonb_build_object('entries',count(*),'minutes',coalesce(sum((x->>'minutes')::int),0),'billableMinutes',coalesce(sum((x->>'minutes')::int) filter(where (x->>'billable')::boolean),0),
   'billableCents',coalesce(sum((x->>'billable_cents')::bigint),0),'costCents',coalesce(sum((x->>'cost_cents')::bigint),0),'uncostedMinutes',coalesce(sum((x->>'minutes')::int) filter(where x->>'cost_cents' is null),0)) into totals from jsonb_array_elements(filtered) x;
 select coalesce(jsonb_agg(jsonb_build_object('key',g.k,'name',g.n,'minutes',g.m,'billableCents',g.c) order by g.m desc,g.n),'[]'::jsonb) into by_person
  from (select x->>'person_key' k,min(x->>'person_name') n,sum((x->>'minutes')::int) m,coalesce(sum((x->>'billable_cents')::bigint),0) c from jsonb_array_elements(filtered) x group by 1) g;
 select coalesce(jsonb_agg(jsonb_build_object('workId',g.k,'title',g.n,'minutes',g.m,'billableCents',g.c) order by g.m desc,g.n),'[]'::jsonb) into by_work
  from (select x->>'work_id' k,min(x->>'work_title') n,sum((x->>'minutes')::int) m,coalesce(sum((x->>'billable_cents')::bigint),0) c from jsonb_array_elements(filtered) x group by 1) g;
 -- Filter options come from the whole period (not the filtered rows), so a filter can always be changed.
 select coalesce(jsonb_agg(jsonb_build_object('key',p.k,'name',p.n) order by p.n),'[]'::jsonb) into people
  from (select x->>'person_key' k,min(x->>'person_name') n from jsonb_array_elements(all_rows) x group by 1) p;
 select coalesce(jsonb_agg(jsonb_build_object('workId',w.id,'title',w.service) order by w.service,w.id),'[]'::jsonb) into jobs
  from (select id,service from public.pro_work where user_id=p_actor order by service,id limit 500) w;
 return jsonb_build_object('period',jsonb_build_object('from',to_char(first_day,'YYYY-MM-DD'),'to',to_char(last_day,'YYYY-MM-DD')),
  'filters',jsonb_build_object('workId',v_work,'person',v_person,'billable',v_billable),'rows',rows_json,'truncated',total_rows>1000,
  'totals',totals,'byPerson',by_person,'byWork',by_work,'people',people,'jobs',jobs);
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_time_report_rows','pro_time_report_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
