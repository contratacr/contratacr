-- LOCAL PRO ONLY. Licitaciones privadas por proyecto (parity register row 53).
-- Owner-private bid packages per job (pro_work): title, scope, Costa Rica due date and
-- lines (description, quantity, unit, optional budget item). The owner invites vendors of
-- the existing directory (pro_expense_suppliers + pro_company_vendor_profiles), records
-- each offer received by hand (unit price per line, lead time, validity, notes), compares
-- them side by side and awards the whole package or line by line. Awarded vendors get
-- DRAFT purchase orders through the existing writer pro_purchase_orders_mutate (same
-- validation, OC numbering, receipts and history); generation is idempotent.
--
-- Numbering: LIC-0001 per account, no gaps (counter row updated inside the transaction).
-- States: draft -> open -> closed -> awarded, or cancelled from draft/open/closed;
-- closed -> open again with a new due date. Amounts are CRC céntimos (bigint).
-- Per line total = round(quantity × unit_cents) (numeric round, half away from zero),
-- identical to purchase order subtotals. Offers are compared before tax.
--
-- Not here (documented in bids-local.md): vendor portal (vendors have no linked account),
-- e-mail or message delivery, automatic close at the due date, attachments.
--
-- Lock order: bid action advisory -> bid work advisory -> bid counter (create only)
-- -> package row -> (generate_orders) purchase order writer locks. The purchase order
-- writer never takes bid locks, so the order cannot invert. Reapplicable; new objects only.
begin;
create table if not exists public.pro_bid_counters(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 last_number integer not null default 0 check(last_number between 0 and 999999)
);
create table if not exists public.pro_bid_packages(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 number integer not null check(number between 1 and 999999),
 title text not null check(length(btrim(title)) between 1 and 160),
 scope text check(scope is null or length(btrim(scope)) between 1 and 4000),
 due_date date,
 status text not null default 'draft' check(status in('draft','open','closed','awarded','cancelled')),
 opened_at timestamptz,closed_at timestamptz,awarded_at timestamptz,cancelled_at timestamptz,
 cancel_reason text check(cancel_reason is null or length(btrim(cancel_reason)) between 1 and 300),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,number),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 check((status='cancelled')=(cancelled_at is not null)),
 check((status='awarded')=(awarded_at is not null)),
 check(status='draft' or status='cancelled' or (opened_at is not null and due_date is not null))
);
create unique index if not exists pro_bid_package_global_id on public.pro_bid_packages(id);
create index if not exists pro_bid_package_page on public.pro_bid_packages(owner_id,work_id,number desc);
create table if not exists public.pro_bid_lines(
 owner_id uuid not null,work_id text not null,package_id uuid not null,id uuid not null,
 position smallint not null check(position between 1 and 100),
 description text not null check(length(btrim(description)) between 1 and 300),
 quantity numeric(12,3) not null check(quantity between 0.001 and 1000000),
 unit text not null check(length(btrim(unit)) between 1 and 20),
 budget_code_id uuid,
 primary key(owner_id,id),unique(owner_id,package_id,position),
 foreign key(owner_id,package_id) references public.pro_bid_packages(owner_id,id) on delete cascade
);
create unique index if not exists pro_bid_line_global_id on public.pro_bid_lines(id);
alter table public.pro_bid_lines drop constraint if exists pro_bid_line_budget_code;
-- Optional reference: losing the budget item only clears the link.
alter table public.pro_bid_lines add constraint pro_bid_line_budget_code foreign key(owner_id,work_id,budget_code_id) references public.pro_work_budget_codes(owner_id,work_id,id) on delete set null(budget_code_id);
create index if not exists pro_bid_lines_package on public.pro_bid_lines(owner_id,package_id,position);
create table if not exists public.pro_bid_invitations(
 owner_id uuid not null,package_id uuid not null,supplier_id uuid not null,
 invited_at timestamptz not null default now(),
 primary key(owner_id,package_id,supplier_id),
 foreign key(owner_id,package_id) references public.pro_bid_packages(owner_id,id) on delete cascade,
 foreign key(owner_id,supplier_id) references public.pro_expense_suppliers(user_id,id)
);
create index if not exists pro_bid_invitations_supplier on public.pro_bid_invitations(owner_id,supplier_id);
-- One offer per invited vendor; recording again replaces it (the history keeps every version).
create table if not exists public.pro_bid_responses(
 owner_id uuid not null,package_id uuid not null,supplier_id uuid not null,
 received_on date not null,lead_days integer check(lead_days between 0 and 3650),valid_until date,
 notes text check(notes is null or length(btrim(notes)) between 1 and 2000),
 recorded_at timestamptz not null default now(),
 primary key(owner_id,package_id,supplier_id),
 foreign key(owner_id,package_id,supplier_id) references public.pro_bid_invitations(owner_id,package_id,supplier_id) on delete cascade,
 check(valid_until is null or valid_until>=received_on)
);
-- A missing row means the vendor did not quote that line.
create table if not exists public.pro_bid_response_prices(
 owner_id uuid not null,package_id uuid not null,supplier_id uuid not null,line_id uuid not null,
 unit_cents bigint not null check(unit_cents between 0 and 10000000000),
 primary key(owner_id,package_id,supplier_id,line_id),
 foreign key(owner_id,package_id,supplier_id) references public.pro_bid_responses(owner_id,package_id,supplier_id) on delete cascade,
 foreign key(owner_id,line_id) references public.pro_bid_lines(owner_id,id) on delete cascade
);
create table if not exists public.pro_bid_awards(
 owner_id uuid not null,package_id uuid not null,line_id uuid not null,supplier_id uuid not null,unit_cents bigint not null check(unit_cents between 0 and 10000000000),
 primary key(owner_id,package_id,line_id),
 foreign key(owner_id,package_id) references public.pro_bid_packages(owner_id,id) on delete cascade,
 foreign key(owner_id,line_id) references public.pro_bid_lines(owner_id,id) on delete cascade,
 foreign key(owner_id,package_id,supplier_id) references public.pro_bid_invitations(owner_id,package_id,supplier_id)
);
-- Phase 2 (2026-11-11): the vendor and invitation references are checked at commit (deferred) so deleting the
-- whole account (auth user -> suppliers and jobs -> bid packages, two cascade paths in one statement) does not fail
-- with 23503 when the vendor rows are removed before the cascaded invitations. Deleting an invited vendor on its own
-- is still rejected at commit: the rule is unchanged, only the moment it is checked.
alter table public.pro_bid_invitations drop constraint if exists pro_bid_invitations_owner_id_supplier_id_fkey;
alter table public.pro_bid_invitations add constraint pro_bid_invitations_owner_id_supplier_id_fkey foreign key(owner_id,supplier_id) references public.pro_expense_suppliers(user_id,id) deferrable initially deferred;
alter table public.pro_bid_awards drop constraint if exists pro_bid_awards_owner_id_package_id_supplier_id_fkey;
alter table public.pro_bid_awards add constraint pro_bid_awards_owner_id_package_id_supplier_id_fkey foreign key(owner_id,package_id,supplier_id) references public.pro_bid_invitations(owner_id,package_id,supplier_id) deferrable initially deferred;
-- Link to the draft purchase order generated for each awarded vendor (one per vendor and package).
create table if not exists public.pro_bid_orders(
 owner_id uuid not null,package_id uuid not null,supplier_id uuid not null,order_id uuid not null,created_at timestamptz not null default now(),
 primary key(owner_id,package_id,supplier_id),unique(owner_id,order_id),
 foreign key(owner_id,package_id) references public.pro_bid_packages(owner_id,id) on delete cascade,
 foreign key(owner_id,order_id) references public.pro_purchase_orders(owner_id,id) on delete cascade
);
create table if not exists public.pro_bid_history(
 owner_id uuid not null,work_id text not null,package_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','invite','uninvite','open','record_response','clear_response','close','reopen','award','generate_orders','cancel')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id),foreign key(owner_id,package_id) references public.pro_bid_packages(owner_id,id) on delete cascade
);
create index if not exists pro_bid_history_page on public.pro_bid_history(owner_id,package_id,at desc);
create table if not exists public.pro_bid_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

