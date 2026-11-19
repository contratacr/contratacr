-- LOCAL PRO ONLY. Round 6B (2026-11-13): accounting sync (Houzz parity row 56).
-- * QuickBooks Online through the 6A framework (provider 'quickbooks', Intuit OAuth in connectors-local.sql):
--   customers (pro_clients), invoices (invoice drafts; «emitted» = accepted Hacienda FE/TE) and payments
--   (non-voided applications of recorded payments to those drafts).
-- * Mapping (per owner, CAS + idempotent + immutable history): income account, deposit account, and one
--   QuickBooks tax code per Costa Rica IVA code (01 exento 0 %, 02 1 %, 03 2 %, 04 4 %, 08 13 %, 09 0,5 %,
--   10 exento, 11 0 % sin derecho a crédito).
-- * Links remember the remote id, its SyncToken and the hash of what we last sent. When BOTH sides changed
--   since the last sync the link becomes a conflict (both versions kept) and nothing is overwritten until the
--   owner chooses «keep ContrataCR» or «keep QuickBooks».
-- * pro_mock_qbo_entities is the local stand-in of the QuickBooks company (mock mode only).
-- * The CSV export (any CR accounting system) reads pro_accounting_sources; it writes nothing.
-- Tables: RLS on, service_role only; functions security invoker, executable by service_role only.
begin;

create or replace function public.pro_accounting_vat_map_ok(p_map jsonb) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_typeof(p_map)='object' and octet_length(p_map::text)<=2048
  and not exists(select 1 from jsonb_each(p_map) e where e.key not in('01','02','03','04','08','09','10','11') or jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>60) $$;

create table if not exists public.pro_accounting_mappings(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 income_account text not null default '' check(length(income_account)<=100),
 deposit_account text not null default '' check(length(deposit_account)<=100),
 vat_map jsonb not null default '{}' check(public.pro_accounting_vat_map_ok(vat_map)),
 invoice_scope text not null default 'emitted' check(invoice_scope in('emitted','all')),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now()
);
create table if not exists public.pro_accounting_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null default gen_random_uuid(),
 action text not null check(action in('mapping','sync','resolve')),detail jsonb not null default '{}' check(octet_length(detail::text)<=8192 and public.pro_integration_config_safe(detail)),
 at timestamptz not null default clock_timestamp(),primary key(owner_id,id)
);
create table if not exists public.pro_accounting_links(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null default 'quickbooks' check(provider='quickbooks'),mode text not null check(mode in('mock','sandbox','production')),
 entity text not null check(entity in('customer','invoice','payment')),local_id text not null check(length(local_id) between 1 and 160),
 remote_id text check(remote_id is null or length(remote_id) between 1 and 60),
 remote_sync_token text check(remote_sync_token is null or remote_sync_token~'^[0-9]{1,12}$'),
 local_hash text not null check(local_hash~'^[a-f0-9]{32}$'),
 label text not null check(length(label) between 1 and 200),
 status text not null check(status in('synced','conflict','error')),
 conflict jsonb check(conflict is null or jsonb_typeof(conflict)='object' and octet_length(conflict::text)<=8192),
 last_error text check(last_error is null or length(last_error)<=300),
 synced_at timestamptz not null default now(),revision integer not null default 1 check(revision>0),
 primary key(owner_id,provider,mode,entity,local_id),
 check((status='conflict')=(conflict is not null)),check(status<>'synced' or remote_id is not null)
);
-- Local stand-in of the QuickBooks company (mock only). sync_token increases on every remote change.
create table if not exists public.pro_mock_qbo_entities(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 entity text not null check(entity in('customer','invoice','payment','account','taxcode')),id text not null check(id~'^[0-9]{1,12}$'),
 sync_token integer not null default 0 check(sync_token>=0),data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=16384),
 updated_at timestamptz not null default now(),primary key(owner_id,entity,id)
);

create or replace function public.pro_accounting_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then raise exception 'Accounting history is immutable' using errcode='23514';end if;
 if exists(select 1 from public.profiles where id=old.owner_id) then raise exception 'Accounting history is immutable' using errcode='23514';end if;
 return old;
end $$;
drop trigger if exists pro_accounting_immutable on public.pro_accounting_history;
create trigger pro_accounting_immutable before update or delete on public.pro_accounting_history for each row execute function public.pro_accounting_immutable();

