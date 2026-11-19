-- LOCAL PRO ONLY. Ronda F2-A (2026-11-19): electronic-invoice PIPELINE behind a provider adapter (row 58).
-- Extends einvoice-local.sql (Round 6A) without touching its rows:
-- * Debit note (02) referencing an ACCEPTED FE/TE of the same draft (reference code 02, never capped).
-- * Hacienda's asynchronous answer modelled as its own state: enviado → recibido → procesando → aceptado | rechazado,
--   with error (retry with backoff) at any non-final step; «duplicate» submissions (Hacienda: «ya fue recibido»)
--   are recorded as received, never as a second document.
-- * Provider responses: one immutable row per adapter call (provider, mode, operation, attempt, HTTP status,
--   outcome, state, message, SHA-256 of the body). The XML payload stays inline (text, frozen once signed) and is
--   referenced by (owner_id, clave) + xml_sha256/signed_sha256.
-- * Per-emisor provider (mock | hacienda-sandbox | gti). The MODE is resolved by the server on every call and is
--   recorded per document; it is never chosen by the browser.
-- * Receiver messages (MensajeReceptor 05 aceptación, 06 aceptación parcial, 07 rechazo) for documents RECEIVED from
--   suppliers, with their own gapless consecutivo per branch/terminal/type, the same state machine and history.
-- Security as neighbours: RLS on, no anon/authenticated grants, service_role only, security invoker, owner gate
-- (pro_private_work_tools_enabled), idempotent actionId receipts, immutable history and responses. The route
-- (/api/pro/invoice-einvoice) only lets the owner, Administrador and Gerente in.
-- Nothing here calls Hacienda or a provider: the server adapter (mock by default) reports each step.
begin;

-- 1) Provider per emisor (older rows → mock).
alter table public.pro_einvoice_settings add column if not exists provider text not null default 'mock';
alter table public.pro_einvoice_documents add column if not exists provider text not null default 'mock';
do $$begin
 if not exists(select 1 from pg_constraint where conname='pro_einvoice_f2a_settings_provider' and conrelid='public.pro_einvoice_settings'::regclass) then
  alter table public.pro_einvoice_settings add constraint pro_einvoice_f2a_settings_provider check(provider in('mock','hacienda-sandbox','gti'));end if;
 if not exists(select 1 from pg_constraint where conname='pro_einvoice_f2a_documents_provider' and conrelid='public.pro_einvoice_documents'::regclass) then
  alter table public.pro_einvoice_documents add constraint pro_einvoice_f2a_documents_provider check(provider in('mock','hacienda-sandbox','gti'));end if;
end $$;

-- 2) Widen the Round 6A checks that enumerate document types and states (replaced by named f2a checks).
do $$declare c record;begin
 for c in select conname,conrelid::regclass rel,pg_get_constraintdef(oid) def from pg_constraint
  where contype='c' and conrelid in('public.pro_einvoice_documents'::regclass,'public.pro_einvoice_sequences'::regclass) and conname not like 'pro\_einvoice\_f2a\_%' loop
  if c.def like '%doc_type%''03''%' or c.def like '%01|03|04%' or c.def like '%''borrador''%''procesando''%' or (c.def like '%status%' and c.def like '%''firmado''%' and c.def like '%''error''%' and c.def not like '%xml%') then
   execute format('alter table %s drop constraint %I',c.rel,c.conname);
  end if;
 end loop;
 if not exists(select 1 from pg_constraint where conname='pro_einvoice_f2a_doc_type' and conrelid='public.pro_einvoice_documents'::regclass) then
  alter table public.pro_einvoice_documents add constraint pro_einvoice_f2a_doc_type check(doc_type in('01','02','03','04'));
  alter table public.pro_einvoice_documents add constraint pro_einvoice_f2a_consecutivo check(consecutivo ~ '^[0-9]{3}[0-9]{5}(01|02|03|04)[0-9]{10}$');
  alter table public.pro_einvoice_documents add constraint pro_einvoice_f2a_status check(status in('borrador','firmado','enviado','recibido','procesando','aceptado','rechazado','error'));
  alter table public.pro_einvoice_documents add constraint pro_einvoice_f2a_reference check((doc_type in('02','03'))=(reference_document_id is not null and reference_code is not null and reference_reason is not null));
 end if;
 if not exists(select 1 from pg_constraint where conname='pro_einvoice_f2a_sequence_type' and conrelid='public.pro_einvoice_sequences'::regclass) then
  alter table public.pro_einvoice_sequences add constraint pro_einvoice_f2a_sequence_type check(doc_type in('01','02','03','04','05','06','07'));
 end if;
end $$;

