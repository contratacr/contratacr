-- LOCAL PRO ONLY. Round 4B (2026-11-13): invoicing from accepted quote lines, contract progress and
-- billable time/expenses; billable expense metadata (flag, payment method, VAT-included split, receipt)
-- and the person of a time entry (owner or a team member of the job).
--
-- * An invoice draft created here is an ordinary DIRECT draft (same writer chain as «Factura directa»:
--   pro_invoice_extras_save 'create_direct'), linked to its job (work_id) so it counts in «facturado».
--   Nothing is issued, sent or charged; the draft is internal.
-- * Each source used is recorded in pro_invoice_billing_items. While the draft is not archived its items
--   are ACTIVE: a time entry or expense can be in one active draft only (unique index); a quote line or
--   the agreed amount can be billed up to 100 % in total across active drafts. Archiving the draft
--   (the existing «Archivar», pro_invoice_management_save) releases them; restoring re-checks them.
-- * Amounts come from the existing single sources: the agreed amount and the customer balance from
--   pro_work_account (client-balance-local.sql, never forked), time from pro_time_entries + the live
--   line of the single ledger pro_work_cost_entries, expenses from pro_internal_expenses assigned to the job.
-- * Invoiced time/expenses are frozen: voiding/editing the time line, unlinking the expense or changing
--   its amount is refused (hint pro_billing_invoiced) until the draft is archived.
begin;

-- ---------------------------------------------------------------- expenses: billable metadata + receipt
create table if not exists public.pro_expense_billing(
 user_id uuid not null references public.profiles(id) on delete cascade,expense_id uuid not null,
 billable boolean not null default false,
 payment_method text check(payment_method is null or payment_method in('cash','transfer','card','sinpe','check','other')),
 vat_rate_bps integer check(vat_rate_bps is null or vat_rate_bps in(50,100,200,400,1300)),
 updated_at timestamptz not null default now(),
 primary key(user_id,expense_id),foreign key(user_id,expense_id) references public.pro_internal_expenses(user_id,id) on delete cascade
);
-- Round 7C: one «Registrar costo» form → the expense category is metadata too (optional).
alter table public.pro_expense_billing add column if not exists category text;
do $$begin if not exists(select 1 from pg_constraint where conname='pro_expense_billing_category_check') then
 alter table public.pro_expense_billing add constraint pro_expense_billing_category_check check(category is null or category in('materials','labor','subcontract','equipment','transport','permits','other'));end if;end $$;
create table if not exists public.pro_expense_receipts(
 user_id uuid not null references public.profiles(id) on delete cascade,expense_id uuid not null,id uuid not null,
 object_path text not null check(object_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|pdf)$'),
 name text not null check(length(name) between 1 and 160),mime_type text not null check(mime_type in('image/jpeg','application/pdf')),
 size_bytes integer not null check(size_bytes between 1 and 20971520),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 archived boolean not null default false,created_at timestamptz not null default now(),
 primary key(user_id,id),foreign key(user_id,expense_id) references public.pro_internal_expenses(user_id,id) on delete cascade,
 check(split_part(object_path,'/',1)=user_id::text and split_part(object_path,'/',2) like id::text||'.%')
);
create unique index if not exists pro_expense_receipts_one_active on public.pro_expense_receipts(user_id,expense_id) where not archived;

-- ---------------------------------------------------------------- time: person of an entry
create table if not exists public.pro_time_entry_people(
 owner_id uuid not null references public.profiles(id) on delete cascade,entry_id uuid not null,
 grant_id uuid,name text not null check(length(name) between 1 and 160),set_at timestamptz not null default now(),
 primary key(owner_id,entry_id),foreign key(owner_id,entry_id) references public.pro_time_entries(owner_id,id) on delete cascade
);