-- Costa Rica calendar day (UTC-6, no DST) for due dates and validity.
create or replace function public.pro_bid_today() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (now() at time zone 'America/Costa_Rica')::date $$;
create or replace function public.pro_bid_uuid(p_seed text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select md5(p_seed) h) x;
$$;
create or replace function public.pro_bid_text(p_value jsonb,p_max integer,p_required boolean) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare t text;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' then raise exception 'Invalid text' using errcode='22023';end if;
 t:=btrim(p_value#>>'{}');
 if t='' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 -- Short fields are single-line; long fields (scope, notes) may contain line breaks only.
 if length(t)>p_max or (p_max<=300 and t~'[[:cntrl:]]') or t~'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid text' using errcode='22023';end if;
 return t;
end $$;
create or replace function public.pro_bid_day(p_value jsonb,p_required boolean) returns date
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare d date;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing date' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' or not (p_value#>>'{}')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
 begin d:=(p_value#>>'{}')::date;exception when others then raise exception 'Invalid date' using errcode='22023';end;
 if to_char(d,'YYYY-MM-DD')<>p_value#>>'{}' or d not between date '2000-01-01' and date '2100-12-31' then raise exception 'Invalid date' using errcode='22023';end if;
 return d;
end $$;
create or replace function public.pro_bid_uuid_value(p_value jsonb) returns uuid
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'string' or not (p_value#>>'{}')~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'Invalid identifier' using errcode='22023';end if;
 return (p_value#>>'{}')::uuid;
end $$;

create or replace function public.pro_bid_summary(p_row public.pro_bid_packages) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'number',p_row.number,'code','LIC-'||lpad(p_row.number::text,4,'0'),
  'title',p_row.title,'status',p_row.status,'dueDate',p_row.due_date,
  'pastDue',p_row.status='open' and p_row.due_date<public.pro_bid_today(),
  'lineCount',(select count(*)::integer from public.pro_bid_lines l where l.owner_id=p_row.owner_id and l.package_id=p_row.id),
  'invitedCount',(select count(*)::integer from public.pro_bid_invitations i where i.owner_id=p_row.owner_id and i.package_id=p_row.id),
  'responseCount',(select count(*)::integer from public.pro_bid_responses r where r.owner_id=p_row.owner_id and r.package_id=p_row.id),
  'awardedCents',(select coalesce(sum(round(l.quantity*a.unit_cents)),0)::bigint from public.pro_bid_awards a join public.pro_bid_lines l on l.owner_id=a.owner_id and l.id=a.line_id
    where a.owner_id=p_row.owner_id and a.package_id=p_row.id),
  'orderCount',(select count(*)::integer from public.pro_bid_orders o where o.owner_id=p_row.owner_id and o.package_id=p_row.id),
  'revision',p_row.revision,'openedAt',p_row.opened_at,'closedAt',p_row.closed_at,'awardedAt',p_row.awarded_at,'cancelledAt',p_row.cancelled_at,
  'createdAt',p_row.created_at,'updatedAt',p_row.updated_at);
$$;

-- Full package with the side-by-side comparison. Lowest = smallest line total among the
-- vendors that quoted the line (ties: every tied vendor is lowest). Totals per vendor only
-- add the lines it quoted; missingCount tells how many it left out.
create or replace function public.pro_bid_json(p_row public.pro_bid_packages) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with lines as materialized(select * from public.pro_bid_lines l where l.owner_id=p_row.owner_id and l.package_id=p_row.id),
 offers as materialized(select p.supplier_id,p.line_id,p.unit_cents,round(l.quantity*p.unit_cents)::bigint total
   from public.pro_bid_response_prices p join lines l on l.id=p.line_id where p.owner_id=p_row.owner_id and p.package_id=p_row.id),
 lowest as materialized(select line_id,min(total) total from offers group by line_id),
 inv as materialized(select i.*,s.name,s.archived,coalesce(v.kind,'supplier') kind,v.trade,s.email,s.phone
   from public.pro_bid_invitations i join public.pro_expense_suppliers s on s.user_id=i.owner_id and s.id=i.supplier_id
   left join public.pro_company_vendor_profiles v on v.owner_id=i.owner_id and v.supplier_id=i.supplier_id
   where i.owner_id=p_row.owner_id and i.package_id=p_row.id)
 select public.pro_bid_summary(p_row)||jsonb_build_object('scope',p_row.scope,'cancelReason',p_row.cancel_reason,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'position',l.position,'description',l.description,'quantity',l.quantity,'unit',l.unit,
    'budgetCodeId',l.budget_code_id,
    'budgetCode',(select c.code from public.pro_work_budget_codes c where c.owner_id=l.owner_id and c.work_id=l.work_id and c.id=l.budget_code_id),
    'quotedCount',(select count(*)::integer from offers o where o.line_id=l.id),
    'lowestCents',(select w.total from lowest w where w.line_id=l.id),
    'lowestSupplierIds',coalesce((select jsonb_agg(o.supplier_id order by o.supplier_id) from offers o join lowest w on w.line_id=o.line_id and w.total=o.total where o.line_id=l.id),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(jsonb_build_object('supplierId',o.supplier_id,'unitCents',o.unit_cents,'totalCents',o.total) order by o.supplier_id) from offers o where o.line_id=l.id),'[]'::jsonb),
    'award',(select jsonb_build_object('supplierId',a.supplier_id,'unitCents',a.unit_cents,'totalCents',round(l.quantity*a.unit_cents)::bigint)
      from public.pro_bid_awards a where a.owner_id=l.owner_id and a.line_id=l.id)) order by l.position) from lines l),'[]'::jsonb),
  'vendors',coalesce((select jsonb_agg(jsonb_build_object('supplierId',i.supplier_id,'name',i.name,'kind',i.kind,'trade',i.trade,'email',i.email,'phone',i.phone,
    'archived',i.archived,'invitedAt',i.invited_at,
    'response',(select jsonb_build_object('receivedOn',r.received_on,'leadDays',r.lead_days,'validUntil',r.valid_until,'notes',r.notes,'recordedAt',r.recorded_at,
       'expired',r.valid_until is not null and r.valid_until<public.pro_bid_today())
      from public.pro_bid_responses r where r.owner_id=i.owner_id and r.package_id=i.package_id and r.supplier_id=i.supplier_id),
    'quotedCount',(select count(*)::integer from offers o where o.supplier_id=i.supplier_id),
    'missingCount',(select count(*)::integer from lines l where not exists(select 1 from offers o where o.supplier_id=i.supplier_id and o.line_id=l.id)),
    'totalCents',(select sum(o.total)::bigint from offers o where o.supplier_id=i.supplier_id),
    'lowestCount',(select count(*)::integer from offers o join lowest w on w.line_id=o.line_id and w.total=o.total where o.supplier_id=i.supplier_id),
    'awardedCents',(select sum(round(l.quantity*a.unit_cents))::bigint from public.pro_bid_awards a join lines l on l.id=a.line_id where a.owner_id=i.owner_id and a.package_id=i.package_id and a.supplier_id=i.supplier_id),
    'order',(select jsonb_build_object('orderId',o.order_id,'code','OC-'||lpad(po.number::text,4,'0'),'status',po.status,'revision',po.revision)
      from public.pro_bid_orders o join public.pro_purchase_orders po on po.owner_id=o.owner_id and po.id=o.order_id
      where o.owner_id=i.owner_id and o.package_id=i.package_id and o.supplier_id=i.supplier_id)) order by lower(i.name),i.supplier_id) from inv i),'[]'::jsonb),
  'comparison',jsonb_build_object(
    'bestCombinedCents',(select sum(total)::bigint from lowest),
    'unquotedLineCount',(select count(*)::integer from lines l where not exists(select 1 from offers o where o.line_id=l.id)),
    'awardedLineCount',(select count(*)::integer from public.pro_bid_awards a where a.owner_id=p_row.owner_id and a.package_id=p_row.id)));
