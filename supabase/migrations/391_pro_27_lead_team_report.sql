-- ContrataCR Pro, database part 27 (row 08): conversion by team member.
-- Same funnel counts as pro_lead_conversion_report (received in a Costa Rica period, reached meeting, reached quote, won, lost,
-- converted to a job by an explicit current link) but grouped by the person the lead is assigned to (pro_lead_assignments).
-- Leads without an assignee, or whose assignee was removed, are grouped as "unassigned". Read only; nothing is sent or changed.
begin;
create or replace function public.pro_lead_team_conversion_report(p_owner uuid,p_from date,p_to date) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare catalog jsonb;meeting_pos integer;estimate_pos integer;answer jsonb;
begin
 perform public.pro_lead_origin_owner(p_owner);
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 or p_from<date'1900-01-01' or p_to>date'2100-12-31' then raise exception 'Invalid conversion report' using errcode='22023';end if;
 catalog:=public.pro_lead_origin_stage_catalog(p_owner);
 select(s->>'position')::integer into meeting_pos from jsonb_array_elements(catalog->'stages') s where s->>'id'='meeting_scheduled';
 select(s->>'position')::integer into estimate_pos from jsonb_array_elements(catalog->'stages') s where s->>'id'='estimate_sent';
 with base as materialized(
  select b.kind,b.id,b.created_day,b.effective_stage,(select(s->>'position')::integer from jsonb_array_elements(catalog->'stages') s where s->>'id'=b.effective_stage) pos,
   public.pro_lead_pipeline_converted(p_owner,b.kind,b.id) converted,o.outcome,coalesce(a.assignee_id::text,'unassigned') gkey
  from public.pro_lead_inbox_sources(p_owner,'') b
  left join public.pro_lead_outcomes o on o.owner_id=p_owner and o.kind=b.kind and o.lead_id=b.id
  left join public.pro_lead_assignments a on a.owner_id=p_owner and a.kind=b.kind and a.lead_id=b.id
  where b.created_day between p_from and p_to),
 grouped as(select gkey,count(*) received,count(*) filter(where pos>=meeting_pos or converted) meeting,count(*) filter(where pos>=estimate_pos or converted) estimate,
   count(*) filter(where effective_stage='won' or outcome='won' or converted) won,count(*) filter(where outcome='lost') lost,count(*) filter(where converted) converted from base group by gkey),
 months as(select to_char(date_trunc('month',created_day),'YYYY-MM') mon,count(*) received,count(*) filter(where converted) converted from base group by 1)
 select jsonb_build_object('from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),'group','member',
  'rows',coalesce((select jsonb_agg(jsonb_build_object('key',g.gkey,
    'name',case when g.gkey='unassigned' then null else nullif(public.pro_team_name(g.gkey::uuid),'') end,'campaignChannel',null,
    'received',g.received,'meeting',g.meeting,'estimate',g.estimate,'won',g.won,'lost',g.lost,'converted',g.converted,
    'conversionRate',case when g.received=0 then null else round(g.converted*100.0/g.received,1) end) order by g.received desc,g.gkey) from grouped g),'[]'::jsonb),
  'totals',(select jsonb_build_object('received',count(*),'meeting',count(*) filter(where pos>=meeting_pos or converted),'estimate',count(*) filter(where pos>=estimate_pos or converted),
    'won',count(*) filter(where effective_stage='won' or outcome='won' or converted),'lost',count(*) filter(where outcome='lost'),'converted',count(*) filter(where converted)) from base),
  'months',coalesce((select jsonb_agg(jsonb_build_object('month',mon,'received',received,'converted',converted) order by mon) from months),'[]'::jsonb))
 into answer;
 return answer;
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pro_lead_team_conversion_report' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
notify pgrst,'reload schema';
commit;
