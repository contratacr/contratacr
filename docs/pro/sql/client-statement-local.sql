-- LOCAL ONLY. Read-only statement derived from existing agreements and canonical payments.
-- Draft invoices are not debts. Standalone payments never offset work balances implicitly.
begin;
create or replace function public.pro_client_statement_page(p_user uuid,p_client text,p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_client is null or length(p_client) not between 1 and 160 then raise exception 'Invalid client' using errcode='22023';end if;
 perform pro_payment_overview_validate_cursor(p_after);
 with accounts as materialized(
 select pro_work_account(p_user,w.id) a,coalesce(to_char(pro_instant(w.start) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'') at from pro_work w where w.user_id=p_user and w."clientId"=p_client
 ),
 ledger as(
 select e.id,e.kind,e.work_id,w.service work_title,w.cancelled work_cancelled,e.amount_cents,e.created_at at,e.label,e.position,
 case when e.kind='agreement' then (select prev.amount_cents from pro_client_entries prev where prev.user_id=e.user_id and prev.work_id=e.work_id and prev.kind='agreement' and prev.position<e.position order by prev.position desc limit 1) else null end previous_agreement,
 exists(select 1 from pro_client_entries v where v.user_id=e.user_id and v.reversal_id=e.id and v.kind='payment_void') reversed,
 e.kind='agreement' and exists(select 1 from pro_client_entries n where n.user_id=e.user_id and n.work_id=e.work_id and n.kind='agreement' and n.position>e.position) superseded,
 case when e.kind in ('payment','payment_void') then pro_invoice_payment_metadata(p_user,case when e.kind='payment' then e.id else e.reversal_id end) else null end metadata,
 case when e.kind='payment' then e.id when e.kind='payment_void' then e.reversal_id else null end payment_id
 from pro_client_entries e join pro_work w on w.user_id=e.user_id and w.id=e.work_id where e.user_id=p_user and e.client_id=p_client and w."clientId"=p_client and e.kind in ('agreement','payment','payment_void')
 ),standalone as materialized(
 select p.*,pro_invoice_payment_metadata(p_user,p.id) metadata,pro_invoice_payment_used(p_user,p.id,null) applied from pro_invoice_payments p where p.user_id=p_user and p.client_id=p_client and p.work_id is null and p.entry_id is null
 ),events as(
 select id,at,jsonb_build_object('id',id,'kind',kind,'workId',work_id,'workTitle',work_title,'workCancelled',work_cancelled,'amountCents',amount_cents,'previousAgreementCents',previous_agreement,'balanceDeltaCents',case when kind='agreement' then amount_cents-coalesce(previous_agreement,0) when kind='payment' then -amount_cents else amount_cents end,'at',at,'receivedOn',case when kind='payment' then metadata->'receivedOn' else null end,'method',metadata->'method','reference',metadata->'reference','label',label,'reversed',reversed,'superseded',superseded,'paymentId',payment_id) document from ledger
 union all
 select id,created_at,jsonb_build_object('id',id,'kind','direct_payment','workId',null,'workTitle',null,'workCancelled',false,'amountCents',amount_cents,'previousAgreementCents',null,'balanceDeltaCents',0,'at',created_at,'receivedOn',metadata->'receivedOn','method',metadata->'method','reference',metadata->'reference','label',coalesce(metadata->>'reference',''),'reversed',false,'superseded',false,'paymentId',id) from standalone
 ),matches as(select * from events where p_after is null or (at,id)<((p_after->>'at')::timestamptz,(p_after->>'id')::uuid) order by at desc,id desc limit 21),page as(select * from matches order by at desc,id desc limit 20)
 select jsonb_build_object('revision',md5(coalesce((select jsonb_build_object('id',id,'name',name,'archived',archived)::text from pro_clients where user_id=p_user and id=p_client),'')||coalesce((select jsonb_agg(a order by a->>'id')::text from accounts),'[]')||coalesce((select jsonb_agg(document order by at desc,id desc)::text from events),'[]')||coalesce((select jsonb_agg(jsonb_build_object('id',id,'applied',applied) order by id)::text from standalone),'[]')),'client',(select jsonb_build_object('id',id,'name',name,'archived',archived) from pro_clients where user_id=p_user and id=p_client),
 'summary',jsonb_build_object('agreedCents',coalesce((select sum((a->>'agreedCents')::bigint) from accounts),0),'paidCents',coalesce((select sum((a->>'paidCents')::bigint) from accounts),0),'balanceCents',coalesce((select sum(greatest((a->>'balanceCents')::bigint,0)) from accounts),0),'creditCents',coalesce((select sum(greatest(-(a->>'balanceCents')::bigint,0)) from accounts),0),'unpriced',(select count(*) from accounts where a->>'agreedCents' is null and not(a->>'cancelled')::boolean),'workCount',(select count(*) from accounts),'standaloneReceivedCents',coalesce((select sum(amount_cents) from standalone),0),'standaloneAvailableCents',coalesce((select sum(amount_cents-applied) from standalone),0)),
 'items',coalesce((select jsonb_agg(document order by at desc,id desc) from page),'[]'),'nextCursor',case when (select count(*) from matches)>20 then (select jsonb_build_object('at',at,'id',id) from page order by at asc,id asc limit 1) else null end) into result
 where exists(select 1 from pro_clients where user_id=p_user and id=p_client);
 return result;
end $$;
revoke all on function pro_client_statement_page(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function pro_client_statement_page(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