-- 3) Provider responses (append-only).
create table if not exists public.pro_einvoice_receiver_messages(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 received_clave text not null check(received_clave ~ '^506[0-9]{6}[A-Za-z0-9]{12}[0-9]{20}[123][0-9]{8}$'),
 emisor_id_type text not null check(emisor_id_type in('01','02','03','04','05')),
 emisor_id text not null check(emisor_id ~ '^[A-Za-z0-9]{9,20}$'),
 emisor_name text not null check(length(btrim(emisor_name)) between 3 and 100),
 received_issued_at timestamptz not null,
 received_total_cents bigint not null check(received_total_cents between 0 and 10000000000),
 received_tax_cents bigint not null check(received_tax_cents between 0 and 10000000000),
 message_code text not null check(message_code in('1','2','3')),
 doc_type text not null check(doc_type in('05','06','07')),
 detail text check(detail is null or length(detail) between 5 and 160),
 tax_condition text check(tax_condition is null or tax_condition in('01','02','03','04','05')),
 credit_tax_cents bigint check(credit_tax_cents is null or credit_tax_cents>=0),
 expense_cents bigint check(expense_cents is null or expense_cents>=0),
 activity_code text not null check(activity_code ~ '^[0-9]{6}$'),
 consecutivo text not null check(consecutivo ~ '^[0-9]{3}[0-9]{5}(05|06|07)[0-9]{10}$'),
 mode text not null check(mode in('mock','sandbox','production')),
 provider text not null default 'mock' check(provider in('mock','hacienda-sandbox','gti')),
 status text not null default 'borrador' check(status in('borrador','firmado','enviado','recibido','procesando','aceptado','rechazado','error')),
 xml text,xml_sha256 text check(xml_sha256 is null or xml_sha256 ~ '^[a-f0-9]{64}$'),
 signed_xml text,signed_sha256 text check(signed_sha256 is null or signed_sha256 ~ '^[a-f0-9]{64}$'),
 signer text check(signer is null or signer in('mock','p12')),
 response_xml text,response_code integer check(response_code is null or response_code in(1,2,3)),
 response_message text check(response_message is null or length(response_message)<=2000),
 attempts integer not null default 0 check(attempts between 0 and 100),
 next_attempt_at timestamptz,last_error text check(last_error is null or length(last_error)<=300),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,consecutivo),
 check(doc_type=case message_code when '1' then '05' when '2' then '06' else '07' end),
 check(message_code='1' or detail is not null),
 check(message_code<>'2' or credit_tax_cents is not null and credit_tax_cents<=received_tax_cents),
 check(substr(consecutivo,9,2)=doc_type),
 check(status='borrador' or xml is not null and signed_xml is not null and xml_sha256 is not null and signed_sha256 is not null and signer is not null),
 check(status not in('aceptado','rechazado') or response_code is not null)
);
-- One live answer per received document (a rejected answer frees it).
create unique index if not exists pro_einvoice_receiver_one_live on public.pro_einvoice_receiver_messages(owner_id,received_clave) where status<>'rechazado';
create index if not exists pro_einvoice_receiver_recent on public.pro_einvoice_receiver_messages(owner_id,created_at desc);
create table if not exists public.pro_einvoice_receiver_events(
 owner_id uuid not null,message_id uuid not null,id bigint generated always as identity,
 from_status text,to_status text not null,detail jsonb not null default '{}',created_at timestamptz not null default now(),
 primary key(owner_id,message_id,id),foreign key(owner_id,message_id) references public.pro_einvoice_receiver_messages(owner_id,id) on delete cascade
);
create table if not exists public.pro_einvoice_provider_responses(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id bigint generated always as identity,
 document_id uuid,receiver_message_id uuid,
 provider text not null check(provider in('mock','hacienda-sandbox','gti')),
 mode text not null check(mode in('mock','sandbox','production')),
 operation text not null check(operation in('issue','status','receiver_message','receiver_status')),
 attempt integer not null check(attempt between 1 and 100),
 http_status integer check(http_status is null or http_status between 0 and 599),
 outcome text not null check(outcome in('received','duplicate','error','timeout','state')),
 state text check(state is null or state in('recibido','procesando','aceptado','rechazado','error')),
 message text check(message is null or length(message)<=500),
 body_sha256 text check(body_sha256 is null or body_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,document_id) references public.pro_einvoice_documents(owner_id,id) on delete cascade,
 foreign key(owner_id,receiver_message_id) references public.pro_einvoice_receiver_messages(owner_id,id) on delete cascade,
 check((document_id is null)<>(receiver_message_id is null)),
 check((outcome='state')=(state is not null)),
 check((operation in('issue','status'))=(document_id is not null))
);
create index if not exists pro_einvoice_provider_responses_document on public.pro_einvoice_provider_responses(owner_id,document_id,id) where document_id is not null;
create index if not exists pro_einvoice_provider_responses_receiver on public.pro_einvoice_provider_responses(owner_id,receiver_message_id,id) where receiver_message_id is not null;
drop trigger if exists pro_einvoice_provider_responses_immutable on public.pro_einvoice_provider_responses;
create trigger pro_einvoice_provider_responses_immutable before update on public.pro_einvoice_provider_responses for each row execute function public.pro_einvoice_immutable();
drop trigger if exists pro_einvoice_receiver_events_immutable on public.pro_einvoice_receiver_events;
create trigger pro_einvoice_receiver_events_immutable before update on public.pro_einvoice_receiver_events for each row execute function public.pro_einvoice_immutable();

-- 4) State machine with «procesando» (replaces the Round 6A guard; same freeze rules + provider frozen).
--   borrador→firmado · firmado→enviado|error · enviado→recibido|procesando|aceptado|rechazado|error
--   recibido→procesando|aceptado|rechazado|error · procesando→aceptado|rechazado|error
--   error→enviado|recibido|procesando|aceptado|rechazado · aceptado/rechazado final.
create or replace function public.pro_einvoice_transition_ok(p_from text,p_to text) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select p_from=p_to or p_from='borrador' and p_to='firmado' or p_from='firmado' and p_to in('enviado','error')
  or p_from='enviado' and p_to in('recibido','procesando','aceptado','rechazado','error') or p_from='recibido' and p_to in('procesando','aceptado','rechazado','error')
  or p_from='procesando' and p_to in('aceptado','rechazado','error') or p_from='error' and p_to in('enviado','recibido','procesando','aceptado','rechazado') $$;
