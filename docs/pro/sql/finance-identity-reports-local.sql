-- LOCAL PRO ONLY. Round 11 (2026-11-15), Finance (Houzz Pro parity rows 23, 42-44, 50-52, 54, 55, 57).
--  * Company fiscal identity (row 43): pro_company_fiscal_identity fills every EMPTY issuer field from the
--    company record (business name ▸ account name, contact e-mail, phone formatted «+506 XXXX-XXXX»,
--    address). Fix 13 (privacy): only the professional/company contact data; never the login e-mail, the
--    account's personal cédula or personal phone from profiles (the cédula is typed in issuer settings). Saved issuer settings always win field by field. Used by
--    every new invoice draft (direct, «Bill from job», installment, from source) through
--    pro_invoice_configured_save, and by the draft form defaults (/api/pro/invoice-drafts). No invoice is
--    emitted, signed or sent.
--  * Reports (rows 23, 55): pro_reports_read keeps its keys and now (a) ages each invoice by the SAME open
--    balance as the invoice draft (total − payments − credit notes applied, pro_credit_draft_balance) and
--    (b) gives each job the result WITH committed purchase orders plus its basis, so «Costs and committed»
--    and «Result» compare the same things (before: the result left out the committed column it was shown
--    next to). pro_reports_finance_read adds: receivables aging per customer, payments received (with
--    reversed payments and refunds apart), IVA (sales tax) summary per rate from the invoice lines, all in
--    CRC cents and Costa Rica dates.
--  * Purchase orders from the job (rows 51, 62): pro_purchase_order_sources lists the accepted quote lines
--    (with the owner's internal unit cost when known), the approved selection options (with their internal
--    cost) and the budget codes with planned amounts, plus what is already ordered of each, so the PO form
--    is prefilled; the order is still created by the existing PO writer (numbering, CAS, receipts, history).
--  * Payment plan reminders (row 57): new in-app event «payment_plan_due» (an installment of an active plan
--    due within the person's «due soon» days), owner only; overdue installments keep «invoice_overdue».
--    Nothing is sent: e-mail stays a never-sent draft when the person chose it.
-- Patterns: RLS on, service_role only, security invoker, CRC cents, Costa Rica dates. Read-only except the
-- notification sync (idempotent per source key) and the draft creation it wraps.
begin;

-- ===== Company fiscal identity =====
create or replace function public.pro_company_phone(p_value text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when x.d ~ '^[0-9]{8}$' then '+506 '||left(x.d,4)||'-'||right(x.d,4)
  when x.d ~ '^506[0-9]{8}$' then '+506 '||substr(x.d,4,4)||'-'||right(x.d,4)
  else left(btrim(coalesce(p_value,'')),30) end
 from (select regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(p_value,'')),'[[:space:]().-]','','g'),'^\+',''),'^00','') d) x $$;

