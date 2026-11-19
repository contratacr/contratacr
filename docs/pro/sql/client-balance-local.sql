-- LOCAL PRO ONLY. Round 1 after the manual walkthrough (2026-11-12): ONE customer balance.
-- The walkthrough showed three different balances for the same customer (customer record
-- ₡708.550, statement ₡658.550, invoice draft ₡1.008.550). The single formula, per job:
--
--   agreed      = latest manual agreement entry (owner edit) ▸ else the accepted request quote
--                 (request-quotes-local.sql) ▸ else the accepted private estimate continued
--                 into the job (pro_private_estimate_work_agreements, CRC)
--   paid        = Σ ledger payments − Σ ledger payment voids (pro_client_entries). A retainer
--                 (anticipo) received is ALWAYS one ledger payment, and applying it to an
--                 invoice only allocates that same money: it is counted once, here.
--   credit notes= Σ credit-note applications of the job not reverted (pro_credit_applications)
--   customer balance = max(agreed − paid − credit notes, 0)       (null while agreed is null)
--   creditCents (money in favour) = max(paid − agreed, 0)         (a credit note never is money)
--
-- Used by: customer record (pro_client_operations_page summary.customerBalanceCents),
-- customer statement (pro_client_statement_page: Σ max(max(agreed−paid,0) − notes,0), the same
-- number), and the invoice draft ("saldo actual del cliente en este trabajo", read live through
-- pro_client_job_balance). balanceCents (agreed − paid) is kept unchanged for the payment
-- validations that already rely on it. Read-only module: no table and no row is changed.
-- Supersedes pro_work_account (request-quotes-local.sql) and pro_client_operations_page
-- (client-operations-draft.sql) with the same signatures and only ADDED keys.
begin;
create or replace function public.pro_client_job_credit_notes(p_user uuid,p_work text) returns bigint
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(sum(a.amount_cents),0)::bigint from public.pro_credit_applications a join public.pro_credits c on c.owner_id=a.owner_id and c.id=a.credit_id
 where a.owner_id=p_user and a.work_id=p_work and c.kind='credit_note' and a.invoice_application_id is null
  and not exists(select 1 from public.pro_credit_application_reversals r where r.owner_id=a.owner_id and r.application_id=a.id) $$;
