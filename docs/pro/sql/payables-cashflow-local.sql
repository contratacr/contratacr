-- LOCAL PRO ONLY (2026-11-19, round F1-A, parity register row 55). Accounts payable, cash flow and a simple
-- income statement for the owner. MANAGEMENT REPORTS: no tax filing, no ledger, no bank operation, nothing is sent,
-- charged or moved. CRC cents (the expense/PO model is CRC only), Costa Rica calendar days.
--
-- Accounts payable reuse what already exists (no duplicated amounts, suppliers or payments):
--   * Expenses (pro_internal_expenses) ARE supplier bills already: supplier, date, due date, amount and their own
--     payments/reversals (pro_expense_payments). Every expense is a payable.
--   * A purchase order (pro_purchase_orders, issued/partial/received) becomes a payable when the owner records the
--     supplier's bill for it: bill number, bill date and due date. Amount and payments stay the PO's own
--     (pro_purchase_order_figures, pro_purchase_order_payments). One bill per order.
--   * pro_payable_bills only keeps what did not exist: bill number, bill/due date of a PO bill, a note and the
--     «anulada» state (with reason) of either source. A bill with payments cannot be voided (reverse them first).
--   * Payments made: the «pay» action validates the bill and DELEGATES to the existing writers
--     (pro_expense_meta_save 'payment' / pro_purchase_orders_mutate 'pay'), with the same actionId, so balances,
--     receipts and histories stay in the source module. Reversals stay in Expenses / Purchase orders.
--   * Status: pendiente (nothing paid), parcial, pagada (balance 0), anulada; overdue = open and due before today.
--   * Aging 0-30/31-60/61-90/90+ by supplier: open balance by days since the bill/expense date (same rule as the
--     receivables aging of pro_reports_finance_read), plus the overdue amount.
-- Cash flow (pro_cash_flow_read): per week (Monday) or month of a chosen period.
--   In, actual: payments received (pro_invoice_payments, reversed ones left out: same «collected» as the reports).
--   In, expected: open invoice-draft balances (pro_report_draft_open) due on planned date (or creation day) + credit
--     days; open payment-plan installments (pro_payment_plan_state). Drafts that bill an installment are left out so
--     the installment is counted once.
--   Out, actual: expense payments and PO payments (a reversal is negative on its own day) and customer refunds.
--   Out, expected: open payables by due date.
--   Expected money cannot arrive in the past: an overdue item is placed on today (flagged overdue).
-- Income statement (pro_income_statement_read): income = invoice drafts (not archived) without IVA by creation day;
--   collected shown apart (cash basis, informational). Costs = expenses without IVA when the rate is known (by
--   expense date, per category; voided ones left out) + internal cost of recorded hours (pro_work_cost_entries
--   time − time_void) + PO supplier bills without tax (bill date; voided/cancelled left out). Per period and per job.
-- Patterns: RLS on, service_role only, security invoker, pinned search_path, receipts by actionId, CAS revision,
-- immutable history. Reapplicable.
begin;

create table if not exists public.pro_payable_bills(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 source_kind text not null check(source_kind in('purchase_order','expense')),
 purchase_order_id uuid,expense_id uuid,
 bill_number text check(bill_number is null or length(btrim(bill_number)) between 1 and 60),
 bill_date date check(bill_date is null or bill_date between date '2000-01-01' and date '2100-12-31'),
 due_date date check(due_date is null or due_date between date '2000-01-01' and date '2100-12-31'),
 note text check(note is null or length(btrim(note)) between 1 and 300),
 voided_at timestamptz,
 void_reason text check(void_reason is null or length(btrim(void_reason)) between 1 and 300),
 revision integer not null default 1 check(revision between 1 and 2147483646),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,purchase_order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade,
 foreign key(owner_id,expense_id) references public.pro_internal_expenses(user_id,id) on delete cascade,
 check((source_kind='purchase_order' and purchase_order_id is not null and expense_id is null and bill_date is not null)
  or (source_kind='expense' and expense_id is not null and purchase_order_id is null and bill_date is null and due_date is null)),
 check(due_date is null or bill_date is null or due_date>=bill_date),
 check((voided_at is null)=(void_reason is null))
);
create unique index if not exists pro_payable_bills_po on public.pro_payable_bills(owner_id,purchase_order_id) where purchase_order_id is not null;
create unique index if not exists pro_payable_bills_expense on public.pro_payable_bills(owner_id,expense_id) where expense_id is not null;
create table if not exists public.pro_payable_bill_history(
 owner_id uuid not null,bill_id uuid not null,action_id uuid not null,
 action text not null check(action in('save','void','restore')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id),
 foreign key(owner_id,bill_id) references public.pro_payable_bills(owner_id,id) on delete cascade
);
create index if not exists pro_payable_bill_history_page on public.pro_payable_bill_history(owner_id,bill_id,at desc);
create table if not exists public.pro_payable_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);

create or replace function public.pro_payable_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Payable bill history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_payable_bill_history_immutable on public.pro_payable_bill_history;
create trigger pro_payable_bill_history_immutable before update on public.pro_payable_bill_history for each row execute function public.pro_payable_immutable();
drop trigger if exists pro_payable_action_immutable on public.pro_payable_actions;
create trigger pro_payable_action_immutable before update on public.pro_payable_actions for each row execute function public.pro_payable_immutable();

create or replace function public.pro_payable_today() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (clock_timestamp() at time zone 'America/Costa_Rica')::date $$;