create or replace function public.pro_einvoice_document_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.status in('aceptado','rechazado') then raise exception 'Emitted document is final and immutable' using errcode='23514';end if;
 if not public.pro_einvoice_transition_ok(old.status,new.status) then
  raise exception 'Invalid electronic invoice transition % → %',old.status,new.status using errcode='23514';
 end if;
 if new.owner_id<>old.owner_id or new.id<>old.id or new.draft_id<>old.draft_id or new.doc_type<>old.doc_type or new.mode<>old.mode or new.provider<>old.provider or new.clave<>old.clave or new.consecutivo<>old.consecutivo
  or new.issued_at<>old.issued_at or new.total_cents<>old.total_cents or new.tax_cents<>old.tax_cents or new.snapshot<>old.snapshot
  or new.reference_document_id is distinct from old.reference_document_id or new.reference_code is distinct from old.reference_code or new.reference_reason is distinct from old.reference_reason
  or new.receiver_name is distinct from old.receiver_name or new.receiver_id is distinct from old.receiver_id or new.receiver_id_type is distinct from old.receiver_id_type or new.created_at<>old.created_at then
  raise exception 'Electronic invoice identity is immutable' using errcode='23514';
 end if;
 if old.status<>'borrador' and (new.xml is distinct from old.xml or new.signed_xml is distinct from old.signed_xml or new.xml_sha256 is distinct from old.xml_sha256 or new.signed_sha256 is distinct from old.signed_sha256 or new.signer is distinct from old.signer) then
  raise exception 'Signed XML is immutable' using errcode='23514';
 end if;
 if new.status='firmado' and old.status='borrador' and (encode(sha256(convert_to(new.xml,'UTF8')),'hex')<>new.xml_sha256 or encode(sha256(convert_to(new.signed_xml,'UTF8')),'hex')<>new.signed_sha256 or position(new.clave in new.xml)=0 or position(new.consecutivo in new.xml)=0) then
  raise exception 'Signed XML does not match its digest or clave' using errcode='22023',hint='pro_einvoice_xml_mismatch';
 end if;
 new.updated_at:=now();
 return new;
end $$;
create or replace function public.pro_einvoice_receiver_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.status in('aceptado','rechazado') then raise exception 'Receiver message is final and immutable' using errcode='23514';end if;
 if not public.pro_einvoice_transition_ok(old.status,new.status) then raise exception 'Invalid receiver message transition % → %',old.status,new.status using errcode='23514';end if;
 if (to_jsonb(new)-array['status','xml','xml_sha256','signed_xml','signed_sha256','signer','response_xml','response_code','response_message','attempts','next_attempt_at','last_error','updated_at'])
   <>(to_jsonb(old)-array['status','xml','xml_sha256','signed_xml','signed_sha256','signer','response_xml','response_code','response_message','attempts','next_attempt_at','last_error','updated_at']) then
  raise exception 'Receiver message identity is immutable' using errcode='23514';
 end if;
 if old.status<>'borrador' and (new.xml is distinct from old.xml or new.signed_xml is distinct from old.signed_xml or new.xml_sha256 is distinct from old.xml_sha256 or new.signed_sha256 is distinct from old.signed_sha256 or new.signer is distinct from old.signer) then
  raise exception 'Signed XML is immutable' using errcode='23514';
 end if;
 if new.status='firmado' and old.status='borrador' and (encode(sha256(convert_to(new.xml,'UTF8')),'hex')<>new.xml_sha256 or encode(sha256(convert_to(new.signed_xml,'UTF8')),'hex')<>new.signed_sha256 or position(new.received_clave in new.xml)=0 or position(new.consecutivo in new.xml)=0) then
  raise exception 'Signed XML does not match its digest or clave' using errcode='22023',hint='pro_einvoice_xml_mismatch';
 end if;
 new.updated_at:=now();
 return new;
end $$;
drop trigger if exists pro_einvoice_receiver_guard on public.pro_einvoice_receiver_messages;
create trigger pro_einvoice_receiver_guard before update on public.pro_einvoice_receiver_messages for each row execute function public.pro_einvoice_receiver_guard();
create or replace function public.pro_einvoice_receiver_event() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' or new.status<>old.status then
  insert into public.pro_einvoice_receiver_events(owner_id,message_id,from_status,to_status,detail) values(new.owner_id,new.id,case when tg_op='INSERT' then null else old.status end,new.status,
   jsonb_strip_nulls(jsonb_build_object('attempts',new.attempts,'error',case when new.status='error' then new.last_error end,'responseCode',new.response_code)));
 end if;
 return null;
end $$;
drop trigger if exists pro_einvoice_receiver_event on public.pro_einvoice_receiver_messages;
create trigger pro_einvoice_receiver_event after insert or update on public.pro_einvoice_receiver_messages for each row execute function public.pro_einvoice_receiver_event();

-- 5) JSON (adds provider and the provider responses; same keys as Round 6A otherwise).
create or replace function public.pro_einvoice_settings_json(p_row public.pro_einvoice_settings) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_row.owner_id is null then null else jsonb_build_object('idType',p_row.id_type,'idNumber',p_row.id_number,'name',p_row.name,'commercialName',coalesce(p_row.commercial_name,''),
  'activityCode',p_row.activity_code,'province',p_row.province,'canton',p_row.canton,'district',p_row.district,'barrio',coalesce(p_row.barrio,''),'otherSigns',p_row.other_signs,
  'phone',coalesce(p_row.phone,''),'email',p_row.email,'branch',p_row.branch,'terminal',p_row.terminal,'providerSystems',p_row.provider_systems,'provider',p_row.provider) end $$;
-- Last 30 adapter calls of one document or receiver message, oldest first.
create or replace function public.pro_einvoice_responses_json(p_owner uuid,p_document uuid,p_message uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('provider',q.provider,'mode',q.mode,'operation',q.operation,'attempt',q.attempt,'httpStatus',q.http_status,'outcome',q.outcome,'state',q.state,'message',q.message,'at',q.created_at) order by q.id),'[]')
 from (select r.* from public.pro_einvoice_provider_responses r where r.owner_id=p_owner and (p_document is not null and r.document_id=p_document or p_message is not null and r.receiver_message_id=p_message) order by r.id desc limit 30) q $$;