$$;

create or replace function public.pro_bids_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v text;wid text;pid uuid;r public.pro_bid_packages;w public.pro_work;rows jsonb;hist jsonb;receipt public.pro_bid_actions;keys text[];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or jsonb_typeof(p_query->'view') is distinct from 'string' then raise exception 'Invalid query' using errcode='22023';end if;
 v:=p_query->>'view';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_query) key;
 if v='action' then
  if keys is distinct from array['actionId','view'] then raise exception 'Invalid query' using errcode='22023';end if;
  select * into receipt from public.pro_bid_actions where actor_id=p_actor and action_id=public.pro_bid_uuid_value(p_query->'actionId');
  return jsonb_build_object('receipt',case when found then jsonb_build_object('input',receipt.input,'result',receipt.result) end);
 end if;
 if keys is distinct from (case v when 'list' then array['view','workId'] when 'sources' then array['view','workId'] when 'detail' then array['id','view','workId'] end)
  or jsonb_typeof(p_query->'workId') is distinct from 'string' or length(p_query->>'workId') not between 1 and 160 then raise exception 'Invalid query' using errcode='22023';end if;
 wid:=p_query->>'workId';
 select * into w from public.pro_work where user_id=p_actor and id=wid;
 if not found then return null;end if;
 if v='list' then
  select coalesce(jsonb_agg(public.pro_bid_summary(b) order by b.number desc),'[]'::jsonb) into rows
   from (select * from public.pro_bid_packages where owner_id=p_actor and work_id=wid order by number desc limit 200) b;
  return jsonb_build_object('workId',wid,'cancelledWork',coalesce(w.cancelled,false),'items',rows,
   'nextNumber',coalesce((select last_number from public.pro_bid_counters where owner_id=p_actor),0)+1,'today',public.pro_bid_today());
 elsif v='detail' then
  pid:=public.pro_bid_uuid_value(p_query->'id');
  select * into r from public.pro_bid_packages where owner_id=p_actor and work_id=wid and id=pid;
  if not found then return null;end if;
  select coalesce(jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at) order by h.at desc,h.action_id),'[]'::jsonb) into hist
   from(select * from public.pro_bid_history where owner_id=p_actor and package_id=pid order by at desc,action_id limit 20) h;
  return jsonb_build_object('package',public.pro_bid_json(r),'history',hist,'today',public.pro_bid_today(),'cancelledWork',coalesce(w.cancelled,false));
 else
  -- Prefill sources (read only): active budget items, lines of this project's estimates, active vendors.
  return jsonb_build_object(
   'budgetItems',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'title',c.title) order by c.code) from public.pro_work_budget_codes c
     where c.owner_id=p_actor and c.work_id=wid and c.kind='item' and not c.archived
     and (c.parent_id is null or exists(select 1 from public.pro_work_budget_codes g where g.owner_id=c.owner_id and g.work_id=c.work_id and g.id=c.parent_id and not g.archived))),'[]'::jsonb),
   'estimateLines',coalesce((select jsonb_agg(x.item order by x.created_at desc,x.position) from (
     select d.created_at,i.position,jsonb_build_object('estimateId',d.id,'estimateTitle',d.title,'lineId',i.id,'description',left(btrim(i.content->>'description'),300),
      'quantity',round((i.content->>'qtyMilli')::numeric/1000,3),'unit',left(btrim(i.content->>'unit'),20)) item
     from public.pro_project_estimate_rows(p_actor,w) e join public.pro_private_estimates d on d.owner_id=p_actor and d.id=e.estimate_id
     join public.pro_private_estimate_items i on i.owner_id=d.owner_id and i.estimate_id=d.id
     where e.relation='project' and coalesce(btrim(i.content->>'description'),'')<>'' and coalesce(btrim(i.content->>'unit'),'')<>''
      and (i.content->>'qtyMilli')~'^[0-9]{1,10}$' and (i.content->>'qtyMilli')::numeric between 1 and 1000000000
     order by d.created_at desc,i.position limit 200) x),'[]'::jsonb),
   'vendors',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',coalesce(p.kind,'supplier'),'trade',p.trade) order by lower(s.name),s.id)
     from (select * from public.pro_expense_suppliers where user_id=p_actor and not archived order by lower(name),id limit 300) s
     left join public.pro_company_vendor_profiles p on p.owner_id=s.user_id and p.supplier_id=s.id),'[]'::jsonb));
 end if;
