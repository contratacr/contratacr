-- LOCAL PRO ONLY. Órdenes de compra por proyecto (families 51, 52 and 54 of the
-- parity register). Owner-private purchase orders per job (pro_work) with a
-- per-account sequential number (OC-0001), supplier from the existing expense
-- suppliers (or a free name), lines with optional budget code / approved
-- selection option / allowance, optional tax per line, per-line receipts and
-- manual supplier payments. Amounts are CRC céntimos (bigint), like work-budget.
-- Nothing here sends e-mail, moves money, creates expenses or invoices.
--
-- Rounding (documented in purchase-orders-local.md): per line,
--   subtotal = round(quantity × unit_cents)          (numeric round, half away from zero)
--   tax      = round(subtotal × tax_rate / 100)
--   total    = subtotal + tax;  order total = Σ line totals.
--
-- Budget: a non-cancelled order is a COMMITMENT, never an actual cost. The budget
-- comparison (pro_purchase_order_budget) shows planned, committed and actual per
-- code and projects each code with greatest(committed, actual) so a later real
-- expense for the same purchase is never added on top of its order.
--
-- Lock order: own action advisory -> own work advisory (same key as nothing else)
-- -> account counter row (create only) -> order row.
begin;
create table if not exists public.pro_purchase_order_counters(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 last_number integer not null default 0 check(last_number between 0 and 999999)
);
create table if not exists public.pro_purchase_orders(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 number integer not null check(number between 1 and 999999),
 supplier_id uuid,supplier_name text not null check(length(btrim(supplier_name)) between 1 and 160),
 supplier_contact text check(supplier_contact is null or length(btrim(supplier_contact)) between 1 and 200),
 title text not null check(length(btrim(title)) between 1 and 160),
 issue_date date not null,expected_date date,
 notes text check(notes is null or length(btrim(notes)) between 1 and 2000),
 status text not null default 'draft' check(status in('draft','issued','partial','received','cancelled')),
 issued_at timestamptz,cancelled_at timestamptz,
 cancel_reason text check(cancel_reason is null or length(btrim(cancel_reason)) between 1 and 300),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,number),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,supplier_id) references public.pro_expense_suppliers(user_id,id),
 check(expected_date is null or expected_date>=issue_date),
 check((status='cancelled')=(cancelled_at is not null))
);
-- Issued-family states carry the issue stamp; a draft has none; a cancelled order may be either.
do $$declare c text;begin
 for c in select conname from pg_constraint where conrelid='public.pro_purchase_orders'::regclass and contype='c' and pg_get_constraintdef(oid) like '%issued_at IS NULL%' and conname<>'pro_purchase_order_issue_stamp' loop
  execute format('alter table public.pro_purchase_orders drop constraint %I',c);
 end loop;
