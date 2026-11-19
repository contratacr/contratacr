-- Round 7B (Houzz parity: Reports): financial and jobs reports for the owner, read-only.
-- One reader, security invoker, service_role only (the /api/pro/reports route passes the
-- authenticated actor). Every figure comes from the existing single formulas:
--   * per job: pro_work_overview_read(...,'finance') (agreed, paid, invoiced, costs, result),
--   * invoiced: non-archived invoice drafts; collected: payments received (pro_invoice_payments);
--   * outstanding/aging: per invoice draft, total minus non-voided payment applications, aged by
--     its creation day in America/Costa_Rica (0-30, 31-60, 61-90, 90+ days).
-- CRC cents everywhere (bigint). Nothing is written.
create or replace function public.pro_reports_read(p_actor uuid,p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;jobs jsonb;aging jsonb;invoiced bigint;collected bigint;outstanding bigint;w record;fin jsonb;
begin
 if p_actor is null then raise exception 'Invalid actor' using errcode='22023';end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if (p_from is not null and p_from not between date'2000-01-01' and date'2100-12-31') or (p_to is not null and p_to not between date'2000-01-01' and date'2100-12-31') or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid report period' using errcode='22023';end if;
 -- Invoices in the period (by creation day, Costa Rica), not archived.
 with d as (
  select d.id,d.total_cents,(d.created_at at time zone 'America/Costa_Rica')::date as day,
   d.total_cents-coalesce((select sum(a.amount_cents) from public.pro_invoice_payment_applications a where a.user_id=d.user_id and a.draft_id=d.id and not exists(select 1 from public.pro_invoice_payment_voids v where v.user_id=a.user_id and v.application_id=a.id)),0) as open_cents
  from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
  where d.user_id=p_actor and not coalesce(m.archived,false)
   and (p_from is null or (d.created_at at time zone 'America/Costa_Rica')::date>=p_from) and (p_to is null or (d.created_at at time zone 'America/Costa_Rica')::date<=p_to))
 select coalesce(sum(total_cents),0)::bigint,coalesce(sum(greatest(open_cents,0)),0)::bigint,
  jsonb_build_object(
   'd0_30',coalesce(sum(greatest(open_cents,0)) filter(where today-day<=30),0)::bigint,
   'd31_60',coalesce(sum(greatest(open_cents,0)) filter(where today-day between 31 and 60),0)::bigint,
   'd61_90',coalesce(sum(greatest(open_cents,0)) filter(where today-day between 61 and 90),0)::bigint,
   'd90_plus',coalesce(sum(greatest(open_cents,0)) filter(where today-day>90),0)::bigint,
   'openInvoices',count(*) filter(where open_cents>0))
 into invoiced,outstanding,aging from d;
 select coalesce(sum(p.amount_cents),0)::bigint into collected from public.pro_invoice_payments p
  where p.user_id=p_actor and (p_from is null or p.received_on>=p_from) and (p_to is null or p.received_on<=p_to);
 jobs:='[]'::jsonb;
 for w in select x.id,x.service,x.client,x.stage,coalesce(x.cancelled,false) cancelled,x.start,x."end" from public.pro_work x where x.user_id=p_actor order by coalesce(x.start,'') desc,x.id limit 200 loop
  fin:=public.pro_work_overview_read(p_actor,w.id,'finance');
  if fin is null then continue;end if;
  jobs:=jobs||jsonb_build_array(jsonb_build_object('workId',w.id,'service',coalesce(w.service,''),'client',coalesce(w.client,''),'stage',coalesce(w.stage,''),'cancelled',w.cancelled,
   'start',nullif(left(coalesce(w.start,''),10),''),'end',nullif(left(coalesce(w."end",''),10),''),
   'agreedCents',fin->'agreedCents','agreedNetCents',fin->'agreedNetCents','invoicedCents',coalesce((fin->>'invoicedCents')::bigint,0),'paidCents',coalesce((fin->>'paidCents')::bigint,0),'balanceCents',fin->'balanceCents',
   'costCents',coalesce((fin->>'costCents')::bigint,0),'committedCents',coalesce((fin->>'committedCents')::bigint,0),'resultCents',fin->'resultCents'));
   -- balance/agreed/result stay null while the job has no agreement («Sin definir»).
 end loop;
 return jsonb_build_object('today',today,'from',p_from,'to',p_to,'invoicedCents',invoiced,'collectedCents',collected,'outstandingCents',outstanding,'aging',aging,'jobs',jobs,'truncated',(select count(*) from public.pro_work where user_id=p_actor)>200);
end $$;
revoke all on function public.pro_reports_read(uuid,date,date) from public,anon,authenticated;
grant execute on function public.pro_reports_read(uuid,date,date) to service_role;
