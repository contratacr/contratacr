-- LOCAL PRO ONLY. Créditos y anticipos por proyecto (family 50 of the parity register).
-- Internal, NON-FISCAL records: nothing here charges, moves money, sends anything or
-- issues a Hacienda document. Amounts are CRC céntimos (bigint); days are America/Costa_Rica.
--
-- Kinds (per-account gapless numbering per kind): retainer ANT-0001, credit_note NC-0001,
-- overpayment SP-0001 and refund REE-0001.
--
-- Reuse, never a second payments ledger:
--  * A received retainer and an overpayment are always backed by ONE payment of the existing
--    ledger (pro_client_entries kind 'payment'): linking an existing payment, or recording a
--    new one through pro_record_client_operation (manual date/method/reference). The ledger
--    snapshot pro_invoice_payments is created exactly as invoice-payments does.
--  * Applying an entry-backed credit to an invoice draft goes THROUGH
--    pro_invoice_payment_mutate ('apply' / 'unapply'), so the invoice payment panel, the
--    draft balance and pro_invoice_payment_used see it and the same money can never be
--    applied twice by both modules.
--  * A credit note is not money: its applications live in pro_credit_applications only and
--    reduce the draft balance computed by pro_credit_draft_balance.
--  * A refund is a manual record of money returned outside ContrataCR. It does not void the
--    ledger payment (the ledger has no partial voids); it reduces the credit's balance.
--
-- Figures per credit (pro_credit_figures):
--   applied   = Σ active applications (not reverted here, not voided in invoice payments,
--               source payment not reversed in the ledger)
--   refunded  = Σ refunds not voided
--   balance   = amount − applied − refunded        (0 while requested, cancelled or reversed)
--   available = balance, and for entry-backed credits also ≤ the payment's unallocated money
--               (entry amount − every invoice application of that payment) − refunded.
-- Overpayment detection (pro_credit_excess):
--   excess = max(0, ledger paid − net billed − Σ min(amount − applied, payment unallocated)
--            of entry-backed credits),
--   net billed = Σ active drafts (total − credit-note applications) + payments applied to
--   archived drafts.
--
-- Lock order: the owner's advisory lock shared with the ledger, invoice drafts and invoice
-- payments (hashtextextended(owner,0)) -> action receipt -> counter row -> credit row -> draft row.
begin;
create table if not exists public.pro_credit_counters(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('retainer','credit_note','overpayment','refund')),
 last_number integer not null default 0 check(last_number between 0 and 999999),
 primary key(owner_id,kind)
);
create table if not exists public.pro_credits(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,client_id text not null,
 kind text not null check(kind in('retainer','credit_note','overpayment')),
 number integer not null check(number between 1 and 999999),
 title text not null check(length(btrim(title)) between 1 and 160),
 note text check(note is null or length(btrim(note)) between 1 and 2000),
 reason text check(reason is null or length(btrim(reason)) between 1 and 300),
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 requested_on date,
 status text not null check(status in('requested','active','cancelled')),
 entry_id uuid,received_on date,method text check(method is null or method in('cash','card','transfer','sinpe','other')),
 reference text check(reference is null or length(reference)<=160),
 received_at timestamptz,cancelled_at timestamptz,cancel_reason text check(cancel_reason is null or length(btrim(cancel_reason)) between 1 and 300),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,kind,number),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,client_id) references public.pro_clients(user_id,id) on delete cascade,
 foreign key(owner_id,entry_id) references public.pro_client_entries(user_id,id) on delete cascade,
 check((kind='credit_note')=(reason is not null)),
 check(kind<>'credit_note' or entry_id is null),
 check(kind<>'overpayment' or entry_id is not null),
 check(kind<>'retainer' or requested_on is not null),
 check(kind<>'retainer' or status<>'requested' or entry_id is null),
 check(kind<>'retainer' or status<>'active' or entry_id is not null),
 check(kind='retainer' or status<>'requested'),
 check((entry_id is null)=(received_on is null) and (entry_id is null)=(method is null)),
 check((status='cancelled')=(cancelled_at is not null))
);
create unique index if not exists pro_credit_global_id on public.pro_credits(id);
create unique index if not exists pro_credit_one_per_payment on public.pro_credits(owner_id,entry_id) where entry_id is not null and status<>'cancelled';
create index if not exists pro_credit_page on public.pro_credits(owner_id,work_id,kind,number desc);
-- One row per application action. A reversal is a new row in pro_credit_application_reversals.
create table if not exists public.pro_credit_applications(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,credit_id uuid not null,work_id text not null,draft_id uuid not null,
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 invoice_application_id uuid,created_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,credit_id) references public.pro_credits(owner_id,id) on delete cascade,
 foreign key(owner_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade,
 foreign key(owner_id,invoice_application_id) references public.pro_invoice_payment_applications(user_id,id) on delete cascade
);
create unique index if not exists pro_credit_application_invoice on public.pro_credit_applications(owner_id,invoice_application_id) where invoice_application_id is not null;
create index if not exists pro_credit_applications_credit on public.pro_credit_applications(owner_id,credit_id,created_at desc);
create index if not exists pro_credit_applications_draft on public.pro_credit_applications(owner_id,draft_id);
create table if not exists public.pro_credit_application_reversals(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,application_id uuid not null,
 reason text not null check(length(btrim(reason)) between 1 and 300),created_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,application_id),
 foreign key(owner_id,application_id) references public.pro_credit_applications(owner_id,id) on delete cascade
);
create table if not exists public.pro_credit_refunds(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,credit_id uuid not null,work_id text not null,
 number integer not null check(number between 1 and 999999),
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 refunded_on date not null,method text not null check(method in('cash','card','transfer','sinpe','other')),
 reference text check(reference is null or length(btrim(reference)) between 1 and 160),
 note text check(note is null or length(btrim(note)) between 1 and 300),
 created_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,number),
 foreign key(owner_id,credit_id) references public.pro_credits(owner_id,id) on delete cascade
);
create index if not exists pro_credit_refund_page on public.pro_credit_refunds(owner_id,work_id,number desc);
create index if not exists pro_credit_refund_credit on public.pro_credit_refunds(owner_id,credit_id);
create table if not exists public.pro_credit_refund_voids(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,refund_id uuid not null,
 reason text not null check(length(btrim(reason)) between 1 and 300),created_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,refund_id),
 foreign key(owner_id,refund_id) references public.pro_credit_refunds(owner_id,id) on delete cascade
);
create table if not exists public.pro_credit_history(
 owner_id uuid not null,work_id text not null,credit_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','receive','update','apply','unapply','refund','void_refund','cancel')),
 before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id),foreign key(owner_id,credit_id) references public.pro_credits(owner_id,id) on delete cascade
);
create index if not exists pro_credit_history_page on public.pro_credit_history(owner_id,credit_id,at desc);
create table if not exists public.pro_credit_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

