-- LOCAL PRO ONLY. Round 6A (2026-11-13): Hacienda electronic invoices (Costa Rica, v4.4) built from an
-- existing invoice DRAFT. Factura Electrónica (01), Nota de Crédito (03) referencing an accepted
-- original, Tiquete Electrónico (04). The draft stays an internal draft until a document is emitted;
-- emitted documents are immutable.
-- * Emisor settings per owner (identification, name, commercial name, economic activity, location
--   codes, branch/terminal, «proveedor de sistemas»), CAS by revision.
-- * Consecutivo (20 digits: branch 3 + terminal 5 + type 2 + number 10) allocated gapless per owner,
--   branch, terminal and type; clave (50 digits: 506 + DDMMYY in America/Costa_Rica + emisor id padded to
--   12 + consecutivo + situación 1 + 8-digit security code) composed HERE, so its format is enforced.
-- * State machine borrador → firmado → enviado → recibido → aceptado | rechazado, with error (retry with
--   backoff) — enforced by a trigger; XML, signed XML, totals, clave and snapshot are frozen once signed;
--   aceptado/rechazado are final; every transition is an immutable event.
-- * An emitted FE/TE (any state except rechazado) locks the draft content (hint pro_einvoice_emitted);
--   a rejected document frees it and the next emission takes a NEW consecutivo.
-- * Credit notes reference an ACCEPTED FE/TE of the same draft; the sum of active credit notes never
--   exceeds the original total.
-- No real call to Hacienda happens in SQL; the server adapter (mock by default) reports each step.
begin;