end $$;
alter table public.pro_purchase_orders drop constraint if exists pro_purchase_order_issue_stamp;
alter table public.pro_purchase_orders add constraint pro_purchase_order_issue_stamp check((status='draft' and issued_at is null) or status='cancelled' or (status in('issued','partial','received') and issued_at is not null));
create unique index if not exists pro_purchase_order_global_id on public.pro_purchase_orders(id);
create index if not exists pro_purchase_order_page on public.pro_purchase_orders(owner_id,work_id,number desc);
create table if not exists public.pro_purchase_order_lines(
 owner_id uuid not null,work_id text not null,order_id uuid not null,id uuid not null,
 position smallint not null check(position between 1 and 100),
 description text not null check(length(btrim(description)) between 1 and 300),
 quantity numeric(12,3) not null check(quantity between 0.001 and 1000000),
 unit text not null check(length(btrim(unit)) between 1 and 20),
 unit_cents bigint not null check(unit_cents between 0 and 10000000000),
 tax_rate numeric(5,2) not null default 0 check(tax_rate between 0 and 100),
 subtotal_cents bigint generated always as (round(quantity*unit_cents)::bigint) stored,
 tax_cents bigint generated always as (round(round(quantity*unit_cents)*tax_rate/100)::bigint) stored,
 budget_code_id uuid,selection_option_id uuid,allowance_id uuid,
 primary key(owner_id,id),unique(owner_id,order_id,position),
 foreign key(owner_id,order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade,
 check(subtotal_cents<=10000000000),check(selection_option_id is null or allowance_id is null)
);
-- Optional references: losing the referenced row (account cleanup cascades) only clears the link.
alter table public.pro_purchase_order_lines drop constraint if exists pro_purchase_order_lines_owner_id_work_id_budget_code_id_fkey;
alter table public.pro_purchase_order_lines drop constraint if exists pro_purchase_order_lines_owner_id_selection_option_id_fkey;
alter table public.pro_purchase_order_lines drop constraint if exists pro_purchase_order_lines_owner_id_allowance_id_fkey;
alter table public.pro_purchase_order_lines drop constraint if exists pro_purchase_order_line_budget_code;
alter table public.pro_purchase_order_lines drop constraint if exists pro_purchase_order_line_selection_option;
alter table public.pro_purchase_order_lines drop constraint if exists pro_purchase_order_line_allowance;
alter table public.pro_purchase_order_lines add constraint pro_purchase_order_line_budget_code foreign key(owner_id,work_id,budget_code_id) references public.pro_work_budget_codes(owner_id,work_id,id) on delete set null(budget_code_id);
alter table public.pro_purchase_order_lines add constraint pro_purchase_order_line_selection_option foreign key(owner_id,selection_option_id) references public.pro_work_selection_options(owner_id,id) on delete set null(selection_option_id);
alter table public.pro_purchase_order_lines add constraint pro_purchase_order_line_allowance foreign key(owner_id,allowance_id) references public.pro_work_allowances(owner_id,id) on delete set null(allowance_id);
create index if not exists pro_purchase_order_lines_order on public.pro_purchase_order_lines(owner_id,order_id,position);
create index if not exists pro_purchase_order_lines_code on public.pro_purchase_order_lines(owner_id,work_id,budget_code_id);
-- One row per received line per receipt action; never updated (no edits, no deletes).
create table if not exists public.pro_purchase_order_receipts(
 owner_id uuid not null,order_id uuid not null,id uuid not null,line_id uuid not null,
 quantity numeric(12,3) not null check(quantity between 0.001 and 1000000),
 received_on date not null,note text check(note is null or length(btrim(note)) between 1 and 300),
 created_at timestamptz not null default now(),
 primary key(owner_id,id,line_id),
 foreign key(owner_id,order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade,
 foreign key(owner_id,line_id) references public.pro_purchase_order_lines(owner_id,id) on delete cascade
);
create index if not exists pro_purchase_order_receipts_order on public.pro_purchase_order_receipts(owner_id,order_id);
-- Manual record of a payment made outside ContrataCR; a reversal is a new row.
create table if not exists public.pro_purchase_order_payments(
 owner_id uuid not null,order_id uuid not null,id uuid not null,
 kind text not null check(kind in('payment','reverse')),payment_id uuid,
 amount_cents bigint not null check(amount_cents between 1 and 10000000000000),
 paid_on date not null,method text not null check(method in('transfer','sinpe','cash','card','check','other')),
 reference text check(reference is null or length(btrim(reference)) between 1 and 160),
 note text check(note is null or length(btrim(note)) between 1 and 300),
 created_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,order_id,id),
 foreign key(owner_id,order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade,
 foreign key(owner_id,order_id,payment_id) references public.pro_purchase_order_payments(owner_id,order_id,id),
 check((kind='payment' and payment_id is null) or (kind='reverse' and payment_id is not null and note is not null))
);
create unique index if not exists pro_purchase_order_one_reverse on public.pro_purchase_order_payments(owner_id,payment_id) where kind='reverse';
create table if not exists public.pro_purchase_order_history(
 owner_id uuid not null,work_id text not null,order_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','issue','receive','pay','reverse_payment','cancel')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id),foreign key(owner_id,order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade
);
create index if not exists pro_purchase_order_history_page on public.pro_purchase_order_history(owner_id,order_id,at desc);
create table if not exists public.pro_purchase_order_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

-- Costa Rica calendar day (UTC-6, no DST) for overdue and date limits.
create or replace function public.pro_purchase_order_today() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (now() at time zone 'America/Costa_Rica')::date $$;

create or replace function public.pro_purchase_order_figures(p_owner uuid,p_order uuid,
 out subtotal_cents bigint,out tax_cents bigint,out total_cents bigint,out paid_cents bigint,out line_count integer)
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(sum(l.subtotal_cents),0)::bigint,coalesce(sum(l.tax_cents),0)::bigint,coalesce(sum(l.subtotal_cents+l.tax_cents),0)::bigint,
  (select coalesce(sum(case when p.kind='payment' then p.amount_cents else -p.amount_cents end),0)::bigint from public.pro_purchase_order_payments p where p.owner_id=p_owner and p.order_id=p_order),
  count(l.id)::integer
 from public.pro_purchase_order_lines l where l.owner_id=p_owner and l.order_id=p_order;
$$;

create or replace function public.pro_purchase_order_summary(p_row public.pro_purchase_orders) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'number',p_row.number,'code','OC-'||lpad(p_row.number::text,4,'0'),
  'title',p_row.title,'supplierId',p_row.supplier_id,'supplierName',p_row.supplier_name,'supplierContact',p_row.supplier_contact,
  'status',p_row.status,'issueDate',p_row.issue_date,'expectedDate',p_row.expected_date,
  'subtotalCents',f.subtotal_cents,'taxCents',f.tax_cents,'totalCents',f.total_cents,'paidCents',f.paid_cents,'balanceCents',f.total_cents-f.paid_cents,
  'lineCount',f.line_count,
  'overdue',p_row.status in('issued','partial') and p_row.expected_date is not null and p_row.expected_date<public.pro_purchase_order_today(),
  'revision',p_row.revision,'issuedAt',p_row.issued_at,'cancelledAt',p_row.cancelled_at,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at)
 from public.pro_purchase_order_figures(p_row.owner_id,p_row.id) f;
$$;

create or replace function public.pro_purchase_order_json(p_row public.pro_purchase_orders) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select public.pro_purchase_order_summary(p_row)||jsonb_build_object('notes',p_row.notes,'cancelReason',p_row.cancel_reason,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'position',l.position,'description',l.description,'quantity',l.quantity,'unit',l.unit,
    'unitCents',l.unit_cents,'taxRate',l.tax_rate,'subtotalCents',l.subtotal_cents,'taxCents',l.tax_cents,'totalCents',l.subtotal_cents+l.tax_cents,
    'budgetCodeId',l.budget_code_id,'selectionOptionId',l.selection_option_id,'allowanceId',l.allowance_id,
    'receivedQuantity',coalesce((select sum(r.quantity) from public.pro_purchase_order_receipts r where r.owner_id=l.owner_id and r.line_id=l.id),0)) order by l.position)
   from public.pro_purchase_order_lines l where l.owner_id=p_row.owner_id and l.order_id=p_row.id),'[]'::jsonb),
  'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'lineId',r.line_id,'quantity',r.quantity,'receivedOn',r.received_on,'note',r.note,'createdAt',r.created_at) order by r.created_at,r.id,r.line_id)
   from public.pro_purchase_order_receipts r where r.owner_id=p_row.owner_id and r.order_id=p_row.id),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'paymentId',p.payment_id,'amountCents',p.amount_cents,'paidOn',p.paid_on,
    'method',p.method,'reference',p.reference,'note',p.note,'createdAt',p.created_at,
    'reversed',p.kind='payment' and exists(select 1 from public.pro_purchase_order_payments x where x.owner_id=p.owner_id and x.payment_id=p.id)) order by p.created_at,p.id)
   from public.pro_purchase_order_payments p where p.owner_id=p_row.owner_id and p.order_id=p_row.id),'[]'::jsonb));
