-- LOCAL PRO ONLY. Credit notes in the customer statement and in the payment overview.
-- Read-only: no table, ledger row or credit is created or changed here.
--
-- A credit note (pro_credits kind 'credit_note', NC-0001…) is not money. Its applications to
-- an invoice draft (pro_credit_applications without invoice_application_id) reduce what the
-- customer owes on that job. Supersedes pro_client_statement_page from
-- client-statement-local.sql (same signature and output, plus the credit-note lines):
--   job due       = max(agreed − paid, 0)                (unchanged ledger figure)
--   credit notes  = Σ applications of the job's credit notes that were not reverted
--   balance       = Σ max(job due − credit notes, 0)     (a note never becomes money in favour)
--   creditCents   = Σ max(paid − agreed, 0)              (overpayment only, as before)
-- Each application is an immutable line ('credit_note', balance −amount). A reversal keeps that
-- line (reversed=true) and adds its own line ('credit_note_reversal', balance +amount).
-- pro_payment_overview_credit_notes gives the overview a separate total: credit notes are never
-- added to the received money totals.
begin;
create or replace function public.pro_credit_note_lines(p_user uuid,p_client text)
returns table(id uuid,kind text,at timestamptz,work_id text,work_title text,work_cancelled boolean,client_id text,client_name text,amount_cents bigint,
 credit_id uuid,code text,title text,reason text,draft_id uuid,draft_title text,reversed boolean)
language sql stable security invoker set search_path=public,pg_temp as $$
 select a.id,'credit_note',a.created_at,a.work_id,w.service,coalesce(w.cancelled,false),c.client_id,cl.name,a.amount_cents,
  c.id,public.pro_credit_code(c.kind,c.number),c.title,c.reason,a.draft_id,d.title,r.id is not null
 from public.pro_credit_applications a
 join public.pro_credits c on c.owner_id=a.owner_id and c.id=a.credit_id
 join public.pro_work w on w.user_id=a.owner_id and w.id=a.work_id
 join public.pro_clients cl on cl.user_id=c.owner_id and cl.id=c.client_id
 left join public.pro_invoice_drafts d on d.user_id=a.owner_id and d.id=a.draft_id
 left join public.pro_credit_application_reversals r on r.owner_id=a.owner_id and r.application_id=a.id
 where a.owner_id=p_user and c.kind='credit_note' and a.invoice_application_id is null and (p_client is null or c.client_id=p_client and w."clientId"=p_client)
 union all
 select r.id,'credit_note_reversal',r.created_at,a.work_id,w.service,coalesce(w.cancelled,false),c.client_id,cl.name,a.amount_cents,
  c.id,public.pro_credit_code(c.kind,c.number),c.title,r.reason,a.draft_id,d.title,false
 from public.pro_credit_application_reversals r
 join public.pro_credit_applications a on a.owner_id=r.owner_id and a.id=r.application_id
 join public.pro_credits c on c.owner_id=a.owner_id and c.id=a.credit_id
 join public.pro_work w on w.user_id=a.owner_id and w.id=a.work_id
 join public.pro_clients cl on cl.user_id=c.owner_id and cl.id=c.client_id
 left join public.pro_invoice_drafts d on d.user_id=a.owner_id and d.id=a.draft_id
 where r.owner_id=p_user and c.kind='credit_note' and a.invoice_application_id is null and (p_client is null or c.client_id=p_client and w."clientId"=p_client) $$;