create or replace function public.pro_einvoice_document_json(p_doc public.pro_einvoice_documents,p_full boolean default false) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_doc.id,'draftId',p_doc.draft_id,'docType',p_doc.doc_type,'mode',p_doc.mode,'provider',p_doc.provider,'clave',p_doc.clave,'consecutivo',p_doc.consecutivo,'issuedAt',p_doc.issued_at,
  'status',p_doc.status,'responseCode',p_doc.response_code,'responseMessage',p_doc.response_message,'totalCents',p_doc.total_cents,'taxCents',p_doc.tax_cents,
  'receiverName',p_doc.receiver_name,'referenceDocumentId',p_doc.reference_document_id,'referenceCode',p_doc.reference_code,'referenceReason',p_doc.reference_reason,
  'attempts',p_doc.attempts,'nextAttemptAt',p_doc.next_attempt_at,'lastError',p_doc.last_error,'signer',p_doc.signer,'hasXml',p_doc.signed_xml is not null,'hasResponse',p_doc.response_xml is not null,
  'xmlSha256',p_doc.signed_sha256,'createdAt',p_doc.created_at,'updatedAt',p_doc.updated_at,
  'events',coalesce((select jsonb_agg(jsonb_build_object('from',e.from_status,'to',e.to_status,'detail',e.detail,'at',e.created_at) order by e.id) from public.pro_einvoice_events e where e.owner_id=p_doc.owner_id and e.document_id=p_doc.id),'[]'),
  'responses',public.pro_einvoice_responses_json(p_doc.owner_id,p_doc.id,null))
  ||case when p_full then jsonb_build_object('xml',p_doc.xml,'signedXml',p_doc.signed_xml,'responseXml',p_doc.response_xml,'snapshot',p_doc.snapshot) else '{}'::jsonb end $$;
create or replace function public.pro_einvoice_receiver_json(m public.pro_einvoice_receiver_messages,p_full boolean default false) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',m.id,'receivedClave',m.received_clave,'emisorIdType',m.emisor_id_type,'emisorId',m.emisor_id,'emisorName',m.emisor_name,'receivedIssuedAt',m.received_issued_at,
  'receivedTotalCents',m.received_total_cents,'receivedTaxCents',m.received_tax_cents,'messageCode',m.message_code,'docType',m.doc_type,'detail',m.detail,'taxCondition',m.tax_condition,
  'creditTaxCents',m.credit_tax_cents,'expenseCents',m.expense_cents,'activityCode',m.activity_code,'consecutivo',m.consecutivo,'mode',m.mode,'provider',m.provider,'status',m.status,
  'responseCode',m.response_code,'responseMessage',m.response_message,'attempts',m.attempts,'nextAttemptAt',m.next_attempt_at,'lastError',m.last_error,'hasXml',m.signed_xml is not null,'hasResponse',m.response_xml is not null,
  'createdAt',m.created_at,'updatedAt',m.updated_at,
  'events',coalesce((select jsonb_agg(jsonb_build_object('from',e.from_status,'to',e.to_status,'detail',e.detail,'at',e.created_at) order by e.id) from public.pro_einvoice_receiver_events e where e.owner_id=m.owner_id and e.message_id=m.id),'[]'),
  'responses',public.pro_einvoice_responses_json(m.owner_id,null,m.id))
  ||case when p_full then jsonb_build_object('xml',m.xml,'signedXml',m.signed_xml,'responseXml',m.response_xml) else '{}'::jsonb end $$;