$$;

-- Budget comparison per code: planned (work-budget), committed (lines of non-cancelled
-- orders, tax included), actual (existing work-budget sources) and variance =
-- planned − greatest(committed, actual). Groups roll up their items. Never writes.
create or replace function public.pro_purchase_order_budget(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare rows jsonb;totals jsonb;
begin
 with codes as materialized(select * from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=p_work),
 sources as materialized(select * from public.pro_work_budget_sources(p_actor,p_work)),
 committed as materialized(select l.budget_code_id code_id,sum(l.subtotal_cents+l.tax_cents)::bigint cents
   from public.pro_purchase_order_lines l join public.pro_purchase_orders o on o.owner_id=l.owner_id and o.id=l.order_id
   where l.owner_id=p_actor and l.work_id=p_work and o.status<>'cancelled' group by l.budget_code_id),
 items as materialized(select c.id,c.parent_id,c.planned_cents planned,coalesce(m.cents,0)::bigint committed,
   coalesce((select sum(s.amount_cents) from sources s where s.code_id=c.id),0)::bigint actual,
   (select count(*) from sources s where s.code_id=c.id and s.amount_cents is null)::bigint unknown
   from codes c left join committed m on m.code_id=c.id where c.kind='item'),
 grouped as(select c.id,c.kind,c.code,c.title,c.parent_id,c.archived,
   case when c.kind='item' then i.planned else (select sum(x.planned) from items x where x.parent_id=c.id) end planned,
   case when c.kind='item' then i.committed else coalesce((select sum(x.committed) from items x where x.parent_id=c.id),0) end committed,
   case when c.kind='item' then i.actual else coalesce((select sum(x.actual) from items x where x.parent_id=c.id),0) end actual,
   case when c.kind='item' then i.unknown else coalesce((select sum(x.unknown) from items x where x.parent_id=c.id),0) end unknown,
   case when c.kind='item' then greatest(i.committed,i.actual) else coalesce((select sum(greatest(x.committed,x.actual)) from items x where x.parent_id=c.id),0) end projected
   from codes c left join items i on i.id=c.id)
 select coalesce(jsonb_agg(jsonb_build_object('codeId',g.id,'kind',g.kind,'code',g.code,'title',g.title,'parentId',g.parent_id,'archived',g.archived,
   'plannedCents',g.planned,'committedCents',g.committed,'actualCents',g.actual,'unknownCount',g.unknown,'projectedCents',g.projected,
   'varianceCents',case when g.planned is null or g.unknown>0 then null else g.planned-g.projected end)
   order by coalesce((select p.code from codes p where p.id=g.parent_id),g.code),g.parent_id is not null,g.code),'[]'::jsonb) into rows
 from grouped g;
 with sources as materialized(select * from public.pro_work_budget_sources(p_actor,p_work)),
 committed as materialized(select l.budget_code_id code_id,sum(l.subtotal_cents+l.tax_cents)::bigint cents
   from public.pro_purchase_order_lines l join public.pro_purchase_orders o on o.owner_id=l.owner_id and o.id=l.order_id
   where l.owner_id=p_actor and l.work_id=p_work and o.status<>'cancelled' group by l.budget_code_id),
 per_code as(select c.id,c.planned_cents planned,coalesce(m.cents,0)::bigint committed,
   coalesce((select sum(s.amount_cents) from sources s where s.code_id=c.id),0)::bigint actual
   from public.pro_work_budget_codes c left join committed m on m.code_id=c.id where c.owner_id=p_actor and c.work_id=p_work and c.kind='item'),
 loose as(select coalesce((select cents from committed where code_id is null),0)::bigint committed,
   coalesce((select sum(amount_cents) from sources where code_id is null),0)::bigint actual)
 select jsonb_build_object(
   'plannedCents',(select sum(planned)::bigint from per_code),
   'committedCents',coalesce((select sum(cents) from committed),0)::bigint,
   'actualCents',coalesce((select sum(amount_cents) from sources),0)::bigint,
   'unknownCount',(select count(*) from sources where amount_cents is null),
   'uncodedCommittedCents',(select committed from loose),'unassignedActualCents',(select actual from loose),
   'projectedCents',coalesce((select sum(greatest(committed,actual)) from per_code),0)::bigint+(select greatest(committed,actual) from loose),
   'varianceCents',case when (select sum(planned) from per_code) is null or exists(select 1 from sources where amount_cents is null) then null
     else (select sum(planned) from per_code)-coalesce((select sum(greatest(committed,actual)) from per_code),0)-(select greatest(committed,actual) from loose) end)
 into totals;
 return jsonb_build_object('workId',p_work,'currency','CRC','rows',rows,'totals',totals);
end $$;

create or replace function public.pro_purchase_order_references(p_actor uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'budgetCodes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'title',c.title) order by c.code) from public.pro_work_budget_codes c
    where c.owner_id=p_actor and c.work_id=p_work and c.kind='item' and not c.archived
    and (c.parent_id is null or exists(select 1 from public.pro_work_budget_codes p where p.owner_id=c.owner_id and p.work_id=c.work_id and p.id=c.parent_id and not p.archived))),'[]'::jsonb),
  'selectionOptions',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'itemName',i.name,'name',o.name,'brand',o.brand,'quantity',o.quantity,'unitCents',o.unit_cents) order by i.position)
    from public.pro_work_selection_items i join public.pro_work_selection_options o on o.owner_id=i.owner_id and o.id=i.approved_option_id
    where i.owner_id=p_actor and i.work_id=p_work and i.status='approved' and not i.archived),'[]'::jsonb),
  'allowances',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'plannedCents',a.planned_cents) order by a.position)
    from public.pro_work_allowances a where a.owner_id=p_actor and a.work_id=p_work and not a.archived),'[]'::jsonb),
  'suppliers',coalesce((select jsonb_agg(x.item order by x.name,x.id) from (select s.name,s.id,jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'phone',s.phone) item
    from public.pro_expense_suppliers s where s.user_id=p_actor and not s.archived order by s.name,s.id limit 200) x),'[]'::jsonb));