create or replace function public.pro_accounting_mapping_json(m public.pro_accounting_mappings) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('incomeAccount',coalesce(m.income_account,''),'depositAccount',coalesce(m.deposit_account,''),'vatMap',coalesce(m.vat_map,'{}'::jsonb),
  'invoiceScope',coalesce(m.invoice_scope,'emitted'),'revision',coalesce(m.revision,0),'updatedAt',m.updated_at) $$;

create or replace function public.pro_accounting_mapping_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prior jsonb;m public.pro_accounting_mappings;result jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 prior:=public.pro_connector_receipt(p_actor,p_input,'accounting_mapping');if prior is not null then return prior;end if;
 if jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid revision' using errcode='22023';end if;
 select * into m from public.pro_accounting_mappings where owner_id=p_actor for update;
 if coalesce(m.revision,0)<>(p_input->>'revision')::integer then raise exception 'Mapping changed' using errcode='40001';end if;
 insert into public.pro_accounting_mappings(owner_id,income_account,deposit_account,vat_map,invoice_scope)
 values(p_actor,coalesce(p_input->>'incomeAccount',''),coalesce(p_input->>'depositAccount',''),coalesce(p_input->'vatMap','{}'),coalesce(p_input->>'invoiceScope','emitted'))
 on conflict(owner_id) do update set income_account=excluded.income_account,deposit_account=excluded.deposit_account,vat_map=excluded.vat_map,invoice_scope=excluded.invoice_scope,
  revision=pro_accounting_mappings.revision+1,updated_at=now()
 returning * into m;
 insert into public.pro_accounting_history(owner_id,action,detail) values(p_actor,'mapping',jsonb_build_object('incomeAccount',m.income_account,'depositAccount',m.deposit_account,'vatMap',m.vat_map,'invoiceScope',m.invoice_scope));
 result:=public.pro_accounting_mapping_json(m);
 insert into public.pro_connector_actions(owner_id,action_id,scope,input,result) values(p_actor,(p_input->>'actionId')::uuid,'accounting_mapping',p_input,result);
 return result;
exception when check_violation then raise exception 'Invalid mapping' using errcode='22023';
end $$;