-- Owner read for one draft (Round 6A shape); «credited» now counts credit notes only (a debit note adds, never credits).
create or replace function public.pro_einvoice_read(p_actor uuid,p_draft uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.pro_einvoice_settings;d public.pro_invoice_drafts;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into s from public.pro_einvoice_settings where owner_id=p_actor;
 if p_draft is null then return jsonb_build_object('settings',public.pro_einvoice_settings_json(s),'settingsRevision',coalesce(s.revision,0));end if;
 select * into d from public.pro_invoice_drafts where user_id=p_actor and id=p_draft;
 if not found then return null;end if;
 return jsonb_build_object('settings',public.pro_einvoice_settings_json(s),'settingsRevision',coalesce(s.revision,0),'draftRevision',d.revision,'draftTotalCents',d.total_cents,
  'documents',coalesce((select jsonb_agg(public.pro_einvoice_document_json(x) order by x.created_at desc,x.consecutivo desc) from public.pro_einvoice_documents x where x.owner_id=p_actor and x.draft_id=d.id),'[]'),
  'credited',coalesce((select jsonb_object_agg(o.id,(select coalesce(sum(n.total_cents),0) from public.pro_einvoice_documents n where n.owner_id=p_actor and n.reference_document_id=o.id and n.doc_type='03' and n.status<>'rechazado')) from public.pro_einvoice_documents o where o.owner_id=p_actor and o.draft_id=d.id and o.doc_type in('01','04')),'{}'),
  'debited',coalesce((select jsonb_object_agg(o.id,(select coalesce(sum(n.total_cents),0) from public.pro_einvoice_documents n where n.owner_id=p_actor and n.reference_document_id=o.id and n.doc_type='02' and n.status<>'rechazado')) from public.pro_einvoice_documents o where o.owner_id=p_actor and o.draft_id=d.id and o.doc_type in('01','04')),'{}'));
end $$;

-- Records one adapter call (inside the same transaction as the state change it caused).
create or replace function public.pro_einvoice_record_response(p_actor uuid,p_document uuid,p_message uuid,p_response jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_response is null or jsonb_typeof(p_response)<>'object' then return;end if;
 if jsonb_typeof(p_response->'attempt')<>'number' or (p_response->'httpStatus' is not null and jsonb_typeof(p_response->'httpStatus') not in('number','null')) then raise exception 'Invalid provider response' using errcode='22023';end if;
 insert into public.pro_einvoice_provider_responses(owner_id,document_id,receiver_message_id,provider,mode,operation,attempt,http_status,outcome,state,message,body_sha256)
 values(p_actor,p_document,p_message,p_response->>'provider',p_response->>'mode',p_response->>'operation',(p_response->>'attempt')::integer,(p_response->>'httpStatus')::integer,p_response->>'outcome',
  nullif(p_response->>'state',''),left(p_response->>'message',500),nullif(p_response->>'bodySha256',''));
end $$;

-- 6) Mutations for emitted documents (replaces the Round 6A function: + debit note, + procesando, + duplicate,
--    + provider and responses). Same receipts, lock, CAS and hints.
create or replace function public.pro_einvoice_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;receipt public.pro_einvoice_actions;h text:=md5(p_input::text);s public.pro_einvoice_settings;d public.pro_invoice_drafts;x public.pro_einvoice_documents;
 o public.pro_einvoice_documents;dtype text;num bigint;cons text;clave text;issued timestamptz;sec text;result jsonb;st text;credited bigint;prov text;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' then raise exception 'Invalid input' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Invalid action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-einvoice:'||p_actor::text,0));
 select * into receipt from public.pro_einvoice_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input_hash<>h then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;

 if act='save_settings' then
  select * into s from public.pro_einvoice_settings where owner_id=p_actor for update;
  if jsonb_typeof(p_input->'revision')<>'number' or (p_input->>'revision')::integer<>coalesce(s.revision,0) then raise exception 'Settings changed' using errcode='40001';end if;
  prov:=coalesce(nullif(p_input#>>'{settings,provider}',''),s.provider,'mock');
  insert into public.pro_einvoice_settings(owner_id,id_type,id_number,name,commercial_name,activity_code,province,canton,district,barrio,other_signs,phone,email,branch,terminal,provider_systems,provider,revision)
  values(p_actor,p_input#>>'{settings,idType}',p_input#>>'{settings,idNumber}',p_input#>>'{settings,name}',nullif(p_input#>>'{settings,commercialName}',''),p_input#>>'{settings,activityCode}',
   p_input#>>'{settings,province}',p_input#>>'{settings,canton}',p_input#>>'{settings,district}',nullif(p_input#>>'{settings,barrio}',''),p_input#>>'{settings,otherSigns}',nullif(p_input#>>'{settings,phone}',''),
   p_input#>>'{settings,email}',coalesce(p_input#>>'{settings,branch}','001'),coalesce(p_input#>>'{settings,terminal}','00001'),p_input#>>'{settings,providerSystems}',prov,1)
  on conflict(owner_id) do update set id_type=excluded.id_type,id_number=excluded.id_number,name=excluded.name,commercial_name=excluded.commercial_name,activity_code=excluded.activity_code,
   province=excluded.province,canton=excluded.canton,district=excluded.district,barrio=excluded.barrio,other_signs=excluded.other_signs,phone=excluded.phone,email=excluded.email,
   branch=excluded.branch,terminal=excluded.terminal,provider_systems=excluded.provider_systems,provider=excluded.provider,revision=pro_einvoice_settings.revision+1,updated_at=now()
  returning * into s;
  result:=jsonb_build_object('settings',public.pro_einvoice_settings_json(s),'settingsRevision',s.revision);

 elsif act='reserve' then
  dtype:=p_input->>'docType';
  if dtype not in('01','02','03','04') or p_input->>'mode' not in('mock','sandbox','production') or p_input->>'securityCode' !~ '^[0-9]{8}$' or jsonb_typeof(p_input->'snapshot')<>'object'
   or coalesce(p_input->>'provider','mock') not in('mock','hacienda-sandbox','gti') or (p_input->>'mode'='mock')<>(coalesce(p_input->>'provider','mock')='mock') then raise exception 'Invalid reservation' using errcode='22023';end if;
  select * into s from public.pro_einvoice_settings where owner_id=p_actor;
  if not found then raise exception 'Emisor settings missing' using errcode='22023',hint='pro_einvoice_settings';end if;
  if jsonb_typeof(p_input->'settingsRevision')<>'number' or (p_input->>'settingsRevision')::integer<>s.revision then raise exception 'Settings changed' using errcode='40001';end if;
  select * into d from public.pro_invoice_drafts where user_id=p_actor and id=(p_input->>'draftId')::uuid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if jsonb_typeof(p_input->'draftRevision')<>'number' or (p_input->>'draftRevision')::integer<>d.revision then raise exception 'Draft changed' using errcode='40001';end if;
  if exists(select 1 from public.pro_invoice_draft_management m where m.user_id=p_actor and m.draft_id=d.id and m.archived) then raise exception 'Archived draft' using errcode='22023',hint='pro_einvoice_archived';end if;
  if jsonb_typeof(p_input->'totalCents')<>'number' or jsonb_typeof(p_input->'taxCents')<>'number' then raise exception 'Invalid totals' using errcode='22023';end if;
  if dtype in('01','04') then
   if exists(select 1 from public.pro_einvoice_documents where owner_id=p_actor and draft_id=d.id and doc_type in('01','04') and status<>'rechazado') then raise exception 'Draft already emitted' using errcode='40001',hint='pro_einvoice_emitted';end if;
   if (p_input->>'totalCents')::bigint<>d.total_cents then raise exception 'Totals do not match the draft' using errcode='22023',hint='pro_einvoice_totals';end if;
  else
   select * into o from public.pro_einvoice_documents where owner_id=p_actor and id=(p_input->>'referenceDocumentId')::uuid and draft_id=d.id and doc_type in('01','04');
   if not found then raise exception 'Unknown original' using errcode='22023',hint='pro_einvoice_reference';end if;
   if o.status<>'aceptado' then raise exception 'Original not accepted' using errcode='22023',hint='pro_einvoice_reference_state';end if;
   if length(btrim(coalesce(p_input->>'referenceReason','')))<5 then raise exception 'Invalid reference' using errcode='22023';end if;
   if dtype='03' then
    if p_input->>'referenceCode' not in('01','02') then raise exception 'Invalid reference' using errcode='22023';end if;
    select coalesce(sum(total_cents),0) into credited from public.pro_einvoice_documents where owner_id=p_actor and reference_document_id=o.id and doc_type='03' and status<>'rechazado';
    if (p_input->>'totalCents')::bigint<1 or (p_input->>'totalCents')::bigint>o.total_cents-credited then raise exception 'Credit exceeds original' using errcode='22023',hint='pro_einvoice_credit_exceeds';end if;
    if p_input->>'referenceCode'='01' and (credited>0 or (p_input->>'totalCents')::bigint<>o.total_cents) then raise exception 'Full cancellation must credit the whole original' using errcode='22023',hint='pro_einvoice_credit_exceeds';end if;
   else
    -- Debit note: adds to the original (code 02 «Corrige monto»); never on a fully cancelled original.
    if p_input->>'referenceCode'<>'02' then raise exception 'Invalid reference' using errcode='22023';end if;
    if (p_input->>'totalCents')::bigint<1 then raise exception 'Invalid debit' using errcode='22023',hint='pro_einvoice_debit_amount';end if;
    if exists(select 1 from public.pro_einvoice_documents n where n.owner_id=p_actor and n.reference_document_id=o.id and n.doc_type='03' and n.reference_code='01' and n.status<>'rechazado') then
     raise exception 'Original was cancelled' using errcode='22023',hint='pro_einvoice_reference_cancelled';end if;
   end if;
  end if;
  insert into public.pro_einvoice_sequences(owner_id,branch,terminal,doc_type) values(p_actor,s.branch,s.terminal,dtype) on conflict do nothing;
  update public.pro_einvoice_sequences set last_number=case when last_number>=9999999999 then 1 else last_number+1 end where owner_id=p_actor and branch=s.branch and terminal=s.terminal and doc_type=dtype returning last_number into num;
  cons:=s.branch||s.terminal||dtype||lpad(num::text,10,'0');
  issued:=date_trunc('second',now());
  sec:=p_input->>'securityCode';
  clave:='506'||to_char(issued at time zone 'America/Costa_Rica','DDMMYY')||lpad(s.id_number,12,'0')||cons||'1'||sec;
  insert into public.pro_einvoice_documents(owner_id,id,draft_id,doc_type,mode,provider,clave,consecutivo,issued_at,total_cents,tax_cents,receiver_name,receiver_id_type,receiver_id,reference_document_id,reference_code,reference_reason,snapshot)
  values(p_actor,aid,d.id,dtype,p_input->>'mode',coalesce(p_input->>'provider','mock'),clave,cons,issued,(p_input->>'totalCents')::bigint,(p_input->>'taxCents')::bigint,nullif(p_input->>'receiverName',''),nullif(p_input->>'receiverIdType',''),nullif(p_input->>'receiverId',''),
   case when dtype in('02','03') then o.id end,case when dtype in('02','03') then p_input->>'referenceCode' end,case when dtype in('02','03') then btrim(p_input->>'referenceReason') end,p_input->'snapshot') returning * into x;
  result:=public.pro_einvoice_document_json(x)||jsonb_build_object('settings',public.pro_einvoice_settings_json(s));

 elsif act in('sign','submitted','status') then
  select * into x from public.pro_einvoice_documents where owner_id=p_actor and id=(p_input->>'documentId')::uuid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if act='sign' then
   if x.status<>'borrador' then raise exception 'Already signed' using errcode='40001';end if;
   if p_input->>'signer' not in('mock','p12') then raise exception 'Invalid signer' using errcode='22023';end if;
   if x.mode='mock' and p_input->>'signer'<>'mock' or x.mode<>'mock' and p_input->>'signer'<>'p12' then raise exception 'Signer does not match the mode' using errcode='22023';end if;
   update public.pro_einvoice_documents set status='firmado',xml=p_input->>'xml',xml_sha256=p_input->>'xmlSha256',signed_xml=p_input->>'signedXml',signed_sha256=p_input->>'signedSha256',signer=p_input->>'signer'
   where owner_id=p_actor and id=x.id returning * into x;
  elsif act='submitted' then
   if x.status not in('firmado','error') then raise exception 'Not ready to send' using errcode='40001';end if;
   if p_input->>'outcome' in('sent','duplicate') then
    update public.pro_einvoice_documents set status='enviado',attempts=attempts+1,next_attempt_at=null,last_error=null,response_message=coalesce(left(p_input->>'message',2000),response_message) where owner_id=p_actor and id=x.id returning * into x;
   elsif p_input->>'outcome'='error' then
    update public.pro_einvoice_documents set status='error',attempts=attempts+1,next_attempt_at=now()+public.pro_integration_retry_delay(attempts+1),last_error=left(coalesce(p_input->>'message','Error'),300) where owner_id=p_actor and id=x.id returning * into x;
   else raise exception 'Invalid outcome' using errcode='22023';end if;
   perform public.pro_einvoice_record_response(p_actor,x.id,null,p_input->'response');
  else
   st:=p_input->>'state';
   if st not in('recibido','procesando','aceptado','rechazado','error') then raise exception 'Invalid state' using errcode='22023';end if;
   if x.status not in('enviado','recibido','procesando','error') then raise exception 'Not sent' using errcode='40001';end if;
   if st in('aceptado','rechazado') and (p_input->>'responseXml' is null or (p_input->>'responseCode')::integer not in(1,2,3)) then raise exception 'Final state needs the response' using errcode='22023';end if;
   if st<>x.status then
    update public.pro_einvoice_documents set status=st,response_xml=case when st in('aceptado','rechazado') then p_input->>'responseXml' else response_xml end,
     response_code=case when st in('aceptado','rechazado') then (p_input->>'responseCode')::integer else response_code end,
     response_message=coalesce(left(p_input->>'message',2000),response_message),
     attempts=case when st='error' then attempts+1 else attempts end,
     next_attempt_at=case when st='error' then now()+public.pro_integration_retry_delay(attempts+1) else null end,
     last_error=case when st='error' then left(coalesce(p_input->>'message','Error'),300) else null end
    where owner_id=p_actor and id=x.id returning * into x;
   end if;
   perform public.pro_einvoice_record_response(p_actor,x.id,null,p_input->'response');
  end if;
  result:=public.pro_einvoice_document_json(x);
 else raise exception 'Invalid electronic invoice action' using errcode='22023';end if;
 insert into public.pro_einvoice_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,h,result);
 return result;
exception when check_violation then
 if sqlerrm like '%immutable%' or sqlerrm like '%transition%' or sqlerrm like '%final%' then raise;end if;
 raise exception 'Invalid electronic invoice data: %',sqlerrm using errcode='22023',hint='pro_einvoice_invalid';
end $$;

-- 7) Receiver messages: reserve (gapless 05/06/07), sign, submitted, status. Same receipts table and lock.
create or replace function public.pro_einvoice_receiver_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;receipt public.pro_einvoice_actions;h text:=md5(p_input::text);s public.pro_einvoice_settings;m public.pro_einvoice_receiver_messages;
 code text;dtype text;num bigint;result jsonb;st text;issued timestamptz;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' then raise exception 'Invalid input' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Invalid action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-einvoice:'||p_actor::text,0));
 select * into receipt from public.pro_einvoice_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input_hash<>h then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 if act='reserve' then
  code:=p_input->>'messageCode';
  if code not in('1','2','3') or p_input->>'mode' not in('mock','sandbox','production') or coalesce(p_input->>'provider','mock') not in('mock','hacienda-sandbox','gti')
   or (p_input->>'mode'='mock')<>(coalesce(p_input->>'provider','mock')='mock') then raise exception 'Invalid receiver message' using errcode='22023';end if;
  begin issued:=(p_input->>'receivedIssuedAt')::timestamptz;exception when others then raise exception 'Invalid issue date' using errcode='22023';end;
  if issued is null or issued>now()+interval '1 day' then raise exception 'Invalid issue date' using errcode='22023';end if;
  select * into s from public.pro_einvoice_settings where owner_id=p_actor;
  if not found then raise exception 'Emisor settings missing' using errcode='22023',hint='pro_einvoice_settings';end if;
  if exists(select 1 from public.pro_einvoice_receiver_messages where owner_id=p_actor and received_clave=p_input->>'receivedClave' and status<>'rechazado') then
   raise exception 'Already answered' using errcode='40001',hint='pro_einvoice_receiver_answered';end if;
  -- The received clave carries the supplier id (positions 10–21, left-padded): it must match the declared emisor.
  if substr(p_input->>'receivedClave',10,12)<>lpad(coalesce(p_input->>'emisorId',''),12,'0') then raise exception 'Clave does not match the supplier' using errcode='22023',hint='pro_einvoice_receiver_clave';end if;
  if lpad(coalesce(p_input->>'emisorId',''),12,'0')=lpad(s.id_number,12,'0') then raise exception 'Own document' using errcode='22023',hint='pro_einvoice_receiver_own';end if;
  dtype:=case code when '1' then '05' when '2' then '06' else '07' end;
  insert into public.pro_einvoice_sequences(owner_id,branch,terminal,doc_type) values(p_actor,s.branch,s.terminal,dtype) on conflict do nothing;
  update public.pro_einvoice_sequences set last_number=case when last_number>=9999999999 then 1 else last_number+1 end where owner_id=p_actor and branch=s.branch and terminal=s.terminal and doc_type=dtype returning last_number into num;
  insert into public.pro_einvoice_receiver_messages(owner_id,id,received_clave,emisor_id_type,emisor_id,emisor_name,received_issued_at,received_total_cents,received_tax_cents,message_code,doc_type,detail,tax_condition,credit_tax_cents,expense_cents,activity_code,consecutivo,mode,provider)
  values(p_actor,aid,p_input->>'receivedClave',p_input->>'emisorIdType',p_input->>'emisorId',btrim(p_input->>'emisorName'),issued,(p_input->>'receivedTotalCents')::bigint,(p_input->>'receivedTaxCents')::bigint,code,dtype,
   nullif(btrim(coalesce(p_input->>'detail','')),''),nullif(p_input->>'taxCondition',''),(p_input->>'creditTaxCents')::bigint,(p_input->>'expenseCents')::bigint,coalesce(nullif(p_input->>'activityCode',''),s.activity_code),
   s.branch||s.terminal||dtype||lpad(num::text,10,'0'),p_input->>'mode',coalesce(p_input->>'provider','mock')) returning * into m;
 elsif act in('sign','submitted','status') then
  select * into m from public.pro_einvoice_receiver_messages where owner_id=p_actor and id=(p_input->>'messageId')::uuid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if act='sign' then
   if m.status<>'borrador' then raise exception 'Already signed' using errcode='40001';end if;
   if m.mode='mock' and p_input->>'signer'<>'mock' or m.mode<>'mock' and p_input->>'signer'<>'p12' then raise exception 'Signer does not match the mode' using errcode='22023';end if;
   update public.pro_einvoice_receiver_messages set status='firmado',xml=p_input->>'xml',xml_sha256=p_input->>'xmlSha256',signed_xml=p_input->>'signedXml',signed_sha256=p_input->>'signedSha256',signer=p_input->>'signer'
   where owner_id=p_actor and id=m.id returning * into m;
  elsif act='submitted' then
   if m.status not in('firmado','error') then raise exception 'Not ready to send' using errcode='40001';end if;
   if p_input->>'outcome' in('sent','duplicate') then
    update public.pro_einvoice_receiver_messages set status='enviado',attempts=attempts+1,next_attempt_at=null,last_error=null,response_message=coalesce(left(p_input->>'message',2000),response_message) where owner_id=p_actor and id=m.id returning * into m;
   elsif p_input->>'outcome'='error' then
    update public.pro_einvoice_receiver_messages set status='error',attempts=attempts+1,next_attempt_at=now()+public.pro_integration_retry_delay(attempts+1),last_error=left(coalesce(p_input->>'message','Error'),300) where owner_id=p_actor and id=m.id returning * into m;
   else raise exception 'Invalid outcome' using errcode='22023';end if;
   perform public.pro_einvoice_record_response(p_actor,null,m.id,p_input->'response');
  else
   st:=p_input->>'state';
   if st not in('recibido','procesando','aceptado','rechazado','error') then raise exception 'Invalid state' using errcode='22023';end if;
   if m.status not in('enviado','recibido','procesando','error') then raise exception 'Not sent' using errcode='40001';end if;
   if st in('aceptado','rechazado') and (p_input->>'responseXml' is null or (p_input->>'responseCode')::integer not in(1,2,3)) then raise exception 'Final state needs the response' using errcode='22023';end if;
   if st<>m.status then
    update public.pro_einvoice_receiver_messages set status=st,response_xml=case when st in('aceptado','rechazado') then p_input->>'responseXml' else response_xml end,
     response_code=case when st in('aceptado','rechazado') then (p_input->>'responseCode')::integer else response_code end,response_message=coalesce(left(p_input->>'message',2000),response_message),
     attempts=case when st='error' then attempts+1 else attempts end,next_attempt_at=case when st='error' then now()+public.pro_integration_retry_delay(attempts+1) else null end,
     last_error=case when st='error' then left(coalesce(p_input->>'message','Error'),300) else null end
    where owner_id=p_actor and id=m.id returning * into m;
   end if;
   perform public.pro_einvoice_record_response(p_actor,null,m.id,p_input->'response');
  end if;
 else raise exception 'Invalid receiver message action' using errcode='22023';end if;
 result:=public.pro_einvoice_receiver_json(m);
 insert into public.pro_einvoice_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,h,result);
 return result;