$$;

create or replace function public.pro_purchase_orders_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare wid text;v text;st text;sup text;od boolean;dfrom date;dto date;cur integer;oid uuid;r public.pro_purchase_orders;items jsonb;totals jsonb;more boolean;work_row record;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or jsonb_typeof(p_query->'workId') is distinct from 'string'
  or exists(select 1 from jsonb_object_keys(p_query) k where k not in('workId','view','status','supplier','overdue','from','to','after','id')) then
  raise exception 'Invalid purchase order query' using errcode='22023';end if;
 wid:=p_query->>'workId';v:=coalesce(p_query->>'view','list');
 if length(wid) not between 1 and 160 or v not in('list','detail','budget') then raise exception 'Invalid purchase order query' using errcode='22023';end if;
 select w.id,w.service,w.cancelled into work_row from public.pro_work w where w.user_id=p_actor and w.id=wid;
 if not found then return null;end if;
 if v='budget' then return public.pro_purchase_order_budget(p_actor,wid);end if;
 if v='detail' then
  oid:=(p_query->>'id')::uuid;if oid is null then raise exception 'Order identity required' using errcode='22023';end if;
  select * into r from public.pro_purchase_orders where owner_id=p_actor and work_id=wid and id=oid;
  if not found then return jsonb_build_object('workId',wid,'order',null);end if;
  return jsonb_build_object('workId',wid,'workTitle',work_row.service,'today',public.pro_purchase_order_today(),'order',public.pro_purchase_order_json(r),
   'history',coalesce((select jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_value,'after',h.after_value) order by h.at desc,h.action_id)
    from (select * from public.pro_purchase_order_history h where h.owner_id=p_actor and h.order_id=oid order by h.at desc,h.action_id limit 100) h),'[]'::jsonb));
 end if;
 st:=coalesce(p_query->>'status','all');sup:=nullif(btrim(coalesce(p_query->>'supplier','')),'');od:=coalesce(p_query->>'overdue','0')='1';
 if st not in('all','open','draft','issued','partial','received','cancelled') or length(sup)>160 or coalesce(p_query->>'overdue','0') not in('0','1') then raise exception 'Invalid purchase order filter' using errcode='22023';end if;
 if p_query->>'from' is not null then if not (p_query->>'from')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023';end if;dfrom:=(p_query->>'from')::date;end if;
 if p_query->>'to' is not null then if not (p_query->>'to')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023';end if;dto:=(p_query->>'to')::date;end if;
 if dfrom is not null and dto is not null and dto<dfrom then raise exception 'Invalid date range' using errcode='22023';end if;
 if p_query->>'after' is not null then if not (p_query->>'after')~'^[0-9]{1,6}$' then raise exception 'Invalid cursor' using errcode='22023';end if;cur:=(p_query->>'after')::integer;end if;
 with filtered as materialized(select o.*,public.pro_purchase_order_summary(o) s from public.pro_purchase_orders o
   where o.owner_id=p_actor and o.work_id=wid
    and (st='all' or (st='open' and o.status in('draft','issued','partial')) or o.status=st)
    and (sup is null or lower(o.supplier_name)=lower(sup))
    and (not od or (o.status in('issued','partial') and o.expected_date is not null and o.expected_date<public.pro_purchase_order_today()))
    and (dfrom is null or o.issue_date>=dfrom) and (dto is null or o.issue_date<=dto)),
  page as(select * from filtered where cur is null or number<cur order by number desc limit 21)
 select coalesce((select jsonb_agg(s order by number desc) from (select * from page order by number desc limit 20) p),'[]'::jsonb),
  (select count(*)>20 from page),
  jsonb_build_object('count',(select count(*) from filtered where status<>'cancelled'),
   'totalCents',coalesce((select sum((s->>'totalCents')::bigint) from filtered where status<>'cancelled'),0),
   'paidCents',coalesce((select sum((s->>'paidCents')::bigint) from filtered where status<>'cancelled'),0),
   'balanceCents',coalesce((select sum((s->>'balanceCents')::bigint) from filtered where status<>'cancelled'),0),
   'overdueCount',(select count(*) from filtered where (s->>'overdue')::boolean),
   'cancelledCount',(select count(*) from filtered where status='cancelled'))
 into items,more,totals;
 return jsonb_build_object('workId',wid,'workTitle',work_row.service,'canWrite',not coalesce(work_row.cancelled,false),'today',public.pro_purchase_order_today(),
  'items',items,'nextCursor',case when more then (items->19->>'number')::integer end,'totals',totals,
  'supplierNames',coalesce((select jsonb_agg(n order by lower(n)) from (select distinct on (lower(supplier_name)) supplier_name n from public.pro_purchase_orders where owner_id=p_actor and work_id=wid order by lower(supplier_name),supplier_name) d),'[]'::jsonb),
  'nextNumber',coalesce((select last_number from public.pro_purchase_order_counters where owner_id=p_actor),0)+1,
  'references',public.pro_purchase_order_references(p_actor,wid));
