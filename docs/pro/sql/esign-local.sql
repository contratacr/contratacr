-- LOCAL PRO ONLY. Round 6B (2026-11-13): electronic signature requests (Houzz parity row 41).
-- * A request freezes ONE shared document: a contract version, a quote publication or a proposed/accepted
--   change order. Snapshot + SHA-256 are copied at creation and never change.
-- * State machine: created → sent → viewed → signed | declined | expired | cancelled (created/sent/viewed can
--   be cancelled; created → error → sent on retry). Finals are immutable. Events are append-only.
-- * Provider status arrives ONLY through the 6A webhook inbox (pro_integration_webhooks, provider 'esign'),
--   idempotent by event id; pro_esign_event_apply maps each event once and ignores out-of-order ones.
-- * «signed» stores the signed PDF and the audit certificate (bytea + SHA-256) in the same transaction;
--   artifacts can never be updated, and only the account-deletion cascade can remove them.
-- * The existing authenticated acceptance (contracts / quotes / change orders) is untouched: it stays the
--   fallback when no electronic signature is used.
-- Tables: RLS on, service_role only; functions security invoker, executable by service_role only.
begin;

create table if not exists public.pro_esign_requests(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 document_kind text not null check(document_kind in('contract','quote','work_change')),
 document_id uuid not null,
 document_label text not null check(length(document_label) between 1 and 200),
 document_hash text not null check(document_hash~'^[a-f0-9]{64}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=262144),
 signer_name text not null check(length(btrim(signer_name)) between 2 and 160),
 signer_email text not null check(length(signer_email)<=254 and signer_email~'^[^@\s]+@[^@\s]+\.[^@\s]+$'),
 language text not null default 'es' check(language in('es','en')),
 mode text not null check(mode in('mock','sandbox','production')),
 envelope_id text check(envelope_id is null or length(envelope_id) between 6 and 120),
 signer_token_hash text check(signer_token_hash is null or signer_token_hash~'^[a-f0-9]{64}$'),
 status text not null default 'created' check(status in('created','sent','viewed','signed','declined','expired','cancelled','error')),
 expires_at timestamptz not null,
 sent_at timestamptz,viewed_at timestamptz,completed_at timestamptz,
 decline_reason text check(decline_reason is null or length(decline_reason) between 1 and 500),
 last_error text check(last_error is null or length(last_error)<=300),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),
 check(status in('created','error','cancelled') or envelope_id is not null),
 check(status<>'declined' or decline_reason is not null),
 check((status in('signed','declined','expired','cancelled'))=(completed_at is not null))
);
create unique index if not exists pro_esign_requests_global on public.pro_esign_requests(id);
create unique index if not exists pro_esign_requests_envelope on public.pro_esign_requests(mode,envelope_id) where envelope_id is not null;
create unique index if not exists pro_esign_requests_token on public.pro_esign_requests(signer_token_hash) where signer_token_hash is not null;
-- One live request per document (a new one can be sent once the previous one ended).
create unique index if not exists pro_esign_requests_live on public.pro_esign_requests(owner_id,document_kind,document_id) where status in('created','sent','viewed','error');
create index if not exists pro_esign_requests_document on public.pro_esign_requests(owner_id,document_kind,document_id,created_at desc);

create table if not exists public.pro_esign_events(
 owner_id uuid not null,request_id uuid not null,seq integer not null check(seq>0),
 status text not null check(status in('created','sent','viewed','signed','declined','expired','cancelled','error')),
 source text not null check(source in('owner','provider','system')),
 webhook_id uuid,detail jsonb not null default '{}' check(octet_length(detail::text)<=4096 and public.pro_integration_config_safe(detail)),
 at timestamptz not null default clock_timestamp(),
 primary key(owner_id,request_id,seq),foreign key(owner_id,request_id) references public.pro_esign_requests(owner_id,id) on delete cascade
);
create table if not exists public.pro_esign_artifacts(
 owner_id uuid not null,request_id uuid not null,
 kind text not null check(kind in('signed_pdf','certificate')),
 content bytea not null check(octet_length(content) between 64 and 10485760),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,request_id,kind),foreign key(owner_id,request_id) references public.pro_esign_requests(owner_id,id) on delete cascade,
 check(sha256=encode(sha256(content),'hex'))
);
create table if not exists public.pro_esign_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,action_id)
);