create or replace function public.pro_credit_today() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (now() at time zone 'America/Costa_Rica')::date $$;
create or replace function public.pro_credit_code(p_kind text,p_number integer) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_kind when 'retainer' then 'ANT-' when 'credit_note' then 'NC-' when 'overpayment' then 'SP-' else 'REE-' end||lpad(p_number::text,4,'0') $$;

-- Optional text: JSON null or a string trimmed to 1..max (empty → null). Raises 22023 otherwise.
create or replace function public.pro_credit_text(p_value jsonb,p_max integer,p_required boolean) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare t text;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' then raise exception 'Invalid text' using errcode='22023';end if;
 t:=btrim(p_value#>>'{}');
 if t='' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if length(t)>p_max or (p_max<=300 and t~'[[:cntrl:]]') then raise exception 'Invalid text' using errcode='22023';end if;
 return t;
end $$;
create or replace function public.pro_credit_day(p_value jsonb,p_required boolean) returns date
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare d date;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing date' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' or not (p_value#>>'{}')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
 begin d:=(p_value#>>'{}')::date;exception when others then raise exception 'Invalid date' using errcode='22023';end;
 if to_char(d,'YYYY-MM-DD')<>p_value#>>'{}' or d<date '2000-01-01' then raise exception 'Invalid date' using errcode='22023';end if;
 return d;
end $$;
create or replace function public.pro_credit_amount(p_value jsonb) returns bigint
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare n numeric;
begin
 if p_value is null or jsonb_typeof(p_value)<>'number' then raise exception 'Invalid amount' using errcode='22023';end if;
 n:=(p_value#>>'{}')::numeric;if n<>round(n) or n not between 1 and 10000000000 then raise exception 'Invalid amount' using errcode='22023';end if;
 return n::bigint;
end $$;

-- A ledger payment that was voided (payment_void) no longer backs anything.
create or replace function public.pro_credit_entry_reversed(p_owner uuid,p_entry uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select p_entry is not null and exists(select 1 from public.pro_client_entries r where r.user_id=p_owner and r.reversal_id=p_entry and r.kind='payment_void') $$;
-- Unallocated money of one ledger payment: amount − every active invoice application of it.
create or replace function public.pro_credit_entry_free(p_owner uuid,p_entry uuid) returns bigint
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select case when public.pro_credit_entry_reversed(p_owner,e.id) then 0
   else e.amount_cents-coalesce((select public.pro_invoice_payment_used(p_owner,p.id,null) from public.pro_invoice_payments p where p.user_id=p_owner and p.entry_id=e.id),0) end
  from public.pro_client_entries e where e.user_id=p_owner and e.id=p_entry and e.kind='payment'),0)::bigint $$;

-- State of each application of a credit (active, reverted here, voided in invoice payments, source reversed).
create or replace function public.pro_credit_application_rows(p_owner uuid,p_credit uuid)
returns table(id uuid,draft_id uuid,amount_cents bigint,invoice_application_id uuid,created_at timestamptz,state text,reason text,reverted_at timestamptz)
language sql stable security invoker set search_path=public,pg_temp as $$
 select a.id,a.draft_id,a.amount_cents,a.invoice_application_id,a.created_at,
  case when r.id is not null then 'reverted'
   when a.invoice_application_id is not null and exists(select 1 from public.pro_invoice_payment_voids v where v.user_id=a.owner_id and v.application_id=a.invoice_application_id) then 'voided_in_invoice'
   when public.pro_credit_entry_reversed(a.owner_id,c.entry_id) then 'source_reversed' else 'active' end,
  coalesce(r.reason,(select v.reason from public.pro_invoice_payment_voids v where v.user_id=a.owner_id and v.application_id=a.invoice_application_id)),
  coalesce(r.created_at,(select v.created_at from public.pro_invoice_payment_voids v where v.user_id=a.owner_id and v.application_id=a.invoice_application_id))
 from public.pro_credit_applications a join public.pro_credits c on c.owner_id=a.owner_id and c.id=a.credit_id
 left join public.pro_credit_application_reversals r on r.owner_id=a.owner_id and r.application_id=a.id
 where a.owner_id=p_owner and a.credit_id=p_credit $$;

create or replace function public.pro_credit_figures(p_row public.pro_credits,
 out applied_cents bigint,out refunded_cents bigint,out balance_cents bigint,out available_cents bigint,out source_reversed boolean,out display_status text)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 select coalesce(sum(x.amount_cents) filter(where x.state='active'),0)::bigint into applied_cents from public.pro_credit_application_rows(p_row.owner_id,p_row.id) x;
 select coalesce(sum(f.amount_cents),0)::bigint into refunded_cents from public.pro_credit_refunds f
  where f.owner_id=p_row.owner_id and f.credit_id=p_row.id and not exists(select 1 from public.pro_credit_refund_voids v where v.owner_id=f.owner_id and v.refund_id=f.id);
 source_reversed:=public.pro_credit_entry_reversed(p_row.owner_id,p_row.entry_id);
 if p_row.status<>'active' or source_reversed then balance_cents:=0;available_cents:=0;
 else
  balance_cents:=p_row.amount_cents-applied_cents-refunded_cents;
  available_cents:=greatest(0,balance_cents);
  if p_row.entry_id is not null then available_cents:=greatest(0,least(available_cents,public.pro_credit_entry_free(p_row.owner_id,p_row.entry_id)-refunded_cents));end if;
 end if;
 display_status:=case when p_row.status='cancelled' then 'cancelled' when p_row.status='requested' then 'requested' when source_reversed then 'reversed'
  when available_cents>0 and applied_cents=0 and refunded_cents=0 then 'available' when available_cents>0 then 'partial' else 'used' end;
end $$;

create or replace function public.pro_credit_summary(p_row public.pro_credits) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'kind',p_row.kind,'number',p_row.number,'code',public.pro_credit_code(p_row.kind,p_row.number),
  'title',p_row.title,'status',f.display_status,'baseStatus',p_row.status,'amountCents',p_row.amount_cents,'appliedCents',f.applied_cents,'refundedCents',f.refunded_cents,
  'balanceCents',f.balance_cents,'availableCents',f.available_cents,'sourceReversed',f.source_reversed,
  'recipient',(select c.name from public.pro_clients c where c.user_id=p_row.owner_id and c.id=p_row.client_id),'clientId',p_row.client_id,
  'requestedOn',p_row.requested_on,'entryId',p_row.entry_id,'receivedOn',p_row.received_on,'method',p_row.method,'reference',nullif(p_row.reference,''),
  'reason',p_row.reason,'note',p_row.note,'cancelReason',p_row.cancel_reason,'revision',p_row.revision,
  'createdAt',p_row.created_at,'updatedAt',p_row.updated_at,'receivedAt',p_row.received_at,'cancelledAt',p_row.cancelled_at)
 from public.pro_credit_figures(p_row) f $$;

create or replace function public.pro_credit_refund_json(p_row public.pro_credit_refunds) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'number',p_row.number,'code',public.pro_credit_code('refund',p_row.number),'creditId',p_row.credit_id,
  'creditCode',public.pro_credit_code(c.kind,c.number),'creditKind',c.kind,'title',c.title,'status',case when v.id is null then 'recorded' else 'voided' end,
  'amountCents',p_row.amount_cents,'refundedOn',p_row.refunded_on,'method',p_row.method,'reference',p_row.reference,'note',p_row.note,
  'recipient',(select x.name from public.pro_clients x where x.user_id=c.owner_id and x.id=c.client_id),'voidReason',v.reason,'voidedAt',v.created_at,'createdAt',p_row.created_at)
 from public.pro_credits c left join public.pro_credit_refund_voids v on v.owner_id=p_row.owner_id and v.refund_id=p_row.id
 where c.owner_id=p_row.owner_id and c.id=p_row.credit_id $$;

create or replace function public.pro_credit_json(p_row public.pro_credits) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select public.pro_credit_summary(p_row)||jsonb_build_object(
  'applications',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'draftId',x.draft_id,'draftTitle',d.title,'amountCents',x.amount_cents,
    'viaInvoicePayments',x.invoice_application_id is not null,'state',x.state,'reason',x.reason,'revertedAt',x.reverted_at,'createdAt',x.created_at) order by x.created_at,x.id)
   from public.pro_credit_application_rows(p_row.owner_id,p_row.id) x left join public.pro_invoice_drafts d on d.user_id=p_row.owner_id and d.id=x.draft_id),'[]'::jsonb),
  'refunds',coalesce((select jsonb_agg(public.pro_credit_refund_json(f) order by f.number) from public.pro_credit_refunds f where f.owner_id=p_row.owner_id and f.credit_id=p_row.id),'[]'::jsonb)) $$;