create or replace function public.pro_work_account(p_user uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with account_values as (
 select w.*,
 coalesce(
  (select amount_cents from pro_client_entries where user_id=p_user and work_id=w.id and kind='agreement' order by position desc limit 1),
  -- Quotes are CRC documents with integer-colon totals. Derive cents exactly;
  -- this is a reading of the accepted document, never a charge or ledger entry.
  (select q.total::bigint*100
   from pro_request_quotes m
   join pro_appointment_requests r on r.id=m.request_id and r.owner_id=m.owner_id and r.client_user_id=m.client_user_id
   join quotes q on q.id=m.quote_id and q.client_id=m.client_user_id and q.professional_id=r.professional_id
   join professionals p on p.id=q.professional_id and p.profile_id=m.owner_id
   where m.owner_id=p_user and m.accepted and q.status='accepted' and q.deleted_at is null
    and r.work_id=w.id and w."externalQuoteId"=q.id::text and nullif(w."quoteId",'') is null
    and w."clientId"='reservation-'||r.client_user_id::text and w."bookingClientId"=r.client_user_id::text),
  -- Round 1: the accepted private estimate continued into this job (CRC only), until the owner edits it.
  (select g.total_cents from pro_private_estimate_work_agreements g where g.owner_id=p_user and g.work_id=w.id and g.currency='CRC')
 ) as agreed,
 case when exists(select 1 from pro_client_entries where user_id=p_user and work_id=w.id and kind='agreement') then 'agreement'
  when exists(select 1 from pro_private_estimate_work_agreements g where g.owner_id=p_user and g.work_id=w.id and g.currency='CRC')
   and not exists(select 1 from pro_request_quotes m join pro_appointment_requests r on r.id=m.request_id where m.owner_id=p_user and m.accepted and r.work_id=w.id and w."externalQuoteId" is not null) then 'estimate'
  else null end as agreed_kind,
 (select (v.content->>'taxCents')::bigint from pro_private_estimate_work_agreements g join pro_private_estimate_publications v on v.id=g.publication_id where g.owner_id=p_user and g.work_id=w.id and g.currency='CRC') as estimate_tax,
 public.pro_client_job_credit_notes(p_user,w.id) as credit_notes,
 (select coalesce(sum(case when kind='payment' then amount_cents when kind='payment_void' then -amount_cents else 0 end),0) from pro_client_entries where user_id=p_user and work_id=w.id) as paid,
 (select count(*) from pro_client_entries e where e.user_id=p_user and e.work_id=w.id and e.kind='material' and not exists(select 1 from pro_client_entries r where r.user_id=e.user_id and r.reversal_id=e.id)) as materials,
 (select coalesce(sum(case when kind='material' then round(quantity*unit_cost,2) when kind='material_return' then -round(quantity*unit_cost,2) else 0 end),0) from pro_client_entries where user_id=p_user and work_id=w.id) as material_cost
 from pro_work w where w.user_id=p_user and w.id=p_work
 ) select jsonb_build_object('id',id,'service',service,'stage',stage,'cancelled',cancelled,'start',start,'quoteId',"quoteId",'externalQuoteId',"externalQuoteId",'agreedCents',agreed,'paidCents',paid,'balanceCents',coalesce(agreed,0)-paid,'materialCount',materials,'materialCost',material_cost,
 'agreedSource',case when agreed is null then null when agreed_kind is not null then agreed_kind else 'quote' end,
 'agreedTaxCents',case when agreed_kind='estimate' then estimate_tax else null end,
 'creditNotesCents',credit_notes,
 'customerBalanceCents',case when agreed is null then null else greatest(agreed-paid-credit_notes,0) end) from account_values;
$$;

create or replace function public.pro_client_operations_page(p_user uuid,p_client text,p_work text default '',p_after jsonb default null,p_entries_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with accounts as materialized (
 select pro_work_account(p_user,w.id) as a,coalesce(to_char(pro_instant(w.start) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'') as at from pro_work w where w.user_id=p_user and w."clientId"=p_client
 ), page as (
 select a,at from accounts where p_after is null or at<p_after->>'at' or at=p_after->>'at' and a->>'id'>p_after->>'id' order by at desc,a->>'id' limit 21
 ), entries as (
 select e.*,exists(select 1 from pro_client_entries r where r.user_id=e.user_id and r.reversal_id=e.id) as reversed
 from pro_client_entries e where e.user_id=p_user and e.client_id=p_client and e.work_id=p_work and (p_entries_after is null or e.position<(p_entries_after->>'position')::bigint) order by e.position desc limit 21
 ) select jsonb_build_object(
 'revision',(select revision from pro_workspace_core where user_id=p_user),
 'summary',jsonb_build_object('agreedCents',coalesce((select sum((a->>'agreedCents')::bigint) from accounts),0),'paidCents',coalesce((select sum((a->>'paidCents')::bigint) from accounts),0),'balanceCents',coalesce((select sum((a->>'balanceCents')::bigint) from accounts),0),
 'creditNotesCents',coalesce((select sum((a->>'creditNotesCents')::bigint) from accounts),0),'customerBalanceCents',coalesce((select sum((a->>'customerBalanceCents')::bigint) from accounts),0),'unpriced',(select count(*) from accounts where a->>'agreedCents' is null and not(a->>'cancelled')::boolean)),
 'items',coalesce((select jsonb_agg(a order by at desc,a->>'id') from (select a,at from page order by at desc,a->>'id' limit 20) p),'[]'),
 'nextCursor',case when (select count(*) from page)>20 then (select jsonb_build_object('at',at,'id',a->>'id') from page order by at desc,a->>'id' offset 19 limit 1) else null end,
 'work',(select a from accounts where a->>'id'=p_work),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amountCents',amount_cents,'quantity',quantity,'label',label,'at',created_at,'reversed',reversed) order by position desc) from (select * from entries order by position desc limit 20) p),'[]'),
 'nextEntryCursor',case when (select count(*) from entries)>20 then (select jsonb_build_object('position',position::text) from entries order by position desc offset 19 limit 1) else null end
 ) where exists(select 1 from pro_clients where user_id=p_user and id=p_client) and (p_work='' or exists(select 1 from pro_work where user_id=p_user and "clientId"=p_client and id=p_work));
$$;

create or replace function public.pro_client_job_balance(p_user uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare a jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_user),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 a:=public.pro_work_account(p_user,p_work);if a is null then return null;end if;
 return jsonb_build_object('workId',p_work,'agreedCents',a->'agreedCents','agreedSource',a->'agreedSource','paidCents',a->'paidCents','creditNotesCents',a->'creditNotesCents',
  'customerBalanceCents',a->'customerBalanceCents','creditCents',greatest(-(a->>'balanceCents')::bigint,0));
end $$;
revoke all on function public.pro_client_job_credit_notes(uuid,text),public.pro_work_account(uuid,text),public.pro_client_operations_page(uuid,text,text,jsonb,jsonb),public.pro_client_job_balance(uuid,text) from public,anon,authenticated;
grant execute on function public.pro_client_job_credit_notes(uuid,text),public.pro_work_account(uuid,text),public.pro_client_operations_page(uuid,text,text,jsonb,jsonb),public.pro_client_job_balance(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