-- ---------------------------------------------------------------- billing items
create table if not exists public.pro_invoice_billing_items(
 user_id uuid not null,draft_id uuid not null,item_number integer not null check(item_number between 1 and 100),
 work_id text not null,
 source_type text not null check(source_type in('estimate_line','agreement','time','expense')),
 source_key text not null check(length(source_key) between 1 and 200),
 percent_bps integer check(percent_bps between 1 and 10000),
 amount_cents bigint not null check(amount_cents between 0 and 10000000000),
 description text not null check(length(description) between 1 and 200),
 active boolean not null default true,created_at timestamptz not null default now(),
 primary key(user_id,draft_id,item_number),
 foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade,
 foreign key(user_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 check((source_type in('estimate_line','agreement'))=(percent_bps is not null))
);
-- Double billing of a time entry or an expense is impossible while its draft is active.
create unique index if not exists pro_invoice_billing_once on public.pro_invoice_billing_items(user_id,source_type,source_key) where active and source_type in('time','expense');
create index if not exists pro_invoice_billing_work on public.pro_invoice_billing_items(user_id,work_id,source_type) where active;
create table if not exists public.pro_invoice_billing_requests(
 user_id uuid not null references public.profiles(id) on delete cascade,request_id uuid not null,input_hash text not null,draft_id uuid not null,
 created_at timestamptz not null default now(),primary key(user_id,request_id),
 foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade
);

-- A quote line / the agreed amount: at most 100 % in total among ACTIVE drafts; never both kinds on one job.
create or replace function public.pro_invoice_billing_cap() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare used integer;
begin
 if not new.active then return new;end if;
 if new.source_type in('estimate_line','agreement') then
  select coalesce(sum(percent_bps),0) into used from public.pro_invoice_billing_items
   where user_id=new.user_id and source_type=new.source_type and source_key=new.source_key and active and not(draft_id=new.draft_id and item_number=new.item_number);
  if used+new.percent_bps>10000 then raise exception 'Already billed above 100 percent' using errcode='23505',hint='pro_billing_already';end if;
  if exists(select 1 from public.pro_invoice_billing_items where user_id=new.user_id and work_id=new.work_id and active
     and source_type=case new.source_type when 'agreement' then 'estimate_line' else 'agreement' end) then
   raise exception 'Job already billed by another method' using errcode='23505',hint='pro_billing_already';end if;
 end if;
 return new;
end $$;
drop trigger if exists pro_invoice_billing_cap on public.pro_invoice_billing_items;
create trigger pro_invoice_billing_cap before insert or update on public.pro_invoice_billing_items for each row execute function public.pro_invoice_billing_cap();

-- Archive releases, restore re-checks (unique index / cap raise 23505 → the restore is refused).
create or replace function public.pro_invoice_billing_sync() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.pro_invoice_billing_items set active=not new.archived where user_id=new.user_id and draft_id=new.draft_id and active is distinct from not new.archived;
 return new;
end $$;
drop trigger if exists pro_invoice_billing_sync on public.pro_invoice_draft_management;
create trigger pro_invoice_billing_sync after insert or update of archived on public.pro_invoice_draft_management for each row execute function public.pro_invoice_billing_sync();

-- Live ledger line of an invoiced time entry / an invoiced expense is frozen.
create or replace function public.pro_invoice_billing_time_billed(p_owner uuid,p_line uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.pro_invoice_billing_items i join public.pro_time_entries e on e.owner_id=i.user_id and e.id::text=i.source_key
  where i.user_id=p_owner and i.active and i.source_type='time' and public.pro_time_live_line(e.owner_id,e.cost_entry_id)=p_line);
$$;
create or replace function public.pro_invoice_billing_expense_billed(p_owner uuid,p_expense uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.pro_invoice_billing_items i where i.user_id=p_owner and i.active and i.source_type='expense' and i.source_key=p_expense::text);
$$;
create or replace function public.pro_invoice_billing_guard_costs() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.kind='time_void' and public.pro_invoice_billing_time_billed(new.user_id,new.reversal_id) then
  raise exception 'Invoiced time entry' using errcode='22023',hint='pro_billing_invoiced';end if;
 if new.kind='expense_unlink' and public.pro_invoice_billing_expense_billed(new.user_id,new.expense_id) then
  raise exception 'Invoiced expense' using errcode='22023',hint='pro_billing_invoiced';end if;
 return new;
end $$;
drop trigger if exists pro_invoice_billing_guard_costs on public.pro_work_cost_entries;
create trigger pro_invoice_billing_guard_costs before insert on public.pro_work_cost_entries for each row execute function public.pro_invoice_billing_guard_costs();
create or replace function public.pro_invoice_billing_guard_expense() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (new.amount_cents,new.expense_date,new.concept) is distinct from (old.amount_cents,old.expense_date,old.concept) and public.pro_invoice_billing_expense_billed(old.user_id,old.id) then
  raise exception 'Invoiced expense' using errcode='22023',hint='pro_billing_invoiced';end if;
 return new;
end $$;
drop trigger if exists pro_invoice_billing_guard_expense on public.pro_internal_expenses;
create trigger pro_invoice_billing_guard_expense before update on public.pro_internal_expenses for each row execute function public.pro_invoice_billing_guard_expense();

-- A direct draft may now belong to a job (billing drafts). Everything else of the direct contract stays.
alter table public.pro_invoice_drafts drop constraint if exists pro_invoice_drafts_direct_check;
alter table public.pro_invoice_drafts add constraint pro_invoice_drafts_direct_check check(source_kind<>'direct' or (source_id=id::text and quote_origin_key is null and basis='manual' and agreed_cents is null and paid_cents is null and balance_cents is null and material_count=0 and material_cost=0));

-- ---------------------------------------------------------------- expense summary (superseded, added keys only)
create or replace function public.pro_expense_summary(p_user uuid,p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'supplierId',e.supplier_id,'supplierName',e.supplier_name,'date',e.expense_date,'dueDate',e.due_date,'currency',e.currency,'concept',e.concept,'amountCents',e.amount_cents,'paidCents',v.paid,'balanceCents',e.amount_cents-v.paid,'status',case when v.paid=0 then 'pending' when v.paid=e.amount_cents then 'paid' else 'partial' end,
  'billable',coalesce(b.billable,false),'paymentMethod',b.payment_method,'vatRateBps',b.vat_rate_bps,'category',b.category,
  'netCents',case when b.vat_rate_bps is null then null else round(e.amount_cents*10000.0/(10000+b.vat_rate_bps))::bigint end,
  'vatCents',case when b.vat_rate_bps is null then null else e.amount_cents-round(e.amount_cents*10000.0/(10000+b.vat_rate_bps))::bigint end,
  'workId',(select a.work_id from pro_work_expense_assignments a where a.user_id=e.user_id and a.expense_id=e.id),
  'invoicedDraftId',(select i.draft_id from pro_invoice_billing_items i where i.user_id=e.user_id and i.active and i.source_type='expense' and i.source_key=e.id::text limit 1),
  'receipt',(select jsonb_build_object('id',r.id,'name',r.name,'mimeType',r.mime_type,'sizeBytes',r.size_bytes,'createdAt',r.created_at) from pro_expense_receipts r where r.user_id=e.user_id and r.expense_id=e.id and not r.archived))
 from pro_internal_expenses e cross join lateral(select coalesce(sum(case when kind='payment' then amount_cents else -amount_cents end),0)::bigint paid from pro_expense_payments where user_id=e.user_id and expense_id=e.id) v
 left join pro_expense_billing b on b.user_id=e.user_id and b.expense_id=e.id
 where e.user_id=p_user and e.id=p_id;
$$;

-- Expense writer with metadata: the original writer runs unchanged (same receipt/revision/CAS), then the
-- metadata is stored in the same transaction. Keys billable/paymentMethod/vatRateBps are optional.
create or replace function public.pro_expense_meta_save(p_user uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;meta_keys text[]:=array['billable','paymentMethod','vatRateBps','category'];old pro_expense_billing;v_billable boolean;v_method text;v_vat integer;v_category text;eid uuid;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid expense' using errcode='22023';end if;
 if not(p_input ?| meta_keys) then return public.pro_expenses_save(p_user,p_input);end if;
 if p_input->>'action' is distinct from 'expense' then raise exception 'Metadata only for expenses' using errcode='22023';end if;
 if (p_input ? 'billable' and jsonb_typeof(p_input->'billable') is distinct from 'boolean')
  or (p_input ? 'paymentMethod' and jsonb_typeof(p_input->'paymentMethod') not in('string','null'))
  or (p_input ? 'vatRateBps' and jsonb_typeof(p_input->'vatRateBps') not in('number','null'))
  or (p_input ? 'category' and (jsonb_typeof(p_input->'category') not in('string','null') or p_input->>'category' not in('materials','labor','subcontract','equipment','transport','permits','other'))) then raise exception 'Invalid expense metadata' using errcode='22023';end if;
 eid:=(p_input->>'id')::uuid;
 select * into old from pro_expense_billing where user_id=p_user and expense_id=eid;
 v_billable:=case when p_input ? 'billable' then (p_input->>'billable')::boolean else coalesce(old.billable,false) end;
 v_method:=case when p_input ? 'paymentMethod' then p_input->>'paymentMethod' else old.payment_method end;
 v_vat:=case when p_input ? 'vatRateBps' then (p_input->>'vatRateBps')::integer else old.vat_rate_bps end;
 v_category:=case when p_input ? 'category' then p_input->>'category' else old.category end;
 if public.pro_invoice_billing_expense_billed(p_user,eid) and (v_billable is distinct from coalesce(old.billable,false) or v_vat is distinct from old.vat_rate_bps) then
  raise exception 'Invoiced expense' using errcode='22023',hint='pro_billing_invoiced';end if;
 result:=public.pro_expenses_save(p_user,p_input-meta_keys);
 insert into pro_expense_billing(user_id,expense_id,billable,payment_method,vat_rate_bps,category) values(p_user,eid,v_billable,v_method,v_vat,v_category)
  on conflict(user_id,expense_id) do update set billable=excluded.billable,payment_method=excluded.payment_method,vat_rate_bps=excluded.vat_rate_bps,category=excluded.category,updated_at=now();
 return result;
end $$;

-- Receipt (one active per expense; replacing archives the previous one). Bytes live in the private
-- bucket pro-expense-receipts under <owner>/<receipt>.<ext>; the route never returns storage URLs.
create or replace function public.pro_expense_receipt_mutate(p_user uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare eid uuid;rid uuid;ext text;row pro_expense_receipts;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_user),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' not in('attach','remove') then raise exception 'Invalid receipt' using errcode='22023';end if;
 eid:=(p_input->>'expenseId')::uuid;rid:=(p_input->>'receiptId')::uuid;
 perform 1 from pro_internal_expenses where user_id=p_user and id=eid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if p_input->>'action'='remove' then
  update pro_expense_receipts set archived=true where user_id=p_user and expense_id=eid and id=rid and not archived;
  if not found then raise exception 'Receipt changed' using errcode='40001';end if;
  return jsonb_build_object('expenseId',eid,'receiptId',null);
 end if;
 select * into row from pro_expense_receipts where user_id=p_user and id=rid;
 if found then
  if row.expense_id<>eid or row.sha256<>p_input->>'sha256' then raise exception 'Receipt identity reused' using errcode='22023';end if;
  return jsonb_build_object('expenseId',eid,'receiptId',rid);
 end if;
 ext:=case p_input->>'mimeType' when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' end;
 if ext is null or p_input->>'objectPath'<>p_user::text||'/'||rid::text||'.'||ext then raise exception 'Invalid receipt path' using errcode='22023';end if;
 update pro_expense_receipts set archived=true where user_id=p_user and expense_id=eid and not archived;
 insert into pro_expense_receipts(user_id,expense_id,id,object_path,name,mime_type,size_bytes,sha256)
  values(p_user,eid,rid,p_input->>'objectPath',p_input->>'name',p_input->>'mimeType',(p_input->>'sizeBytes')::integer,p_input->>'sha256');
 return jsonb_build_object('expenseId',eid,'receiptId',rid);
end $$;
create or replace function public.pro_expense_receipt_download(p_user uuid,p_receipt uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('objectPath',r.object_path,'name',r.name,'mimeType',r.mime_type,'sizeBytes',r.size_bytes,'sha256',r.sha256)
 from pro_expense_receipts r where r.user_id=p_user and r.id=p_receipt and coalesce(public.pro_private_work_tools_enabled(p_user),false);
$$;

-- ---------------------------------------------------------------- time: people and entry JSON
create or replace function public.pro_time_people(p_actor uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_array(jsonb_build_object('grantId',null,'name',coalesce(nullif(btrim(p.full_name),''),'Propietario'),'self',true))
  ||coalesce((select jsonb_agg(jsonb_build_object('grantId',g.id,'name',coalesce(nullif(btrim(g.member_name),''),'Miembro'),'self',false) order by lower(g.member_name),g.id)
   from pro_team_grants g where g.owner_id=p_actor and g.work_id=p_work and g.active),'[]'::jsonb)
 from profiles p where p.id=p_actor and exists(select 1 from pro_work w where w.user_id=p_actor and w.id=p_work);
$$;
create or replace function public.pro_time_entry_json(p_row public.pro_time_entries) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'workTitle',(select w.service from public.pro_work w where w.user_id=p_row.owner_id and w.id=p_row.work_id),
  'activityId',p_row.activity_id,'activityName',(select a.name from public.pro_time_activities a where a.owner_id=p_row.owner_id and a.id=p_row.activity_id),
  'source',p_row.source,'status',p_row.status,'startedAt',p_row.started_at,'stoppedAt',p_row.stopped_at,'minutes',coalesce(l.minutes,p_row.minutes),
  'recordedOn',case when p_row.recorded_on is null then null else to_char(p_row.recorded_on,'YYYY-MM-DD') end,
  'billable',p_row.billable,'rateCents',p_row.rate_cents,'costCents',p_row.cost_cents,'note',p_row.note,'costEntryId',p_row.cost_entry_id,
  'billableCents',case when p_row.status='stopped' and p_row.billable and p_row.rate_cents is not null then round(coalesce(l.minutes,p_row.minutes)::numeric*p_row.rate_cents/60)::bigint end,
  'voided',p_row.cost_entry_id is not null and l.id is null,
  'adjusted',l.id is not null and l.id<>p_row.cost_entry_id,
  'revision',p_row.revision,
  'personGrantId',pp.grant_id,'personName',pp.name,
  'invoicedDraftId',(select i.draft_id from public.pro_invoice_billing_items i where i.user_id=p_row.owner_id and i.active and i.source_type='time' and i.source_key=p_row.id::text limit 1))
 from (select 1) one left join public.pro_work_cost_entries l on l.user_id=p_row.owner_id and l.id=public.pro_time_live_line(p_row.owner_id,p_row.cost_entry_id)
 left join public.pro_time_entry_people pp on pp.owner_id=p_row.owner_id and pp.entry_id=p_row.id;
$$;
-- Same time writer; 'personGrantId' (optional, start/manual) is stored with the entry in the same transaction.
create or replace function public.pro_time_mutate_person(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;g pro_team_grants;who text;eid uuid;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or not(p_input ? 'personGrantId') then return public.pro_time_mutate(p_actor,p_input);end if;
 if p_input->>'action' not in('start','manual') or jsonb_typeof(p_input->'personGrantId') not in('string','null') then raise exception 'Invalid time person' using errcode='22023';end if;
 result:=public.pro_time_mutate(p_actor,p_input-'personGrantId');
 eid:=(p_input->>'entryId')::uuid;
 if p_input->>'personGrantId' is null then
  select coalesce(nullif(btrim(full_name),''),'Propietario') into who from profiles where id=p_actor;
 else
  select * into g from pro_team_grants where id=(p_input->>'personGrantId')::uuid and owner_id=p_actor and work_id=p_input->>'workId' and active;
  if not found then raise exception 'Team member unavailable' using errcode='40001';end if;
  who:=coalesce(nullif(btrim(g.member_name),''),'Miembro');
 end if;
 insert into pro_time_entry_people(owner_id,entry_id,grant_id,name) values(p_actor,eid,g.id,left(who,160))
  on conflict(owner_id,entry_id) do nothing;
 return jsonb_set(result,'{entry}',public.pro_time_entry_json((select e from pro_time_entries e where e.owner_id=p_actor and e.id=eid)));
end $$;

-- ---------------------------------------------------------------- billing sources and writer
create or replace function public.pro_invoice_billing_vat(p_user uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select case d.default_vat_code when '01' then '{"t":"vat","r":"0"}' when '02' then '{"t":"vat","r":"1"}' when '03' then '{"t":"vat","r":"2"}' when '04' then '{"t":"vat","r":"4"}'
  when '08' then '{"t":"vat","r":"13"}' when '09' then '{"t":"vat","r":"0.5"}' when '10' then '{"t":"exempt","r":"0"}' when '11' then '{"t":"not_subject","r":"0"}' else null end::jsonb
 from (select 1) one left join pro_project_details d on d.owner_id=p_user and d.work_id=p_work;
$$;
create or replace function public.pro_invoice_billing_sources(p_user uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w pro_work;c pro_clients;account jsonb;lines jsonb:='[]';agreement jsonb;times jsonb;expenses jsonb;drafts jsonb;billed bigint;v jsonb;pub uuid;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_user),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 select * into w from pro_work where user_id=p_user and id=p_work;
 if not found then return null;end if;
 select * into c from pro_clients where user_id=p_user and id=w."clientId";
 account:=public.pro_work_account(p_user,p_work);
 if account->>'agreedSource'='estimate' then
  select g.publication_id into pub from pro_private_estimate_work_agreements g where g.owner_id=p_user and g.work_id=p_work and g.currency='CRC';
  select coalesce(jsonb_agg(jsonb_build_object('key',pub::text||':'||(l->>'id'),'description',l->>'description','unit',l->>'unit','qtyMilli',(l->>'qtyMilli')::bigint,'unitPriceCents',(l->>'unitPriceCents')::bigint,
    'discountBps',(l->>'discountBps')::integer,'taxBps',(l->>'taxBps')::integer,'totalCents',t.total,
    'billedBps',coalesce((select sum(i.percent_bps) from pro_invoice_billing_items i where i.user_id=p_user and i.active and i.source_type='estimate_line' and i.source_key=pub::text||':'||(l->>'id')),0)) order by n),'[]'::jsonb)
   into lines
   from pro_private_estimate_publications v cross join lateral jsonb_array_elements(v.content->'lines') with ordinality e(l,n)
   cross join lateral (select round((l->>'qtyMilli')::numeric*(l->>'unitPriceCents')::numeric/1000) as base) a0
   cross join lateral (select a0.base-round(a0.base*(l->>'discountBps')::numeric/10000) as net) b
   cross join lateral (select (b.net+round(b.net*(l->>'taxBps')::numeric/10000))::bigint as total) t
   where v.id=pub;
 elsif account->>'agreedCents' is not null then
  agreement:=jsonb_build_object('key',p_work,'totalCents',(account->>'agreedCents')::bigint,'source',account->'agreedSource',
   'billedBps',coalesce((select sum(i.percent_bps) from pro_invoice_billing_items i where i.user_id=p_user and i.active and i.source_type='agreement' and i.source_key=p_work),0));
 end if;
 select coalesce(jsonb_agg(x order by x->>'date' desc,x->>'id'),'[]'::jsonb) into times from (
  select jsonb_build_object('id',e.id,'date',to_char(e.recorded_on,'YYYY-MM-DD'),'minutes',l.minutes,'rateCents',e.rate_cents,'amountCents',round(l.minutes::numeric*e.rate_cents/60)::bigint,
   'activityName',(select a.name from pro_time_activities a where a.owner_id=e.owner_id and a.id=e.activity_id),'personName',pp.name,'note',e.note,
   'invoicedDraftId',(select i.draft_id from pro_invoice_billing_items i where i.user_id=p_user and i.active and i.source_type='time' and i.source_key=e.id::text limit 1)) x
  from pro_time_entries e join pro_work_cost_entries l on l.user_id=e.owner_id and l.id=public.pro_time_live_line(e.owner_id,e.cost_entry_id)
  left join pro_time_entry_people pp on pp.owner_id=e.owner_id and pp.entry_id=e.id
  where e.owner_id=p_user and e.work_id=p_work and e.status='stopped' and e.billable and e.rate_cents is not null and e.rate_cents>0
  order by e.recorded_on desc,e.id limit 200) s;
 select coalesce(jsonb_agg(x order by x->>'date' desc,x->>'id'),'[]'::jsonb) into expenses from (
  select jsonb_build_object('id',x.id,'date',to_char(x.expense_date,'YYYY-MM-DD'),'concept',x.concept,'supplierName',x.supplier_name,'amountCents',x.amount_cents,'vatRateBps',b.vat_rate_bps,
   'netCents',case when b.vat_rate_bps is null then null else round(x.amount_cents*10000.0/(10000+b.vat_rate_bps))::bigint end,
   'invoicedDraftId',(select i.draft_id from pro_invoice_billing_items i where i.user_id=p_user and i.active and i.source_type='expense' and i.source_key=x.id::text limit 1)) x
  from pro_work_expense_assignments a join pro_internal_expenses x on x.user_id=a.user_id and x.id=a.expense_id join pro_expense_billing b on b.user_id=x.user_id and b.expense_id=x.id and b.billable
  where a.user_id=p_user and a.work_id=p_work order by x.expense_date desc,x.id limit 200) s;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'totalCents',d.total_cents,'archived',coalesce(m.archived,false),'createdAt',d.created_at) order by d.created_at desc,d.id),'[]'::jsonb)
  into drafts from pro_invoice_drafts d left join pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
  where d.user_id=p_user and d.work_id=p_work and exists(select 1 from pro_invoice_billing_items i where i.user_id=d.user_id and i.draft_id=d.id);
 select coalesce(sum(amount_cents),0) into billed from pro_invoice_billing_items where user_id=p_user and work_id=p_work and active and source_type in('estimate_line','agreement');
 v:=jsonb_build_object('workId',w.id,'clientId',w."clientId",'title',w.service,'cancelled',w.cancelled,'clientArchived',coalesce(c.archived,true),
  'agreedCents',account->'agreedCents','agreedSource',account->'agreedSource','customerBalanceCents',account->'customerBalanceCents','paidCents',account->'paidCents',
  'billedContractCents',billed,'lines',lines,'agreement',agreement,'time',times,'expenses',expenses,'defaultVat',public.pro_invoice_billing_vat(p_user,p_work));
 return v||jsonb_build_object('fingerprint',md5(v::text),'drafts',drafts);
end $$;

create or replace function public.pro_invoice_billing_create(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s jsonb;rid uuid;hash text;prior pro_invoice_billing_requests;keys text[];out_lines jsonb:='[]';items jsonb:='[]';l jsonb;sel jsonb;bps integer;n integer:=0;
 vat jsonb;t jsonb;x jsonb;draft uuid;price numeric;amount bigint;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_user),false) then raise exception 'Forbidden' using errcode='42501';end if;
 keys:=array['action','requestId','workId','fingerprint','title','notes','lines','agreementBps','timeIds','expenseIds'];
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is distinct from 'create_billing' or not(p_input ?& keys) or (p_input-keys)<>'{}'::jsonb
  or jsonb_typeof(p_input->'lines') is distinct from 'array' or jsonb_typeof(p_input->'timeIds') is distinct from 'array' or jsonb_typeof(p_input->'expenseIds') is distinct from 'array'
  or jsonb_typeof(p_input->'agreementBps') not in('number','null') or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'notes') is distinct from 'string'
  or length(btrim(p_input->>'title')) not between 1 and 160 or length(p_input->>'notes')>2000 then raise exception 'Invalid billing request' using errcode='22023';end if;
 rid:=(p_input->>'requestId')::uuid;hash:=md5((p_input-'requestId')::text);
 -- Same owner lock as every invoice writer (archive/restore included).
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into prior from pro_invoice_billing_requests where user_id=p_user and request_id=rid;
 if found then if prior.input_hash<>hash then raise exception 'Request already used' using errcode='22023';end if;return prior.draft_id;end if;
 if exists(select 1 from pro_invoice_drafts where user_id=p_user and id=rid) then raise exception 'Request collision' using errcode='40001';end if;
 s:=public.pro_invoice_billing_sources(p_user,p_input->>'workId');
 if s is null then raise exception 'Forbidden' using errcode='42501';end if;
 if (s->>'cancelled')::boolean or (s->>'clientArchived')::boolean then raise exception 'Inactive job' using errcode='22023';end if;
 if s->>'fingerprint' is distinct from p_input->>'fingerprint' then raise exception 'Billing sources changed' using errcode='40001';end if;
 vat:=s->'defaultVat';
 -- (a) accepted quote lines, full or % per line
 for sel in select value from jsonb_array_elements(p_input->'lines') loop
  if jsonb_typeof(sel) is distinct from 'object' or (sel-array['key','bps'])<>'{}'::jsonb or jsonb_typeof(sel->'bps') is distinct from 'number' or (sel->>'bps')!~'^[0-9]{1,5}$' then raise exception 'Invalid line' using errcode='22023';end if;
  bps:=(sel->>'bps')::integer;
  select value into l from jsonb_array_elements(s->'lines') where value->>'key'=sel->>'key';
  if l is null or bps<1 or bps>10000-(l->>'billedBps')::integer then raise exception 'Line already billed or unavailable' using errcode='40001';end if;
  if exists(select 1 from jsonb_array_elements(p_input->'lines') o where o->>'key'=sel->>'key' having count(*)>1) then raise exception 'Duplicate line' using errcode='22023';end if;
  n:=n+1;price:=round((l->>'unitPriceCents')::numeric*bps/1000000,5);amount:=round((l->>'totalCents')::numeric*bps/10000);
  out_lines:=out_lines||jsonb_build_object('kind','service','productId',null,'sku','','description',left(l->>'description'||case when bps<10000 then ' ('||trim(to_char(bps/100.0,'FM990.99'),'.')||' %)' else '' end,200),
   'unit',coalesce(nullif(left(l->>'unit',30),''),'Sp'),'cabys','','quantity',trim_scale((l->>'qtyMilli')::numeric/1000)::text,'unitPrice',trim_scale(price)::text,'discountType','percent','discount',trim_scale((l->>'discountBps')::numeric/100)::text,'discountReason','',
   'taxTreatment',case when (l->>'taxBps')::integer>0 then 'vat' else 'pending' end,'taxRate',trim_scale((l->>'taxBps')::numeric/100)::text);
  items:=items||jsonb_build_object('type','estimate_line','key',l->>'key','bps',bps,'amount',amount,'description',left(l->>'description',200));
 end loop;
 -- (b) progress % of the agreed amount (when there are no accepted quote lines)
 if p_input->>'agreementBps' is not null then
  if (p_input->>'agreementBps')!~'^[0-9]{1,5}$' then raise exception 'Invalid progress' using errcode='22023';end if;
  bps:=(p_input->>'agreementBps')::integer;l:=s->'agreement';
  if l is null or l='null'::jsonb or bps<1 or bps>10000-(l->>'billedBps')::integer then raise exception 'Progress already billed or unavailable' using errcode='40001';end if;
  n:=n+1;amount:=round((l->>'totalCents')::numeric*bps/10000);
  out_lines:=out_lines||jsonb_build_object('kind','service','productId',null,'sku','','description',left(s->>'title',170)||' — '||trim(to_char(bps/100.0,'FM990.99'),'.')||' %','unit','Sp','cabys','','quantity','1',
   'unitPrice',trim_scale(round((l->>'totalCents')::numeric*bps/1000000,5))::text,'discountType','percent','discount','0','discountReason','',
   -- Fix 13: the progress line takes the project's default IVA like time lines (still «por definir» without one).
   'taxTreatment',coalesce(vat->>'t','pending'),'taxRate',coalesce(vat->>'r','0'));
  items:=items||jsonb_build_object('type','agreement','key',l->>'key','bps',bps,'amount',amount,'description',left(s->>'title',200));
 end if;
 -- (c) unbilled billable time
 for sel in select value from jsonb_array_elements(p_input->'timeIds') loop
  select value into t from jsonb_array_elements(s->'time') where value->>'id'=sel#>>'{}';
  if t is null or t->>'invoicedDraftId' is not null then raise exception 'Time entry already billed or unavailable' using errcode='40001';end if;
  if exists(select 1 from jsonb_array_elements(p_input->'timeIds') o where o=sel having count(*)>1) then raise exception 'Duplicate time entry' using errcode='22023';end if;
  n:=n+1;
  out_lines:=out_lines||jsonb_build_object('kind','service','productId',null,'sku','','description',left(concat_ws(' · ',coalesce(t->>'activityName','Horas'),t->>'personName',t->>'date',
    (((t->>'minutes')::integer/60)::text||' h '||lpad(((t->>'minutes')::integer%60)::text,2,'0')||' min'),nullif(t->>'note','')),200),
   'unit','h','cabys','','quantity','1','unitPrice',trim_scale((t->>'amountCents')::numeric/100)::text,'discountType','percent','discount','0','discountReason','',
   'taxTreatment',coalesce(vat->>'t','pending'),'taxRate',coalesce(vat->>'r','0'));
  items:=items||jsonb_build_object('type','time','key',t->>'id','bps',null,'amount',(t->>'amountCents')::bigint,'description',left(coalesce(t->>'activityName','Horas')||' · '||(t->>'date'),200));
 end loop;
 -- (c) unbilled billable expenses (VAT-included split when the expense says so)
 for sel in select value from jsonb_array_elements(p_input->'expenseIds') loop
  select value into x from jsonb_array_elements(s->'expenses') where value->>'id'=sel#>>'{}';
  if x is null or x->>'invoicedDraftId' is not null then raise exception 'Expense already billed or unavailable' using errcode='40001';end if;
  if exists(select 1 from jsonb_array_elements(p_input->'expenseIds') o where o=sel having count(*)>1) then raise exception 'Duplicate expense' using errcode='22023';end if;
  n:=n+1;
  out_lines:=out_lines||jsonb_build_object('kind','service','productId',null,'sku','','description',left(concat_ws(' · ',x->>'concept',x->>'supplierName',x->>'date'),200),'unit','Sp','cabys','','quantity','1',
   'unitPrice',trim_scale(coalesce((x->>'netCents')::numeric,(x->>'amountCents')::numeric)/100)::text,'discountType','percent','discount','0','discountReason','',
   'taxTreatment',case when x->>'vatRateBps' is not null then 'vat' else 'pending' end,'taxRate',case when x->>'vatRateBps' is not null then trim_scale((x->>'vatRateBps')::numeric/100)::text else '0' end);
  items:=items||jsonb_build_object('type','expense','key',x->>'id','bps',null,'amount',(x->>'amountCents')::bigint,'description',left(x->>'concept',200));
 end loop;
 if n=0 then raise exception 'Choose what to bill' using errcode='22023';end if;
 if n>100 then raise exception 'Too many lines' using errcode='22023';end if;
 -- The same writer chain as a direct draft (receiver, fiscal defaults, totals, VAT), then the job link.
 draft:=public.pro_invoice_extras_save(p_user,jsonb_build_object('action','create_direct','requestId',rid,'clientId',s->>'clientId','title',btrim(p_input->>'title'),'notes',p_input->>'notes','lines',out_lines));
 update pro_invoice_drafts set work_id=s->>'workId' where user_id=p_user and id=draft;
 insert into pro_invoice_billing_items(user_id,draft_id,item_number,work_id,source_type,source_key,percent_bps,amount_cents,description)
  select p_user,draft,k,s->>'workId',i->>'type',i->>'key',(i->>'bps')::integer,(i->>'amount')::bigint,i->>'description' from jsonb_array_elements(items) with ordinality e(i,k);
 insert into pro_invoice_billing_requests(user_id,request_id,input_hash,draft_id) values(p_user,rid,hash,draft);
 return draft;