exception when check_violation then
 if sqlerrm like '%immutable%' or sqlerrm like '%transition%' or sqlerrm like '%final%' then raise;end if;
 raise exception 'Invalid receiver message data: %',sqlerrm using errcode='22023',hint='pro_einvoice_invalid';
end $$;
create or replace function public.pro_einvoice_receiver_read(p_actor uuid,p_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare m public.pro_einvoice_receiver_messages;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_id is not null then
  select * into m from public.pro_einvoice_receiver_messages where owner_id=p_actor and id=p_id;
  if not found then return null;end if;
  return public.pro_einvoice_receiver_json(m,true);
 end if;
 return jsonb_build_object('messages',coalesce((select jsonb_agg(public.pro_einvoice_receiver_json(x) order by x.created_at desc) from public.pro_einvoice_receiver_messages x where x.owner_id=p_actor and x.created_at>=coalesce((select min(created_at) from (select created_at from public.pro_einvoice_receiver_messages where owner_id=p_actor order by created_at desc limit 100) z),'-infinity')),'[]'));
end $$;
-- Pending retries for the worker / «Reintentar pendientes» (due errors only, oldest first).
create or replace function public.pro_einvoice_due_retries(p_actor uuid,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('kind',k,'id',i,'attempts',a,'nextAttemptAt',n) order by n) from (
  select 'document' k,id i,attempts a,next_attempt_at n from public.pro_einvoice_documents where owner_id=p_actor and status='error' and next_attempt_at<=now()
  union all select 'receiver',id,attempts,next_attempt_at from public.pro_einvoice_receiver_messages where owner_id=p_actor and status='error' and next_attempt_at<=now()
  order by 4 limit least(greatest(coalesce(p_limit,20),1),100)) q),'[]');
end $$;

do $$declare n text;begin foreach n in array array['pro_einvoice_receiver_messages','pro_einvoice_receiver_events','pro_einvoice_provider_responses'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);
end loop;
 grant select,insert,update on public.pro_einvoice_receiver_messages to service_role;
 grant select,insert on public.pro_einvoice_receiver_events,public.pro_einvoice_provider_responses to service_role;
end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_einvoice\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text ~ '^pro_einvoice_(immutable|document_guard|document_event|draft_lock|receiver_guard|receiver_event)\(' then execute format('revoke all on function %s from service_role',f);
  else execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