-- Append-only rows: never updated; deleted only by the account-deletion cascade (owner profile gone).
create or replace function public.pro_esign_append_only() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then raise exception 'Signature evidence is immutable' using errcode='23514';end if;
 if exists(select 1 from public.profiles where id=old.owner_id) then raise exception 'Signature evidence is immutable' using errcode='23514';end if;
 return old;
end $$;
do $$declare n text;begin foreach n in array array['pro_esign_events','pro_esign_artifacts','pro_esign_actions'] loop
 execute format('drop trigger if exists pro_esign_append_only on public.%I',n);
 execute format('create trigger pro_esign_append_only before update or delete on public.%I for each row execute function public.pro_esign_append_only()',n);
end loop;end $$;

create or replace function public.pro_esign_transition_ok(p_from text,p_to text) returns boolean
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_from
  when 'created' then p_to in('sent','error','cancelled')
  when 'error' then p_to in('sent','error','cancelled')
  when 'sent' then p_to in('viewed','signed','declined','expired','cancelled')
  when 'viewed' then p_to in('signed','declined','expired','cancelled')
  else false end $$;
-- Identity, snapshot and signer never change; status only follows the machine; finals are frozen;
-- «signed» needs both artifacts already stored in this transaction.
create or replace function public.pro_esign_request_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.owner_id<>old.owner_id or new.id<>old.id or new.document_kind<>old.document_kind or new.document_id<>old.document_id or new.document_hash<>old.document_hash
  or new.snapshot<>old.snapshot or new.signer_name<>old.signer_name or new.signer_email<>old.signer_email or new.mode<>old.mode or new.created_at<>old.created_at
  or old.envelope_id is not null and new.envelope_id is distinct from old.envelope_id then raise exception 'Signature request identity is immutable' using errcode='23514';end if;
 if new.status<>old.status and not public.pro_esign_transition_ok(old.status,new.status) then raise exception 'Invalid signature transition % -> %',old.status,new.status using errcode='23514';end if;
 if new.status=old.status and old.status in('signed','declined','expired','cancelled') then raise exception 'Signature request is final' using errcode='23514';end if;
 if new.status='signed' and (select count(*) from public.pro_esign_artifacts where owner_id=new.owner_id and request_id=new.id)<>2 then raise exception 'Signed requests need the signed PDF and the certificate' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_esign_request_guard on public.pro_esign_requests;
create trigger pro_esign_request_guard before update on public.pro_esign_requests for each row execute function public.pro_esign_request_guard();
create or replace function public.pro_esign_request_no_delete() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin if exists(select 1 from public.profiles where id=old.owner_id) then raise exception 'Signature requests are kept' using errcode='23514';end if;return old;end $$;
drop trigger if exists pro_esign_request_no_delete on public.pro_esign_requests;
create trigger pro_esign_request_no_delete before delete on public.pro_esign_requests for each row execute function public.pro_esign_request_no_delete();

create or replace function public.pro_esign_log(p_owner uuid,p_request uuid,p_status text,p_source text,p_webhook uuid,p_detail jsonb) returns void
language sql security invoker set search_path=public,pg_temp as $$
 insert into public.pro_esign_events(owner_id,request_id,seq,status,source,webhook_id,detail)
 values(p_owner,p_request,coalesce((select max(seq) from public.pro_esign_events where owner_id=p_owner and request_id=p_request),0)+1,p_status,p_source,p_webhook,coalesce(p_detail,'{}')) $$;

