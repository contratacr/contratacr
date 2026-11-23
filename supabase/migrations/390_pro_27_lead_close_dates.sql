-- ContrataCR Pro, database part 27 (row 07): expected close date per lead and the forecast by close date.
-- The close date is a side record keyed by lead (the existing lead writers and their receipts are untouched). It is set or
-- cleared with a per-lead revision (CAS 40001), an idempotent actionId receipt and an immutable history. The reader groups
-- the OPEN leads (not archived, lost, won or converted to a job) by Costa Rica month of the expected close date, with the
-- estimated value and the value weighted by the stage probability per currency; overdue and undated leads are separate
-- groups. A forecast is not a payment or an invoice. Nothing is sent. PRO_ENABLED stays false in production.
begin;
create table if not exists public.pro_lead_close_dates(
 owner_id uuid not null references public.profiles(id) on delete cascade,kind text not null check(kind in('manual','request')),lead_id uuid not null,
 close_on date check(close_on is null or close_on between date'2000-01-01' and date'2100-12-31'),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,kind,lead_id));
create table if not exists public.pro_lead_close_date_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_lead_close_date_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,kind text not null,lead_id uuid not null,
 before_on date,after_on date,revision integer not null,actor_name text not null default '',at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
do $$declare t text;begin
 foreach t in array array['pro_lead_close_dates','pro_lead_close_date_actions','pro_lead_close_date_history'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
 foreach t in array array['pro_lead_close_date_actions','pro_lead_close_date_history'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_lead_stage_immutable()',t||'_immutable',t);
 end loop;
end $$;

create or replace function public.pro_lead_close_forecast_read(p_owner uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare today date;settings jsonb;answer jsonb;
begin
 perform public.pro_lead_origin_owner(p_owner);
 perform public.pro_lead_stage_observe(p_owner);
 today:=public.pro_lead_inbox_today();settings:=public.pro_lead_stage_settings(p_owner);
 with st as(select x->>'id' id,(x->>'probability')::integer prob from jsonb_array_elements(settings->'stages') x),
 src as materialized(select s.kind,s.id,s.effective_stage,coalesce(nullif(s.service_label,''),'') title,l.currency,l.revenue_cents,d.close_on,coalesce(d.revision,0) revision,
   coalesce((select prob from st where st.id=s.effective_stage),0) prob
  from public.pro_lead_inbox_sources(p_owner,'') s
  left join public.pro_lead_center_records l on s.kind='manual' and l.owner_id=p_owner and l.kind='manual' and l.id=s.id
  left join public.pro_lead_outcomes o on o.owner_id=p_owner and o.kind=s.kind and o.lead_id=s.id
  left join public.pro_lead_close_dates d on d.owner_id=p_owner and d.kind=s.kind and d.lead_id=s.id
  where not s.archived and s.effective_stage<>'won' and coalesce(o.outcome,'')not in('lost','won') and not public.pro_lead_pipeline_converted(p_owner,s.kind,s.id)),
 grp as(select case when close_on is null then 'none' when close_on<today then 'overdue' else to_char(close_on,'YYYY-MM') end g,currency,
   count(*) n,sum(revenue_cents) total,sum(round(revenue_cents*prob/100.0)) weighted from src group by 1,2),
 groups as(select g,sum(n) n from grp group by g)
 select jsonb_build_object('today',to_char(today,'YYYY-MM-DD'),
  'groups',coalesce((select jsonb_agg(jsonb_build_object('group',gr.g,'count',gr.n,
     'values',coalesce((select jsonb_agg(jsonb_build_object('currency',v.currency,'totalCents',v.total,'weightedCents',v.weighted) order by v.currency) from grp v where v.g=gr.g and v.currency is not null and v.total is not null),'[]'::jsonb),
     'withoutValue',(select count(*) from src where(case when src.close_on is null then 'none' when src.close_on<today then 'overdue' else to_char(src.close_on,'YYYY-MM') end)=gr.g and(src.revenue_cents is null or src.currency is null)))
    order by case gr.g when 'overdue' then '0' when 'none' then '9' else '1'||gr.g end) from groups gr),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(jsonb_build_object('kind',x.kind,'id',x.id,'title',left(x.title,400),'stageId',x.effective_stage,'probability',x.prob,'currency',x.currency,'revenueCents',x.revenue_cents,
     'closeOn',x.close_on,'revision',x.revision) order by x.close_on nulls last,x.title,x.id)
    from(select * from src order by close_on nulls last,title,id limit 200) x),'[]'::jsonb))
 into answer;
 return answer;
end $$;

create or replace function public.pro_lead_close_date_mutate(p_owner uuid,p_input jsonb,p_member uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;receipt public.pro_lead_close_date_actions;lid uuid;k text;cur public.pro_lead_close_dates;day date;before_on date;rev integer;answer jsonb;
begin
 perform public.pro_lead_origin_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid close date' using errcode='22023';end if;
 select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from array['actionId','closeOn','id','kind','revision']
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false)
  or jsonb_typeof(p_input->'kind') is distinct from 'string' or p_input->>'kind' not in('manual','request')
  or jsonb_typeof(p_input->'closeOn') not in('string','null') then raise exception 'Unexpected close date fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 k:=p_input->>'kind';rev:=(p_input->>'revision')::integer;
 if jsonb_typeof(p_input->'closeOn')='string' then
  if not coalesce(p_input->>'closeOn'~'^\d{4}-\d{2}-\d{2}$',false) then raise exception 'Invalid close date' using errcode='22023';end if;
  begin day:=(p_input->>'closeOn')::date;exception when others then raise exception 'Invalid close date' using errcode='22023';end;
  if day not between date'2000-01-01' and date'2100-12-31' then raise exception 'Invalid close date' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-lead-close-date:'||p_owner::text||k||lid::text,0));
 select * into receipt from public.pro_lead_close_date_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 if not exists(select 1 from public.pro_lead_inbox_sources(p_owner,'') s where s.kind=k and s.id=lid) then raise exception 'Lead unavailable' using errcode='P0002';end if;
 select * into cur from public.pro_lead_close_dates where owner_id=p_owner and kind=k and lead_id=lid for update;
 if coalesce(cur.revision,0)<>rev then raise exception 'Close date changed' using errcode='40001';end if;
 if rev>=2147483646 then raise exception 'Close date revision exhausted' using errcode='40001';end if;
 before_on:=cur.close_on;
 insert into public.pro_lead_close_dates(owner_id,kind,lead_id,close_on,revision) values(p_owner,k,lid,day,rev+1)
 on conflict(owner_id,kind,lead_id) do update set close_on=excluded.close_on,revision=excluded.revision,updated_at=clock_timestamp();
 answer:=jsonb_build_object('kind',k,'id',lid,'closeOn',day,'revision',rev+1);
 insert into public.pro_lead_close_date_history(owner_id,action_id,kind,lead_id,before_on,after_on,revision,actor_name)
 values(p_owner,aid,k,lid,before_on,day,rev+1,left(coalesce(public.pro_team_name(case when p_member is not null and public.pro_role_of(p_member,p_owner) is not null then p_member else p_owner end),''),160));
 insert into public.pro_lead_close_date_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_lead_close_forecast_read','pro_lead_close_date_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
notify pgrst,'reload schema';
commit;