create or replace function public.pro_payable_uuid(p_value jsonb) returns uuid
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'string' or (p_value#>>'{}')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid identifier' using errcode='22023';end if;
 return (p_value#>>'{}')::uuid;
end $$;

create or replace function public.pro_payable_period_check(p_from date,p_to date) returns void
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if (p_from is not null and p_from not between date '2000-01-01' and date '2100-12-31') or (p_to is not null and p_to not between date '2000-01-01' and date '2100-12-31')
  or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid report period' using errcode='22023';end if;
end $$;

-- Every payable of the owner (expenses + PO supplier bills), with the derived balance and status.
create or replace function public.pro_payable_rows(p_owner uuid,p_today date)
returns table(source_kind text,source_id uuid,supplier_key text,supplier_id uuid,supplier_name text,vendor_kind text,work_id text,work_title text,
 reference text,concept text,doc_date date,due_date date,amount_cents bigint,paid_cents bigint,balance_cents bigint,net_cents bigint,status text,overdue boolean,
 bill_number text,note text,void_reason text,bill_revision integer,source_revision bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
 with ex as (
  select 'expense'::text k,e.id,e.supplier_id sid,e.supplier_name sname,a.work_id wid,''::text ref,e.concept con,e.expense_date doc,coalesce(e.due_date,e.expense_date) due,e.amount_cents amount,
   coalesce((select sum(case when p.kind='payment' then p.amount_cents else -p.amount_cents end) from public.pro_expense_payments p where p.user_id=e.user_id and p.expense_id=e.id),0)::bigint paid,
   case when eb.vat_rate_bps is null then e.amount_cents else round(e.amount_cents*10000.0/(10000+eb.vat_rate_bps))::bigint end net,
   b.bill_number bn,b.note bnote,b.void_reason vr,coalesce(b.revision,0) brev,b.voided_at is not null voided,
   coalesce((select s.revision from public.pro_expense_state s where s.user_id=e.user_id),0)::bigint srev
  from public.pro_internal_expenses e
  left join public.pro_payable_bills b on b.owner_id=e.user_id and b.expense_id=e.id
  left join public.pro_work_expense_assignments a on a.user_id=e.user_id and a.expense_id=e.id
  left join public.pro_expense_billing eb on eb.user_id=e.user_id and eb.expense_id=e.id
  where e.user_id=p_owner),
 po as (
  select 'purchase_order'::text k,o.id,o.supplier_id sid,o.supplier_name sname,o.work_id wid,'OC-'||lpad(o.number::text,4,'0') ref,o.title con,b.bill_date doc,coalesce(b.due_date,b.bill_date) due,
   f.total_cents amount,f.paid_cents paid,f.subtotal_cents net,
   b.bill_number bn,b.note bnote,b.void_reason vr,b.revision brev,(b.voided_at is not null or o.status='cancelled') voided,o.revision::bigint srev
  from public.pro_payable_bills b join public.pro_purchase_orders o on o.owner_id=b.owner_id and o.id=b.purchase_order_id
  cross join lateral public.pro_purchase_order_figures(o.owner_id,o.id) f
  where b.owner_id=p_owner and b.source_kind='purchase_order')
 select x.k,x.id,coalesce(x.sid::text,'name:'||lower(btrim(x.sname))),x.sid,x.sname,coalesce(vp.kind,'supplier'),x.wid,coalesce(w.service,''),x.ref,x.con,x.doc,x.due,
  x.amount,x.paid,x.amount-x.paid,x.net,
  case when x.voided then 'void' when x.amount-x.paid<=0 then 'paid' when x.paid>0 then 'partial' else 'pending' end,
  not x.voided and x.amount-x.paid>0 and x.due<p_today,x.bn,x.bnote,x.vr,x.brev,x.srev
 from (select * from ex union all select * from po) x
 left join public.pro_company_vendor_profiles vp on vp.owner_id=p_owner and vp.supplier_id=x.sid
 left join public.pro_work w on w.user_id=p_owner and w.id=x.wid
$$;

create or replace function public.pro_payable_json(r record,p_today date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 return jsonb_build_object('sourceKind',r.source_kind,'sourceId',r.source_id,'supplierKey',r.supplier_key,'supplierId',r.supplier_id,'supplierName',r.supplier_name,'vendorKind',r.vendor_kind,
  'workId',r.work_id,'workTitle',r.work_title,'reference',r.reference,'concept',r.concept,'docDate',to_char(r.doc_date,'YYYY-MM-DD'),'dueDate',to_char(r.due_date,'YYYY-MM-DD'),
  'amountCents',r.amount_cents,'paidCents',r.paid_cents,'balanceCents',greatest(r.balance_cents,0),'status',r.status,'overdue',r.overdue,
  'daysOverdue',case when r.overdue then p_today-r.due_date else 0 end,'billNumber',r.bill_number,'note',r.note,'voidReason',r.void_reason,
  'billRevision',r.bill_revision,'sourceRevision',r.source_revision);
end $$;

-- Accounts payable: list (filters), aging by supplier, totals and the issued orders still without a bill.
create or replace function public.pro_payables_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today date:=public.pro_payable_today();v_from date;v_to date;v_status text;v_supplier text;v_overdue boolean;items jsonb;suppliers jsonb;totals jsonb;aging jsonb;pending jsonb;matched integer;
begin
 if p_actor is null then raise exception 'Invalid actor' using errcode='22023';end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_query) k where k not in('from','to','status','supplier','overdue'))
  or exists(select 1 from jsonb_each(p_query) e where jsonb_typeof(e.value)<>'string') then raise exception 'Invalid query' using errcode='22023';end if;
 v_from:=public.pro_purchase_order_day(p_query->'from',false);v_to:=public.pro_purchase_order_day(p_query->'to',false);perform public.pro_payable_period_check(v_from,v_to);
 v_status:=coalesce(p_query->>'status','open');v_supplier:=nullif(p_query->>'supplier','');
 if v_status not in('open','all','paid','void') or coalesce(p_query->>'overdue','0') not in('0','1') or length(coalesce(v_supplier,''))>200 then raise exception 'Invalid query' using errcode='22023';end if;
 v_overdue:=coalesce(p_query->>'overdue','0')='1';
 with r as (select * from public.pro_payable_rows(p_actor,today) x where (v_from is null or x.doc_date>=v_from) and (v_to is null or x.doc_date<=v_to)),
 o as (select * from r where status in('pending','partial')),
 g as (select o.supplier_key,max(o.supplier_name) sname,(array_agg(o.supplier_id))[1] sid,max(o.vendor_kind) vkind,sum(o.balance_cents)::bigint open_cents,
   coalesce(sum(o.balance_cents) filter(where today-o.doc_date<=30),0)::bigint d0,coalesce(sum(o.balance_cents) filter(where today-o.doc_date between 31 and 60),0)::bigint d31,
   coalesce(sum(o.balance_cents) filter(where today-o.doc_date between 61 and 90),0)::bigint d61,coalesce(sum(o.balance_cents) filter(where today-o.doc_date>90),0)::bigint d90,
   coalesce(sum(o.balance_cents) filter(where o.overdue),0)::bigint overdue_cents,count(*)::integer n,max(today-o.doc_date) oldest
  from o group by o.supplier_key)
 select coalesce((select jsonb_agg(jsonb_build_object('supplierKey',g.supplier_key,'supplierId',g.sid,'supplierName',g.sname,'vendorKind',g.vkind,'openCents',g.open_cents,
   'd0_30',g.d0,'d31_60',g.d31,'d61_90',g.d61,'d90_plus',g.d90,'overdueCents',g.overdue_cents,'openBills',g.n,'oldestDays',g.oldest) order by g.open_cents desc,lower(g.sname),g.supplier_key) from g),'[]'::jsonb),
  jsonb_build_object('openCents',coalesce((select sum(balance_cents) from o),0)::bigint,'openCount',(select count(*) from o)::integer,
   'overdueCents',coalesce((select sum(balance_cents) from o where overdue),0)::bigint,'overdueCount',(select count(*) from o where overdue)::integer,
   'billedCents',coalesce((select sum(amount_cents) from r where status<>'void'),0)::bigint,'paidCents',coalesce((select sum(paid_cents) from r where status<>'void'),0)::bigint),
  jsonb_build_object('d0_30',coalesce((select sum(balance_cents) from o where today-doc_date<=30),0)::bigint,'d31_60',coalesce((select sum(balance_cents) from o where today-doc_date between 31 and 60),0)::bigint,
   'd61_90',coalesce((select sum(balance_cents) from o where today-doc_date between 61 and 90),0)::bigint,'d90_plus',coalesce((select sum(balance_cents) from o where today-doc_date>90),0)::bigint),
  (select count(*) from r where (v_status='all' or (v_status='open' and status in('pending','partial')) or status=v_status) and (v_supplier is null or supplier_key=v_supplier) and (not v_overdue or overdue))::integer,
  coalesce((select jsonb_agg(public.pro_payable_json(t,today) order by t.due_date,t.reference,t.source_id) from (select * from r where (v_status='all' or (v_status='open' and status in('pending','partial')) or status=v_status)
   and (v_supplier is null or supplier_key=v_supplier) and (not v_overdue or overdue) order by due_date,reference,source_id limit 200) t),'[]'::jsonb)
 into suppliers,totals,aging,matched,items;
 select coalesce(jsonb_agg(jsonb_build_object('purchaseOrderId',o.id,'workId',o.work_id,'workTitle',coalesce(w.service,''),'reference','OC-'||lpad(o.number::text,4,'0'),'title',o.title,
   'supplierName',o.supplier_name,'issueDate',to_char(o.issue_date,'YYYY-MM-DD'),'status',o.status,'totalCents',f.total_cents,'paidCents',f.paid_cents) order by o.issue_date,o.number),'[]'::jsonb) into pending
 from (select * from public.pro_purchase_orders x where x.owner_id=p_actor and x.status in('issued','partial','received')
   and not exists(select 1 from public.pro_payable_bills b where b.owner_id=x.owner_id and b.purchase_order_id=x.id) order by x.issue_date,x.number limit 50) o
 cross join lateral public.pro_purchase_order_figures(o.owner_id,o.id) f left join public.pro_work w on w.user_id=o.owner_id and w.id=o.work_id;
 return jsonb_build_object('today',to_char(today,'YYYY-MM-DD'),'from',to_char(v_from,'YYYY-MM-DD'),'to',to_char(v_to,'YYYY-MM-DD'),'status',v_status,'supplier',v_supplier,'overdue',v_overdue,
  'totals',totals,'aging',aging,'suppliers',suppliers,'items',items,'matched',matched,'truncated',matched>200,'toRegister',pending);
end $$;

-- Bill record (save / void / restore) and payments made through the existing writers.
create or replace function public.pro_payables_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;v_kind text;sid uuid;rev integer;keys text[];expected text[];receipt public.pro_payable_actions;b public.pro_payable_bills;o public.pro_purchase_orders;e public.pro_internal_expenses;
 before_json jsonb;after_json jsonb;result jsonb;v_number text;v_bill date;v_due date;v_note text;v_reason text;today date:=public.pro_payable_today();cur record;v_amount numeric;v_paid_on date;v_method text;v_ref text;v_srev numeric;
begin
 if p_actor is null or not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid payable' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'save' then array['action','actionId','billDate','billNumber','dueDate','note','revision','sourceId','sourceKind']
  when 'void' then array['action','actionId','reason','revision','sourceId','sourceKind']
  when 'restore' then array['action','actionId','revision','sourceId','sourceKind']
  when 'pay' then array['action','actionId','amountCents','method','note','paidOn','reference','revision','sourceId','sourceKind','sourceRevision'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected then raise exception 'Invalid payable fields' using errcode='22023';end if;
 aid:=public.pro_payable_uuid(p_input->'actionId');sid:=public.pro_payable_uuid(p_input->'sourceId');v_kind:=p_input->>'sourceKind';
 if jsonb_typeof(p_input->'sourceKind') is distinct from 'string' or v_kind not in('purchase_order','expense') then raise exception 'Invalid source' using errcode='22023';end if;
 if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;
 -- Shape validation without state (22023).
 if act='save' then
  v_number:=public.pro_purchase_order_text(p_input->'billNumber',60,false);v_note:=public.pro_purchase_order_text(p_input->'note',300,false);
  v_bill:=public.pro_purchase_order_day(p_input->'billDate',false);v_due:=public.pro_purchase_order_day(p_input->'dueDate',false);
  if v_kind='expense' and (v_bill is not null or v_due is not null) then raise exception 'The due date of an expense is edited in Expenses' using errcode='22023';end if;
  if v_kind='purchase_order' and v_bill is null then raise exception 'Missing bill date' using errcode='22023';end if;
  if v_bill is not null and (v_bill not between date '2000-01-01' and today) then raise exception 'Invalid bill date' using errcode='22023';end if;
  if v_due is not null and (v_due<v_bill or v_due>date '2100-12-31') then raise exception 'Invalid due date' using errcode='22023';end if;
 elsif act='void' then
  v_reason:=public.pro_purchase_order_text(p_input->'reason',300,true);
 elsif act='pay' then
  if jsonb_typeof(p_input->'amountCents') is distinct from 'number' or jsonb_typeof(p_input->'method') is distinct from 'string' or jsonb_typeof(p_input->'sourceRevision') is distinct from 'number'
   or not coalesce((p_input->>'sourceRevision')~'^[0-9]{1,15}$',false) then raise exception 'Invalid payment' using errcode='22023';end if;
  v_amount:=(p_input->>'amountCents')::numeric;v_method:=p_input->>'method';v_srev:=(p_input->>'sourceRevision')::numeric;
  v_paid_on:=public.pro_purchase_order_day(p_input->'paidOn',true);
  v_ref:=public.pro_purchase_order_text(p_input->'reference',160,false);v_note:=public.pro_purchase_order_text(p_input->'note',300,false);
  if v_amount<>round(v_amount) or v_amount not between 1 and 10000000000 or v_paid_on>today or v_paid_on<date '2000-01-01'
   or (v_kind='expense' and v_method not in('cash','transfer','card','other')) or (v_kind='purchase_order' and v_method not in('transfer','sinpe','cash','card','check','other')) then raise exception 'Invalid payment values' using errcode='22023';end if;
 end if;
 -- Idempotent receipt by actionId.
 perform pg_advisory_xact_lock(hashtextextended('pro-payables-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_payable_actions where owner_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-payables:'||p_actor::text||':'||v_kind||':'||sid::text,0));
 if v_kind='purchase_order' then
  select * into o from public.pro_purchase_orders where owner_id=p_actor and id=sid for update;
  if not found then raise exception 'Unknown purchase order' using errcode='P0002';end if;
  select * into b from public.pro_payable_bills where owner_id=p_actor and purchase_order_id=sid for update;
 else
  select * into e from public.pro_internal_expenses where user_id=p_actor and id=sid for update;
  if not found then raise exception 'Unknown expense' using errcode='P0002';end if;
  select * into b from public.pro_payable_bills where owner_id=p_actor and expense_id=sid for update;
 end if;
 if coalesce(b.revision,0)<>rev then raise exception 'Payable changed' using errcode='40001';end if;
 select * into cur from public.pro_payable_rows(p_actor,today) x where x.source_kind=v_kind and x.source_id=sid;
 before_json:=case when b.id is null then null else to_jsonb(b)-'owner_id' end;
 if act='save' then
  if b.voided_at is not null then raise exception 'Restore the bill before editing it' using errcode='22023',hint='pro_payable_void';end if;
  if v_kind='purchase_order' then
   if o.status not in('issued','partial','received') then raise exception 'Issue the order before recording its bill' using errcode='22023',hint='pro_payable_order_state';end if;
   if v_bill<o.issue_date then raise exception 'Bill date before the order' using errcode='22023';end if;
  end if;
  if b.id is null then
   insert into public.pro_payable_bills(owner_id,source_kind,purchase_order_id,expense_id,bill_number,bill_date,due_date,note)
    values(p_actor,v_kind,case when v_kind='purchase_order' then sid end,case when v_kind='expense' then sid end,v_number,v_bill,v_due,v_note) returning * into b;
  else
   if b.bill_number is not distinct from v_number and b.bill_date is not distinct from v_bill and b.due_date is not distinct from v_due and b.note is not distinct from v_note then raise exception 'No changes' using errcode='22023';end if;
   update public.pro_payable_bills set bill_number=v_number,bill_date=v_bill,due_date=v_due,note=v_note,revision=revision+1,updated_at=now() where owner_id=p_actor and id=b.id returning * into b;
  end if;
 elsif act='void' then
  if b.voided_at is not null then raise exception 'Already voided' using errcode='22023';end if;
  if v_kind='purchase_order' and b.id is null then raise exception 'Record the bill first' using errcode='22023';end if;
  if cur.paid_cents>0 then raise exception 'Reverse the payments before voiding' using errcode='22023',hint='pro_payable_paid';end if;
  if b.id is null then
   insert into public.pro_payable_bills(owner_id,source_kind,expense_id,voided_at,void_reason) values(p_actor,'expense',sid,now(),v_reason) returning * into b;
  else
   update public.pro_payable_bills set voided_at=now(),void_reason=v_reason,revision=revision+1,updated_at=now() where owner_id=p_actor and id=b.id returning * into b;
  end if;
 elsif act='restore' then
  if b.voided_at is null then raise exception 'Not voided' using errcode='22023';end if;
  if v_kind='purchase_order' and o.status='cancelled' then raise exception 'Cancelled order' using errcode='22023',hint='pro_payable_order_state';end if;
  update public.pro_payable_bills set voided_at=null,void_reason=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=b.id returning * into b;
 else -- pay: validated here, written by the source module's own writer (same actionId, its own receipt and history).
  if v_kind='purchase_order' and b.id is null then raise exception 'Record the bill first' using errcode='22023';end if;
  if b.voided_at is not null or cur.status='void' then raise exception 'Voided bill' using errcode='22023',hint='pro_payable_void';end if;
  if v_amount>cur.balance_cents then raise exception 'Payment exceeds balance' using errcode='22023',hint='pro_payable_balance';end if;
  if v_kind='expense' then
   if v_paid_on<e.expense_date then raise exception 'Payment before the expense' using errcode='22023';end if;
   perform public.pro_expense_meta_save(p_actor,jsonb_build_object('action','payment','actionId',aid,'revision',v_srev,'expenseId',sid,'amountCents',v_amount,'date',to_char(v_paid_on,'YYYY-MM-DD'),
    'method',v_method,'reference',coalesce(v_ref,''),'note',coalesce(v_note,'')));
  else
   if v_paid_on<o.issue_date then raise exception 'Payment before the order' using errcode='22023';end if;
   perform public.pro_purchase_orders_mutate(p_actor,jsonb_build_object('action','pay','actionId',aid,'amountCents',v_amount,'id',sid,'method',v_method,'note',v_note,'paidOn',to_char(v_paid_on,'YYYY-MM-DD'),
    'reference',v_ref,'revision',v_srev,'workId',o.work_id));
  end if;
 end if;
 if act<>'pay' then
  after_json:=to_jsonb(b)-'owner_id';
  insert into public.pro_payable_bill_history(owner_id,bill_id,action_id,action,before_value,after_value) values(p_actor,b.id,aid,act,before_json,after_json);
 end if;
 select public.pro_payable_json(x,today) into result from public.pro_payable_rows(p_actor,today) x where x.source_kind=v_kind and x.source_id=sid;
 result:=jsonb_build_object('payable',result);
 insert into public.pro_payable_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Cash flow per week (ISO, Monday) or month of [p_from, p_to].
create or replace function public.pro_cash_flow_read(p_actor uuid,p_from date,p_to date,p_grain text default 'month') returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today date:=public.pro_payable_today();n integer;step interval;periods jsonb;totals jsonb;overdue jsonb;plan record;item jsonb;inst jsonb:='[]'::jsonb;undated bigint:=0;
begin
 if p_actor is null then raise exception 'Invalid actor' using errcode='22023';end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_from is null or p_to is null then raise exception 'Invalid report period' using errcode='22023';end if;
 perform public.pro_payable_period_check(p_from,p_to);
 if p_grain is null or p_grain not in('week','month') then raise exception 'Invalid grain' using errcode='22023';end if;
 if p_grain='week' then step:=interval '7 days';n:=(date_trunc('week',p_to)::date-date_trunc('week',p_from)::date)/7+1;
 else step:=interval '1 month';n:=(extract(year from p_to)::integer*12+extract(month from p_to)::integer)-(extract(year from p_from)::integer*12+extract(month from p_from)::integer)+1;end if;
 if (p_grain='week' and n>106) or (p_grain='month' and n>60) then raise exception 'Period too long' using errcode='22023';end if;
 -- Open installments of active payment plans (their own derived state).
 for plan in select p.id,p.work_id from public.pro_payment_plans p where p.owner_id=p_actor and p.status='active' order by p.created_at limit 200 loop
  for item in select value from jsonb_array_elements(coalesce(public.pro_payment_plan_state(p_actor,plan.id,today)->'items','[]'::jsonb)) loop
   if item->>'status'<>'paid' and coalesce((item->>'amountCents')::bigint,0)-coalesce((item->>'appliedCents')::bigint,0)>0 then
    if item->>'dueDate' is null then undated:=undated+(item->>'amountCents')::bigint-coalesce((item->>'appliedCents')::bigint,0);
    else inst:=inst||jsonb_build_array(jsonb_build_object('planId',plan.id,'workId',plan.work_id,'seq',(item->>'seq')::integer,'kind',item->>'kind','due',item->>'dueDate',
     'amount',(item->>'amountCents')::bigint-coalesce((item->>'appliedCents')::bigint,0)));end if;
   end if;
  end loop;
 end loop;
 with ev as (
  -- In, actual: payments received (reversed ones left out).
  select 'in'::text dir,true actual,'payment'::text kind,p.id::text id,p.received_on due,p.amount_cents::bigint amount,coalesce(c.name,'') party,coalesce(w.service,'') work,coalesce(p.reference,'') label
   from public.pro_invoice_payments p left join public.pro_clients c on c.user_id=p.user_id and c.id=p.client_id left join public.pro_work w on w.user_id=p.user_id and w.id=p.work_id
   where p.user_id=p_actor and p.received_on between p_from and p_to and not public.pro_credit_entry_reversed(p_actor,p.entry_id)
  union all -- Out, actual: refunds to customers (not voided).
  select 'out',true,'refund',r.id::text,r.refunded_on,r.amount_cents,'','',''
   from public.pro_credit_refunds r where r.owner_id=p_actor and r.refunded_on between p_from and p_to and not exists(select 1 from public.pro_credit_refund_voids v where v.owner_id=r.owner_id and v.refund_id=r.id)
  union all -- Out, actual: expense payments (a reversal is negative on its own day).
  select 'out',true,'expense_payment',p.id::text,p.paid_on,case when p.kind='payment' then p.amount_cents else -p.amount_cents end,x.supplier_name,'',x.concept
   from public.pro_expense_payments p join public.pro_internal_expenses x on x.user_id=p.user_id and x.id=p.expense_id where p.user_id=p_actor and p.paid_on between p_from and p_to
  union all -- Out, actual: purchase-order payments.
  select 'out',true,'po_payment',p.id::text,p.paid_on,case when p.kind='payment' then p.amount_cents else -p.amount_cents end,o.supplier_name,'','OC-'||lpad(o.number::text,4,'0')
   from public.pro_purchase_order_payments p join public.pro_purchase_orders o on o.owner_id=p.owner_id and o.id=p.order_id where p.owner_id=p_actor and p.paid_on between p_from and p_to
  union all -- In, expected: open invoice drafts (installment drafts are counted by their installment).
  select 'in',false,'invoice',d.id::text,coalesce(pp.planned_date,(d.created_at at time zone 'America/Costa_Rica')::date)+case when pp.sale_condition='credit' then pp.credit_days else 0 end,
   public.pro_report_draft_open(p_actor,d.id),coalesce(c.name,d.receiver_name),coalesce(w.service,''),d.title
   from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
   left join public.pro_invoice_preparation pp on pp.user_id=d.user_id and pp.draft_id=d.id
   left join public.pro_clients c on c.user_id=d.user_id and c.id=d.client_id left join public.pro_work w on w.user_id=d.user_id and w.id=d.work_id
   where d.user_id=p_actor and not coalesce(m.archived,false)
    and not exists(select 1 from public.pro_invoice_billing_items i where i.user_id=d.user_id and i.draft_id=d.id and i.active and i.source_type='installment')
  union all -- In, expected: open payment-plan installments with a known date.
  select 'in',false,'installment',(j->>'planId')||':'||(j->>'seq'),(j->>'due')::date,(j->>'amount')::bigint,coalesce(w.client,''),coalesce(w.service,''),(j->>'seq')
   from jsonb_array_elements(inst) j left join public.pro_work w on w.user_id=p_actor and w.id=j->>'workId'
  union all -- Out, expected: open payables.
  select 'out',false,x.source_kind,x.source_id::text,x.due_date,x.balance_cents,x.supplier_name,x.work_title,case when x.source_kind='purchase_order' then x.reference else x.concept end
   from public.pro_payable_rows(p_actor,today) x where x.status in('pending','partial')),
 placed as (select ev.*,case when actual then due else greatest(due,today) end at_day,(not actual and due<today) is_overdue from ev where amount<>0),
 ps as (select g::date start,(g+step-interval '1 day')::date finish from generate_series(case when p_grain='week' then date_trunc('week',p_from) else date_trunc('month',p_from) end,
   case when p_grain='week' then date_trunc('week',p_to) else date_trunc('month',p_to) end,step) g),
 per as (select ps.start,ps.finish,
   coalesce(sum(pl.amount) filter(where pl.dir='in' and pl.actual),0)::bigint ain,coalesce(sum(pl.amount) filter(where pl.dir='out' and pl.actual),0)::bigint aout,
   coalesce(sum(pl.amount) filter(where pl.dir='in' and not pl.actual),0)::bigint ein,coalesce(sum(pl.amount) filter(where pl.dir='out' and not pl.actual),0)::bigint eout,
   coalesce(sum(pl.amount) filter(where pl.dir='in' and pl.is_overdue),0)::bigint oin,coalesce(sum(pl.amount) filter(where pl.dir='out' and pl.is_overdue),0)::bigint oout
  from ps left join placed pl on pl.at_day between greatest(ps.start,p_from) and least(ps.finish,p_to) group by ps.start,ps.finish),
 run as (select per.*,sum(ain-aout+ein-eout) over(order by start) cumulative from per)
 select coalesce(jsonb_agg(jsonb_build_object('start',to_char(greatest(start,p_from),'YYYY-MM-DD'),'end',to_char(least(finish,p_to),'YYYY-MM-DD'),'current',today between start and finish,
   'actualInCents',ain,'actualOutCents',aout,'expectedInCents',ein,'expectedOutCents',eout,'overdueInCents',oin,'overdueOutCents',oout,
   'netCents',ain-aout+ein-eout,'cumulativeCents',cumulative::bigint) order by start),'[]'::jsonb),
  jsonb_build_object('actualInCents',coalesce(sum(ain),0)::bigint,'actualOutCents',coalesce(sum(aout),0)::bigint,'expectedInCents',coalesce(sum(ein),0)::bigint,'expectedOutCents',coalesce(sum(eout),0)::bigint,
   'netCents',coalesce(sum(ain-aout+ein-eout),0)::bigint)
 into periods,totals from run;
 -- Overdue as of today (whole account, not only the window): what should already have come in or gone out.
 with od as (
  select 'in'::text dir,'invoice'::text kind,d.id::text id,coalesce(c.name,d.receiver_name) party,coalesce(w.service,'') work,d.title label,
   coalesce(pp.planned_date,(d.created_at at time zone 'America/Costa_Rica')::date)+case when pp.sale_condition='credit' then pp.credit_days else 0 end due,public.pro_report_draft_open(p_actor,d.id) amount
   from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
   left join public.pro_invoice_preparation pp on pp.user_id=d.user_id and pp.draft_id=d.id
   left join public.pro_clients c on c.user_id=d.user_id and c.id=d.client_id left join public.pro_work w on w.user_id=d.user_id and w.id=d.work_id
   where d.user_id=p_actor and not coalesce(m.archived,false)
    and not exists(select 1 from public.pro_invoice_billing_items i where i.user_id=d.user_id and i.draft_id=d.id and i.active and i.source_type='installment')
  union all
  select 'in','installment',(j->>'planId')||':'||(j->>'seq'),coalesce(w.client,''),coalesce(w.service,''),(j->>'seq'),(j->>'due')::date,(j->>'amount')::bigint
   from jsonb_array_elements(inst) j left join public.pro_work w on w.user_id=p_actor and w.id=j->>'workId'
  union all
  select 'out',x.source_kind,x.source_id::text,x.supplier_name,x.work_title,case when x.source_kind='purchase_order' then x.reference else x.concept end,x.due_date,x.balance_cents
   from public.pro_payable_rows(p_actor,today) x where x.status in('pending','partial'))
 select jsonb_build_object('inCents',coalesce(sum(amount) filter(where dir='in'),0)::bigint,'outCents',coalesce(sum(amount) filter(where dir='out'),0)::bigint,'count',count(*)::integer,
  'items',coalesce((select jsonb_agg(jsonb_build_object('direction',t.dir,'kind',t.kind,'id',t.id,'party',t.party,'workTitle',t.work,'label',t.label,'dueDate',to_char(t.due,'YYYY-MM-DD'),
   'amountCents',t.amount,'daysOverdue',today-t.due) order by t.due,t.dir,t.id) from (select * from od where amount>0 and due<today order by due,dir,id limit 100) t),'[]'::jsonb))
 into overdue from od where amount>0 and due<today;
 return jsonb_build_object('today',to_char(today,'YYYY-MM-DD'),'from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),'grain',p_grain,
  'periods',periods,'totals',totals||jsonb_build_object('undatedInCents',undated),'overdue',overdue);
end $$;

-- Simple income statement (management report, not a tax filing) per period and per job.
create or replace function public.pro_income_statement_read(p_actor uuid,p_from date,p_to date,p_grain text default 'month') returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today date:=public.pro_payable_today();n integer;step interval;periods jsonb;totals jsonb;jobs jsonb;categories jsonb;tax_unknown integer;job_count integer;
begin
 if p_actor is null then raise exception 'Invalid actor' using errcode='22023';end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_from is null or p_to is null then raise exception 'Invalid report period' using errcode='22023';end if;
 perform public.pro_payable_period_check(p_from,p_to);
 if p_grain is null or p_grain not in('month','quarter','year') then raise exception 'Invalid grain' using errcode='22023';end if;
 step:=case p_grain when 'month' then interval '1 month' when 'quarter' then interval '3 months' else interval '1 year' end;
 n:=case p_grain when 'year' then extract(year from p_to)::integer-extract(year from p_from)::integer+1
  else ((extract(year from p_to)::integer*12+extract(month from p_to)::integer)-(extract(year from p_from)::integer*12+extract(month from p_from)::integer))/case when p_grain='quarter' then 3 else 1 end+1 end;
 if n>60 then raise exception 'Period too long' using errcode='22023';end if;
 with l as (
  -- Income: invoice drafts without IVA (not archived), by creation day in Costa Rica.
  select 'income'::text side,'invoiced'::text line,(d.created_at at time zone 'America/Costa_Rica')::date on_day,d.work_id,(d.total_cents-coalesce(d.tax_cents,0))::bigint amount,(d.tax_cents is null) unknown
   from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
   where d.user_id=p_actor and not coalesce(m.archived,false)
  union all -- Collected (cash basis, informational; not in the result).
  select 'info','collected',p.received_on,p.work_id,p.amount_cents::bigint,false from public.pro_invoice_payments p
   where p.user_id=p_actor and not public.pro_credit_entry_reversed(p_actor,p.entry_id)
  union all -- Costs: expenses without IVA when the rate is known, per category (voided ones left out).
  select 'cost','expense:'||coalesce(eb.category,'uncategorized'),e.expense_date,a.work_id,
   case when eb.vat_rate_bps is null then e.amount_cents else round(e.amount_cents*10000.0/(10000+eb.vat_rate_bps))::bigint end,false
   from public.pro_internal_expenses e left join public.pro_expense_billing eb on eb.user_id=e.user_id and eb.expense_id=e.id
   left join public.pro_work_expense_assignments a on a.user_id=e.user_id and a.expense_id=e.id
   where e.user_id=p_actor and not exists(select 1 from public.pro_payable_bills b where b.owner_id=e.user_id and b.expense_id=e.id and b.voided_at is not null)
  union all -- Costs: internal cost of recorded hours (a void is negative on its own day).
  select 'cost','labor',c.recorded_on,c.work_id,case when c.kind='time' then c.amount_cents else -c.amount_cents end,false
   from public.pro_work_cost_entries c where c.user_id=p_actor and c.kind in('time','time_void') and c.amount_cents is not null
  union all -- Costs: supplier bills of purchase orders without tax (bill date).
  select 'cost','purchase_bills',b.bill_date,o.work_id,f.subtotal_cents,false
   from public.pro_payable_bills b join public.pro_purchase_orders o on o.owner_id=b.owner_id and o.id=b.purchase_order_id
   cross join lateral public.pro_purchase_order_figures(o.owner_id,o.id) f
   where b.owner_id=p_actor and b.voided_at is null and o.status<>'cancelled'),
 w as (select * from l where on_day between p_from and p_to),
 ps as (select g::date start,(g+step-interval '1 day')::date finish from generate_series(
   case p_grain when 'month' then date_trunc('month',p_from) when 'quarter' then date_trunc('quarter',p_from) else date_trunc('year',p_from) end,
   case p_grain when 'month' then date_trunc('month',p_to) when 'quarter' then date_trunc('quarter',p_to) else date_trunc('year',p_to) end,step) g),
 per as (select ps.start,ps.finish,
   coalesce(sum(w.amount) filter(where w.side='income'),0)::bigint income,coalesce(sum(w.amount) filter(where w.line='collected'),0)::bigint collected,
   coalesce(sum(w.amount) filter(where w.line like 'expense:%'),0)::bigint expenses,coalesce(sum(w.amount) filter(where w.line='labor'),0)::bigint labor,
   coalesce(sum(w.amount) filter(where w.line='purchase_bills'),0)::bigint bills
  from ps left join w on w.on_day between ps.start and ps.finish group by ps.start,ps.finish)
 select coalesce(jsonb_agg(jsonb_build_object('start',to_char(greatest(start,p_from),'YYYY-MM-DD'),'end',to_char(least(finish,p_to),'YYYY-MM-DD'),
   'incomeCents',income,'collectedCents',collected,'expensesCents',expenses,'laborCents',labor,'purchaseBillsCents',bills,'costCents',expenses+labor+bills,'resultCents',income-expenses-labor-bills) order by start),'[]'::jsonb),
  jsonb_build_object('incomeCents',coalesce(sum(income),0)::bigint,'collectedCents',coalesce(sum(collected),0)::bigint,'expensesCents',coalesce(sum(expenses),0)::bigint,'laborCents',coalesce(sum(labor),0)::bigint,
   'purchaseBillsCents',coalesce(sum(bills),0)::bigint,'costCents',coalesce(sum(expenses+labor+bills),0)::bigint,'resultCents',coalesce(sum(income-expenses-labor-bills),0)::bigint)
 into periods,totals from per;
 with l as (
  select (d.created_at at time zone 'America/Costa_Rica')::date on_day,d.tax_cents is null unknown from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
  where d.user_id=p_actor and not coalesce(m.archived,false))
 select count(*) filter(where unknown)::integer into tax_unknown from l where on_day between p_from and p_to;
 -- Expense categories of the period.
 select coalesce(jsonb_agg(jsonb_build_object('category',k,'cents',s) order by s desc,k),'[]'::jsonb) into categories from (
  select coalesce(eb.category,'uncategorized') k,sum(case when eb.vat_rate_bps is null then e.amount_cents else round(e.amount_cents*10000.0/(10000+eb.vat_rate_bps))::bigint end)::bigint s
  from public.pro_internal_expenses e left join public.pro_expense_billing eb on eb.user_id=e.user_id and eb.expense_id=e.id
  where e.user_id=p_actor and e.expense_date between p_from and p_to and not exists(select 1 from public.pro_payable_bills b where b.owner_id=e.user_id and b.expense_id=e.id and b.voided_at is not null)
  group by 1) c;
 -- Per job (and the costs/income without a job), same lines as above.
 with l as (
  select 'income'::text line,d.work_id,(d.total_cents-coalesce(d.tax_cents,0))::bigint amount from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
   where d.user_id=p_actor and not coalesce(m.archived,false) and (d.created_at at time zone 'America/Costa_Rica')::date between p_from and p_to
  union all select 'collected',p.work_id,p.amount_cents::bigint from public.pro_invoice_payments p where p.user_id=p_actor and p.received_on between p_from and p_to and not public.pro_credit_entry_reversed(p_actor,p.entry_id)
  union all select 'expenses',a.work_id,case when eb.vat_rate_bps is null then e.amount_cents else round(e.amount_cents*10000.0/(10000+eb.vat_rate_bps))::bigint end
   from public.pro_internal_expenses e left join public.pro_expense_billing eb on eb.user_id=e.user_id and eb.expense_id=e.id left join public.pro_work_expense_assignments a on a.user_id=e.user_id and a.expense_id=e.id
   where e.user_id=p_actor and e.expense_date between p_from and p_to and not exists(select 1 from public.pro_payable_bills b where b.owner_id=e.user_id and b.expense_id=e.id and b.voided_at is not null)
  union all select 'labor',c.work_id,case when c.kind='time' then c.amount_cents else -c.amount_cents end from public.pro_work_cost_entries c
   where c.user_id=p_actor and c.kind in('time','time_void') and c.amount_cents is not null and c.recorded_on between p_from and p_to
  union all select 'bills',o.work_id,f.subtotal_cents from public.pro_payable_bills b join public.pro_purchase_orders o on o.owner_id=b.owner_id and o.id=b.purchase_order_id
   cross join lateral public.pro_purchase_order_figures(o.owner_id,o.id) f where b.owner_id=p_actor and b.voided_at is null and o.status<>'cancelled' and b.bill_date between p_from and p_to),
 g as (select l.work_id,coalesce(sum(amount) filter(where line='income'),0)::bigint income,coalesce(sum(amount) filter(where line='collected'),0)::bigint collected,
   coalesce(sum(amount) filter(where line='expenses'),0)::bigint expenses,coalesce(sum(amount) filter(where line='labor'),0)::bigint labor,coalesce(sum(amount) filter(where line='bills'),0)::bigint bills
  from l group by l.work_id),
 r as (select g.*,income-expenses-labor-bills result from g)
 select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('workId',r.work_id,'service',coalesce(wk.service,''),'client',coalesce(wk.client,''),'incomeCents',r.income,'collectedCents',r.collected,
   'expensesCents',r.expenses,'laborCents',r.labor,'purchaseBillsCents',r.bills,'costCents',r.expenses+r.labor+r.bills,'resultCents',r.result) order by r.work_id is null,r.result desc,coalesce(wk.service,''),r.work_id) filter(where r.rn<=200),'[]'::jsonb)
 into job_count,jobs from (select r.*,row_number() over(order by r.work_id is null,r.result desc,r.work_id) rn from r) r left join public.pro_work wk on wk.user_id=p_actor and wk.id=r.work_id;
 return jsonb_build_object('today',to_char(today,'YYYY-MM-DD'),'from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),'grain',p_grain,'basis','management',
  'periods',periods,'totals',totals,'categories',categories,'jobs',jobs,'jobsTruncated',job_count>200,'taxUnknownInvoices',tax_unknown);
end $$;

-- ---------------------------------------------------------------- RLS and grants (service_role only)
do $$declare t text;begin foreach t in array array['pro_payable_bills','pro_payable_bill_history','pro_payable_actions'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
end loop;end $$;
revoke update,delete,truncate on public.pro_payable_bill_history,public.pro_payable_actions from service_role;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('pro_payable_immutable','pro_payable_today','pro_payable_uuid','pro_payable_period_check','pro_payable_rows','pro_payable_json','pro_payables_read','pro_payables_mutate','pro_cash_flow_read','pro_income_statement_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_payable_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