-- Frozen document of one signable object (owner only). Raises 22023 with hint pro_esign_not_signable.
create or replace function public.pro_esign_document(p_actor uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare c public.pro_contracts;v public.pro_contract_versions;pub public.pro_private_estimate_publications;st text;ch public.pro_work_changes;w public.pro_work;cl public.pro_clients;content jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_kind='contract' then
  select * into c from public.pro_contracts where owner_id=p_actor and id=p_id;
  if not found then raise exception 'Document unavailable' using errcode='P0002';end if;
  if c.status not in('shared','accepted') or c.latest_version is null then raise exception 'Contract must be shared' using errcode='22023',hint='pro_esign_not_signable';end if;
  select * into v from public.pro_contract_versions where owner_id=p_actor and contract_id=c.id and version=c.latest_version;
  select * into w from public.pro_work where user_id=p_actor and id=c.work_id;
  select * into cl from public.pro_clients where user_id=p_actor and id=w."clientId";
  return jsonb_build_object('kind','contract','documentId',c.id,'label',left((v.content->>'code')||' · '||(v.content->>'title'),200),'title',v.content->>'title','version',v.version,
   'clientName',coalesce(v.recipient_name,cl.name),'clientEmail',coalesce(cl.email,''),'language',c.language,'currency',coalesce(v.content->'estimate'->>'currency','CRC'),
   'totalCents',(v.content->'estimate'->>'totalCents')::bigint,'content',v.content,'contentHash',v.content_hash);
 elsif p_kind='quote' then
  select * into pub from public.pro_private_estimate_publications where owner_id=p_actor and id=p_id;
  if not found then raise exception 'Document unavailable' using errcode='P0002';end if;
  select status into st from public.pro_private_estimate_publication_states where publication_id=pub.id;
  if st not in('awaiting_claim','shared','changes_requested','accepted') then raise exception 'Quote must be shared' using errcode='22023',hint='pro_esign_not_signable';end if;
  select * into cl from public.pro_clients where user_id=p_actor and id=pub.client_id;
  return jsonb_build_object('kind','quote','documentId',pub.id,'label',left('COT-'||upper(left(pub.estimate_id::text,8))||' v'||pub.version||' · '||(pub.content->>'title'),200),'title',pub.content->>'title','version',pub.version,
   'clientName',coalesce(pub.content->'customer'->>'name',cl.name),'clientEmail',coalesce(cl.email,''),'language','es','currency',coalesce(pub.content->>'currency','CRC'),
   'totalCents',(pub.content->>'totalCents')::bigint,'content',pub.content,'contentHash',pub.content_hash);
 elsif p_kind='work_change' then
  select * into ch from public.pro_work_changes where owner_id=p_actor and id=p_id;
  if not found then raise exception 'Document unavailable' using errcode='P0002';end if;
  if ch.status not in('proposed','accepted') then raise exception 'Change must be proposed' using errcode='22023',hint='pro_esign_not_signable';end if;
  select * into w from public.pro_work where user_id=p_actor and id=ch.work_id;
  select * into cl from public.pro_clients where user_id=p_actor and id=w."clientId";
  content:=jsonb_build_object('reason',ch.reason,'lines',ch.lines,'baseCents',ch.base_cents,'deltaCents',ch.delta_cents,'totalCents',ch.total_cents,'project',w.service,'proposedAt',ch.created_at);
  return jsonb_build_object('kind','work_change','documentId',ch.id,'label',left('CAMBIO · '||ch.reason,200),'title',ch.reason,'version',ch.revision,
   'clientName',coalesce(cl.name,w.client),'clientEmail',coalesce(cl.email,''),'language','es','currency','CRC','totalCents',ch.total_cents,'content',content,
   'contentHash',encode(sha256(convert_to(content::text,'UTF8')),'hex'));
 end if;
 raise exception 'Invalid document kind' using errcode='22023';
end $$;

create or replace function public.pro_esign_json(r public.pro_esign_requests) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'documentKind',r.document_kind,'documentId',r.document_id,'documentLabel',r.document_label,'documentHash',r.document_hash,
  'signerName',r.signer_name,'signerEmail',r.signer_email,'language',r.language,'mode',r.mode,'envelopeId',r.envelope_id,'status',r.status,'expiresAt',r.expires_at,
  'sentAt',r.sent_at,'viewedAt',r.viewed_at,'completedAt',r.completed_at,'declineReason',r.decline_reason,'lastError',r.last_error,'revision',r.revision,'createdAt',r.created_at,
  'events',coalesce((select jsonb_agg(jsonb_build_object('seq',e.seq,'status',e.status,'source',e.source,'detail',e.detail,'at',e.at) order by e.seq) from public.pro_esign_events e where e.owner_id=r.owner_id and e.request_id=r.id),'[]'),
  'artifacts',coalesce((select jsonb_agg(jsonb_build_object('kind',a.kind,'sha256',a.sha256,'bytes',octet_length(a.content),'createdAt',a.created_at) order by a.kind) from public.pro_esign_artifacts a where a.owner_id=r.owner_id and a.request_id=r.id),'[]')) $$;