create or replace function public.pro_client_statement_page(p_user uuid,p_client text,p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_client is null or length(p_client) not between 1 and 160 then raise exception 'Invalid client' using errcode='22023';end if;
 perform pro_payment_overview_validate_cursor(p_after);
 with accounts as materialized(
 select pro_work_account(p_user,w.id) a,coalesce(to_char(pro_instant(w.start) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'') at from pro_work w where w.user_id=p_user and w."clientId"=p_client
 ),
 notes as materialized(select * from pro_credit_note_lines(p_user,p_client)),
 note_totals as(select work_id,sum(amount_cents)::bigint applied from notes where kind='credit_note' and not reversed group by work_id),
 jobs as(select a,greatest((a->>'balanceCents')::bigint,0) due,greatest(-(a->>'balanceCents')::bigint,0) credit,coalesce((select applied from note_totals n where n.work_id=a->>'id'),0) notes from accounts),
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
 union all
 select id,at,jsonb_build_object('id',id,'kind',kind,'workId',work_id,'workTitle',work_title,'workCancelled',work_cancelled,'amountCents',amount_cents,'previousAgreementCents',null,'balanceDeltaCents',case when kind='credit_note' then -amount_cents else amount_cents end,'at',at,'receivedOn',null,'method',null,'reference',null,'label',title,'reversed',reversed,'superseded',false,'paymentId',null,
  'creditNote',jsonb_build_object('creditId',credit_id,'code',code,'reason',reason,'draftId',draft_id,'draftTitle',draft_title)) from notes
 ),matches as(select * from events where p_after is null or (at,id)<((p_after->>'at')::timestamptz,(p_after->>'id')::uuid) order by at desc,id desc limit 21),page as(select * from matches order by at desc,id desc limit 20)
 select jsonb_build_object('revision',md5(coalesce((select jsonb_build_object('id',id,'name',name,'archived',archived)::text from pro_clients where user_id=p_user and id=p_client),'')||coalesce((select jsonb_agg(a order by a->>'id')::text from accounts),'[]')||coalesce((select jsonb_agg(document order by at desc,id desc)::text from events),'[]')||coalesce((select jsonb_agg(jsonb_build_object('id',id,'applied',applied) order by id)::text from standalone),'[]')),'client',(select jsonb_build_object('id',id,'name',name,'archived',archived) from pro_clients where user_id=p_user and id=p_client),
 'summary',jsonb_build_object('agreedCents',coalesce((select sum((a->>'agreedCents')::bigint) from accounts),0),'paidCents',coalesce((select sum((a->>'paidCents')::bigint) from accounts),0),
  'balanceCents',coalesce((select sum(greatest(due-notes,0)) from jobs),0),'creditCents',coalesce((select sum(credit) from jobs),0),
  'creditNotesCents',coalesce((select sum(applied) from note_totals),0),'creditNoteCount',(select count(*) from notes where kind='credit_note' and not reversed),
  'unpriced',(select count(*) from accounts where a->>'agreedCents' is null and not(a->>'cancelled')::boolean),'workCount',(select count(*) from accounts),'standaloneReceivedCents',coalesce((select sum(amount_cents) from standalone),0),'standaloneAvailableCents',coalesce((select sum(amount_cents-applied) from standalone),0)),
 'items',coalesce((select jsonb_agg(document order by at desc,id desc) from page),'[]'),'nextCursor',case when (select count(*) from matches)>20 then (select jsonb_build_object('at',at,'id',id) from page order by at asc,id asc limit 1) else null end) into result
 where exists(select 1 from pro_clients where user_id=p_user and id=p_client);
 return result;
end $$;

-- Overview total of applied credit notes, filtered like the payment list where it applies:
-- customer, literal search (customer, job, code, title) and the application day in Costa Rica.
create or replace function public.pro_payment_overview_credit_notes(p_user uuid,p_query text default '',p_client text default '',p_from date default null,p_through date default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_query is null or length(p_query)>160 then raise exception 'Invalid payment query' using errcode='22023';end if;
 if p_client is null or length(p_client)>160 then raise exception 'Invalid payment client' using errcode='22023';end if;
 if p_from is not null and not isfinite(p_from) or p_through is not null and not isfinite(p_through) or p_from is not null and p_through is not null and p_from>p_through then raise exception 'Invalid payment date range' using errcode='22023';end if;
 with lines as(
  select * from pro_credit_note_lines(p_user,nullif(p_client,'')) l where l.kind='credit_note' and not l.reversed
   and strpos(pro_catalog_search(concat_ws(' ',l.client_name,l.work_title,l.code,l.title)),pro_catalog_search(p_query))>0
   and (p_from is null or (l.at at time zone 'America/Costa_Rica')::date>=p_from) and (p_through is null or (l.at at time zone 'America/Costa_Rica')::date<=p_through)
 ) select jsonb_build_object('creditNotesCents',coalesce(sum(amount_cents),0),'creditNoteCount',count(*)) into result from lines;
 return result;
end $$;
revoke all on function pro_credit_note_lines(uuid,text),pro_client_statement_page(uuid,text,jsonb),pro_payment_overview_credit_notes(uuid,text,text,date,date) from public,anon,authenticated;
grant execute on function pro_credit_note_lines(uuid,text),pro_client_statement_page(uuid,text,jsonb),pro_payment_overview_credit_notes(uuid,text,text,date,date) to service_role;
notify pgrst,'reload schema';
commit;