-- Draft balance seen by credits: total − invoice payment applications − credit-note applications.
create or replace function public.pro_credit_note_applied(p_owner uuid,p_draft uuid) returns bigint
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(sum(a.amount_cents),0)::bigint from public.pro_credit_applications a
 where a.owner_id=p_owner and a.draft_id=p_draft and a.invoice_application_id is null
  and not exists(select 1 from public.pro_credit_application_reversals r where r.owner_id=a.owner_id and r.application_id=a.id) $$;
create or replace function public.pro_credit_draft_balance(p_owner uuid,p_draft uuid) returns bigint
language sql stable security invoker set search_path=public,pg_temp as $$
 select d.total_cents-public.pro_invoice_payment_used(p_owner,null,d.id)-public.pro_credit_note_applied(p_owner,d.id)
 from public.pro_invoice_drafts d where d.user_id=p_owner and d.id=p_draft $$;
create or replace function public.pro_credit_draft_archived(p_owner uuid,p_draft uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select m.archived from public.pro_invoice_draft_management m where m.user_id=p_owner and m.draft_id=p_draft),false) $$;

create or replace function public.pro_credit_excess(p_owner uuid,p_work text,
 out paid_cents bigint,out billed_cents bigint,out reserved_cents bigint,out excess_cents bigint)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 paid_cents:=coalesce((public.pro_work_account(p_owner,p_work)->>'paidCents')::bigint,0);
 select coalesce(sum(case when public.pro_credit_draft_archived(p_owner,d.id) then public.pro_invoice_payment_used(p_owner,null,d.id)
   else d.total_cents-public.pro_credit_note_applied(p_owner,d.id) end),0)::bigint into billed_cents
  from public.pro_invoice_drafts d where d.user_id=p_owner and d.work_id=p_work;
 -- What a credit still holds of its payment: never more than the payment's unallocated money.
 select coalesce(sum(least(c.amount_cents-(public.pro_credit_figures(c)).applied_cents,public.pro_credit_entry_free(p_owner,c.entry_id))),0)::bigint into reserved_cents
  from public.pro_credits c where c.owner_id=p_owner and c.work_id=p_work and c.entry_id is not null and c.status='active' and not public.pro_credit_entry_reversed(p_owner,c.entry_id);
 excess_cents:=greatest(0,paid_cents-billed_cents-reserved_cents);
end $$;

