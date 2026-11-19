-- LOCAL PRO ONLY. Round 1 after the manual walkthrough (2026-11-12): job header and agenda list.
-- The walkthrough job still said «Nuevo · Sin programar» with a plan (12–28 nov), an accepted
-- estimate and a contract, and did not appear under «Pendientes». Read-only: no table is created
-- and no job, plan, estimate or contract row is changed. One derived phase per job:
--
--   cancelled / completed          the job's own state
--   in_progress                    today (America/Costa_Rica) inside the job dates or the plan range
--   scheduled                      the job has dates, or a plan, that start later
--   contracted                     a contract of the job was accepted by the customer
--   estimate_accepted              an accepted estimate was continued into the job
--   contract_sent                  a contract was shared and is waiting for the customer
--   quoting / new                  the job's own stage otherwise
--
-- Plan range = min(planned_start) … max(planned_end) of the job's not archived tasks.
-- Agenda list («Citas y trabajos»): the owner's jobs are 'pending' while their phase is new,
-- quoting, estimate_accepted, contract_sent or contracted without dates or plan; 'confirmed' once
-- scheduled/in progress. Supersedes pro_appointment_inbox (appointment-list-local.sql).
begin;
create or replace function public.pro_work_header_facts(p_owner uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with w as(select * from public.pro_work where user_id=p_owner and id=p_work),
 plan as(select min(p.planned_start) s,max(p.planned_end) e from public.pro_work_schedule_plans p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id
   where p.owner_id=p_owner and p.work_id=p_work and not t.archived and p.planned_start is not null),
 contract as(select c.status from public.pro_contracts c where c.owner_id=p_owner and c.work_id=p_work and c.status<>'voided'
   order by case c.status when 'accepted' then 0 when 'shared' then 1 when 'draft' then 2 else 3 end,c.number desc limit 1),
 facts as(select w.*,(select s from plan) plan_start,(select e from plan) plan_end,(select status from contract) contract_status,
   exists(select 1 from public.pro_private_estimate_work_agreements g where g.owner_id=p_owner and g.work_id=p_work) estimate_accepted,
   -- Round 7A: a quote of this job accepted by the customer but not yet continued into it (code path).
   exists(select 1 from public.pro_private_estimates d join public.pro_private_estimate_publications v on v.owner_id=d.owner_id and v.estimate_id=d.id
     join public.pro_private_estimate_publication_states s on s.publication_id=v.id
     where d.owner_id=p_owner and d.source->>'kind'='work' and d.source->>'id'=p_work and s.status='accepted'
      and not exists(select 1 from public.pro_private_estimate_work_agreements g where g.owner_id=p_owner and g.publication_id=v.id)) estimate_awaiting,
   (now() at time zone 'America/Costa_Rica')::date today,
   case when btrim(w.start)='' then null else (public.pro_instant(w.start) at time zone 'America/Costa_Rica')::date end job_start,
   case when btrim(w."end")='' then null else (public.pro_instant(w."end") at time zone 'America/Costa_Rica')::date end job_end
   from w)
 select jsonb_build_object('workId',f.id,'stage',f.stage,'cancelled',coalesce(f.cancelled,false),
  'planStart',to_char(f.plan_start,'YYYY-MM-DD'),'planEnd',to_char(f.plan_end,'YYYY-MM-DD'),'contractStatus',f.contract_status,'estimateAccepted',f.estimate_accepted,'estimateAwaitingContinue',f.estimate_awaiting and not f.estimate_accepted,
  'phase',case when coalesce(f.cancelled,false) then 'cancelled' when f.stage='completed' then 'completed'
   when f.job_start is not null and f.today between f.job_start and coalesce(f.job_end,f.job_start) or f.plan_start is not null and f.today between f.plan_start and f.plan_end then 'in_progress'
   when f.job_start is not null and f.job_start>f.today or f.plan_start is not null and f.plan_start>f.today then 'scheduled'
   when f.contract_status='accepted' then 'contracted'
   when f.estimate_accepted then 'estimate_accepted'
   when f.contract_status='shared' then 'contract_sent'
   when f.stage='quoting' then 'quoting' when f.stage='scheduled' then 'scheduled' else 'new' end)
 from facts f $$;
create or replace function public.pro_work_header(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 return public.pro_work_header_facts(p_actor,p_work);
end $$;
create or replace function public.pro_appointment_inbox(p_owner uuid,p_status text default 'pending',p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with entries as (
 select r.id::text id,'request'::text source,r.client_name client,r.service,
 coalesce(pro_instant(w.start),r.proposed_start,r.requested_start) start,
 coalesce(pro_instant(w.start),r.proposed_start,r.requested_start,r.created_at) at,
 case when w.cancelled or r.status in ('cancelled','declined') then 'cancelled' when w.stage='completed' or r.status='completed' then 'completed' when r.status in ('requested','proposed') then 'pending' else 'confirmed' end status,
 r.status detail_status
 from pro_appointment_requests r left join pro_work w on w.user_id=r.owner_id and w.id=r.work_id where r.owner_id=p_owner and r.origin='booking'
 union all
 select w.id,'manual',w.client,w.service,coalesce(pro_instant(nullif(w.start,'')),(h.facts->>'planStart')::date::timestamp at time zone 'America/Costa_Rica'),
 coalesce(pro_instant(nullif(w.start,'')),(h.facts->>'planStart')::date::timestamp at time zone 'America/Costa_Rica','epoch'::timestamptz),
 case h.facts->>'phase' when 'cancelled' then 'cancelled' when 'completed' then 'completed' when 'scheduled' then 'confirmed' when 'in_progress' then 'confirmed' else 'pending' end,
 h.facts->>'phase'
 from pro_work w cross join lateral (select public.pro_work_header_facts(p_owner,w.id) facts) h
 where w.user_id=p_owner and not exists(select 1 from pro_appointment_requests r where r.owner_id=p_owner and r.work_id=w.id and r.origin='booking')
 ), page as (
 select * from entries where (p_status='all' or status=p_status)
 and (p_after is null or (at,source,id)>((p_after->>'at')::timestamptz,p_after->>'source',p_after->>'id'))
 order by at,source,id limit 26
 ), visible as (select * from page order by at,source,id limit 25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v)-'at' order by at,source,id) from visible v),'[]'::jsonb),
 'nextCursor',case when (select count(*) from page)>25 then (select jsonb_build_object('at',at,'source',source,'id',id) from visible order by at desc,source desc,id desc limit 1) else null end);
$$;
revoke all on function public.pro_work_header_facts(uuid,text),public.pro_work_header(uuid,text),public.pro_appointment_inbox(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pro_work_header_facts(uuid,text),public.pro_work_header(uuid,text),public.pro_appointment_inbox(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