end $$;

-- ---------------------------------------------------------------- RLS, grants, bucket
do $$declare n text;begin foreach n in array array['pro_expense_billing','pro_expense_receipts','pro_time_entry_people','pro_invoice_billing_items','pro_invoice_billing_requests'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant all on public.%I to service_role',n);
 end loop;end $$;
revoke all on function public.pro_invoice_billing_cap(),public.pro_invoice_billing_sync(),public.pro_invoice_billing_time_billed(uuid,uuid),public.pro_invoice_billing_expense_billed(uuid,uuid),public.pro_invoice_billing_guard_costs(),public.pro_invoice_billing_guard_expense(),
 public.pro_expense_summary(uuid,uuid),public.pro_expense_meta_save(uuid,jsonb),public.pro_expense_receipt_mutate(uuid,jsonb),public.pro_expense_receipt_download(uuid,uuid),public.pro_time_people(uuid,text),public.pro_time_entry_json(public.pro_time_entries),public.pro_time_mutate_person(uuid,jsonb),
 public.pro_invoice_billing_vat(uuid,text),public.pro_invoice_billing_sources(uuid,text),public.pro_invoice_billing_create(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_invoice_billing_time_billed(uuid,uuid),public.pro_invoice_billing_expense_billed(uuid,uuid),
 public.pro_expense_summary(uuid,uuid),public.pro_expense_meta_save(uuid,jsonb),public.pro_expense_receipt_mutate(uuid,jsonb),public.pro_expense_receipt_download(uuid,uuid),public.pro_time_people(uuid,text),public.pro_time_entry_json(public.pro_time_entries),public.pro_time_mutate_person(uuid,jsonb),
 public.pro_invoice_billing_vat(uuid,text),public.pro_invoice_billing_sources(uuid,text),public.pro_invoice_billing_create(uuid,jsonb) to service_role;
do $$begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pro-expense-receipts','pro-expense-receipts',false,20971520,array['image/jpeg','application/pdf']) on conflict(id) do update set file_size_limit=excluded.file_size_limit;
  if not exists(select 1 from storage.buckets where id='pro-expense-receipts' and not public and file_size_limit=20971520 and cardinality(allowed_mime_types)=2 and allowed_mime_types @> array['image/jpeg','application/pdf']) then raise exception 'Expense receipts bucket configuration must match the private contract';end if;
 end if;
 if to_regclass('storage.objects') is not null then
  execute 'drop policy if exists pro_expense_receipts_no_direct on storage.objects';
  execute 'create policy pro_expense_receipts_no_direct on storage.objects as restrictive for all to anon,authenticated using (bucket_id <> ''pro-expense-receipts'') with check (bucket_id <> ''pro-expense-receipts'')';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