create or replace function public.pro_credit_references(p_owner uuid,p_work text,p_client text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'drafts',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'totalCents',d.total_cents,
     'paymentsCents',public.pro_invoice_payment_used(p_owner,null,d.id),'creditNotesCents',public.pro_credit_note_applied(p_owner,d.id),
     'balanceCents',public.pro_credit_draft_balance(p_owner,d.id),'createdAt',d.created_at) order by d.created_at desc,d.id)
    from (select * from public.pro_invoice_drafts x where x.user_id=p_owner and x.work_id=p_work and x.client_id=p_client and not public.pro_credit_draft_archived(p_owner,x.id) order by x.created_at desc,x.id limit 100) d),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('entryId',e.id,'amountCents',e.amount_cents,'freeCents',public.pro_credit_entry_free(p_owner,e.id),'label',e.label,'registeredAt',e.created_at,
     'receivedOn',m.value->'receivedOn','method',m.value->'method','reference',m.value->'reference',
     'hasMetadata',(m.value->>'receivedOn') is not null,
     'creditCode',(select public.pro_credit_code(c.kind,c.number) from public.pro_credits c where c.owner_id=p_owner and c.entry_id=e.id and c.status<>'cancelled')) order by e.position desc)
    from (select * from public.pro_client_entries x where x.user_id=p_owner and x.work_id=p_work and x.client_id=p_client and x.kind='payment'
      and not public.pro_credit_entry_reversed(p_owner,x.id) order by x.position desc limit 100) e
    cross join lateral (select public.pro_invoice_payment_metadata(p_owner,e.id) value) m),'[]'::jsonb)) $$;

create or replace function public.pro_credits_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare wid text;v text;tab text;st text;cur integer;cid uuid;r public.pro_credits;w public.pro_work;cl public.pro_clients;items jsonb;more boolean;totals jsonb;ex record;account jsonb;reason text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or jsonb_typeof(p_query->'workId') is distinct from 'string'
  or exists(select 1 from jsonb_object_keys(p_query) k where k not in('workId','view','tab','status','after','id'))
  or exists(select 1 from jsonb_each(p_query) e where jsonb_typeof(e.value)<>'string') then
  raise exception 'Invalid credit query' using errcode='22023';end if;
 wid:=p_query->>'workId';v:=coalesce(p_query->>'view','list');
 if length(wid) not between 1 and 160 or v not in('list','detail') then raise exception 'Invalid credit query' using errcode='22023';end if;
 select * into w from public.pro_work x where x.user_id=p_actor and x.id=wid;
 if not found then return null;end if;
 select * into cl from public.pro_clients x where x.user_id=p_actor and x.id=w."clientId";
 if v='detail' then
  if p_query ?| array['tab','status','after'] or p_query->>'id' is null then raise exception 'Credit identity required' using errcode='22023';end if;
  cid:=(p_query->>'id')::uuid;
  select * into r from public.pro_credits x where x.owner_id=p_actor and x.work_id=wid and x.id=cid;
  if not found then return jsonb_build_object('workId',wid,'credit',null);end if;
  return jsonb_build_object('workId',wid,'workTitle',w.service,'today',public.pro_credit_today(),'credit',public.pro_credit_json(r),
   'history',coalesce((select jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_value,'after',h.after_value) order by h.at desc,h.action_id)
    from (select * from public.pro_credit_history h where h.owner_id=p_actor and h.credit_id=cid order by h.at desc,h.action_id limit 100) h),'[]'::jsonb));
 end if;
 if p_query ? 'id' then raise exception 'Invalid credit query' using errcode='22023';end if;
 tab:=coalesce(p_query->>'tab','retainer');st:=coalesce(p_query->>'status','all');
 if tab not in('retainer','credit_note','overpayment','refund')
  or (tab<>'refund' and st not in('all','requested','available','partial','used','reversed','cancelled'))
  or (tab='refund' and st not in('all','recorded','voided')) or (tab<>'retainer' and st='requested') then raise exception 'Invalid credit filter' using errcode='22023';end if;
 if p_query->>'after' is not null then if not (p_query->>'after')~'^[0-9]{1,6}$' then raise exception 'Invalid cursor' using errcode='22023';end if;cur:=(p_query->>'after')::integer;end if;
 if tab='refund' then
  with base as materialized(select f.number,public.pro_credit_refund_json(f) s from public.pro_credit_refunds f where f.owner_id=p_actor and f.work_id=wid),
   filtered as(select * from base where st='all' or s->>'status'=st),
   page as(select * from filtered where cur is null or number<cur order by number desc limit 21)
  select coalesce((select jsonb_agg(s order by number desc) from (select * from page order by number desc limit 20) p),'[]'::jsonb),(select count(*)>20 from page),
   jsonb_build_object('count',(select count(*) from base where s->>'status'='recorded'),'totalCents',coalesce((select sum((s->>'amountCents')::bigint) from base where s->>'status'='recorded'),0),
    'appliedCents',0,'availableCents',0,'refundedCents',coalesce((select sum((s->>'amountCents')::bigint) from base where s->>'status'='recorded'),0))
  into items,more,totals;
 else
  with base as materialized(select c.number,public.pro_credit_summary(c) s from public.pro_credits c where c.owner_id=p_actor and c.work_id=wid and c.kind=tab),
   filtered as(select * from base where st='all' or s->>'status'=st),
   page as(select * from filtered where cur is null or number<cur order by number desc limit 21)
  select coalesce((select jsonb_agg(s order by number desc) from (select * from page order by number desc limit 20) p),'[]'::jsonb),(select count(*)>20 from page),
   jsonb_build_object('count',(select count(*) from base where s->>'status'<>'cancelled'),
    'totalCents',coalesce((select sum((s->>'amountCents')::bigint) from base where s->>'status' not in('cancelled','reversed')),0),
    'appliedCents',coalesce((select sum((s->>'appliedCents')::bigint) from base),0),
    'availableCents',coalesce((select sum((s->>'availableCents')::bigint) from base),0),
    'refundedCents',coalesce((select sum((s->>'refundedCents')::bigint) from base),0))
  into items,more,totals;
 end if;
 select * into ex from public.pro_credit_excess(p_actor,wid);
 account:=public.pro_work_account(p_actor,wid);
 reason:=case when coalesce(w.cancelled,false) then 'cancelled' when cl.id is null then 'noClient' when cl.archived then 'archivedClient' end;
 return jsonb_build_object('workId',wid,'workTitle',w.service,'client',case when cl.id is null then null else jsonb_build_object('id',cl.id,'name',cl.name,'archived',cl.archived) end,
  'canWrite',reason is null,'readOnlyReason',reason,'today',public.pro_credit_today(),'tab',tab,
  'items',items,'nextCursor',case when more then (items->19->>'number')::integer end,'totals',totals,
  'tabCounts',jsonb_build_object('retainer',(select count(*) from public.pro_credits where owner_id=p_actor and work_id=wid and kind='retainer'),
   'credit_note',(select count(*) from public.pro_credits where owner_id=p_actor and work_id=wid and kind='credit_note'),
   'overpayment',(select count(*) from public.pro_credits where owner_id=p_actor and work_id=wid and kind='overpayment'),
   'refund',(select count(*) from public.pro_credit_refunds where owner_id=p_actor and work_id=wid)),
  'account',jsonb_build_object('agreedCents',account->'agreedCents','paidCents',coalesce((account->>'paidCents')::bigint,0),'balanceCents',case when account->>'agreedCents' is null then null else account->'balanceCents' end),
  'detection',jsonb_build_object('paidCents',ex.paid_cents,'billedCents',ex.billed_cents,'reservedCents',ex.reserved_cents,'excessCents',ex.excess_cents),
  'nextNumbers',jsonb_build_object('retainer',coalesce((select last_number from public.pro_credit_counters where owner_id=p_actor and kind='retainer'),0)+1,
   'credit_note',coalesce((select last_number from public.pro_credit_counters where owner_id=p_actor and kind='credit_note'),0)+1,
   'overpayment',coalesce((select last_number from public.pro_credit_counters where owner_id=p_actor and kind='overpayment'),0)+1,
   'refund',coalesce((select last_number from public.pro_credit_counters where owner_id=p_actor and kind='refund'),0)+1),
  'references',case when cl.id is null then jsonb_build_object('drafts','[]'::jsonb,'payments','[]'::jsonb) else public.pro_credit_references(p_actor,wid,cl.id) end);