create table if not exists public.pro_einvoice_settings(
 owner_id uuid not null primary key references public.profiles(id) on delete cascade,
 id_type text not null check(id_type in('01','02','03','04')),
 id_number text not null,
 name text not null check(length(name) between 5 and 100),
 commercial_name text check(commercial_name is null or length(commercial_name) between 3 and 80),
 activity_code text not null check(activity_code ~ '^[0-9]{6}$'),
 province text not null check(province ~ '^[1-7]$'),canton text not null check(canton ~ '^[0-9]{2}$'),district text not null check(district ~ '^[0-9]{2}$'),
 barrio text check(barrio is null or length(barrio) between 5 and 50),
 other_signs text not null check(length(other_signs) between 5 and 250),
 phone text check(phone is null or phone ~ '^[0-9]{8,20}$'),
 email text not null check(length(email) between 3 and 160 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
 branch text not null default '001' check(branch ~ '^[0-9]{3}$' and branch<>'000'),
 terminal text not null default '00001' check(terminal ~ '^[0-9]{5}$' and terminal<>'00000'),
 provider_systems text not null check(length(provider_systems) between 9 and 20 and provider_systems ~ '^[A-Za-z0-9]+$'),
 revision integer not null default 1 check(revision>=1),
 updated_at timestamptz not null default now(),
 check(case id_type when '01' then id_number ~ '^[1-9][0-9]{8}$' when '02' then id_number ~ '^[A-Za-z0-9]{10}$' when '03' then id_number ~ '^[1-9][0-9]{10,11}$' else id_number ~ '^[0-9]{10}$' end)
);
create table if not exists public.pro_einvoice_sequences(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 branch text not null,terminal text not null,doc_type text not null check(doc_type in('01','03','04')),
 last_number bigint not null default 0 check(last_number between 0 and 9999999999),
 primary key(owner_id,branch,terminal,doc_type)
);
create table if not exists public.pro_einvoice_documents(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,draft_id uuid not null,
 doc_type text not null check(doc_type in('01','03','04')),
 mode text not null check(mode in('mock','sandbox','production')),
 clave text not null check(clave ~ '^506[0-9]{6}[A-Za-z0-9]{12}[0-9]{20}[123][0-9]{8}$'),
 consecutivo text not null check(consecutivo ~ '^[0-9]{3}[0-9]{5}(01|03|04)[0-9]{10}$'),
 issued_at timestamptz not null,
 status text not null default 'borrador' check(status in('borrador','firmado','enviado','recibido','aceptado','rechazado','error')),
 xml text,xml_sha256 text check(xml_sha256 is null or xml_sha256 ~ '^[a-f0-9]{64}$'),
 signed_xml text,signed_sha256 text check(signed_sha256 is null or signed_sha256 ~ '^[a-f0-9]{64}$'),
 signer text check(signer is null or signer in('mock','p12')),
 response_xml text,response_code integer check(response_code is null or response_code in(1,2,3)),
 response_message text check(response_message is null or length(response_message)<=2000),
 total_cents bigint not null check(total_cents between 0 and 10000000000),
 tax_cents bigint not null check(tax_cents between 0 and 10000000000),
 receiver_name text,receiver_id_type text,receiver_id text,
 reference_document_id uuid,reference_code text check(reference_code is null or reference_code in('01','02')),
 reference_reason text check(reference_reason is null or length(reference_reason) between 5 and 180),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=262144),
 attempts integer not null default 0 check(attempts between 0 and 100),
 next_attempt_at timestamptz,last_error text check(last_error is null or length(last_error)<=300),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,clave),unique(owner_id,consecutivo),
 foreign key(owner_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade,
 foreign key(owner_id,reference_document_id) references public.pro_einvoice_documents(owner_id,id),
 check((doc_type='03')=(reference_document_id is not null and reference_code is not null and reference_reason is not null)),
 check(substr(clave,22,20)=consecutivo),
 check(status='borrador' or xml is not null and signed_xml is not null and xml_sha256 is not null and signed_sha256 is not null and signer is not null),
 check(status not in('aceptado','rechazado') or response_code is not null)
);
create index if not exists pro_einvoice_documents_draft on public.pro_einvoice_documents(owner_id,draft_id,created_at desc);
create index if not exists pro_einvoice_documents_retry on public.pro_einvoice_documents(next_attempt_at) where status='error';
-- One live FE/TE per draft (rejected ones do not count: Hacienda considers them never issued).
create unique index if not exists pro_einvoice_documents_one_live on public.pro_einvoice_documents(owner_id,draft_id) where doc_type in('01','04') and status<>'rechazado';
create table if not exists public.pro_einvoice_events(
 owner_id uuid not null,document_id uuid not null,id bigint generated always as identity,
 from_status text,to_status text not null,detail jsonb not null default '{}',created_at timestamptz not null default now(),
 primary key(owner_id,document_id,id),foreign key(owner_id,document_id) references public.pro_einvoice_documents(owner_id,id) on delete cascade
);
create table if not exists public.pro_einvoice_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,action_id)
);

create or replace function public.pro_einvoice_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Electronic invoice events and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_einvoice_events_immutable on public.pro_einvoice_events;
create trigger pro_einvoice_events_immutable before update on public.pro_einvoice_events for each row execute function public.pro_einvoice_immutable();
drop trigger if exists pro_einvoice_actions_immutable on public.pro_einvoice_actions;
create trigger pro_einvoice_actions_immutable before update on public.pro_einvoice_actions for each row execute function public.pro_einvoice_immutable();

