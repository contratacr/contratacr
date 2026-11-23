-- ContrataCR Pro, row 50 (retainers, credits and refunds): per-customer and per-project LEDGER of the money the professional holds in
-- favour of the customer. PRO_ENABLED stays false in production. Read only: no new storage, nothing is charged, moved or sent.
--  * Every movement comes from the append-only records that already exist (credits, applications, application reversals, refunds,
--    refund voids): received/issued +, applied -, application reverted +, refunded -, refund voided +. Nothing is ever deleted or edited:
--    a reversal is an inverse entry. Cancelling a credit or reversing its source payment adds a closing entry that zeroes the credit.
--  * The running balance is the sum of the signed entries in time order; the reader also returns, per credit, the balance of the
--    figures used everywhere else (pro_credit_figures) and a reconciled flag, so the ledger can never silently drift from them.
-- Query: exactly one of workId (one project) or clientId (every project of that customer).
begin;
create or replace function public.pro_credit_ledger_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;cid text;w public.pro_work;cl public.pro_clients;entries jsonb;trunc boolean;tot record;per_credit jsonb;by_work jsonb;ok boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_query) k where k not in('workId','clientId'))
  or (p_query ? 'workId')=(p_query ? 'clientId') or exists(select 1 from jsonb_each(p_query) e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}') not between 1 and 160) then
  raise exception 'Invalid ledger query' using errcode='22023';end if;
 wid:=p_query->>'workId';cid:=p_query->>'clientId';
 if wid is not null then
  select * into w from public.pro_work x where x.user_id=p_actor and x.id=wid;
  if not found then return null;end if;cid:=w."clientId";
 end if;
 select * into cl from public.pro_clients x where x.user_id=p_actor and x.id=cid;
 if not found then return null;end if;
 create temporary table if not exists pg_temp.pro_ledger_tmp(seq bigint,at timestamptz,event text,credit_id uuid,code text,kind text,title text,work_id text,work_title text,delta bigint,balance bigint,reference text) on commit drop;
 truncate pg_temp.pro_ledger_tmp;
 insert into pg_temp.pro_ledger_tmp
 with scope as(select c.* from public.pro_credits c where c.owner_id=p_actor and c.client_id=cid and (wid is null or c.work_id=wid)),
 ev as(
  select c.id credit_id,'received' event,coalesce(c.received_at,c.created_at) at,1 ord,c.amount_cents delta,c.reference ref,'r:'||c.id eid from scope c where c.kind<>'retainer' or c.entry_id is not null
  union all select a.credit_id,'apply',a.created_at,2,-a.amount_cents,d.title,'a:'||a.id from public.pro_credit_applications a join scope c on c.id=a.credit_id
   left join public.pro_invoice_drafts d on d.user_id=a.owner_id and d.id=a.draft_id where a.owner_id=p_actor
  union all select x.credit_id,'unapply',x.reverted_at,3,x.amount_cents,x.reason,'u:'||x.id from(
    select c.id credit_id,r.id,a.amount_cents,r.created_at reverted_at,r.reason from public.pro_credit_application_reversals r
     join public.pro_credit_applications a on a.owner_id=r.owner_id and a.id=r.application_id join scope c on c.id=a.credit_id where r.owner_id=p_actor) x
  union all select c.id,'apply_void',x.reverted_at,3,x.amount_cents,x.reason,'v:'||x.id from scope c
   cross join lateral public.pro_credit_application_rows(c.owner_id,c.id) x where x.state='voided_in_invoice'
  union all select f.credit_id,'refund',f.created_at,4,-f.amount_cents,f.reference,'f:'||f.id from public.pro_credit_refunds f join scope c on c.id=f.credit_id where f.owner_id=p_actor
  union all select f.credit_id,'void_refund',v.created_at,5,f.amount_cents,v.reason,'w:'||f.id from public.pro_credit_refund_voids v
   join public.pro_credit_refunds f on f.owner_id=v.owner_id and f.id=v.refund_id join scope c on c.id=f.credit_id where v.owner_id=p_actor),
 sums as(select credit_id,sum(delta) s,max(at) mx from ev group by credit_id),
 adj as(select c.id credit_id,case when c.status='cancelled' then 'cancel' else 'source_reversed' end event,
   case when c.status='cancelled' then c.cancelled_at else greatest(s.mx,coalesce((select r.created_at from public.pro_client_entries r where r.user_id=c.owner_id and r.reversal_id=c.entry_id and r.kind='payment_void'),s.mx)) end at,
   6 ord,-s.s delta,c.cancel_reason ref,'c:'||c.id eid
  from scope c join sums s on s.credit_id=c.id where (c.status='cancelled' or public.pro_credit_entry_reversed(c.owner_id,c.entry_id)) and s.s<>0),
 led as(select * from ev union all select * from adj)
 select row_number() over(order by l.at,l.ord,l.eid),l.at,l.event,c.id,public.pro_credit_code(c.kind,c.number),c.kind,c.title,c.work_id,w2.service,l.delta,
  sum(l.delta) over(order by l.at,l.ord,l.eid rows between unbounded preceding and current row),l.ref
 from led l join scope c on c.id=l.credit_id left join public.pro_work w2 on w2.user_id=c.owner_id and w2.id=c.work_id;
 select coalesce(sum(delta),0) balance,coalesce(sum(delta) filter(where event='received'),0) received,coalesce(-sum(delta) filter(where event in('apply','unapply','apply_void')),0) applied,
  coalesce(-sum(delta) filter(where event in('refund','void_refund')),0) refunded,coalesce(-sum(delta) filter(where event in('cancel','source_reversed')),0) closed,count(*) n into tot from pg_temp.pro_ledger_tmp;
 trunc:=tot.n>200;
 select coalesce(jsonb_agg(jsonb_build_object('seq',seq,'at',at,'event',event,'creditId',credit_id,'code',code,'kind',kind,'title',title,'workId',work_id,'workTitle',work_title,
   'deltaCents',delta,'balanceCents',balance,'reference',reference) order by seq desc),'[]'::jsonb) into entries from(select * from pg_temp.pro_ledger_tmp order by seq desc limit 200) t;
 select coalesce(jsonb_agg(jsonb_build_object('creditId',c.id,'code',public.pro_credit_code(c.kind,c.number),'title',c.title,'workId',c.work_id,'status',c.status,
   'ledgerCents',coalesce(g.s,0),'balanceCents',f.balance_cents,'reconciled',coalesce(g.s,0)=f.balance_cents) order by c.created_at,c.id),'[]'::jsonb),
  coalesce(bool_and(coalesce(g.s,0)=f.balance_cents),true) into per_credit,ok
  from public.pro_credits c cross join lateral public.pro_credit_figures(c) f left join(select credit_id,sum(delta) s from pg_temp.pro_ledger_tmp group by credit_id) g on g.credit_id=c.id
  where c.owner_id=p_actor and c.client_id=cid and (wid is null or c.work_id=wid);
 select coalesce(jsonb_agg(jsonb_build_object('workId',x.work_id,'title',x.title,'balanceCents',x.b) order by x.work_id),'[]'::jsonb) into by_work
  from(select work_id,max(work_title) title,sum(delta) b from pg_temp.pro_ledger_tmp group by work_id) x;
 return jsonb_build_object('scope',case when wid is null then 'client' else 'work' end,'workId',wid,'client',jsonb_build_object('id',cl.id,'name',cl.name,'archived',cl.archived),
  'balanceCents',tot.balance,'receivedCents',tot.received,'appliedCents',tot.applied,'refundedCents',tot.refunded,'closedCents',tot.closed,'entryCount',tot.n,'truncated',trunc,
  'reconciled',ok,'entries',entries,'credits',per_credit,'byWork',by_work);
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pro_credit_ledger_read' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