end $$;

-- Optional text: JSON null or a string trimmed to 1..max (empty → null). Raises 22023 otherwise.
create or replace function public.pro_purchase_order_text(p_value jsonb,p_max integer,p_required boolean) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare t text;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' then raise exception 'Invalid text' using errcode='22023';end if;
 t:=btrim(p_value#>>'{}');
 if t='' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if length(t)>p_max or t~'[[:cntrl:]]' and p_max<=300 then raise exception 'Invalid text' using errcode='22023';end if;
 return t;
end $$;
create or replace function public.pro_purchase_order_day(p_value jsonb,p_required boolean) returns date
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare d date;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing date' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' or not (p_value#>>'{}')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
 d:=(p_value#>>'{}')::date;if to_char(d,'YYYY-MM-DD')<>p_value#>>'{}' then raise exception 'Invalid date' using errcode='22023';end if;
 return d;
end $$;

create or replace function public.pro_purchase_orders_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;aid uuid;rid uuid;rev integer;keys text[];expected text[];receipt public.pro_purchase_order_actions;r public.pro_purchase_orders;
 before_json jsonb;after_json jsonb;result jsonb;work_row record;supplier public.pro_expense_suppliers;v_supplier uuid;v_name text;v_contact text;v_title text;v_issue date;v_expected date;v_notes text;
 line jsonb;line_keys text[];n integer;q numeric;tax numeric;unit_cents numeric;v_code uuid;v_option uuid;v_allowance uuid;seen uuid[]:=array[]::uuid[];ordered numeric;received numeric;
 v_day date;v_note text;fig record;amount numeric;v_method text;v_reference text;pay public.pro_purchase_order_payments;next_number integer;all_received boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid purchase order' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'create' then array['action','actionId','expectedDate','id','issueDate','lines','notes','supplierContact','supplierId','supplierName','title','workId']
  when 'update' then array['action','actionId','expectedDate','id','issueDate','lines','notes','revision','supplierContact','supplierId','supplierName','title','workId']
  when 'issue' then array['action','actionId','id','revision','workId']
  when 'cancel' then array['action','actionId','id','reason','revision','workId']
  when 'receive' then array['action','actionId','entries','id','note','receivedOn','revision','workId']
  when 'pay' then array['action','actionId','amountCents','id','method','note','paidOn','reference','revision','workId']
  when 'reverse_payment' then array['action','actionId','id','note','paymentId','revision','workId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
  or jsonb_typeof(p_input->'id') is distinct from 'string' then raise exception 'Invalid purchase order fields' using errcode='22023';end if;
 if act<>'create' and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'id')::uuid;rev:=case when act<>'create' then (p_input->>'revision')::integer end;
 if length(wid) not between 1 and 160 then raise exception 'Invalid purchase order identity' using errcode='22023';end if;
 -- Shape validation that needs no state (all 22023 → 400).
 if act in('create','update') then
  v_title:=public.pro_purchase_order_text(p_input->'title',160,true);
  v_contact:=public.pro_purchase_order_text(p_input->'supplierContact',200,false);
  v_notes:=public.pro_purchase_order_text(p_input->'notes',2000,false);
  v_issue:=public.pro_purchase_order_day(p_input->'issueDate',true);v_expected:=public.pro_purchase_order_day(p_input->'expectedDate',false);
  if v_expected is not null and v_expected<v_issue then raise exception 'Expected date before issue date' using errcode='22023';end if;
  if jsonb_typeof(p_input->'supplierId') not in('string','null') then raise exception 'Invalid supplier' using errcode='22023';end if;
  v_supplier:=(p_input->>'supplierId')::uuid;
  if v_supplier is null then v_name:=public.pro_purchase_order_text(p_input->'supplierName',160,true);
  elsif jsonb_typeof(p_input->'supplierName') is distinct from 'null' then raise exception 'Supplier name comes from the supplier' using errcode='22023';end if;
  if jsonb_typeof(p_input->'lines') is distinct from 'array' or jsonb_array_length(p_input->'lines') not between 1 and 100 then raise exception 'Invalid lines' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(p_input->'lines') loop
   select array_agg(key order by key) into line_keys from jsonb_object_keys(line) key;
   if jsonb_typeof(line) is distinct from 'object' or line_keys is distinct from array['allowanceId','budgetCodeId','description','id','quantity','selectionOptionId','taxRate','unit','unitCents']
    or jsonb_typeof(line->'id') is distinct from 'string' or jsonb_typeof(line->'quantity') is distinct from 'number' or jsonb_typeof(line->'unitCents') is distinct from 'number'
    or jsonb_typeof(line->'taxRate') is distinct from 'number' or jsonb_typeof(line->'budgetCodeId') not in('string','null')
    or jsonb_typeof(line->'selectionOptionId') not in('string','null') or jsonb_typeof(line->'allowanceId') not in('string','null') then raise exception 'Invalid line fields' using errcode='22023';end if;
   perform public.pro_purchase_order_text(line->'description',300,true);perform public.pro_purchase_order_text(line->'unit',20,true);
   q:=(line->>'quantity')::numeric;tax:=(line->>'taxRate')::numeric;unit_cents:=(line->>'unitCents')::numeric;
   if q<>round(q,3) or q not between 0.001 and 1000000 or tax<>round(tax,2) or tax not between 0 and 100 or unit_cents<>round(unit_cents) or unit_cents not between 0 and 10000000000
    or round(q*unit_cents)>10000000000 then raise exception 'Invalid line values' using errcode='22023';end if;
   if line->>'selectionOptionId' is not null and line->>'allowanceId' is not null then raise exception 'Link a selection or an allowance, not both' using errcode='22023';end if;
   if (line->>'id')::uuid=any(seen) then raise exception 'Duplicated line' using errcode='22023';end if;seen:=seen||(line->>'id')::uuid;
  end loop;
 elsif act='cancel' then v_note:=public.pro_purchase_order_text(p_input->'reason',300,false);
 elsif act='receive' then
  v_day:=public.pro_purchase_order_day(p_input->'receivedOn',true);v_note:=public.pro_purchase_order_text(p_input->'note',300,false);
  if jsonb_typeof(p_input->'entries') is distinct from 'array' or jsonb_array_length(p_input->'entries') not between 1 and 100 then raise exception 'Invalid receipt' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(p_input->'entries') loop
   select array_agg(key order by key) into line_keys from jsonb_object_keys(line) key;
   if jsonb_typeof(line) is distinct from 'object' or line_keys is distinct from array['lineId','quantity'] or jsonb_typeof(line->'lineId') is distinct from 'string' or jsonb_typeof(line->'quantity') is distinct from 'number' then raise exception 'Invalid receipt entry' using errcode='22023';end if;
   q:=(line->>'quantity')::numeric;if q<>round(q,3) or q not between 0.001 and 1000000 then raise exception 'Invalid receipt quantity' using errcode='22023';end if;
   if (line->>'lineId')::uuid=any(seen) then raise exception 'Duplicated receipt line' using errcode='22023';end if;seen:=seen||(line->>'lineId')::uuid;
  end loop;
 elsif act='pay' then
  if jsonb_typeof(p_input->'amountCents') is distinct from 'number' or jsonb_typeof(p_input->'method') is distinct from 'string' then raise exception 'Invalid payment' using errcode='22023';end if;
  amount:=(p_input->>'amountCents')::numeric;v_method:=p_input->>'method';v_day:=public.pro_purchase_order_day(p_input->'paidOn',true);
  v_reference:=public.pro_purchase_order_text(p_input->'reference',160,false);v_note:=public.pro_purchase_order_text(p_input->'note',300,false);
  if amount<>round(amount) or amount not between 1 and 10000000000000 or v_method not in('transfer','sinpe','cash','card','check','other') then raise exception 'Invalid payment values' using errcode='22023';end if;
 elsif act='reverse_payment' then
  if jsonb_typeof(p_input->'paymentId') is distinct from 'string' then raise exception 'Invalid reversal' using errcode='22023';end if;
  v_note:=public.pro_purchase_order_text(p_input->'note',300,true);
 end if;
 select w.id,w.cancelled into work_row from public.pro_work w where w.user_id=p_actor and w.id=wid;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-purchase-order-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_purchase_order_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-purchase-order-work:'||p_actor::text||':'||wid,0));
 if coalesce(work_row.cancelled,false) and act in('create','update','issue') then raise exception 'Restore the job before ordering' using errcode='40001';end if;
 if act in('create','update') then
  if v_supplier is not null then
   select * into supplier from public.pro_expense_suppliers where user_id=p_actor and id=v_supplier;
   if not found then raise exception 'Unknown supplier' using errcode='22023';end if;
   v_name:=supplier.name;
  end if;
 end if;
 if act='create' then
  if exists(select 1 from public.pro_purchase_orders where id=rid) then raise exception 'Order id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_purchase_orders where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Purchase order limit' using errcode='54000';end if;
  if supplier.id is not null and supplier.archived then raise exception 'Archived supplier' using errcode='22023';end if;
  -- Per-account number: row lock serializes creators; a failed transaction rolls the counter back (no gaps).
  insert into public.pro_purchase_order_counters(owner_id) values(p_actor) on conflict(owner_id) do nothing;
  update public.pro_purchase_order_counters set last_number=last_number+1 where owner_id=p_actor returning last_number into next_number;
  insert into public.pro_purchase_orders(owner_id,id,work_id,number,supplier_id,supplier_name,supplier_contact,title,issue_date,expected_date,notes)
   values(p_actor,rid,wid,next_number,v_supplier,v_name,v_contact,v_title,v_issue,v_expected,v_notes) returning * into r;
  before_json:=null;
 else
  select * into r from public.pro_purchase_orders where owner_id=p_actor and id=rid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if r.revision<>rev then raise exception 'Purchase order changed' using errcode='40001';end if;
  before_json:=public.pro_purchase_order_json(r);
  select * into fig from public.pro_purchase_order_figures(p_actor,rid);
  if act='update' then
   if r.status not in('draft','issued') or exists(select 1 from public.pro_purchase_order_receipts where owner_id=p_actor and order_id=rid) then raise exception 'Only orders without receipts can be edited' using errcode='22023';end if;
   if supplier.id is not null and supplier.archived and r.supplier_id is distinct from supplier.id then raise exception 'Archived supplier' using errcode='22023';end if;
   if r.supplier_id=v_supplier then v_name:=r.supplier_name;end if;
   if exists(select 1 from public.pro_purchase_order_payments where owner_id=p_actor and order_id=rid and paid_on<v_issue) then raise exception 'Payments before issue date' using errcode='22023';end if;
   update public.pro_purchase_orders set supplier_id=v_supplier,supplier_name=v_name,supplier_contact=v_contact,title=v_title,issue_date=v_issue,expected_date=v_expected,notes=v_notes,revision=revision+1,updated_at=now()
    where owner_id=p_actor and id=rid returning * into r;
   delete from public.pro_purchase_order_lines where owner_id=p_actor and order_id=rid;
  elsif act='issue' then
   if r.status<>'draft' then raise exception 'Only drafts can be issued' using errcode='22023';end if;
   update public.pro_purchase_orders set status='issued',issued_at=now(),revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='cancel' then
   if r.status not in('draft','issued','partial') then raise exception 'Order cannot be cancelled' using errcode='22023';end if;
   if fig.paid_cents<>0 then raise exception 'Reverse payments before cancelling' using errcode='22023';end if;
   update public.pro_purchase_orders set status='cancelled',cancelled_at=now(),cancel_reason=v_note,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='receive' then
   if r.status not in('issued','partial') then raise exception 'Issue the order before receiving' using errcode='22023';end if;
   if v_day<r.issue_date or v_day>public.pro_purchase_order_today() then raise exception 'Invalid receipt date' using errcode='22023';end if;
   for line in select value from jsonb_array_elements(p_input->'entries') loop
    select l.quantity into ordered from public.pro_purchase_order_lines l where l.owner_id=p_actor and l.order_id=rid and l.id=(line->>'lineId')::uuid;
    if not found then raise exception 'Unknown line' using errcode='22023';end if;
    select coalesce(sum(x.quantity),0) into received from public.pro_purchase_order_receipts x where x.owner_id=p_actor and x.line_id=(line->>'lineId')::uuid;
    if received+(line->>'quantity')::numeric>ordered then raise exception 'Received more than ordered' using errcode='22023';end if;
    insert into public.pro_purchase_order_receipts(owner_id,order_id,id,line_id,quantity,received_on,note) values(p_actor,rid,aid,(line->>'lineId')::uuid,(line->>'quantity')::numeric,v_day,v_note);
   end loop;
   select bool_and(coalesce((select sum(x.quantity) from public.pro_purchase_order_receipts x where x.owner_id=l.owner_id and x.line_id=l.id),0)>=l.quantity) into all_received
    from public.pro_purchase_order_lines l where l.owner_id=p_actor and l.order_id=rid;
   update public.pro_purchase_orders set status=case when all_received then 'received' else 'partial' end,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='pay' then
   if r.status not in('issued','partial','received') then raise exception 'Issue the order before paying' using errcode='22023';end if;
   if v_day<r.issue_date or v_day>public.pro_purchase_order_today() then raise exception 'Invalid payment date' using errcode='22023';end if;
   if amount>fig.total_cents-fig.paid_cents then raise exception 'Payment exceeds balance' using errcode='22023';end if;
   insert into public.pro_purchase_order_payments(owner_id,order_id,id,kind,amount_cents,paid_on,method,reference,note) values(p_actor,rid,aid,'payment',amount::bigint,v_day,v_method,v_reference,v_note);
   update public.pro_purchase_orders set revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='reverse_payment' then
   select * into pay from public.pro_purchase_order_payments where owner_id=p_actor and order_id=rid and id=(p_input->>'paymentId')::uuid and kind='payment';
   if not found or exists(select 1 from public.pro_purchase_order_payments where owner_id=p_actor and payment_id=pay.id) then raise exception 'Invalid reversal' using errcode='22023';end if;
   insert into public.pro_purchase_order_payments(owner_id,order_id,id,kind,payment_id,amount_cents,paid_on,method,reference,note)
    values(p_actor,rid,aid,'reverse',pay.id,pay.amount_cents,greatest(pay.paid_on,public.pro_purchase_order_today()),pay.method,pay.reference,v_note);
   update public.pro_purchase_orders set revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  end if;
 end if;
 if act in('create','update') then
  n:=0;
  for line in select value from jsonb_array_elements(p_input->'lines') loop
   n:=n+1;v_code:=(line->>'budgetCodeId')::uuid;v_option:=(line->>'selectionOptionId')::uuid;v_allowance:=(line->>'allowanceId')::uuid;
   if v_code is not null and not exists(select 1 from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=wid and c.id=v_code and c.kind='item' and not c.archived) then
    raise exception 'Choose an active budget item' using errcode='22023';end if;
   if v_option is not null and not exists(select 1 from public.pro_work_selection_items i where i.owner_id=p_actor and i.work_id=wid and i.approved_option_id=v_option and i.status='approved' and not i.archived) then
    raise exception 'Choose an approved selection option' using errcode='22023';end if;
   if v_allowance is not null and not exists(select 1 from public.pro_work_allowances a where a.owner_id=p_actor and a.work_id=wid and a.id=v_allowance and not a.archived) then
    raise exception 'Choose an active allowance' using errcode='22023';end if;
   if exists(select 1 from public.pro_purchase_order_lines where id=(line->>'id')::uuid and not(owner_id=p_actor and order_id=rid)) then raise exception 'Line id already used' using errcode='23505';end if;
   insert into public.pro_purchase_order_lines(owner_id,work_id,order_id,id,position,description,quantity,unit,unit_cents,tax_rate,budget_code_id,selection_option_id,allowance_id)
    values(p_actor,wid,rid,(line->>'id')::uuid,n,btrim(line->>'description'),(line->>'quantity')::numeric,btrim(line->>'unit'),(line->>'unitCents')::bigint,(line->>'taxRate')::numeric,v_code,v_option,v_allowance);
  end loop;
  select * into fig from public.pro_purchase_order_figures(p_actor,rid);
  if fig.paid_cents>fig.total_cents then raise exception 'Total below payments' using errcode='22023';end if;
  if before_json is not null and before_json-'revision'-'updatedAt'-'receipts'-'payments'-'paidCents'-'balanceCents'-'overdue'
   =public.pro_purchase_order_json(r)-'revision'-'updatedAt'-'receipts'-'payments'-'paidCents'-'balanceCents'-'overdue' then
   raise exception 'No purchase order changes' using errcode='22023';end if;
 end if;
 after_json:=public.pro_purchase_order_json(r);result:=jsonb_build_object('order',after_json);
 insert into public.pro_purchase_order_history(owner_id,work_id,order_id,action_id,action,before_value,after_value) values(p_actor,wid,rid,aid,act,before_json,after_json);
 insert into public.pro_purchase_order_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

create or replace function public.pro_purchase_order_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Purchase order history, receipts and payments are immutable' using errcode='23514';
end $$;
drop trigger if exists pro_purchase_order_history_immutable on public.pro_purchase_order_history;
create trigger pro_purchase_order_history_immutable before update on public.pro_purchase_order_history for each row execute function public.pro_purchase_order_immutable();
drop trigger if exists pro_purchase_order_action_immutable on public.pro_purchase_order_actions;
create trigger pro_purchase_order_action_immutable before update on public.pro_purchase_order_actions for each row execute function public.pro_purchase_order_immutable();
drop trigger if exists pro_purchase_order_receipt_immutable on public.pro_purchase_order_receipts;
create trigger pro_purchase_order_receipt_immutable before update on public.pro_purchase_order_receipts for each row execute function public.pro_purchase_order_immutable();
drop trigger if exists pro_purchase_order_payment_immutable on public.pro_purchase_order_payments;
create trigger pro_purchase_order_payment_immutable before update on public.pro_purchase_order_payments for each row execute function public.pro_purchase_order_immutable();

do $$declare t text;f record;begin
 foreach t in array array['pro_purchase_order_counters','pro_purchase_orders','pro_purchase_order_lines','pro_purchase_order_receipts','pro_purchase_order_payments','pro_purchase_order_history','pro_purchase_order_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'pro_purchase_order%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'pro_purchase_order_immutable' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