-- State machine + freeze. Transition table (anything else 23514):
--   borrador→firmado · firmado→enviado|error · enviado→recibido|aceptado|rechazado|error
--   recibido→aceptado|rechazado|error · error→enviado|recibido|aceptado|rechazado · aceptado/rechazado final.
create or replace function public.pro_einvoice_document_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.status in('aceptado','rechazado') then raise exception 'Emitted document is final and immutable' using errcode='23514';end if;
 if new.status<>old.status and not(
   old.status='borrador' and new.status='firmado' or old.status='firmado' and new.status in('enviado','error')
   or old.status='enviado' and new.status in('recibido','aceptado','rechazado','error') or old.status='recibido' and new.status in('aceptado','rechazado','error')
   or old.status='error' and new.status in('enviado','recibido','aceptado','rechazado')) then
  raise exception 'Invalid electronic invoice transition % → %',old.status,new.status using errcode='23514';
 end if;
 if new.owner_id<>old.owner_id or new.id<>old.id or new.draft_id<>old.draft_id or new.doc_type<>old.doc_type or new.mode<>old.mode or new.clave<>old.clave or new.consecutivo<>old.consecutivo
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
drop trigger if exists pro_einvoice_document_guard on public.pro_einvoice_documents;
create trigger pro_einvoice_document_guard before update on public.pro_einvoice_documents for each row execute function public.pro_einvoice_document_guard();
create or replace function public.pro_einvoice_document_event() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' or new.status<>old.status then
  insert into public.pro_einvoice_events(owner_id,document_id,from_status,to_status,detail) values(new.owner_id,new.id,case when tg_op='INSERT' then null else old.status end,new.status,
   jsonb_strip_nulls(jsonb_build_object('attempts',new.attempts,'error',case when new.status='error' then new.last_error end,'responseCode',new.response_code)));
 end if;
 return null;
end $$;
drop trigger if exists pro_einvoice_document_event on public.pro_einvoice_documents;
create trigger pro_einvoice_document_event after insert or update on public.pro_einvoice_documents for each row execute function public.pro_einvoice_document_event();

-- The draft remains an internal draft until emitted; once a live FE/TE exists its content is locked.
create or replace function public.pro_einvoice_draft_lock() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (to_jsonb(new)-'updated_at')<>(to_jsonb(old)-'updated_at') and exists(select 1 from public.pro_einvoice_documents d where d.owner_id=old.user_id and d.draft_id=old.id and d.doc_type in('01','04') and d.status<>'rechazado') then
  raise exception 'Draft already emitted as an electronic document' using errcode='22023',hint='pro_einvoice_emitted';
 end if;
 return new;
end $$;
drop trigger if exists pro_einvoice_draft_lock on public.pro_invoice_drafts;
create trigger pro_einvoice_draft_lock before update on public.pro_invoice_drafts for each row execute function public.pro_einvoice_draft_lock();

create or replace function public.pro_einvoice_settings_json(p_row public.pro_einvoice_settings) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_row.owner_id is null then null else jsonb_build_object('idType',p_row.id_type,'idNumber',p_row.id_number,'name',p_row.name,'commercialName',coalesce(p_row.commercial_name,''),
  'activityCode',p_row.activity_code,'province',p_row.province,'canton',p_row.canton,'district',p_row.district,'barrio',coalesce(p_row.barrio,''),'otherSigns',p_row.other_signs,
  'phone',coalesce(p_row.phone,''),'email',p_row.email,'branch',p_row.branch,'terminal',p_row.terminal,'providerSystems',p_row.provider_systems) end $$;

create or replace function public.pro_einvoice_document_json(p_doc public.pro_einvoice_documents,p_full boolean default false) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_doc.id,'draftId',p_doc.draft_id,'docType',p_doc.doc_type,'mode',p_doc.mode,'clave',p_doc.clave,'consecutivo',p_doc.consecutivo,'issuedAt',p_doc.issued_at,
  'status',p_doc.status,'responseCode',p_doc.response_code,'responseMessage',p_doc.response_message,'totalCents',p_doc.total_cents,'taxCents',p_doc.tax_cents,
  'receiverName',p_doc.receiver_name,'referenceDocumentId',p_doc.reference_document_id,'referenceCode',p_doc.reference_code,'referenceReason',p_doc.reference_reason,
  'attempts',p_doc.attempts,'nextAttemptAt',p_doc.next_attempt_at,'lastError',p_doc.last_error,'signer',p_doc.signer,'hasXml',p_doc.signed_xml is not null,'hasResponse',p_doc.response_xml is not null,
  'createdAt',p_doc.created_at,'updatedAt',p_doc.updated_at,
  'events',coalesce((select jsonb_agg(jsonb_build_object('from',e.from_status,'to',e.to_status,'detail',e.detail,'at',e.created_at) order by e.id) from public.pro_einvoice_events e where e.owner_id=p_doc.owner_id and e.document_id=p_doc.id),'[]'))
  ||case when p_full then jsonb_build_object('xml',p_doc.xml,'signedXml',p_doc.signed_xml,'responseXml',p_doc.response_xml,'snapshot',p_doc.snapshot) else '{}'::jsonb end $$;