create or replace function public.pro_company_fiscal_identity(p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare cfg jsonb;saved jsonb;pro record;prof record;d_name text;d_id text;d_type text;d_email text;d_phone text;d_addr text;issuer jsonb;src jsonb;
begin
 if p_owner is null then raise exception 'Invalid owner' using errcode='22023';end if;
 cfg:=public.pro_invoice_issuer_read(p_owner);saved:=coalesce(cfg->'issuer','{}'::jsonb);
 select p.business_name,p.contact_email,p.call_phone,p.whatsapp,p.formatted_address,p.address into pro from public.professionals p where p.profile_id=p_owner order by p.id limit 1;
 select f.full_name into prof from public.profiles f where f.id=p_owner;
 d_name:=left(coalesce(nullif(btrim(pro.business_name),''),nullif(btrim(prof.full_name),''),''),160);
 -- Fix 13: no identification is taken from the login profile; it comes only from saved issuer settings.
 d_id:='';d_type:='';
 d_email:=lower(btrim(coalesce(nullif(btrim(pro.contact_email),''),'')));
 if d_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(d_email)>254 then d_email:='';end if;
 d_phone:=public.pro_company_phone(coalesce(nullif(btrim(pro.call_phone),''),nullif(btrim(pro.whatsapp),''),''));
 d_addr:=left(btrim(coalesce(nullif(btrim(pro.formatted_address),''),pro.address,'')),500);
 issuer:=jsonb_build_object(
  'issuerName',coalesce(nullif(btrim(saved->>'issuerName'),''),d_name),
  'issuerIdType',case when coalesce(btrim(saved->>'issuerId'),'')<>'' then coalesce(saved->>'issuerIdType','') else d_type end,
  'issuerId',coalesce(nullif(btrim(saved->>'issuerId'),''),d_id),
  'issuerEmail',coalesce(nullif(btrim(saved->>'issuerEmail'),''),d_email),
  'issuerPhone',coalesce(nullif(btrim(saved->>'issuerPhone'),''),d_phone),
  'issuerAddress',coalesce(nullif(btrim(saved->>'issuerAddress'),''),d_addr),
  'issuerActivity',coalesce(saved->>'issuerActivity',''));
 src:=(select jsonb_object_agg(k,case when coalesce(btrim(saved->>k),'')<>'' then 'saved' when coalesce(issuer->>k,'')<>'' then 'company' else 'missing' end)
  from unnest(array['issuerName','issuerId','issuerEmail','issuerPhone','issuerAddress','issuerActivity']) k);
 return jsonb_build_object('revision',coalesce((cfg->>'revision')::integer,0),'issuer',issuer,'sources',src,
  'complete',issuer->>'issuerName'<>'' and issuer->>'issuerId'<>'' and (issuer->>'issuerEmail'<>'' or issuer->>'issuerPhone'<>''));
end $$;

-- Supersedes invoice-document-settings-local.sql: without saved issuer settings a NEW draft (direct, from
-- a source, «Bill from job», installment) starts with the whole company identity, not only its name.
create or replace function public.pro_invoice_configured_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing uuid;saved uuid;config jsonb;defaults jsonb;d pro_invoice_drafts;prep jsonb;v_today text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'action'='create_direct' then select id into existing from pro_invoice_drafts where user_id=p_user and id=(p_input->>'requestId')::uuid;
 elsif p_input->>'action'='create' then existing:=(pro_invoice_source(p_user,p_input->>'kind',p_input->>'sourceId')->>'existingId')::uuid;end if;
 saved:=pro_invoice_direct_save(p_user,p_input);
 if existing is not null or p_input->>'action' not in ('create','create_direct') or p_input ? 'preparation' then return saved;end if;
 config:=pro_invoice_issuer_read(p_user);defaults:=pro_invoice_document_settings_read(p_user);
 -- Round 11: every empty issuer field comes from the company (saved settings win field by field).
 config:=jsonb_set(config,'{issuer}',public.pro_company_fiscal_identity(p_user)->'issuer');
 if (config->>'revision')::integer=0 and coalesce(config->'issuer'->>'issuerName','')='' and (defaults->>'revision')::integer=0 then return saved;end if;
 select * into d from pro_invoice_drafts where user_id=p_user and id=saved;
 v_today:=((now() at time zone 'America/Costa_Rica')::date)::text;
 prep:=(config->'issuer')||jsonb_build_object('plannedDate',case when defaults->'defaults'->>'dateMode'='today' then v_today else '' end,'saleCondition',defaults->'defaults'->>'saleCondition','creditDays',(defaults->'defaults'->>'creditDays')::integer,'paymentMethod',defaults->'defaults'->>'paymentMethod','orderReference','');
 perform pro_invoice_full_save(p_user,jsonb_build_object('action','update','id',saved,'revision',d.revision,'title',d.title,'notes',d.notes,'receiver',jsonb_build_object('name',d.receiver_name,'identification',d.receiver_identification,'email',d.receiver_email,'phone',d.receiver_phone,'address',d.receiver_address),'preparation',prep));
 return saved;
end $$;

-- ===== Reports =====
-- Open balance of one invoice draft: the same number the draft shows (payments and credit notes applied).
create or replace function public.pro_report_draft_open(p_owner uuid,p_draft uuid) returns bigint language sql stable security invoker set search_path=public,pg_temp as $$
 select greatest(coalesce(public.pro_credit_draft_balance(p_owner,p_draft),0),0)::bigint $$;

create or replace function public.pro_reports_read(p_actor uuid,p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;jobs jsonb;aging jsonb;invoiced bigint;collected bigint;outstanding bigint;w record;fin jsonb;
begin
 if p_actor is null then raise exception 'Invalid actor' using errcode='22023';end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if (p_from is not null and p_from not between date'2000-01-01' and date'2100-12-31') or (p_to is not null and p_to not between date'2000-01-01' and date'2100-12-31') or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid report period' using errcode='22023';end if;
 with d as (
  select d.id,d.total_cents,(d.created_at at time zone 'America/Costa_Rica')::date as day,public.pro_report_draft_open(p_actor,d.id) as open_cents
  from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
  where d.user_id=p_actor and not coalesce(m.archived,false)
   and (p_from is null or (d.created_at at time zone 'America/Costa_Rica')::date>=p_from) and (p_to is null or (d.created_at at time zone 'America/Costa_Rica')::date<=p_to))
 select coalesce(sum(total_cents),0)::bigint,coalesce(sum(open_cents),0)::bigint,
  jsonb_build_object(
   'd0_30',coalesce(sum(open_cents) filter(where today-day<=30),0)::bigint,
   'd31_60',coalesce(sum(open_cents) filter(where today-day between 31 and 60),0)::bigint,
   'd61_90',coalesce(sum(open_cents) filter(where today-day between 61 and 90),0)::bigint,
   'd90_plus',coalesce(sum(open_cents) filter(where today-day>90),0)::bigint,
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
   'costCents',coalesce((fin->>'costCents')::bigint,0),'committedCents',coalesce((fin->>'committedCents')::bigint,0),'resultCents',fin->'resultCents',
   -- Round 11: the result shown next to «Costs and committed» is the one that subtracts both.
   'resultWithCommittedCents',fin->'resultWithCommittedCents','resultBasis',coalesce(fin->>'resultBasis','as_agreed')));
 end loop;
 return jsonb_build_object('today',today,'from',p_from,'to',p_to,'invoicedCents',invoiced,'collectedCents',collected,'outstandingCents',outstanding,'aging',aging,'jobs',jobs,'truncated',(select count(*) from public.pro_work where user_id=p_actor)>200);
end $$;

-- Fix 13: the invoice's own IVA calculation, per line (same expressions as pro_invoice_extras_totals, whose
-- sums are exactly the draft's gross tax and exoneration).
create or replace function public.pro_invoice_vat_lines(p_user uuid,p_id uuid) returns table(line_number integer,treatment text,rate numeric,net numeric,vat_base numeric,gross_tax numeric,exonerated numeric)
language sql stable security invoker set search_path=public,pg_temp as $$
 with gross_lines as (select l.*,round(l.quantity*l.unit_price,5) as gross from public.pro_invoice_edited_lines l where l.user_id=p_user and l.draft_id=p_id),
 bases as (select g.*,g.gross-case when g.discount_type='percent' then round(g.gross*g.discount/100,5) else g.discount end as net from gross_lines g),
 specials as (select t.line_number,t.code,case t.code when '02' then round(t.selective_base*t.rate/100,5) when '04' then round(b.quantity*round(t.quantity_per_unit*t.alcohol_percentage/100,5)*t.amount_per_unit,5) when '05' then round(div(2*((b.quantity*100000)*(t.quantity_per_unit*100000)*(t.amount_per_unit*100000))+(t.beverage_reference_volume*10000000000),2*(t.beverage_reference_volume*10000000000))/100000,5) when '12' then round(b.net*t.rate/100,5) when '03' then round(t.quantity_per_unit*t.amount_per_unit,5) when '06' then round(b.quantity*t.quantity_per_unit*t.amount_per_unit,5) end as amount from public.pro_invoice_line_special_tax t join bases b using(user_id,draft_id,line_number)),
 taxed as (select b.*,t.exemption_rate,b.net+coalesce((select sum(s.amount) from specials s where s.line_number=b.line_number and s.code in ('02','04','05','12')),0) as vat_base from bases b left join public.pro_invoice_line_tax t using(user_id,draft_id,line_number))
 select x.line_number::integer,x.tax_treatment::text,case when x.tax_treatment='vat' then x.tax_rate end,x.net,x.vat_base,
  case when x.tax_treatment='vat' then round(x.vat_base*x.tax_rate/100,5) else 0 end,
  case when x.exemption_rate is not null then round(x.vat_base*x.exemption_rate/100,5) else 0 end
 from taxed x order by x.line_number
$$;

-- Accounting reports: receivables aging per customer, payments received, IVA summary per rate.
create or replace function public.pro_reports_finance_read(p_actor uuid,p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare today date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;customers jsonb;payments jsonb;vat jsonb;pay_totals jsonb;vat_totals jsonb;refunded bigint;
begin
 if p_actor is null then raise exception 'Invalid actor' using errcode='22023';end if;
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if (p_from is not null and p_from not between date'2000-01-01' and date'2100-12-31') or (p_to is not null and p_to not between date'2000-01-01' and date'2100-12-31') or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Invalid report period' using errcode='22023';end if;
 -- Receivables aging per customer (invoice drafts of the period, not archived, open balance > 0).
 with d as (
  select d.id,d.client_id,(d.created_at at time zone 'America/Costa_Rica')::date as day,public.pro_report_draft_open(p_actor,d.id) as open_cents
  from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
  where d.user_id=p_actor and not coalesce(m.archived,false)
   and (p_from is null or (d.created_at at time zone 'America/Costa_Rica')::date>=p_from) and (p_to is null or (d.created_at at time zone 'America/Costa_Rica')::date<=p_to)),
 g as (select d.client_id,sum(open_cents)::bigint open_cents,
   coalesce(sum(open_cents) filter(where today-day<=30),0)::bigint d0,coalesce(sum(open_cents) filter(where today-day between 31 and 60),0)::bigint d31,
   coalesce(sum(open_cents) filter(where today-day between 61 and 90),0)::bigint d61,coalesce(sum(open_cents) filter(where today-day>90),0)::bigint d90,
   count(*) filter(where open_cents>0) n,max(today-day) filter(where open_cents>0) oldest
  from d group by d.client_id having sum(open_cents)>0)
 select coalesce(jsonb_agg(jsonb_build_object('clientId',g.client_id,'clientName',coalesce(c.name,''),'openCents',g.open_cents,'d0_30',g.d0,'d31_60',g.d31,'d61_90',g.d61,'d90_plus',g.d90,
   'openInvoices',g.n,'oldestDays',g.oldest) order by g.open_cents desc,coalesce(c.name,''),g.client_id),'[]'::jsonb) into customers
 from g left join public.pro_clients c on c.user_id=p_actor and c.id=g.client_id;
 -- Payments received in the period (by received day); a reversed payment is listed but not counted.
 -- Fix 13: the list shows the latest 500; the totals below count EVERY payment of the period.
 select coalesce(jsonb_agg(x.row order by x.received_on desc,x.id),'[]'::jsonb) into payments from (
  select p.id,p.received_on,p.amount_cents,public.pro_credit_entry_reversed(p_actor,p.entry_id) reversed,
   jsonb_build_object('id',p.id,'receivedOn',p.received_on,'clientName',coalesce(c.name,''),'workTitle',coalesce(w.service,''),'method',coalesce(p.method,''),'reference',coalesce(p.reference,''),
    'amountCents',p.amount_cents,'reversed',public.pro_credit_entry_reversed(p_actor,p.entry_id)) row
  from public.pro_invoice_payments p left join public.pro_clients c on c.user_id=p.user_id and c.id=p.client_id left join public.pro_work w on w.user_id=p.user_id and w.id=p.work_id
  where p.user_id=p_actor and (p_from is null or p.received_on>=p_from) and (p_to is null or p.received_on<=p_to)
  order by p.received_on desc,p.id limit 500) x;
 select jsonb_build_object('count',count(*),'collectedCents',coalesce(sum(p.amount_cents) filter(where not r.reversed),0)::bigint,'reversedCents',coalesce(sum(p.amount_cents) filter(where r.reversed),0)::bigint)
  into pay_totals from public.pro_invoice_payments p cross join lateral (select public.pro_credit_entry_reversed(p_actor,p.entry_id) reversed) r
  where p.user_id=p_actor and (p_from is null or p.received_on>=p_from) and (p_to is null or p.received_on<=p_to);
 select coalesce(sum(r.amount_cents),0)::bigint into refunded from public.pro_credit_refunds r
  where r.owner_id=p_actor and (p_from is null or r.refunded_on>=p_from) and (p_to is null or r.refunded_on<=p_to)
   and not exists(select 1 from public.pro_credit_refund_voids v where v.owner_id=r.owner_id and v.refund_id=r.id);
 pay_totals:=pay_totals||jsonb_build_object('refundedCents',refunded);
 -- IVA summary per rate. Fix 13: drafts with an edited detail use THE SAME per-line calculation as the invoice
 -- (pro_invoice_vat_lines = pro_invoice_extras_totals per line: 5-decimal amounts, IVA base including the
 -- special taxes 02/04/05/12, exoneration on that base); amounts are rounded to cents once per rate. Special
 -- taxes and other charges are not IVA and are left out of the tax. Drafts still without detail: their own
 -- subtotal and tax as one «from the source» row.
 with drafts as (select d.id,d.total_cents,d.tax_cents,exists(select 1 from public.pro_invoice_edited_detail e where e.user_id=d.user_id and e.draft_id=d.id) edited
   from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
   where d.user_id=p_actor and not coalesce(m.archived,false)
    and (p_from is null or (d.created_at at time zone 'America/Costa_Rica')::date>=p_from) and (p_to is null or (d.created_at at time zone 'America/Costa_Rica')::date<=p_to)),
 lines as (select d.id draft,v.* from drafts d cross join lateral public.pro_invoice_vat_lines(p_actor,d.id) v where d.edited),
 per as (select draft,treatment,rate,sum(vat_base) b,sum(gross_tax-exonerated) tx,sum(exonerated) ex,count(*) n from lines group by draft,treatment,rate),
 -- Each invoice's IVA in cents is round(its total IVA); its rate rows share those cents by largest remainder,
 -- so every row is within one cent of its exact amount and the rows add up to the invoices exactly.
 alloc as (select per.*,floor(tx*100) fl,round(sum(tx) over(partition by draft)*100)-sum(floor(tx*100)) over(partition by draft) extra,
   row_number() over(partition by draft order by tx*100-floor(tx*100) desc,treatment,rate) rk from per),
 rows as (select treatment,rate,round(sum(b)*100)::bigint base,sum(fl+case when rk<=extra then 1 else 0 end)::bigint tax,round(sum(ex)*100)::bigint exo,sum(n)::bigint n from alloc group by treatment,rate
  union all select 'source',null,coalesce(sum(total_cents-coalesce(tax_cents,0)),0)::bigint,coalesce(sum(tax_cents),0)::bigint,0,count(*)::bigint from drafts where not edited having count(*)>0)
 select coalesce(jsonb_agg(jsonb_build_object('treatment',treatment,'ratePercent',rate,'baseCents',base,'taxCents',tax,'exoneratedCents',exo,'lines',n)
   order by case treatment when 'vat' then 0 when 'exempt' then 1 when 'not_subject' then 2 when 'pending' then 3 else 4 end,rate desc nulls last),'[]'::jsonb),
  jsonb_build_object('baseCents',coalesce(sum(base),0)::bigint,'taxCents',coalesce(sum(tax),0)::bigint,'exoneratedCents',coalesce(sum(exo),0)::bigint)
 into vat,vat_totals from rows;
 return jsonb_build_object('today',today,'from',p_from,'to',p_to,'customers',customers,'payments',payments,'paymentTotals',pay_totals,'vat',vat,'vatTotals',vat_totals,'paymentsTruncated',(pay_totals->>'count')::integer>500);
end $$;

-- ===== Purchase orders from the job's quote lines, selections and budget =====
create or replace function public.pro_purchase_order_sources(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare quote jsonb;sel jsonb;budget jsonb;g public.pro_private_estimate_work_agreements;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid work' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select * into g from public.pro_private_estimate_work_agreements where owner_id=p_actor and work_id=p_work order by created_at desc limit 1;
 if g.publication_id is not null then
  select coalesce(jsonb_agg(jsonb_build_object('key','q:'||(l->>'id'),'lineId',l->>'id','description',l->>'description','unit',coalesce(l->>'unit',''),
    'quantity',round((l->>'qtyMilli')::numeric/1000,3),'priceCents',(l->>'unitPriceCents')::bigint,'taxPercent',round(coalesce((l->>'taxBps')::numeric,0)/100,2),
    'unitCostCents',(select (i.content->>'unitCostCents')::bigint from public.pro_private_estimate_items i where i.owner_id=p_actor and i.estimate_id=g.estimate_id and i.content->>'id'=l->>'id' and i.content ? 'unitCostCents' limit 1),
    'group',(select i.content->>'group' from public.pro_private_estimate_items i where i.owner_id=p_actor and i.estimate_id=g.estimate_id and i.content->>'id'=l->>'id' limit 1)) order by n),'[]'::jsonb)
   into quote from public.pro_private_estimate_publications v cross join lateral jsonb_array_elements(v.content->'lines') with ordinality e(l,n) where v.id=g.publication_id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('key','s:'||o.id,'optionId',o.id,'itemName',i.name,'name',o.name,'brand',o.brand,'quantity',o.quantity,'unitCents',o.unit_cents,
   'unitCostCents',c.unit_cost_cents,
   'orderedQuantity',coalesce((select sum(pl.quantity) from public.pro_purchase_order_lines pl join public.pro_purchase_orders po on po.owner_id=pl.owner_id and po.id=pl.order_id where pl.owner_id=p_actor and pl.work_id=p_work and pl.selection_option_id=o.id and po.status<>'cancelled'),0))
   order by a.position,i.position),'[]'::jsonb) into sel
  from public.pro_work_selection_items i join public.pro_work_selection_areas a on a.owner_id=i.owner_id and a.id=i.area_id
  join public.pro_work_selection_options o on o.owner_id=i.owner_id and o.id=i.approved_option_id
  left join public.pro_work_selection_option_costs c on c.owner_id=o.owner_id and c.option_id=o.id
  where i.owner_id=p_actor and i.work_id=p_work and i.status='approved' and not i.archived;
 select coalesce(jsonb_agg(jsonb_build_object('key','b:'||c.id,'codeId',c.id,'code',c.code,'title',c.title,'plannedCents',c.planned_cents,
   'committedCents',coalesce((select sum(pl.subtotal_cents+pl.tax_cents) from public.pro_purchase_order_lines pl join public.pro_purchase_orders po on po.owner_id=pl.owner_id and po.id=pl.order_id where pl.owner_id=p_actor and pl.work_id=p_work and pl.budget_code_id=c.id and po.status<>'cancelled'),0)::bigint)
   order by c.code),'[]'::jsonb) into budget
  from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=p_work and c.kind='item' and not c.archived
   and (c.parent_id is null or exists(select 1 from public.pro_work_budget_codes p where p.owner_id=c.owner_id and p.work_id=c.work_id and p.id=c.parent_id and not p.archived));
 return jsonb_build_object('workId',p_work,'quoteTitle',(select title from public.pro_private_estimate_work_agreements where owner_id=p_actor and work_id=p_work order by created_at desc limit 1),
  'quoteLines',coalesce(quote,'[]'::jsonb),'selections',sel,'budget',budget);
end $$;

-- ===== Notifications: payment plan installments due soon (Round 9 center) =====
alter table public.pro_notifications drop constraint if exists pro_notifications_event_check;
alter table public.pro_notifications add constraint pro_notifications_event_check check(event in('task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received','daily_log_missing','payment_plan_due'));
create or replace function public.pro_notification_events() returns text[] language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received','daily_log_missing','payment_plan_due']
$$;
-- Same derivation as jobsite-links-autofill-local.sql plus the Round 11 payment plan reminder.
create or replace function public.pro_notifications_sync(p_owner uuid,p_person uuid,p_today date) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare st jsonb;who text;n integer;plan record;item jsonb;overdue jsonb:='[]'::jsonb;due_soon jsonb:='[]'::jsonb;state jsonb;svc text;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 st:=public.pro_notification_settings_json(p_owner,p_person);who:=public.pro_notification_person_name(p_owner,p_person);
 -- Overdue payment-plan installments (after the person's grace days), from the plan's own state.
 for plan in select id,work_id from public.pro_payment_plans where owner_id=p_owner and status='active' limit 200 loop
  svc:=left(coalesce((select service from public.pro_work where user_id=p_owner and id=plan.work_id),'Plan de pagos'),200);
  for item in select value from jsonb_array_elements(coalesce(public.pro_payment_plan_state(p_owner,plan.id,p_today-(st->>'overdueGraceDays')::integer)->'items','[]'::jsonb)) loop
   if item->>'status'='overdue' then overdue:=overdue||jsonb_build_array(jsonb_build_object('key',plan.id::text||':'||coalesce(item->>'seq','')||':'||coalesce(item->>'dueDate',''),
    'title',svc,'body',coalesce(item->>'dueDate',''),
    'link',jsonb_build_object('tab','pro_agenda','cita',plan.work_id,'vistaTrabajo','costs','due',item->>'dueDate','amountCents',coalesce((item->>'amountCents')::bigint,0)-coalesce((item->>'appliedCents')::bigint,0))));end if;
  end loop;
  -- Round 11: installments not paid yet and due within the person's «due soon» days (owner only).
  if p_person=p_owner then
   state:=public.pro_payment_plan_state(p_owner,plan.id,p_today);
   for item in select value from jsonb_array_elements(coalesce(state->'items','[]'::jsonb)) loop
    if item->>'status' in('pending','partial') and item->>'dueDate' is not null and (item->>'dueDate')::date between p_today and p_today+(st->>'dueSoonDays')::integer then
     due_soon:=due_soon||jsonb_build_array(jsonb_build_object('key',plan.id::text||':'||(state->>'revision')||':'||coalesce(item->>'seq','')||':'||(item->>'dueDate'),'title',svc,'body',item->>'dueDate',
      'link',jsonb_build_object('tab','pro_agenda','cita',plan.work_id,'vistaTrabajo','costs','due',item->>'dueDate','amountCents',coalesce((item->>'amountCents')::bigint,0)-coalesce((item->>'appliedCents')::bigint,0))));
    end if;
   end loop;
  end if;
 end loop;
 with events(event,source_key,title,body,link,at) as(
  select 'task_assigned',t.id::text||':'||lower(t.assignee),left(t.title,200),left(w.service,400),jsonb_build_object('tab','pro_agenda','cita',t.work_id,'vistaTrabajo','tasks'),t.updated_at
   from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
   where who is not null and t.owner_id=p_owner and not t.archived and t.status='open' and lower(btrim(t.assignee))=lower(who) and t.updated_at>clock_timestamp()-interval '60 days'
  union all
  select 'task_due',t.id::text||':'||t.due_date::text,left(t.title,200),left(w.service,400),jsonb_build_object('tab','pro_agenda','cita',t.work_id,'vistaTrabajo','tasks','due',t.due_date::text,'overdue',t.due_date<p_today),clock_timestamp()
   from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
   where t.owner_id=p_owner and not t.archived and t.status='open' and t.due_date is not null and t.due_date<=p_today+(st->>'dueSoonDays')::integer and t.due_date>=p_today-30
    and (who is not null and lower(btrim(t.assignee))=lower(who) or btrim(t.assignee)='' and p_person=p_owner)
  union all
  select 'client_message',m.id::text,left(coalesce(nullif(m.author_name,''),'Cliente'),200),left(m.body,400),jsonb_build_object('tab','pro_agenda','cita',m.work_id,'vistaTrabajo','messages'),m.created_at
   from public.pro_work_messages m where m.owner_id=p_owner and m.side='client' and m.created_at>clock_timestamp()-interval '30 days'
  union all
  select case s.status when 'accepted' then 'quote_accepted' else 'quote_changes' end,p.id::text||':'||s.status||':'||s.revision,left(e.title,200),'',jsonb_build_object('tab','quotes','estimacionPrivada',p.estimate_id::text),p.created_at
   from public.pro_private_estimate_publications p join public.pro_private_estimate_publication_states s on s.publication_id=p.id join public.pro_private_estimates e on e.owner_id=p.owner_id and e.id=p.estimate_id
   where p.owner_id=p_owner and s.status in('accepted','changes_requested') and p.created_at>clock_timestamp()-interval '90 days'
  union all
  select 'invoice_paid',a.id::text,left(d.title,200),a.amount_cents::text,jsonb_build_object('tab','pro_billing','amountCents',a.amount_cents),a.created_at
   from public.pro_invoice_payment_applications a join public.pro_invoice_drafts d on d.user_id=a.user_id and d.id=a.draft_id
   where a.user_id=p_owner and a.created_at>clock_timestamp()-interval '30 days' and not exists(select 1 from public.pro_invoice_payment_voids v where v.user_id=a.user_id and v.application_id=a.id)
  union all
  select 'invoice_overdue',o->>'key',o->>'title',o->>'body',o->'link',clock_timestamp() from jsonb_array_elements(overdue) o
  union all
  select 'payment_plan_due',o->>'key',o->>'title',o->>'body',o->'link',clock_timestamp() from jsonb_array_elements(due_soon) o
  union all
  select 'bid_received',r.package_id::text||':'||r.supplier_id::text,left(b.title,200),left(coalesce((select v.name from public.pro_expense_suppliers v where v.user_id=r.owner_id and v.id=r.supplier_id),''),400),jsonb_build_object('tab','pro_agenda','cita',b.work_id,'vistaTrabajo','bids'),r.recorded_at
   from public.pro_bid_responses r join public.pro_bid_packages b on b.owner_id=r.owner_id and b.id=r.package_id
   where r.owner_id=p_owner and r.recorded_at>clock_timestamp()-interval '30 days'
  union all
  select 'daily_log_missing',w.id||':'||(p_today-1)::text,left(w.service,200),left(coalesce(w.client,''),400),jsonb_build_object('tab','pro_agenda','cita',w.id,'vistaTrabajo','updates','date',(p_today-1)::text),clock_timestamp()
   from public.pro_work w where p_person=p_owner and w.user_id=p_owner and not coalesce(w.cancelled,false)
    and not exists(select 1 from public.pro_daily_logs l where l.owner_id=p_owner and l.work_id=w.id and l.log_date=p_today-1 and not l.archived)
    and(exists(select 1 from public.pro_time_entries e where e.owner_id=p_owner and e.work_id=w.id and e.status='stopped' and e.recorded_on=p_today-1)
     or exists(select 1 from public.pro_work_timers t where t.owner_id=p_owner and t.work_id=w.id and(t.started_at at time zone 'America/Costa_Rica')::date=p_today-1)
     or exists(select 1 from public.pro_work_task_history h where h.owner_id=p_owner and h.work_id=w.id and h.action='complete' and(h.at at time zone 'America/Costa_Rica')::date=p_today-1))),
 ins as(insert into public.pro_notifications(owner_id,person_id,event,source_key,title,body,link,created_at)
  select distinct on(e.event,e.source_key) p_owner,p_person,e.event,e.source_key,e.title,e.body,e.link,least(coalesce(e.at,clock_timestamp()),clock_timestamp())
  from events e where public.pro_notification_enabled(st,e.event,'inApp')
  on conflict(owner_id,person_id,event,source_key) do nothing returning *),
 drafts as(insert into public.pro_notification_email_drafts(owner_id,person_id,notification_id,subject,body)
  select i.owner_id,i.person_id,i.id,left('ContrataCR Pro: '||i.title,200),i.title||case when i.body<>'' then E'\n'||i.body else '' end
  from ins i where public.pro_notification_enabled(st,i.event,'email') returning 1)
 select count(*) into n from ins;
 return n;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_company_phone','pro_company_fiscal_identity','pro_invoice_configured_save','pro_report_draft_open','pro_invoice_vat_lines','pro_reports_read','pro_reports_finance_read','pro_purchase_order_sources','pro_notification_events','pro_notifications_sync') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