end $$;

-- Links a ledger payment to a credit. Metadata (date/method/reference) comes from the ledger
-- when it already has it; otherwise it is required here and the ledger snapshot is created
-- exactly as invoice-payments would (pro_invoice_payments, id = entry id).
create or replace function public.pro_credit_link_entry(p_owner uuid,p_work text,p_client text,p_entry uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare e public.pro_client_entries;meta jsonb;v_day date;v_method text;v_reference text;
begin
 select * into e from public.pro_client_entries where user_id=p_owner and id=p_entry and kind='payment' and work_id=p_work and client_id=p_client;
 if not found then raise exception 'Choose a payment of this project' using errcode='22023';end if;
 if public.pro_credit_entry_reversed(p_owner,e.id) then raise exception 'Reversed payment' using errcode='22023';end if;
 if exists(select 1 from public.pro_credits where owner_id=p_owner and entry_id=e.id and status<>'cancelled') then raise exception 'Payment already backs a credit' using errcode='22023';end if;
 meta:=public.pro_invoice_payment_metadata(p_owner,e.id);
 if meta->>'receivedOn' is not null then
  if jsonb_typeof(p_input->'receivedOn')<>'null' or jsonb_typeof(p_input->'method')<>'null' or jsonb_typeof(p_input->'reference')<>'null' then raise exception 'Payment details come from the payment' using errcode='22023';end if;
  return jsonb_build_object('receivedOn',meta->>'receivedOn','method',meta->>'method','reference',coalesce(meta->>'reference',''));
 end if;
 v_day:=public.pro_credit_day(p_input->'receivedOn',true);
 if v_day>public.pro_credit_today() then raise exception 'Future received date' using errcode='22023';end if;
 if jsonb_typeof(p_input->'method') is distinct from 'string' or p_input->>'method' not in('cash','card','transfer','sinpe','other') then raise exception 'Invalid method' using errcode='22023';end if;
 v_method:=p_input->>'method';v_reference:=coalesce(public.pro_credit_text(p_input->'reference',160,false),'');
 if not exists(select 1 from public.pro_invoice_payments where user_id=p_owner and entry_id=e.id) then
  insert into public.pro_invoice_payments(user_id,id,client_id,work_id,entry_id,amount_cents,received_on,method,reference) values(p_owner,e.id,p_client,p_work,e.id,e.amount_cents,v_day,v_method,v_reference);
 end if;
 return jsonb_build_object('receivedOn',v_day,'method',v_method,'reference',v_reference);
end $$;

create or replace function public.pro_credits_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;aid uuid;rid uuid;rev integer;keys text[];expected text[];receipt public.pro_credit_actions;r public.pro_credits;
 before_json jsonb;after_json jsonb;result jsonb;w public.pro_work;cl public.pro_clients;v_title text;v_note text;v_reason text;amount bigint;v_day date;v_method text;v_reference text;
 v_kind text;v_entry uuid;meta jsonb;fig record;ex record;next_number integer;d public.pro_invoice_drafts;state_rev integer;core_rev integer;account jsonb;
 app record;f public.pro_credit_refunds;history_action text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid credit' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'create_retainer' then array['action','actionId','amountCents','id','note','requestedOn','title','workId']
  when 'receive_retainer' then array['action','actionId','amountCents','entryId','id','method','receivedOn','reference','revision','source','workId']
  when 'create_credit_note' then array['action','actionId','amountCents','id','note','reason','title','workId']
  when 'create_overpayment' then array['action','actionId','amountCents','entryId','id','method','note','receivedOn','reference','title','workId']
  when 'update' then array['action','actionId','amountCents','id','note','reason','revision','title','workId']
  when 'apply' then array['action','actionId','amountCents','draftId','id','revision','workId']
  when 'unapply' then array['action','actionId','applicationId','id','reason','revision','workId']
  when 'refund' then array['action','actionId','amountCents','id','method','note','reference','refundedOn','revision','workId']
  when 'void_refund' then array['action','actionId','id','reason','refundId','revision','workId']
  when 'cancel' then array['action','actionId','id','reason','revision','workId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
  or jsonb_typeof(p_input->'id') is distinct from 'string' then raise exception 'Invalid credit fields' using errcode='22023';end if;
 if act not like 'create_%' and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'id')::uuid;rev:=case when act not like 'create_%' then (p_input->>'revision')::integer end;
 if length(wid) not between 1 and 160 then raise exception 'Invalid credit identity' using errcode='22023';end if;
 -- Shape validation that needs no state (22023 → 400).
 if act in('create_retainer','create_credit_note','create_overpayment','update') then
  v_title:=public.pro_credit_text(p_input->'title',160,true);v_note:=public.pro_credit_text(p_input->'note',2000,false);amount:=public.pro_credit_amount(p_input->'amountCents');
 end if;
 if act='create_retainer' then v_day:=public.pro_credit_day(p_input->'requestedOn',true);if v_day>public.pro_credit_today()+366 then raise exception 'Invalid requested date' using errcode='22023';end if;
 elsif act='create_credit_note' then v_reason:=public.pro_credit_text(p_input->'reason',300,true);
 elsif act='update' then v_reason:=public.pro_credit_text(p_input->'reason',300,false);
 elsif act in('create_overpayment','receive_retainer') then
  if act='receive_retainer' then
   amount:=public.pro_credit_amount(p_input->'amountCents');
   if jsonb_typeof(p_input->'source') is distinct from 'string' or p_input->>'source' not in('existing','manual') then raise exception 'Invalid source' using errcode='22023';end if;
  end if;
  if coalesce(p_input->>'source','existing')='existing' then
   if jsonb_typeof(p_input->'entryId') is distinct from 'string' then raise exception 'Choose a payment' using errcode='22023';end if;
   v_entry:=(p_input->>'entryId')::uuid;
  else
   if jsonb_typeof(p_input->'entryId') is distinct from 'null' then raise exception 'A manual receipt has no payment' using errcode='22023';end if;
   v_day:=public.pro_credit_day(p_input->'receivedOn',true);if v_day>public.pro_credit_today() then raise exception 'Future received date' using errcode='22023';end if;
   if jsonb_typeof(p_input->'method') is distinct from 'string' or p_input->>'method' not in('cash','card','transfer','sinpe','other') then raise exception 'Invalid method' using errcode='22023';end if;
   v_method:=p_input->>'method';v_reference:=public.pro_credit_text(p_input->'reference',160,false);
  end if;
  if jsonb_typeof(p_input->'receivedOn') not in('string','null') or jsonb_typeof(p_input->'method') not in('string','null') or jsonb_typeof(p_input->'reference') not in('string','null') then raise exception 'Invalid payment details' using errcode='22023';end if;
 elsif act='apply' then amount:=public.pro_credit_amount(p_input->'amountCents');if jsonb_typeof(p_input->'draftId') is distinct from 'string' then raise exception 'Choose an invoice draft' using errcode='22023';end if;
 elsif act='unapply' then v_reason:=public.pro_credit_text(p_input->'reason',160,true);if jsonb_typeof(p_input->'applicationId') is distinct from 'string' then raise exception 'Invalid application' using errcode='22023';end if;
 elsif act='refund' then
  amount:=public.pro_credit_amount(p_input->'amountCents');v_day:=public.pro_credit_day(p_input->'refundedOn',true);
  if v_day>public.pro_credit_today() then raise exception 'Future refund date' using errcode='22023';end if;
  if jsonb_typeof(p_input->'method') is distinct from 'string' or p_input->>'method' not in('cash','card','transfer','sinpe','other') then raise exception 'Invalid method' using errcode='22023';end if;
  v_method:=p_input->>'method';v_reference:=public.pro_credit_text(p_input->'reference',160,false);v_note:=public.pro_credit_text(p_input->'note',300,false);
 elsif act='void_refund' then v_reason:=public.pro_credit_text(p_input->'reason',300,true);if jsonb_typeof(p_input->'refundId') is distinct from 'string' then raise exception 'Invalid refund' using errcode='22023';end if;
 elsif act='cancel' then v_reason:=public.pro_credit_text(p_input->'reason',300,false);
 end if;
 select * into w from public.pro_work where user_id=p_actor and id=wid;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 -- Same owner lock as the ledger, invoice drafts and invoice payments: one writer at a time.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into receipt from public.pro_credit_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 select * into cl from public.pro_clients where user_id=p_actor and id=w."clientId";
 if act like 'create_%' then
  if coalesce(w.cancelled,false) then raise exception 'Restore the job first' using errcode='22023';end if;
  if cl.id is null or cl.archived then raise exception 'The job needs an active customer' using errcode='22023';end if;
  v_kind:=case act when 'create_retainer' then 'retainer' when 'create_credit_note' then 'credit_note' else 'overpayment' end;
  if exists(select 1 from public.pro_credits where id=rid) then raise exception 'Credit id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_credits where owner_id=p_actor and work_id=wid and kind=v_kind)>=500 then raise exception 'Credit limit' using errcode='54000';end if;
  if v_kind='overpayment' then
   select * into ex from public.pro_credit_excess(p_actor,wid);
   meta:=public.pro_credit_link_entry(p_actor,wid,cl.id,v_entry,p_input);
   if amount>least(ex.excess_cents,public.pro_credit_entry_free(p_actor,v_entry)) then raise exception 'Amount exceeds the detected overpayment' using errcode='22023';end if;
  end if;
  -- Per-account number per kind: the counter row lock serializes creators and a failed
  -- transaction rolls the counter back too, so numbers never have gaps.
  insert into public.pro_credit_counters(owner_id,kind) values(p_actor,v_kind) on conflict(owner_id,kind) do nothing;
  update public.pro_credit_counters set last_number=last_number+1 where owner_id=p_actor and kind=v_kind returning last_number into next_number;
  insert into public.pro_credits(owner_id,id,work_id,client_id,kind,number,title,note,reason,amount_cents,requested_on,status,entry_id,received_on,method,reference,received_at)
   values(p_actor,rid,wid,cl.id,v_kind,next_number,v_title,v_note,v_reason,amount,case when v_kind='retainer' then v_day end,
    case when v_kind='retainer' then 'requested' else 'active' end,v_entry,(meta->>'receivedOn')::date,meta->>'method',meta->>'reference',case when v_kind='overpayment' then now() end)
   returning * into r;
  before_json:=null;history_action:='create';
 else
  select * into r from public.pro_credits where owner_id=p_actor and id=rid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if r.revision<>rev then raise exception 'Credit changed' using errcode='40001';end if;
  before_json:=public.pro_credit_json(r);
  select * into fig from public.pro_credit_figures(r);
  history_action:=act;
  if act='receive_retainer' then
   history_action:='receive';
   if r.kind<>'retainer' or r.status<>'requested' then raise exception 'Only requested retainers can be received' using errcode='22023';end if;
   if coalesce(w.cancelled,false) or cl.id is null or cl.archived or cl.id<>r.client_id then raise exception 'The job needs its active customer' using errcode='22023';end if;
   if p_input->>'source'='existing' then
    meta:=public.pro_credit_link_entry(p_actor,wid,r.client_id,v_entry,p_input);
    if amount>public.pro_credit_entry_free(p_actor,v_entry) then raise exception 'Amount exceeds the unallocated payment' using errcode='22023';end if;
   else
    -- Manual receipt: record the payment in the existing ledger (no second ledger), then its snapshot.
    account:=public.pro_work_account(p_actor,wid);
    if account->>'agreedCents' is null then raise exception 'Set the job agreement before recording a payment' using errcode='22023';end if;
    if amount>(account->>'balanceCents')::bigint then raise exception 'Payment exceeds the job balance' using errcode='22023';end if;
    select revision into core_rev from public.pro_workspace_core where user_id=p_actor for update;
    if core_rev is null then raise exception 'Workspace not ready' using errcode='22023';end if;
    perform public.pro_record_client_operation(p_actor,jsonb_build_object('actionId',aid,'clientId',r.client_id,'workId',wid,'kind','payment','amountCents',amount,
     'note',left(public.pro_credit_code(r.kind,r.number)||' · '||r.title,160)),core_rev);
    insert into public.pro_invoice_payments(user_id,id,client_id,work_id,entry_id,amount_cents,received_on,method,reference)
     values(p_actor,aid,r.client_id,wid,aid,amount,v_day,v_method,coalesce(v_reference,''));
    v_entry:=aid;meta:=jsonb_build_object('receivedOn',v_day,'method',v_method,'reference',coalesce(v_reference,''));
   end if;
   update public.pro_credits set status='active',entry_id=v_entry,amount_cents=amount,received_on=(meta->>'receivedOn')::date,method=meta->>'method',reference=meta->>'reference',
    received_at=now(),revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='update' then
   if r.status='cancelled' then raise exception 'Cancelled credit' using errcode='22023';end if;
   if (r.kind='credit_note')<>(v_reason is not null) then raise exception 'Only credit notes carry a reason' using errcode='22023';end if;
   if r.entry_id is not null and amount<>r.amount_cents then raise exception 'The amount comes from the payment' using errcode='22023';end if;
   if amount<fig.applied_cents+fig.refunded_cents then raise exception 'Amount below applied and refunded' using errcode='22023';end if;
   update public.pro_credits set title=v_title,note=v_note,reason=v_reason,amount_cents=amount,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
   if before_json-'revision'-'updatedAt'=public.pro_credit_json(r)-'revision'-'updatedAt' then raise exception 'No credit changes' using errcode='22023';end if;
  elsif act='apply' then
   if r.status<>'active' or fig.source_reversed then raise exception 'Credit not available' using errcode='22023';end if;
   if coalesce(w.cancelled,false) or cl.id is null or cl.archived or cl.id<>r.client_id then raise exception 'The job needs its active customer' using errcode='22023';end if;
   select * into d from public.pro_invoice_drafts where user_id=p_actor and id=(p_input->>'draftId')::uuid for update;
   if not found or d.work_id is distinct from wid or d.client_id<>r.client_id then raise exception 'Choose an invoice draft of this project and customer' using errcode='22023';end if;
   if public.pro_credit_draft_archived(p_actor,d.id) then raise exception 'Restore the archived draft first' using errcode='22023';end if;
   if amount>fig.available_cents then raise exception 'Amount exceeds the available credit' using errcode='22023';end if;
   if amount>public.pro_credit_draft_balance(p_actor,d.id) then raise exception 'Amount exceeds the draft balance' using errcode='22023';end if;
   if r.entry_id is not null then
    -- Money already received: allocate it through invoice payments so both modules share one allocation.
    select coalesce((select s.revision from public.pro_invoice_payment_state s where s.user_id=p_actor and s.draft_id=d.id),0) into state_rev;
    perform public.pro_invoice_payment_mutate(p_actor,jsonb_build_object('requestId',aid,'action','apply','draftId',d.id,'draftRevision',d.revision,'revision',state_rev,
     'amountCents',amount,'source','existing','candidateId',r.entry_id));
    insert into public.pro_credit_applications(owner_id,id,credit_id,work_id,draft_id,amount_cents,invoice_application_id) values(p_actor,aid,rid,wid,d.id,amount,aid);
   else
    insert into public.pro_credit_applications(owner_id,id,credit_id,work_id,draft_id,amount_cents) values(p_actor,aid,rid,wid,d.id,amount);
   end if;
   update public.pro_credits set revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='unapply' then
   select * into app from public.pro_credit_application_rows(p_actor,rid) x where x.id=(p_input->>'applicationId')::uuid;
   if not found or app.state<>'active' then raise exception 'Application is not active' using errcode='22023';end if;
   if app.invoice_application_id is not null then
    select * into d from public.pro_invoice_drafts where user_id=p_actor and id=app.draft_id for update;
    select coalesce((select s.revision from public.pro_invoice_payment_state s where s.user_id=p_actor and s.draft_id=d.id),0) into state_rev;
    perform public.pro_invoice_payment_mutate(p_actor,jsonb_build_object('requestId',aid,'action','unapply','draftId',d.id,'draftRevision',d.revision,'revision',state_rev,
     'id',app.invoice_application_id,'reason',v_reason));
   end if;
   insert into public.pro_credit_application_reversals(owner_id,id,application_id,reason) values(p_actor,aid,app.id,v_reason);
   update public.pro_credits set revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='refund' then
   if r.status<>'active' or fig.source_reversed then raise exception 'Credit not available' using errcode='22023';end if;
   if amount>fig.available_cents then raise exception 'Refund exceeds the available credit' using errcode='22023';end if;
   if v_day<coalesce(r.received_on,(r.created_at at time zone 'America/Costa_Rica')::date) then raise exception 'Refund before the credit' using errcode='22023';end if;
   insert into public.pro_credit_counters(owner_id,kind) values(p_actor,'refund') on conflict(owner_id,kind) do nothing;
   update public.pro_credit_counters set last_number=last_number+1 where owner_id=p_actor and kind='refund' returning last_number into next_number;
   insert into public.pro_credit_refunds(owner_id,id,credit_id,work_id,number,amount_cents,refunded_on,method,reference,note) values(p_actor,aid,rid,wid,next_number,amount,v_day,v_method,v_reference,v_note);
   update public.pro_credits set revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='void_refund' then
   select * into f from public.pro_credit_refunds where owner_id=p_actor and credit_id=rid and id=(p_input->>'refundId')::uuid;
   if not found or exists(select 1 from public.pro_credit_refund_voids where owner_id=p_actor and refund_id=f.id) then raise exception 'Refund is not active' using errcode='22023';end if;
   insert into public.pro_credit_refund_voids(owner_id,id,refund_id,reason) values(p_actor,aid,f.id,v_reason);
   update public.pro_credits set revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='cancel' then
   if r.status='cancelled' then raise exception 'Already cancelled' using errcode='22023';end if;
   if fig.applied_cents<>0 or fig.refunded_cents<>0 then raise exception 'Revert applications and refunds before cancelling' using errcode='22023';end if;
   update public.pro_credits set status='cancelled',cancelled_at=now(),cancel_reason=v_reason,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  end if;
 end if;
 -- Server invariants, checked after every write: never a negative balance, applied ≤ amount.
 select * into fig from public.pro_credit_figures(r);
 if r.status='active' and not fig.source_reversed and (fig.balance_cents<0 or fig.available_cents<0) then raise exception 'Credit balance would be negative' using errcode='23514';end if;
 if act='apply' and public.pro_credit_draft_balance(p_actor,d.id)<0 then raise exception 'Draft balance would be negative' using errcode='23514';end if;
 after_json:=public.pro_credit_json(r);result:=jsonb_build_object('credit',after_json);
 insert into public.pro_credit_history(owner_id,work_id,credit_id,action_id,action,before_value,after_value) values(p_actor,wid,rid,aid,history_action,before_json,after_json);
 insert into public.pro_credit_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Deferred guard on the module's own tables: whoever writes them, a credit never ends with
-- applied + refunded above its amount and a draft never ends below zero.
create or replace function public.pro_credit_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.pro_credits;fig record;v_credit uuid;v_draft uuid;row_json jsonb:=to_jsonb(new);
begin
 -- NEW is read through jsonb: the same function serves three tables with different columns.
 v_credit:=case when tg_table_name='pro_credits' then (row_json->>'id')::uuid else (row_json->>'credit_id')::uuid end;
 select * into c from public.pro_credits where owner_id=(row_json->>'owner_id')::uuid and id=v_credit;
 if c.id is not null and c.status='active' then
  select * into fig from public.pro_credit_figures(c);
  if not fig.source_reversed and c.amount_cents<fig.applied_cents+fig.refunded_cents then raise exception 'Credit applied above its amount' using errcode='23514';end if;
 elsif c.id is not null and tg_table_name<>'pro_credits' then raise exception 'Credit not active' using errcode='23514';
 end if;
 if tg_table_name='pro_credit_applications' then
  v_draft:=(row_json->>'draft_id')::uuid;
  if public.pro_credit_draft_balance(c.owner_id,v_draft)<0 then raise exception 'Draft balance below zero' using errcode='23514';end if;
 end if;
 return null;
end $$;
drop trigger if exists pro_credit_guard on public.pro_credits;
create constraint trigger pro_credit_guard after update on public.pro_credits deferrable initially deferred for each row execute function public.pro_credit_guard();
drop trigger if exists pro_credit_guard on public.pro_credit_applications;
create constraint trigger pro_credit_guard after insert on public.pro_credit_applications deferrable initially deferred for each row execute function public.pro_credit_guard();
drop trigger if exists pro_credit_guard on public.pro_credit_refunds;
create constraint trigger pro_credit_guard after insert on public.pro_credit_refunds deferrable initially deferred for each row execute function public.pro_credit_guard();

create or replace function public.pro_credit_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Credit history, applications and refunds are immutable' using errcode='23514';
end $$;
do $$declare t text;begin
 foreach t in array array['pro_credit_applications','pro_credit_application_reversals','pro_credit_refunds','pro_credit_refund_voids','pro_credit_history','pro_credit_actions'] loop
  execute format('drop trigger if exists pro_credit_immutable on public.%I',t);
  execute format('create trigger pro_credit_immutable before update on public.%I for each row execute function public.pro_credit_immutable()',t);
 end loop;
end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_credit_counters','pro_credits','pro_credit_applications','pro_credit_application_reversals','pro_credit_refunds','pro_credit_refund_voids','pro_credit_history','pro_credit_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'pro\_credit\_%' or p.proname like 'pro\_credits\_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname not in('pro_credit_immutable','pro_credit_guard','pro_credit_existing_guard') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