-- Owner read for one draft: settings, documents (newest first) and the credit already noted per original.
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
  'documents',coalesce((select jsonb_agg(public.pro_einvoice_document_json(x) order by x.created_at desc) from public.pro_einvoice_documents x where x.owner_id=p_actor and x.draft_id=d.id),'[]'),
  'credited',coalesce((select jsonb_object_agg(o.id,(select coalesce(sum(n.total_cents),0) from public.pro_einvoice_documents n where n.owner_id=p_actor and n.reference_document_id=o.id and n.status<>'rechazado')) from public.pro_einvoice_documents o where o.owner_id=p_actor and o.draft_id=d.id and o.doc_type in('01','04')),'{}'));
end $$;
create or replace function public.pro_einvoice_document_read(p_actor uuid,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare x public.pro_einvoice_documents;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into x from public.pro_einvoice_documents where owner_id=p_actor and id=p_id;
 if not found then return null;end if;
 return public.pro_einvoice_document_json(x,true);
end $$;

create or replace function public.pro_einvoice_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;receipt public.pro_einvoice_actions;h text:=md5(p_input::text);s public.pro_einvoice_settings;d public.pro_invoice_drafts;x public.pro_einvoice_documents;
 o public.pro_einvoice_documents;dtype text;num bigint;cons text;clave text;issued timestamptz;sec text;result jsonb;st text;credited bigint;
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
  insert into public.pro_einvoice_settings(owner_id,id_type,id_number,name,commercial_name,activity_code,province,canton,district,barrio,other_signs,phone,email,branch,terminal,provider_systems,revision)
  values(p_actor,p_input#>>'{settings,idType}',p_input#>>'{settings,idNumber}',p_input#>>'{settings,name}',nullif(p_input#>>'{settings,commercialName}',''),p_input#>>'{settings,activityCode}',
   p_input#>>'{settings,province}',p_input#>>'{settings,canton}',p_input#>>'{settings,district}',nullif(p_input#>>'{settings,barrio}',''),p_input#>>'{settings,otherSigns}',nullif(p_input#>>'{settings,phone}',''),
   p_input#>>'{settings,email}',coalesce(p_input#>>'{settings,branch}','001'),coalesce(p_input#>>'{settings,terminal}','00001'),p_input#>>'{settings,providerSystems}',1)
  on conflict(owner_id) do update set id_type=excluded.id_type,id_number=excluded.id_number,name=excluded.name,commercial_name=excluded.commercial_name,activity_code=excluded.activity_code,
   province=excluded.province,canton=excluded.canton,district=excluded.district,barrio=excluded.barrio,other_signs=excluded.other_signs,phone=excluded.phone,email=excluded.email,
   branch=excluded.branch,terminal=excluded.terminal,provider_systems=excluded.provider_systems,revision=pro_einvoice_settings.revision+1,updated_at=now()
  returning * into s;
  result:=jsonb_build_object('settings',public.pro_einvoice_settings_json(s),'settingsRevision',s.revision);

 elsif act='reserve' then
  dtype:=p_input->>'docType';
  if dtype not in('01','03','04') or p_input->>'mode' not in('mock','sandbox','production') or p_input->>'securityCode' !~ '^[0-9]{8}$' or jsonb_typeof(p_input->'snapshot')<>'object' then raise exception 'Invalid reservation' using errcode='22023';end if;
  select * into s from public.pro_einvoice_settings where owner_id=p_actor;
  if not found then raise exception 'Emisor settings missing' using errcode='22023',hint='pro_einvoice_settings';end if;
  if jsonb_typeof(p_input->'settingsRevision')<>'number' or (p_input->>'settingsRevision')::integer<>s.revision then raise exception 'Settings changed' using errcode='40001';end if;
  select * into d from public.pro_invoice_drafts where user_id=p_actor and id=(p_input->>'draftId')::uuid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if jsonb_typeof(p_input->'draftRevision')<>'number' or (p_input->>'draftRevision')::integer<>d.revision then raise exception 'Draft changed' using errcode='40001';end if;
  if exists(select 1 from public.pro_invoice_draft_management m where m.user_id=p_actor and m.draft_id=d.id and m.archived) then raise exception 'Archived draft' using errcode='22023',hint='pro_einvoice_archived';end if;
  if dtype in('01','04') then
   if exists(select 1 from public.pro_einvoice_documents where owner_id=p_actor and draft_id=d.id and doc_type in('01','04') and status<>'rechazado') then raise exception 'Draft already emitted' using errcode='40001',hint='pro_einvoice_emitted';end if;
   if (p_input->>'totalCents')::bigint<>d.total_cents then raise exception 'Totals do not match the draft' using errcode='22023',hint='pro_einvoice_totals';end if;
  else
   select * into o from public.pro_einvoice_documents where owner_id=p_actor and id=(p_input->>'referenceDocumentId')::uuid and draft_id=d.id and doc_type in('01','04');
   if not found then raise exception 'Unknown original' using errcode='22023',hint='pro_einvoice_reference';end if;
   if o.status<>'aceptado' then raise exception 'Original not accepted' using errcode='22023',hint='pro_einvoice_reference_state';end if;
   if p_input->>'referenceCode' not in('01','02') or length(coalesce(p_input->>'referenceReason',''))<5 then raise exception 'Invalid reference' using errcode='22023';end if;
   select coalesce(sum(total_cents),0) into credited from public.pro_einvoice_documents where owner_id=p_actor and reference_document_id=o.id and status<>'rechazado';
   if (p_input->>'totalCents')::bigint<1 or (p_input->>'totalCents')::bigint>o.total_cents-credited then raise exception 'Credit exceeds original' using errcode='22023',hint='pro_einvoice_credit_exceeds';end if;
   if p_input->>'referenceCode'='01' and (credited>0 or (p_input->>'totalCents')::bigint<>o.total_cents) then raise exception 'Full cancellation must credit the whole original' using errcode='22023',hint='pro_einvoice_credit_exceeds';end if;
  end if;
  insert into public.pro_einvoice_sequences(owner_id,branch,terminal,doc_type) values(p_actor,s.branch,s.terminal,dtype) on conflict do nothing;
  update public.pro_einvoice_sequences set last_number=case when last_number>=9999999999 then 1 else last_number+1 end where owner_id=p_actor and branch=s.branch and terminal=s.terminal and doc_type=dtype returning last_number into num;
  cons:=s.branch||s.terminal||dtype||lpad(num::text,10,'0');
  issued:=date_trunc('second',now());
  sec:=p_input->>'securityCode';
  clave:='506'||to_char(issued at time zone 'America/Costa_Rica','DDMMYY')||lpad(s.id_number,12,'0')||cons||'1'||sec;
  insert into public.pro_einvoice_documents(owner_id,id,draft_id,doc_type,mode,clave,consecutivo,issued_at,total_cents,tax_cents,receiver_name,receiver_id_type,receiver_id,reference_document_id,reference_code,reference_reason,snapshot)
  values(p_actor,aid,d.id,dtype,p_input->>'mode',clave,cons,issued,(p_input->>'totalCents')::bigint,(p_input->>'taxCents')::bigint,nullif(p_input->>'receiverName',''),nullif(p_input->>'receiverIdType',''),nullif(p_input->>'receiverId',''),
   case when dtype='03' then o.id end,case when dtype='03' then p_input->>'referenceCode' end,case when dtype='03' then p_input->>'referenceReason' end,p_input->'snapshot') returning * into x;
  result:=public.pro_einvoice_document_json(x)||jsonb_build_object('settings',public.pro_einvoice_settings_json(s));

 elsif act in('sign','submitted','status') then
  select * into x from public.pro_einvoice_documents where owner_id=p_actor and id=(p_input->>'documentId')::uuid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if act='sign' then
   if x.status<>'borrador' then raise exception 'Already signed' using errcode='40001';end if;
   if p_input->>'signer' not in('mock','p12') then raise exception 'Invalid signer' using errcode='22023';end if;
   update public.pro_einvoice_documents set status='firmado',xml=p_input->>'xml',xml_sha256=p_input->>'xmlSha256',signed_xml=p_input->>'signedXml',signed_sha256=p_input->>'signedSha256',signer=p_input->>'signer'
   where owner_id=p_actor and id=x.id returning * into x;
  elsif act='submitted' then
   if x.status not in('firmado','error') then raise exception 'Not ready to send' using errcode='40001';end if;
   if p_input->>'outcome'='sent' then
    update public.pro_einvoice_documents set status='enviado',attempts=attempts+1,next_attempt_at=null,last_error=null where owner_id=p_actor and id=x.id returning * into x;
   elsif p_input->>'outcome'='error' then
    update public.pro_einvoice_documents set status='error',attempts=attempts+1,next_attempt_at=now()+public.pro_integration_retry_delay(attempts+1),last_error=left(coalesce(p_input->>'message','Error'),300) where owner_id=p_actor and id=x.id returning * into x;
   else raise exception 'Invalid outcome' using errcode='22023';end if;
  else
   st:=p_input->>'state';
   if st not in('recibido','procesando','aceptado','rechazado','error') then raise exception 'Invalid state' using errcode='22023';end if;
   if x.status not in('enviado','recibido','error') then raise exception 'Not sent' using errcode='40001';end if;
   if st='procesando' then st:='recibido';end if;
   if st in('aceptado','rechazado') and (p_input->>'responseXml' is null or (p_input->>'responseCode')::integer not in(1,2,3)) then raise exception 'Final state needs the response' using errcode='22023';end if;
   if st=x.status then
    result:=public.pro_einvoice_document_json(x);
   else
    update public.pro_einvoice_documents set status=st,response_xml=case when st in('aceptado','rechazado') then p_input->>'responseXml' else response_xml end,
     response_code=case when st in('aceptado','rechazado') then (p_input->>'responseCode')::integer else response_code end,
     response_message=coalesce(left(p_input->>'message',2000),response_message),
     attempts=case when st='error' then attempts+1 else attempts end,
     next_attempt_at=case when st='error' then now()+public.pro_integration_retry_delay(attempts+1) else null end,
     last_error=case when st='error' then left(coalesce(p_input->>'message','Error'),300) else null end
    where owner_id=p_actor and id=x.id returning * into x;
   end if;
  end if;
  result:=public.pro_einvoice_document_json(x);
 else raise exception 'Invalid electronic invoice action' using errcode='22023';end if;
 insert into public.pro_einvoice_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,h,result);
 return result;
exception when check_violation then
 if sqlerrm like '%immutable%' or sqlerrm like '%transition%' or sqlerrm like '%final%' then raise;end if;
 raise exception 'Invalid electronic invoice data: %',sqlerrm using errcode='22023',hint='pro_einvoice_invalid';
end $$;

do $$declare n text;begin foreach n in array array['pro_einvoice_settings','pro_einvoice_sequences','pro_einvoice_documents','pro_einvoice_events','pro_einvoice_actions'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_einvoice\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_einvoice_immutable(%' and f::text not like 'pro_einvoice_document_guard(%' and f::text not like 'pro_einvoice_document_event(%' and f::text not like 'pro_einvoice_draft_lock(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