-- What would be synced/exported. Dates in America/Costa_Rica. Hash = md5 of the canonical object.
create or replace function public.pro_accounting_sources(p_actor uuid,p_scope text default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare scope text;customers jsonb;invoices jsonb;payments jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 scope:=coalesce(p_scope,(select invoice_scope from public.pro_accounting_mappings where owner_id=p_actor),'emitted');
 with inv as(
  select d.*,e.consecutivo,e.clave,e.issued_at,
   coalesce((select jsonb_agg(jsonb_build_object('line',l.line_number,'description',l.description,'quantity',l.quantity,'unitPrice',l.unit_price,'discountType',l.discount_type,'discount',l.discount,
     'taxTreatment',l.tax_treatment,'taxRate',l.tax_rate,'vatCode',coalesce(t.vat_code,case when l.tax_treatment='vat' and l.tax_rate=13 then '08' when l.tax_treatment='vat' and l.tax_rate=4 then '04' when l.tax_treatment='vat' and l.tax_rate=2 then '03' when l.tax_treatment='vat' and l.tax_rate=1 then '02' when l.tax_treatment='vat' and l.tax_rate=0.5 then '09' else '10' end)) order by l.line_number)
     from public.pro_invoice_edited_lines l left join public.pro_invoice_line_tax t on t.user_id=l.user_id and t.draft_id=l.draft_id and t.line_number=l.line_number where l.user_id=d.user_id and l.draft_id=d.id),'[]') lines
  from public.pro_invoice_drafts d
  left join public.pro_invoice_draft_management mg on mg.user_id=d.user_id and mg.draft_id=d.id
  left join lateral(select x.consecutivo,x.clave,x.issued_at from public.pro_einvoice_documents x where x.owner_id=d.user_id and x.draft_id=d.id and x.doc_type in('01','04') and x.status='aceptado' order by x.created_at desc limit 1) e on true
  where d.user_id=p_actor and not coalesce(mg.archived,false) and (scope='all' or e.consecutivo is not null))
 select coalesce(jsonb_agg(o||jsonb_build_object('hash',md5(o::text)) order by o->>'date',o->>'localId'),'[]') into invoices from(
  select jsonb_build_object('localId',i.id,'number',coalesce(i.consecutivo,'BORRADOR-'||upper(left(i.id::text,8))),'emitted',i.consecutivo is not null,'clave',i.clave,'clientId',i.client_id,
   'customer',i.receiver_name,'customerId',i.receiver_identification,'title',i.title,'date',to_char(coalesce(i.issued_at,i.created_at) at time zone 'America/Costa_Rica','YYYY-MM-DD'),
   'totalCents',i.total_cents,'taxCents',coalesce(i.tax_cents,0),'currency',i.currency,'lines',i.lines) o from inv i) q;
 select coalesce(jsonb_agg(o||jsonb_build_object('hash',md5(o::text)) order by o->>'name',o->>'localId'),'[]') into customers from(
  select jsonb_build_object('localId',c.id,'name',c.name,'tradeName',c."tradeName",'email',c.email,'phone',c.phone,'identification',c.identification,'address',c.address) o
  from public.pro_clients c where c.user_id=p_actor and not c.archived) q;
 select coalesce(jsonb_agg(o||jsonb_build_object('hash',md5(o::text)) order by o->>'date',o->>'localId'),'[]') into payments from(
  select jsonb_build_object('localId',a.id,'invoiceId',a.draft_id,'clientId',p.client_id,'amountCents',a.amount_cents,'date',p.received_on,'method',p.method,'reference',p.reference) o
  from public.pro_invoice_payment_applications a join public.pro_invoice_payments p on p.user_id=a.user_id and p.id=a.payment_id
  where a.user_id=p_actor and not exists(select 1 from public.pro_invoice_payment_voids v where v.user_id=a.user_id and v.application_id=a.id)
   and (scope='all' or exists(select 1 from public.pro_einvoice_documents x where x.owner_id=a.user_id and x.draft_id=a.draft_id and x.doc_type in('01','04') and x.status='aceptado'))) q;
 return jsonb_build_object('scope',scope,'customers',customers,'invoices',invoices,'payments',payments);
end $$;

create or replace function public.pro_accounting_link_put(p_actor uuid,p_mode text,p_link jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 insert into public.pro_accounting_links(owner_id,provider,mode,entity,local_id,remote_id,remote_sync_token,local_hash,label,status,conflict,last_error,synced_at)
 values(p_actor,'quickbooks',p_mode,p_link->>'entity',p_link->>'localId',p_link->>'remoteId',p_link->>'syncToken',p_link->>'hash',left(p_link->>'label',200),p_link->>'status',
  case when p_link->>'status'='conflict' then p_link->'conflict' end,left(p_link->>'error',300),now())
 on conflict(owner_id,provider,mode,entity,local_id) do update set remote_id=coalesce(excluded.remote_id,pro_accounting_links.remote_id),remote_sync_token=coalesce(excluded.remote_sync_token,pro_accounting_links.remote_sync_token),
  local_hash=excluded.local_hash,label=excluded.label,status=excluded.status,conflict=excluded.conflict,last_error=excluded.last_error,synced_at=now(),revision=pro_accounting_links.revision+1;
exception when check_violation or not_null_violation then raise exception 'Invalid accounting link' using errcode='22023';
end $$;
create or replace function public.pro_accounting_note(p_actor uuid,p_action text,p_detail jsonb) returns void
language sql security invoker set search_path=public,pg_temp as $$
 insert into public.pro_accounting_history(owner_id,action,detail) values(p_actor,p_action,coalesce(p_detail,'{}')) $$;

create or replace function public.pro_accounting_read(p_actor uuid,p_mode text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare m public.pro_accounting_mappings;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into m from public.pro_accounting_mappings where owner_id=p_actor;
 return jsonb_build_object('mapping',public.pro_accounting_mapping_json(m),
  'links',coalesce((select jsonb_agg(jsonb_build_object('entity',l.entity,'localId',l.local_id,'remoteId',l.remote_id,'syncToken',l.remote_sync_token,'hash',l.local_hash,'label',l.label,'status',l.status,'conflict',l.conflict,'error',l.last_error,'syncedAt',l.synced_at,'revision',l.revision) order by l.entity,l.label) from public.pro_accounting_links l where l.owner_id=p_actor and l.mode=p_mode),'[]'),
  'history',coalesce((select jsonb_agg(jsonb_build_object('action',h.action,'detail',h.detail,'at',h.at) order by h.at desc) from (select * from public.pro_accounting_history where owner_id=p_actor order by at desc limit 15) h),'[]'));
end $$;

do $$declare n text;begin foreach n in array array['pro_accounting_mappings','pro_accounting_history','pro_accounting_links','pro_mock_qbo_entities'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select,insert,update,delete on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_accounting\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_accounting_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