-- Requests past their deadline expire (system event). Called before every owner read.
create or replace function public.pro_esign_expire_due(p_actor uuid) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.pro_esign_requests;n integer:=0;
begin
 for r in select * from public.pro_esign_requests where owner_id=p_actor and status in('sent','viewed') and expires_at<=now() for update skip locked loop
  update public.pro_esign_requests set status='expired',completed_at=now(),revision=revision+1,updated_at=now() where owner_id=r.owner_id and id=r.id;
  perform public.pro_esign_log(r.owner_id,r.id,'expired','system',null,jsonb_build_object('expiresAt',r.expires_at));n:=n+1;
 end loop;
 return n;
end $$;

create or replace function public.pro_esign_read(p_actor uuid,p_kind text,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare doc jsonb;blocked text;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 perform public.pro_esign_expire_due(p_actor);
 begin doc:=public.pro_esign_document(p_actor,p_kind,p_id)-'content';
 exception when sqlstate '22023' then blocked:='not_signable';doc:=null;end;
 return jsonb_build_object('document',doc,'blocked',blocked,
  'requests',coalesce((select jsonb_agg(public.pro_esign_json(r) order by r.created_at desc) from public.pro_esign_requests r where r.owner_id=p_actor and r.document_kind=p_kind and r.document_id=p_id),'[]'));
end $$;

-- create: freezes the document now (owner-confirmed signer), idempotent by actionId.
create or replace function public.pro_esign_create(p_actor uuid,p_input jsonb,p_mode text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.pro_esign_actions;doc jsonb;rid uuid;r public.pro_esign_requests;days integer;result jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or p_input->>'action'<>'create' or p_mode not in('mock','sandbox','production') then raise exception 'Invalid signature action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'documentId')::uuid;exception when others then raise exception 'Invalid ids' using errcode='22023';end;
 if aid is null or rid is null then raise exception 'Invalid ids' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-esign:'||p_actor::text,0));
 select * into receipt from public.pro_esign_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 days:=coalesce((p_input->>'expiryDays')::integer,14);
 if days not between 1 and 60 then raise exception 'Invalid expiry' using errcode='22023';end if;
 doc:=public.pro_esign_document(p_actor,p_input->>'documentKind',rid);
 if exists(select 1 from public.pro_esign_requests where owner_id=p_actor and document_kind=doc->>'kind' and document_id=rid and status in('created','sent','viewed','error')) then
  raise exception 'A signature request is already open for this document' using errcode='23505',hint='pro_esign_open';end if;
 insert into public.pro_esign_requests(owner_id,id,document_kind,document_id,document_label,document_hash,snapshot,signer_name,signer_email,language,mode,expires_at)
 values(p_actor,gen_random_uuid(),doc->>'kind',rid,doc->>'label',doc->>'contentHash',doc,btrim(p_input->>'signerName'),lower(btrim(p_input->>'signerEmail')),
  case when p_input->>'language' in('es','en') then p_input->>'language' else coalesce(doc->>'language','es') end,p_mode,now()+make_interval(days=>days)) returning * into r;
 -- The hash lives on the request row; event details stay free of long digit runs (redaction guard).
 perform public.pro_esign_log(p_actor,r.id,'created','owner',null,jsonb_build_object('mode',p_mode));
 result:=public.pro_esign_json(r)||jsonb_build_object('snapshot',r.snapshot);
 insert into public.pro_esign_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,jsonb_build_object('id',r.id));
 return result;
exception when check_violation then raise exception 'Invalid signer' using errcode='22023';
end $$;

-- The server reports the provider call (send). ok → sent with envelope id; failure → error (retryable).
create or replace function public.pro_esign_mark_sent(p_actor uuid,p_id uuid,p_ok boolean,p_envelope text,p_token_hash text,p_error text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.pro_esign_requests;
begin
 select * into r from public.pro_esign_requests where owner_id=p_actor and id=p_id for update;
 if not found then raise exception 'Unknown request' using errcode='P0002';end if;
 if r.status not in('created','error') then return public.pro_esign_json(r);end if;
 if p_ok then
  update public.pro_esign_requests set status='sent',envelope_id=p_envelope,signer_token_hash=p_token_hash,sent_at=now(),last_error=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=p_id returning * into r;
  perform public.pro_esign_log(p_actor,p_id,'sent','owner',null,jsonb_build_object('envelopeId',p_envelope));
 else
  update public.pro_esign_requests set status='error',last_error=left(coalesce(p_error,'error'),300),revision=revision+1,updated_at=now() where owner_id=p_actor and id=p_id returning * into r;
  perform public.pro_esign_log(p_actor,p_id,'error','system',null,jsonb_build_object('error',left(coalesce(p_error,'error'),200)));
 end if;
 return public.pro_esign_json(r);
end $$;

create or replace function public.pro_esign_cancel(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;rid uuid;receipt public.pro_esign_actions;r public.pro_esign_requests;result jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 begin aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid ids' using errcode='22023';end;
 if aid is null or rid is null or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid cancel' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-esign:'||p_actor::text,0));
 select * into receipt from public.pro_esign_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 select * into r from public.pro_esign_requests where owner_id=p_actor and id=rid for update;
 if not found then raise exception 'Unknown request' using errcode='P0002';end if;
 if r.revision<>(p_input->>'revision')::integer then raise exception 'Signature request changed' using errcode='40001';end if;
 if r.status not in('created','sent','viewed','error') then raise exception 'Signature request is final' using errcode='22023',hint='pro_esign_final';end if;
 update public.pro_esign_requests set status='cancelled',completed_at=now(),revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
 perform public.pro_esign_log(p_actor,rid,'cancelled','owner',null,'{}');
 result:=public.pro_esign_json(r);
 insert into public.pro_esign_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,jsonb_build_object('id',r.id,'status',r.status));
 return result;