end $$;

create or replace function public.pro_bids_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;aid uuid;pid uuid;rev integer;keys text[];expected text[];receipt public.pro_bid_actions;r public.pro_bid_packages;w public.pro_work;
 before_json jsonb;after_json jsonb;result jsonb;v_title text;v_scope text;v_due date;v_notes text;v_reason text;v_received date;v_valid date;v_lead integer;v_locale text;
 line jsonb;line_keys text[];seen uuid[]:=array[]::uuid[];sids uuid[]:=array[]::uuid[];q numeric;cents numeric;n integer;sid uuid;lid uuid;v_code uuid;next_number integer;
 l public.pro_bid_lines;s public.pro_expense_suppliers;po_input jsonb;po_lines jsonb;po_id uuid;po_answer jsonb;created jsonb:='[]'::jsonb;today date:=public.pro_bid_today();
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid bid' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'create' then array['action','actionId','dueDate','id','lines','scope','title','workId']
  when 'update' then array['action','actionId','dueDate','id','lines','revision','scope','title','workId']
  when 'invite' then array['action','actionId','id','revision','supplierIds','workId']
  when 'uninvite' then array['action','actionId','id','revision','supplierId','workId']
  when 'open' then array['action','actionId','id','revision','workId']
  when 'record_response' then array['action','actionId','id','leadDays','notes','prices','receivedOn','revision','supplierId','validUntil','workId']
  when 'clear_response' then array['action','actionId','id','revision','supplierId','workId']
  when 'close' then array['action','actionId','id','revision','workId']
  when 'reopen' then array['action','actionId','dueDate','id','revision','workId']
  when 'award' then array['action','actionId','awards','id','revision','workId']
  when 'generate_orders' then array['action','actionId','id','locale','revision','workId']
  when 'cancel' then array['action','actionId','id','reason','revision','workId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'workId') is distinct from 'string' then raise exception 'Invalid bid fields' using errcode='22023';end if;
 if act<>'create' and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=public.pro_bid_uuid_value(p_input->'actionId');pid:=public.pro_bid_uuid_value(p_input->'id');rev:=case when act<>'create' then (p_input->>'revision')::integer end;
 if length(wid) not between 1 and 160 then raise exception 'Invalid bid identity' using errcode='22023';end if;
 -- Shape validation that needs no state (all 22023 -> 400).
 if act in('create','update') then
  v_title:=public.pro_bid_text(p_input->'title',160,true);v_scope:=public.pro_bid_text(p_input->'scope',4000,false);v_due:=public.pro_bid_day(p_input->'dueDate',false);
  if jsonb_typeof(p_input->'lines') is distinct from 'array' or jsonb_array_length(p_input->'lines') not between 1 and 100 then raise exception 'Invalid lines' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(p_input->'lines') loop
   if jsonb_typeof(line) is distinct from 'object' then raise exception 'Invalid line fields' using errcode='22023';end if;
   select array_agg(key order by key) into line_keys from jsonb_object_keys(line) key;
   if line_keys is distinct from array['budgetCodeId','description','id','quantity','unit'] or jsonb_typeof(line->'quantity') is distinct from 'number'
    or jsonb_typeof(line->'budgetCodeId') not in('string','null') then raise exception 'Invalid line fields' using errcode='22023';end if;
   perform public.pro_bid_text(line->'description',300,true);perform public.pro_bid_text(line->'unit',20,true);
   if jsonb_typeof(line->'budgetCodeId')='string' then perform public.pro_bid_uuid_value(line->'budgetCodeId');end if;
   q:=(line->>'quantity')::numeric;
   if q<>round(q,3) or q not between 0.001 and 1000000 then raise exception 'Invalid line quantity' using errcode='22023';end if;
   lid:=public.pro_bid_uuid_value(line->'id');
   if lid=any(seen) then raise exception 'Duplicated line' using errcode='22023';end if;seen:=seen||lid;
  end loop;
 elsif act='invite' then
  if jsonb_typeof(p_input->'supplierIds') is distinct from 'array' or jsonb_array_length(p_input->'supplierIds') not between 1 and 30 then raise exception 'Invalid vendors' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(p_input->'supplierIds') loop
   sid:=public.pro_bid_uuid_value(line);
   if sid=any(sids) then raise exception 'Duplicated vendor' using errcode='22023';end if;sids:=sids||sid;
  end loop;
 elsif act in('uninvite','clear_response') then sid:=public.pro_bid_uuid_value(p_input->'supplierId');
 elsif act='record_response' then
  sid:=public.pro_bid_uuid_value(p_input->'supplierId');
  v_received:=public.pro_bid_day(p_input->'receivedOn',true);v_valid:=public.pro_bid_day(p_input->'validUntil',false);v_notes:=public.pro_bid_text(p_input->'notes',2000,false);
  if v_received>today then raise exception 'Offer received in the future' using errcode='22023';end if;
  if v_valid is not null and v_valid<v_received then raise exception 'Validity before reception' using errcode='22023';end if;
  if jsonb_typeof(p_input->'leadDays')='null' then v_lead:=null;
  elsif jsonb_typeof(p_input->'leadDays') is distinct from 'number' or not coalesce((p_input->>'leadDays')~'^[0-9]{1,4}$',false) or (p_input->>'leadDays')::integer>3650 then raise exception 'Invalid lead time' using errcode='22023';
  else v_lead:=(p_input->>'leadDays')::integer;end if;
  if jsonb_typeof(p_input->'prices') is distinct from 'array' or jsonb_array_length(p_input->'prices') not between 1 and 100 then raise exception 'Invalid prices' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(p_input->'prices') loop
   if jsonb_typeof(line) is distinct from 'object' then raise exception 'Invalid price fields' using errcode='22023';end if;
   select array_agg(key order by key) into line_keys from jsonb_object_keys(line) key;
   if line_keys is distinct from array['lineId','unitCents'] or jsonb_typeof(line->'unitCents') is distinct from 'number' then raise exception 'Invalid price fields' using errcode='22023';end if;
   cents:=(line->>'unitCents')::numeric;if cents<>round(cents) or cents not between 0 and 10000000000 then raise exception 'Invalid price' using errcode='22023';end if;
   lid:=public.pro_bid_uuid_value(line->'lineId');
   if lid=any(seen) then raise exception 'Duplicated price line' using errcode='22023';end if;seen:=seen||lid;
  end loop;
 elsif act='reopen' then v_due:=public.pro_bid_day(p_input->'dueDate',true);
 elsif act='award' then
  if jsonb_typeof(p_input->'awards') is distinct from 'array' or jsonb_array_length(p_input->'awards') not between 1 and 100 then raise exception 'Invalid awards' using errcode='22023';end if;
  for line in select value from jsonb_array_elements(p_input->'awards') loop
   if jsonb_typeof(line) is distinct from 'object' then raise exception 'Invalid award fields' using errcode='22023';end if;
   select array_agg(key order by key) into line_keys from jsonb_object_keys(line) key;
   if line_keys is distinct from array['lineId','supplierId'] then raise exception 'Invalid award fields' using errcode='22023';end if;
   perform public.pro_bid_uuid_value(line->'supplierId');lid:=public.pro_bid_uuid_value(line->'lineId');
   if lid=any(seen) then raise exception 'Duplicated award line' using errcode='22023';end if;seen:=seen||lid;
  end loop;
 elsif act='generate_orders' then
  if jsonb_typeof(p_input->'locale') is distinct from 'string' or p_input->>'locale' not in('es','en') then raise exception 'Invalid locale' using errcode='22023';end if;
  v_locale:=p_input->>'locale';
 elsif act='cancel' then v_reason:=public.pro_bid_text(p_input->'reason',300,false);
 end if;
 select * into w from public.pro_work where user_id=p_actor and id=wid;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_bid_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-bid-work:'||p_actor::text||':'||wid,0));
 if coalesce(w.cancelled,false) and act in('create','update','invite','open','reopen','record_response','award','generate_orders') then raise exception 'Restore the job first' using errcode='22023';end if;
 if act='create' then
  if exists(select 1 from public.pro_bid_packages where id=pid) then raise exception 'Bid id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_bid_packages where owner_id=p_actor and work_id=wid)>=200 then raise exception 'Bid limit' using errcode='54000';end if;
  if v_due is not null and v_due<today then raise exception 'Due date in the past' using errcode='22023';end if;
  -- Per-account number: the counter row lock serializes creators; a failed transaction rolls it back (no gaps).
  insert into public.pro_bid_counters(owner_id) values(p_actor) on conflict(owner_id) do nothing;
  update public.pro_bid_counters set last_number=last_number+1 where owner_id=p_actor returning last_number into next_number;
  insert into public.pro_bid_packages(owner_id,id,work_id,number,title,scope,due_date) values(p_actor,pid,wid,next_number,v_title,v_scope,v_due) returning * into r;
  before_json:=null;
 else
  select * into r from public.pro_bid_packages where owner_id=p_actor and id=pid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if r.revision<>rev then raise exception 'Bid changed' using errcode='40001';end if;
  before_json:=public.pro_bid_json(r);
  if act='update' then
   if not(r.status='draft' or (r.status='open' and not exists(select 1 from public.pro_bid_responses where owner_id=p_actor and package_id=pid))) then raise exception 'Only drafts or open bids without offers can be edited' using errcode='22023';end if;
   if r.status='open' and (v_due is null or v_due<today) then raise exception 'Open bids need a current due date' using errcode='22023';end if;
   if v_due is not null and v_due<today and v_due is distinct from r.due_date then raise exception 'Due date in the past' using errcode='22023';end if;
   update public.pro_bid_packages set title=v_title,scope=v_scope,due_date=v_due,revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
   delete from public.pro_bid_lines where owner_id=p_actor and package_id=pid;
  elsif act='invite' then
   if r.status not in('draft','open') then raise exception 'Vendors can only be invited before closing' using errcode='22023';end if;
   foreach sid in array sids loop
    select * into s from public.pro_expense_suppliers where user_id=p_actor and id=sid;
    if not found or s.archived then raise exception 'Choose an active vendor' using errcode='22023';end if;
   end loop;
   if not exists(select 1 from unnest(sids) x where not exists(select 1 from public.pro_bid_invitations i where i.owner_id=p_actor and i.package_id=pid and i.supplier_id=x)) then raise exception 'Vendors already invited' using errcode='22023';end if;
   insert into public.pro_bid_invitations(owner_id,package_id,supplier_id) select p_actor,pid,x from unnest(sids) x on conflict do nothing;
   if (select count(*) from public.pro_bid_invitations where owner_id=p_actor and package_id=pid)>30 then raise exception 'Vendor limit' using errcode='54000';end if;
   update public.pro_bid_packages set revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='uninvite' then
   if r.status not in('draft','open') then raise exception 'Vendors can only be removed before closing' using errcode='22023';end if;
   if exists(select 1 from public.pro_bid_responses where owner_id=p_actor and package_id=pid and supplier_id=sid) then raise exception 'Clear the offer before removing the vendor' using errcode='22023';end if;
   delete from public.pro_bid_invitations where owner_id=p_actor and package_id=pid and supplier_id=sid;
   if not found then raise exception 'Vendor not invited' using errcode='22023';end if;
   update public.pro_bid_packages set revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='open' then
   if r.status<>'draft' then raise exception 'Only drafts can be opened' using errcode='22023';end if;
   if r.due_date is null or r.due_date<today then raise exception 'Set a current due date before opening' using errcode='22023';end if;
   if not exists(select 1 from public.pro_bid_invitations where owner_id=p_actor and package_id=pid) then raise exception 'Invite at least one vendor' using errcode='22023';end if;
   update public.pro_bid_packages set status='open',opened_at=now(),revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='record_response' then
   if r.status not in('open','closed') then raise exception 'Offers are recorded while the bid is open or closed' using errcode='22023';end if;
   if not exists(select 1 from public.pro_bid_invitations where owner_id=p_actor and package_id=pid and supplier_id=sid) then raise exception 'Vendor not invited' using errcode='22023';end if;
   if v_received<(r.created_at at time zone 'America/Costa_Rica')::date then raise exception 'Offer received before the bid existed' using errcode='22023';end if;
   for line in select value from jsonb_array_elements(p_input->'prices') loop
    select * into l from public.pro_bid_lines where owner_id=p_actor and package_id=pid and id=(line->>'lineId')::uuid;
    if not found then raise exception 'Unknown line' using errcode='22023';end if;
    if round(l.quantity*(line->>'unitCents')::numeric)>10000000000 then raise exception 'Line total too large' using errcode='22023';end if;
   end loop;
   insert into public.pro_bid_responses(owner_id,package_id,supplier_id,received_on,lead_days,valid_until,notes) values(p_actor,pid,sid,v_received,v_lead,v_valid,v_notes)
    on conflict(owner_id,package_id,supplier_id) do update set received_on=excluded.received_on,lead_days=excluded.lead_days,valid_until=excluded.valid_until,notes=excluded.notes,recorded_at=now();
   delete from public.pro_bid_response_prices where owner_id=p_actor and package_id=pid and supplier_id=sid;
   insert into public.pro_bid_response_prices(owner_id,package_id,supplier_id,line_id,unit_cents)
    select p_actor,pid,sid,(x->>'lineId')::uuid,(x->>'unitCents')::bigint from jsonb_array_elements(p_input->'prices') x;
   update public.pro_bid_packages set revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='clear_response' then
   if r.status not in('open','closed') then raise exception 'Offers can only be cleared before awarding' using errcode='22023';end if;
   delete from public.pro_bid_responses where owner_id=p_actor and package_id=pid and supplier_id=sid;
   if not found then raise exception 'No offer to clear' using errcode='22023';end if;
   update public.pro_bid_packages set revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='close' then
   if r.status<>'open' then raise exception 'Only open bids can be closed' using errcode='22023';end if;
   update public.pro_bid_packages set status='closed',closed_at=now(),revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='reopen' then
   if r.status<>'closed' then raise exception 'Only closed bids can be reopened' using errcode='22023';end if;
   if v_due<today then raise exception 'Due date in the past' using errcode='22023';end if;
   update public.pro_bid_packages set status='open',due_date=v_due,closed_at=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='award' then
   if r.status not in('open','closed') then raise exception 'Only open or closed bids can be awarded' using errcode='22023';end if;
   for line in select value from jsonb_array_elements(p_input->'awards') loop
    sid:=(line->>'supplierId')::uuid;lid:=(line->>'lineId')::uuid;
    if not exists(select 1 from public.pro_bid_lines where owner_id=p_actor and package_id=pid and id=lid) then raise exception 'Unknown line' using errcode='22023';end if;
    select * into s from public.pro_expense_suppliers where user_id=p_actor and id=sid;
    if not found or not exists(select 1 from public.pro_bid_invitations where owner_id=p_actor and package_id=pid and supplier_id=sid) then raise exception 'Vendor not invited' using errcode='22023';end if;
    if s.archived then raise exception 'Restore the vendor before awarding' using errcode='22023';end if;
    if not exists(select 1 from public.pro_bid_response_prices where owner_id=p_actor and package_id=pid and supplier_id=sid and line_id=lid) then raise exception 'The vendor did not quote that line' using errcode='22023';end if;
    -- The awarded price is frozen: later changes to the offer cannot alter it.
    insert into public.pro_bid_awards(owner_id,package_id,line_id,supplier_id,unit_cents)
     select p_actor,pid,lid,sid,p.unit_cents from public.pro_bid_response_prices p where p.owner_id=p_actor and p.package_id=pid and p.supplier_id=sid and p.line_id=lid;
   end loop;
   update public.pro_bid_packages set status='awarded',awarded_at=now(),closed_at=coalesce(closed_at,now()),revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='generate_orders' then
   if r.status<>'awarded' then raise exception 'Award the bid first' using errcode='22023';end if;
   for sid in select distinct a.supplier_id from public.pro_bid_awards a where a.owner_id=p_actor and a.package_id=pid
     and not exists(select 1 from public.pro_bid_orders o where o.owner_id=a.owner_id and o.package_id=a.package_id and o.supplier_id=a.supplier_id) order by 1 loop
    select coalesce(jsonb_agg(jsonb_build_object('id',public.pro_bid_uuid('pro-bid-order-line:'||p_actor::text||':'||pid::text||':'||l2.id::text),
      'description',l2.description,'quantity',l2.quantity,'unit',l2.unit,'unitCents',a.unit_cents,'taxRate',0,
      'budgetCodeId',case when exists(select 1 from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=wid and c.id=l2.budget_code_id and c.kind='item' and not c.archived) then to_jsonb(l2.budget_code_id) else 'null'::jsonb end,
      'selectionOptionId',null,'allowanceId',null) order by l2.position),'[]'::jsonb) into po_lines
     from public.pro_bid_awards a join public.pro_bid_lines l2 on l2.owner_id=a.owner_id and l2.id=a.line_id where a.owner_id=p_actor and a.package_id=pid and a.supplier_id=sid;
    po_id:=public.pro_bid_uuid('pro-bid-order:'||p_actor::text||':'||pid::text||':'||sid::text);
    po_input:=jsonb_build_object('action','create','actionId',public.pro_bid_uuid('pro-bid-order-action:'||p_actor::text||':'||pid::text||':'||sid::text),
     'id',po_id,'workId',wid,'supplierId',sid,'supplierName',null,'supplierContact',null,
     'title',left(('LIC-'||lpad(r.number::text,4,'0'))||' · '||r.title,160),'issueDate',to_char(today,'YYYY-MM-DD'),'expectedDate',null,
     'notes',case when v_locale='en' then 'Generated from bid request LIC-'||lpad(r.number::text,4,'0')||'. Taxes are not included in the offer; review them before issuing.'
      else 'Generada desde la licitación LIC-'||lpad(r.number::text,4,'0')||'. La oferta no incluye impuestos; revíselos antes de emitirla.' end,
     'lines',po_lines);
    -- Reuses the purchase order writer: OC numbering, validation, receipts and history.
    po_answer:=public.pro_purchase_orders_mutate(p_actor,po_input);
    insert into public.pro_bid_orders(owner_id,package_id,supplier_id,order_id) values(p_actor,pid,sid,po_id);
    created:=created||jsonb_build_array(jsonb_build_object('supplierId',sid,'orderId',po_id,'code',po_answer->'order'->>'code','totalCents',po_answer->'order'->'totalCents'));
   end loop;
   if jsonb_array_length(created)=0 then raise exception 'Purchase orders already created' using errcode='22023';end if;
   update public.pro_bid_packages set revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  elsif act='cancel' then
   if r.status not in('draft','open','closed') then raise exception 'Bid cannot be cancelled' using errcode='22023';end if;
   update public.pro_bid_packages set status='cancelled',cancelled_at=now(),cancel_reason=v_reason,revision=revision+1,updated_at=now() where owner_id=p_actor and id=pid returning * into r;
  end if;
 end if;
 if act in('create','update') then
  n:=0;
  for line in select value from jsonb_array_elements(p_input->'lines') loop
   n:=n+1;v_code:=(line->>'budgetCodeId')::uuid;
   if v_code is not null and not exists(select 1 from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=wid and c.id=v_code and c.kind='item' and not c.archived) then
    raise exception 'Choose an active budget item' using errcode='22023';end if;
   if exists(select 1 from public.pro_bid_lines where id=(line->>'id')::uuid) then raise exception 'Line id already used' using errcode='23505';end if;
   insert into public.pro_bid_lines(owner_id,work_id,package_id,id,position,description,quantity,unit,budget_code_id)
    values(p_actor,wid,pid,(line->>'id')::uuid,n,btrim(line->>'description'),(line->>'quantity')::numeric,btrim(line->>'unit'),v_code);
  end loop;
  if before_json is not null and before_json-'revision'-'updatedAt'=public.pro_bid_json(r)-'revision'-'updatedAt' then raise exception 'No bid changes' using errcode='22023';end if;
 end if;
 after_json:=public.pro_bid_json(r);
 result:=jsonb_build_object('package',after_json)||case when act='generate_orders' then jsonb_build_object('orders',created) else '{}'::jsonb end;
 insert into public.pro_bid_history(owner_id,work_id,package_id,action_id,action,before_value,after_value) values(p_actor,wid,pid,aid,act,before_json,after_json);
 insert into public.pro_bid_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

create or replace function public.pro_bid_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Bid history and receipts are immutable' using errcode='23514';
end $$;
drop trigger if exists pro_bid_history_immutable on public.pro_bid_history;
create trigger pro_bid_history_immutable before update on public.pro_bid_history for each row execute function public.pro_bid_immutable();
drop trigger if exists pro_bid_action_immutable on public.pro_bid_actions;
create trigger pro_bid_action_immutable before update on public.pro_bid_actions for each row execute function public.pro_bid_immutable();
drop trigger if exists pro_bid_award_immutable on public.pro_bid_awards;
create trigger pro_bid_award_immutable before update on public.pro_bid_awards for each row execute function public.pro_bid_immutable();
drop trigger if exists pro_bid_order_immutable on public.pro_bid_orders;
create trigger pro_bid_order_immutable before update on public.pro_bid_orders for each row execute function public.pro_bid_immutable();

do $$declare t text;f record;begin
 foreach t in array array['pro_bid_counters','pro_bid_packages','pro_bid_lines','pro_bid_invitations','pro_bid_responses','pro_bid_response_prices','pro_bid_awards','pro_bid_orders','pro_bid_history','pro_bid_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'pro\_bid\_%' or p.proname like 'pro\_bids\_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'pro_bid_immutable' then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