end $$;

-- Request behind a provider envelope (webhook routing; also tells the server which mode/owner it belongs to).
create or replace function public.pro_esign_by_envelope(p_mode text,p_envelope text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('ownerId',owner_id,'id',id,'status',status,'mode',mode,'snapshot',snapshot,'signerName',signer_name,'signerEmail',signer_email,'language',language,
  'documentHash',document_hash,'createdAt',created_at,'sentAt',sent_at,'viewedAt',viewed_at,'expiresAt',expires_at,'envelopeId',envelope_id)
 from public.pro_esign_requests where mode=p_mode and envelope_id=p_envelope $$;
-- Mock signer page: only mock-mode requests, by the hash of the one-time signer link.
create or replace function public.pro_esign_signer_view(p_token_hash text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('envelopeId',envelope_id,'status',status,'label',document_label,'documentHash',document_hash,'signerName',signer_name,'language',language,'expiresAt',expires_at,
  'title',snapshot->>'title','totalCents',snapshot->'totalCents','currency',snapshot->>'currency','content',snapshot->'content','kind',document_kind)
 from public.pro_esign_requests where signer_token_hash=p_token_hash and mode='mock' $$;

-- Applies one inbox event. Payload: {envelopeId, status: sent|delivered|completed|declined|voided|expired, reason?, at}.
-- completed needs p_pdf and p_certificate (fetched by the server from the provider) and stores them first.
create or replace function public.pro_esign_event_apply(p_webhook uuid,p_pdf bytea default null,p_certificate bytea default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wh public.pro_integration_webhooks;r public.pro_esign_requests;target text;ps text;
begin
 select * into wh from public.pro_integration_webhooks where id=p_webhook and provider='esign' for update;
 if not found then raise exception 'Unknown webhook' using errcode='22023';end if;
 if wh.status in('processed','ignored') then return jsonb_build_object('status',wh.status,'duplicate',true,'review',wh.last_error);end if;
 select * into r from public.pro_esign_requests where mode=wh.mode and envelope_id=wh.payload->>'envelopeId' for update;
 if not found then
  update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='unknown_envelope' where id=wh.id;
  return jsonb_build_object('status','ignored','duplicate',false,'review','unknown_envelope');
 end if;
 if wh.owner_id is null then update public.pro_integration_webhooks set owner_id=r.owner_id where id=wh.id;end if;
 ps:=wh.payload->>'status';
 target:=case ps when 'delivered' then 'viewed' when 'completed' then 'signed' when 'declined' then 'declined' when 'voided' then 'cancelled' when 'expired' then 'expired' when 'sent' then 'sent' else null end;
 if target is null then
  update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='unknown_status' where id=wh.id;
  return jsonb_build_object('status','ignored','duplicate',false,'review','unknown_status');
 end if;
 if r.status=target then
  update public.pro_integration_webhooks set status='processed',processed_at=now(),last_error='already_applied' where id=wh.id;
  return jsonb_build_object('status','processed','duplicate',true,'review',null,'request',r.id);
 end if;
 if not public.pro_esign_transition_ok(r.status,target) then
  update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error=left('out_of_order_'||r.status||'_'||target,300) where id=wh.id;
  return jsonb_build_object('status','ignored','duplicate',false,'review','out_of_order','request',r.id);
 end if;
 if target='signed' then
  if p_pdf is null or p_certificate is null then raise exception 'Completed envelope without documents' using errcode='22023',hint='pro_esign_documents_missing';end if;
  insert into public.pro_esign_artifacts(owner_id,request_id,kind,content,sha256) values
   (r.owner_id,r.id,'signed_pdf',p_pdf,encode(sha256(p_pdf),'hex')),(r.owner_id,r.id,'certificate',p_certificate,encode(sha256(p_certificate),'hex'));
 end if;
 update public.pro_esign_requests set status=target,
  viewed_at=case when target='viewed' then coalesce(viewed_at,now()) else viewed_at end,
  completed_at=case when target in('signed','declined','expired','cancelled') then now() else completed_at end,
  decline_reason=case when target='declined' then left(coalesce(nullif(btrim(wh.payload->>'reason'),''),'Sin motivo'),500) else decline_reason end,
  revision=revision+1,updated_at=now() where owner_id=r.owner_id and id=r.id returning * into r;
 perform public.pro_esign_log(r.owner_id,r.id,target,'provider',wh.id,jsonb_build_object('event',wh.event_id,'providerStatus',ps));
 update public.pro_integration_webhooks set status='processed',processed_at=now() where id=wh.id;
 return jsonb_build_object('status','processed','duplicate',false,'review',null,'request',r.id,'requestStatus',r.status);
end $$;

create or replace function public.pro_esign_artifact(p_actor uuid,p_id uuid,p_kind text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare a public.pro_esign_artifacts;r public.pro_esign_requests;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_esign_requests where owner_id=p_actor and id=p_id;
 if not found then raise exception 'Unknown request' using errcode='P0002';end if;
 select * into a from public.pro_esign_artifacts where owner_id=p_actor and request_id=p_id and kind=p_kind;
 if not found then raise exception 'Artifact unavailable' using errcode='P0002';end if;
 return jsonb_build_object('base64',encode(a.content,'base64'),'sha256',a.sha256,'label',r.document_label,'mode',r.mode);
end $$;

do $$declare n text;begin foreach n in array array['pro_esign_requests','pro_esign_events','pro_esign_artifacts','pro_esign_actions'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_esign\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_esign_append_only(%' and f::text not like 'pro_esign_request_guard(%' and f::text not like 'pro_esign_request_no_delete(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
