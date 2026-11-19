-- LOCAL PRO ONLY. Round 6A (2026-11-13): online payments — payment links for an invoice draft or a
-- payment-plan installment, a hosted page in ContrataCR (/pagar#enlace=…), card and SINPE Móvil through
-- a processor ADAPTER (deterministic local mock by default; a sandbox skeleton activates only with env keys).
-- * A link stores only the SHA-256 of a random token (the token travels in the URL fragment). Amount is
--   fixed at creation: what is still due on the draft (total − applied − credit notes) or on the
--   installment, never above the job balance. One active link per invoice draft / installment.
-- * Attempts never store a card number or CVC (last 4 digits only) — state guarded by a trigger.
-- * The processor's webhook event (inbox of integrations-local.sql, idempotent by event id) creates the
--   ledger payment in pro_client_entries EXACTLY ONCE (deterministic ledger id from provider+event id,
--   unique (provider,event_id) and (attempt,kind) in pro_payment_transactions), through the existing
--   writers: pro_invoice_payment_mutate (invoice: ledger payment + application) or
--   pro_record_client_operation (installment: ledger payment the plan applies oldest-first).
-- * A refund creates the ledger REVERSAL (payment_void) exactly once; nothing is deleted.
-- * Anything that cannot be booked (balance changed, link no longer active, amount mismatch) is kept as
--   a reconciliation EXCEPTION for the owner (refund or record manually); money is never silently lost.
begin;

create table if not exists public.pro_payment_links(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 target text not null check(target in('invoice','installment')),
 draft_id uuid,plan_id uuid,plan_revision integer,installment_seq integer,
 work_id text not null,client_id text not null,
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 currency text not null default 'CRC' check(currency='CRC'),
 description text not null check(length(description) between 1 and 160),
 provider text not null default 'tilopay' check(provider in('tilopay')),
 mode text not null check(mode in('mock','sandbox','production')),
 methods text[] not null check(cardinality(methods) between 1 and 2 and methods<@array['card','sinpe']),
 status text not null default 'active' check(status in('active','paid','cancelled')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),paid_at timestamptz,cancelled_at timestamptz,
 cancel_reason text check(cancel_reason is null or length(cancel_reason) between 1 and 160),
 primary key(owner_id,id),
 foreign key(owner_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade,
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 check((target='invoice')=(draft_id is not null)),
 check((target='installment')=(plan_id is not null and plan_revision is not null and installment_seq is not null)),
 check((status='paid')=(paid_at is not null)),check((status='cancelled')=(cancelled_at is not null))
);
create unique index if not exists pro_payment_links_one_invoice on public.pro_payment_links(owner_id,draft_id) where status='active' and target='invoice';
create unique index if not exists pro_payment_links_one_installment on public.pro_payment_links(owner_id,plan_id,plan_revision,installment_seq) where status='active' and target='installment';
create index if not exists pro_payment_links_work on public.pro_payment_links(owner_id,work_id,created_at desc);
create table if not exists public.pro_payment_attempts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,link_id uuid not null,provider text not null,mode text not null check(mode in('mock','sandbox','production')),
 processor_ref text not null check(length(processor_ref) between 4 and 80),
 method text not null check(method in('card','sinpe')),
 status text not null check(status in('pending','requires_action','succeeded','failed','refunded')),
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 card_last4 text check(card_last4 is null or card_last4 ~ '^[0-9]{4}$'),card_brand text check(card_brand is null or length(card_brand)<=20),
 sinpe_reference text check(sinpe_reference is null or sinpe_reference ~ '^[0-9]{8,25}$'),
 failure_code text check(failure_code is null or length(failure_code)<=60),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(provider,processor_ref),
 foreign key(owner_id,link_id) references public.pro_payment_links(owner_id,id) on delete cascade,
 check(method='card' or card_last4 is null),check(method='sinpe' or sinpe_reference is null)
);
create index if not exists pro_payment_attempts_link on public.pro_payment_attempts(owner_id,link_id,created_at desc);
create table if not exists public.pro_payment_transactions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,provider text not null,event_id text not null,kind text not null check(kind in('payment','refund')),
 attempt_id uuid not null,link_id uuid not null,entry_id uuid not null,invoice_payment_id uuid,
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),created_at timestamptz not null default now(),
 primary key(owner_id,id),unique(provider,event_id),unique(owner_id,attempt_id,kind),
 foreign key(owner_id,attempt_id) references public.pro_payment_attempts(owner_id,id) on delete cascade,
 foreign key(owner_id,entry_id) references public.pro_client_entries(user_id,id) on delete cascade
);
create table if not exists public.pro_payment_refund_requests(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,transaction_id uuid not null,reason text not null check(length(reason) between 1 and 160),created_at timestamptz not null default now(),
 primary key(owner_id,action_id),unique(owner_id,transaction_id)
);
create table if not exists public.pro_payment_link_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,input_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,action_id)
);

create or replace function public.pro_payment_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Online payment transactions, refunds and receipts are immutable' using errcode='23514';end $$;
do $$declare n text;begin foreach n in array array['pro_payment_transactions','pro_payment_refund_requests','pro_payment_link_actions'] loop
 execute format('drop trigger if exists pro_payment_immutable on public.%I',n);
 execute format('create trigger pro_payment_immutable before update on public.%I for each row execute function public.pro_payment_immutable()',n);
end loop;end $$;
create or replace function public.pro_payment_link_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.status<>'active' then raise exception 'Payment link is final' using errcode='23514';end if;
 if (to_jsonb(new)-'status'-'paid_at'-'cancelled_at'-'cancel_reason')<>(to_jsonb(old)-'status'-'paid_at'-'cancelled_at'-'cancel_reason') then raise exception 'Payment link terms are immutable' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_payment_link_guard on public.pro_payment_links;
create trigger pro_payment_link_guard before update on public.pro_payment_links for each row execute function public.pro_payment_link_guard();
create or replace function public.pro_payment_attempt_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (to_jsonb(new)-'status'-'failure_code'-'updated_at')<>(to_jsonb(old)-'status'-'failure_code'-'updated_at') then raise exception 'Payment attempt identity is immutable' using errcode='23514';end if;
 if new.status<>old.status and not(old.status='pending' and new.status in('requires_action','succeeded','failed') or old.status='requires_action' and new.status in('succeeded','failed') or old.status='succeeded' and new.status='refunded') then
  raise exception 'Invalid payment attempt transition % → %',old.status,new.status using errcode='23514';
 end if;
 new.updated_at:=now();return new;
end $$;
drop trigger if exists pro_payment_attempt_guard on public.pro_payment_attempts;
create trigger pro_payment_attempt_guard before update on public.pro_payment_attempts for each row execute function public.pro_payment_attempt_guard();

-- Deterministic RFC 4122 (version 4 layout) uuid from a text: ledger ids derived from provider + event id,
-- so a replayed event always maps to the same ledger row and every UUID validator accepts it.
create or replace function public.pro_payment_derived_uuid(p_text text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',(get_byte(decode(substr(h,17,2),'hex'),0)%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select md5(p_text) h) x $$;
-- What can still be charged online for a draft (total − applied − credit notes, never above the job balance).
create or replace function public.pro_payment_link_due(p_owner uuid,p_draft uuid) returns bigint
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d public.pro_invoice_drafts;acc jsonb;due bigint;
begin
 select * into d from public.pro_invoice_drafts where user_id=p_owner and id=p_draft;
 if not found or d.work_id is null then return 0;end if;
 due:=d.total_cents-public.pro_invoice_payment_used(p_owner,null,d.id)-public.pro_invoice_payment_credit_notes(p_owner,d.id);
 acc:=public.pro_work_account(p_owner,d.work_id);
 if acc->>'agreedCents' is null then return 0;end if;
 return greatest(least(due,(acc->>'balanceCents')::bigint),0);
end $$;

create or replace function public.pro_payment_link_json(p_link public.pro_payment_links) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_link.id,'target',p_link.target,'draftId',p_link.draft_id,'planId',p_link.plan_id,'planRevision',p_link.plan_revision,'seq',p_link.installment_seq,
  'workId',p_link.work_id,'amountCents',p_link.amount_cents,'currency',p_link.currency,'description',p_link.description,'provider',p_link.provider,'mode',p_link.mode,'methods',to_jsonb(p_link.methods),
  'status',case when p_link.status='active' and p_link.expires_at<=now() then 'expired' else p_link.status end,'expiresAt',p_link.expires_at,'createdAt',p_link.created_at,'paidAt',p_link.paid_at,
  'cancelledAt',p_link.cancelled_at,'cancelReason',p_link.cancel_reason,
  'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'method',a.method,'status',a.status,'amountCents',a.amount_cents,'cardLast4',a.card_last4,'cardBrand',a.card_brand,'sinpeReference',a.sinpe_reference,
    'failureCode',a.failure_code,'processorRef',a.processor_ref,'createdAt',a.created_at,
    'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'kind',t.kind,'entryId',t.entry_id,'amountCents',t.amount_cents,'at',t.created_at) order by t.created_at) from public.pro_payment_transactions t where t.owner_id=a.owner_id and t.attempt_id=a.id),'[]')) order by a.created_at desc)
   from public.pro_payment_attempts a where a.owner_id=p_link.owner_id and a.link_id=p_link.id),'[]')) $$;

create or replace function public.pro_payment_links_read(p_actor uuid,p_scope jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare draft uuid;plan uuid;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 begin draft:=(p_scope->>'draftId')::uuid;plan:=(p_scope->>'planId')::uuid;exception when others then raise exception 'Invalid scope' using errcode='22023';end;
 if draft is not null then
  if not exists(select 1 from public.pro_invoice_drafts where user_id=p_actor and id=draft) then return null;end if;
  return jsonb_build_object('dueCents',public.pro_payment_link_due(p_actor,draft),'hasWork',(select work_id is not null from public.pro_invoice_drafts where user_id=p_actor and id=draft),
   'links',coalesce((select jsonb_agg(public.pro_payment_link_json(l) order by l.created_at desc) from public.pro_payment_links l where l.owner_id=p_actor and l.draft_id=draft),'[]'));
 elsif plan is not null then
  if not exists(select 1 from public.pro_payment_plans where owner_id=p_actor and id=plan) then return null;end if;
  return jsonb_build_object('links',coalesce((select jsonb_agg(public.pro_payment_link_json(l) order by l.created_at desc) from public.pro_payment_links l where l.owner_id=p_actor and l.plan_id=plan),'[]'));
 end if;
 raise exception 'Invalid scope' using errcode='22023';
end $$;

create or replace function public.pro_payment_link_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;receipt public.pro_payment_link_actions;h text:=md5(p_input::text);l public.pro_payment_links;d public.pro_invoice_drafts;w public.pro_work;c public.pro_clients;
 p public.pro_payment_plans;st jsonb;item jsonb;amount bigint;acc jsonb;descr text;days integer;result jsonb;n_items integer;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Invalid action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-payment-link:'||p_actor::text,0));
 select * into receipt from public.pro_payment_link_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input_hash<>h then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 if act='create' then
  days:=(p_input->>'expiresInDays')::integer;
  if p_input->>'tokenHash' !~ '^[a-f0-9]{64}$' or days not between 1 and 60 or p_input->>'mode' not in('mock','sandbox','production') or jsonb_typeof(p_input->'methods')<>'array' then raise exception 'Invalid link' using errcode='22023';end if;
  if p_input->>'target'='invoice' then
   select * into d from public.pro_invoice_drafts where user_id=p_actor and id=(p_input->>'draftId')::uuid for update;
   if not found then raise exception 'Forbidden' using errcode='42501';end if;
   if d.work_id is null then raise exception 'Draft without job' using errcode='22023',hint='pro_payment_link_no_work';end if;
   if exists(select 1 from public.pro_invoice_draft_management m where m.user_id=p_actor and m.draft_id=d.id and m.archived) then raise exception 'Archived draft' using errcode='22023',hint='pro_payment_link_inactive';end if;
   select * into w from public.pro_work where user_id=p_actor and id=d.work_id;
   amount:=public.pro_payment_link_due(p_actor,d.id);descr:=d.title;
  elsif p_input->>'target'='installment' then
   select * into p from public.pro_payment_plans where owner_id=p_actor and id=(p_input->>'planId')::uuid for update;
   if not found then raise exception 'Forbidden' using errcode='42501';end if;
   if p.status<>'active' or p.revision<>(p_input->>'planRevision')::integer then raise exception 'Plan changed' using errcode='40001';end if;
   select * into w from public.pro_work where user_id=p_actor and id=p.work_id;
   st:=public.pro_payment_plan_state(p_actor,p.id,(now() at time zone 'America/Costa_Rica')::date);
   select i into item from jsonb_array_elements(st->'items') i where (i->>'seq')::integer=(p_input->>'seq')::integer;
   if item is null then raise exception 'Unknown installment' using errcode='22023';end if;
   n_items:=(select count(*) from jsonb_array_elements(st->'items') i where i->>'kind'='installment');
   acc:=public.pro_work_account(p_actor,p.work_id);
   amount:=greatest(least((item->>'amountCents')::bigint-(item->>'appliedCents')::bigint,coalesce((acc->>'balanceCents')::bigint,0)),0);
   if acc->>'agreedCents' is null then amount:=0;end if;
   descr:=left(case when item->>'kind'='down_payment' then case when p_input->>'language'='en' then 'Down payment' else 'Prima' end
    else case when p_input->>'language'='en' then 'Installment '||(select count(*) from jsonb_array_elements(st->'items') i where i->>'kind'='installment' and (i->>'seq')::integer<=(item->>'seq')::integer)||' of '||n_items
     else 'Cuota '||(select count(*) from jsonb_array_elements(st->'items') i where i->>'kind'='installment' and (i->>'seq')::integer<=(item->>'seq')::integer)||' de '||n_items end end||' · '||w.service,160);
  else raise exception 'Invalid target' using errcode='22023';end if;
  select * into c from public.pro_clients where user_id=p_actor and id=w."clientId";
  if w.cancelled or coalesce(c.archived,true) then raise exception 'Inactive job' using errcode='22023',hint='pro_payment_link_inactive';end if;
  if amount<1 then raise exception 'Nothing due' using errcode='22023',hint='pro_payment_link_nothing_due';end if;
  insert into public.pro_payment_links(owner_id,id,token_hash,target,draft_id,plan_id,plan_revision,installment_seq,work_id,client_id,amount_cents,description,provider,mode,methods,expires_at)
  values(p_actor,(p_input->>'linkId')::uuid,p_input->>'tokenHash',p_input->>'target',d.id,p.id,case when p.id is not null then p.revision end,case when p.id is not null then (p_input->>'seq')::integer end,
   w.id,w."clientId",amount,descr,'tilopay',p_input->>'mode',array(select jsonb_array_elements_text(p_input->'methods')),now()+make_interval(days=>days)) returning * into l;
 elsif act='cancel' then
  select * into l from public.pro_payment_links where owner_id=p_actor and id=(p_input->>'linkId')::uuid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if l.status<>'active' then raise exception 'Link not active' using errcode='40001';end if;
  if exists(select 1 from public.pro_payment_attempts a where a.owner_id=p_actor and a.link_id=l.id and a.status in('pending','requires_action') and a.created_at>now()-interval '30 minutes') then raise exception 'A payment is in progress' using errcode='22023',hint='pro_payment_link_in_progress';end if;
  if length(coalesce(trim(p_input->>'reason'),'')) not between 1 and 160 then raise exception 'Reason required' using errcode='22023';end if;
  update public.pro_payment_links set status='cancelled',cancelled_at=now(),cancel_reason=trim(p_input->>'reason') where owner_id=p_actor and id=l.id returning * into l;
 else raise exception 'Invalid link action' using errcode='22023';end if;
 result:=public.pro_payment_link_json(l);
 insert into public.pro_payment_link_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,h,result);
 return result;
exception when unique_violation then raise exception 'An active link already exists' using errcode='23505',hint='pro_payment_link_exists';
 when check_violation or invalid_text_representation or not_null_violation then raise exception 'Invalid link data' using errcode='22023';
end $$;

-- Public (hosted page): token hash only; no owner, job or customer identifiers leave the server.
create or replace function public.pro_payment_link_public(p_token_hash text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l public.pro_payment_links;biz text;open_attempt public.pro_payment_attempts;
begin
 select * into l from public.pro_payment_links where token_hash=p_token_hash;
 if not found or not public.pro_private_work_tools_enabled(l.owner_id) then return null;end if;
 select coalesce(nullif(trim(business_name),''),'ContrataCR') into biz from public.professionals where profile_id=l.owner_id;
 select * into open_attempt from public.pro_payment_attempts where owner_id=l.owner_id and link_id=l.id and status in('pending','requires_action') order by created_at desc limit 1;
 return jsonb_build_object('status',case when l.status='active' and l.expires_at<=now() then 'expired' else l.status end,'amountCents',l.amount_cents,'currency',l.currency,'description',l.description,
  'businessName',coalesce(biz,'ContrataCR'),'methods',to_jsonb(l.methods),'mode',l.mode,'expiresAt',l.expires_at,'paidAt',l.paid_at,
  'sinpePhone',coalesce((select c.config->>'sinpePhone' from public.pro_integration_connections c where c.owner_id=l.owner_id and c.provider='tilopay'),''),
  'openAttempt',case when open_attempt.id is null then null else jsonb_build_object('id',open_attempt.id,'method',open_attempt.method,'status',open_attempt.status) end,
  'lastFailure',(select a.failure_code from public.pro_payment_attempts a where a.owner_id=l.owner_id and a.link_id=l.id and a.status='failed' order by a.created_at desc limit 1));
end $$;
-- The server ran the processor adapter for this link and records the attempt it got back.
create or replace function public.pro_payment_attempt_record(p_token_hash text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.pro_payment_links;a public.pro_payment_attempts;
begin
 select * into l from public.pro_payment_links where token_hash=p_token_hash for update;
 if not found or not public.pro_private_work_tools_enabled(l.owner_id) then raise exception 'Unknown link' using errcode='42501';end if;
 if l.status<>'active' or l.expires_at<=now() then raise exception 'Link not payable' using errcode='22023',hint='pro_payment_link_closed';end if;
 if not (p_input->>'method')=any(l.methods) then raise exception 'Method not offered' using errcode='22023';end if;
 if p_input->>'status' not in('pending','requires_action','failed') then raise exception 'Invalid attempt status' using errcode='22023';end if;
 insert into public.pro_payment_attempts(owner_id,id,link_id,provider,mode,processor_ref,method,status,amount_cents,card_last4,card_brand,sinpe_reference,failure_code)
 values(l.owner_id,(p_input->>'attemptId')::uuid,l.id,l.provider,l.mode,p_input->>'processorRef',p_input->>'method',p_input->>'status',l.amount_cents,nullif(p_input->>'cardLast4',''),nullif(p_input->>'cardBrand',''),
  nullif(p_input->>'sinpeReference',''),nullif(p_input->>'failureCode','')) returning * into a;
 return jsonb_build_object('attemptId',a.id,'status',a.status,'processorRef',a.processor_ref,'amountCents',a.amount_cents,'provider',a.provider,'mode',a.mode,'ownerId',a.owner_id,'linkId',l.id);
exception when unique_violation then raise exception 'Attempt already recorded' using errcode='23505';
 when check_violation or invalid_text_representation or not_null_violation then raise exception 'Invalid attempt' using errcode='22023';
end $$;
-- Open attempt of a link by id (3-D Secure step); only through the same token.
create or replace function public.pro_payment_attempt_open(p_token_hash text,p_attempt uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('attemptId',a.id,'status',a.status,'processorRef',a.processor_ref,'amountCents',a.amount_cents,'provider',a.provider,'mode',a.mode,'method',a.method,'ownerId',a.owner_id,'linkId',l.id)
 from public.pro_payment_links l join public.pro_payment_attempts a on a.owner_id=l.owner_id and a.link_id=l.id where l.token_hash=p_token_hash and a.id=p_attempt $$;
-- Post-security fixes (2026-11-13): a SINPE attempt is recorded «pending» with the SERVER-generated reference BEFORE
-- the processor is consulted with that same reference; when the processor does not confirm it (not found, amount or
-- currency mismatch, unavailable) the attempt is closed as «failed» here. Only pending SINPE attempts of this link.
create or replace function public.pro_payment_attempt_fail(p_token_hash text,p_attempt uuid,p_failure text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.pro_payment_attempts;
begin
 if p_failure is null or p_failure!~'^[a-z_]{3,60}$' then raise exception 'Invalid failure code' using errcode='22023';end if;
 select a2.* into a from public.pro_payment_links l join public.pro_payment_attempts a2 on a2.owner_id=l.owner_id and a2.link_id=l.id
  where l.token_hash=p_token_hash and a2.id=p_attempt for update of a2;
 if not found then raise exception 'Unknown attempt' using errcode='P0002';end if;
 if a.method<>'sinpe' or a.status<>'pending' then raise exception 'Attempt is not an open SINPE attempt' using errcode='40001';end if;
 update public.pro_payment_attempts set status='failed',failure_code=p_failure where owner_id=a.owner_id and id=a.id returning * into a;
 return jsonb_build_object('attemptId',a.id,'status',a.status,'failureCode',a.failure_code);
end $$;
-- Event routing: which owner/attempt a processor reference belongs to (webhook handler).
create or replace function public.pro_payment_attempt_by_ref(p_provider text,p_ref text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('attemptId',a.id,'ownerId',a.owner_id,'status',a.status,'amountCents',a.amount_cents,'mode',a.mode,'method',a.method) from public.pro_payment_attempts a where a.provider=p_provider and a.processor_ref=p_ref $$;

-- Apply one inbox event exactly once (all in the caller's transaction). Payload (already redacted):
-- {type: payment.succeeded | payment.failed | payment.refunded, processorRef, amountCents, failureCode?}
create or replace function public.pro_payment_event_apply(p_webhook uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wh public.pro_integration_webhooks;a public.pro_payment_attempts;l public.pro_payment_links;t public.pro_payment_transactions;d public.pro_invoice_drafts;
 typ text;req uuid;rev integer;prev integer;review text;void_id uuid;today date:=(now() at time zone 'America/Costa_Rica')::date;label text;
begin
 select * into wh from public.pro_integration_webhooks where id=p_webhook for update;
 if not found then raise exception 'Unknown webhook' using errcode='22023';end if;
 if wh.status in('processed','ignored') then return jsonb_build_object('status',wh.status,'duplicate',true,'review',wh.last_error);end if;
 typ:=wh.event_type;
 select * into a from public.pro_payment_attempts where provider=wh.provider and processor_ref=wh.payload->>'processorRef' for update;
 if not found then
  update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='unknown_reference' where id=wh.id;
  return jsonb_build_object('status','ignored','duplicate',false,'review','unknown_reference');
 end if;
 if wh.owner_id is null then update public.pro_integration_webhooks set owner_id=a.owner_id where id=wh.id;end if;
 if wh.mode<>a.mode then
  update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='mode_mismatch' where id=wh.id;
  return jsonb_build_object('status','ignored','duplicate',false,'review','mode_mismatch');
 end if;
 select * into l from public.pro_payment_links where owner_id=a.owner_id and id=a.link_id for update;
 label:=left(case when a.method='sinpe' then 'Pago en línea SINPE Móvil · ' else 'Pago en línea con tarjeta · ' end||a.processor_ref,160);
 if typ='payment.succeeded' then
  if exists(select 1 from public.pro_payment_transactions where owner_id=a.owner_id and attempt_id=a.id and kind='payment') or a.status in('succeeded','refunded') then
   update public.pro_integration_webhooks set status='processed',processed_at=now(),last_error='already_applied' where id=wh.id;
   return jsonb_build_object('status','processed','duplicate',true,'review',null);
  end if;
  if a.status not in('pending','requires_action') then
   update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='attempt_'||a.status where id=wh.id;
   return jsonb_build_object('status','ignored','duplicate',false,'review','attempt_'||a.status);
  end if;
  update public.pro_payment_attempts set status='succeeded' where owner_id=a.owner_id and id=a.id;
  req:=public.pro_payment_derived_uuid('ccr-online-payment:'||wh.provider||':'||wh.event_id);
  if coalesce((wh.payload->>'amountCents')::bigint,-1)<>a.amount_cents then review:='amount_mismatch';
  elsif l.status<>'active' then review:='link_'||l.status;
  else
   begin
    if l.target='invoice' then
     select * into d from public.pro_invoice_drafts where user_id=a.owner_id and id=l.draft_id;
     select coalesce((select revision from public.pro_invoice_payment_state where user_id=a.owner_id and draft_id=d.id),0) into prev;
     perform public.pro_invoice_payment_mutate(a.owner_id,jsonb_build_object('requestId',req,'draftId',d.id,'draftRevision',d.revision,'revision',prev,'action','apply','source','new',
      'amountCents',a.amount_cents,'receivedOn',to_char(today,'YYYY-MM-DD'),'method',case when a.method='sinpe' then 'sinpe' else 'card' end,'reference',label));
    else
     select revision into rev from public.pro_workspace_core where user_id=a.owner_id;
     perform public.pro_record_client_operation(a.owner_id,jsonb_build_object('actionId',req,'clientId',l.client_id,'workId',l.work_id,'kind','payment','amountCents',a.amount_cents,'note',label),rev);
    end if;
    if not exists(select 1 from public.pro_client_entries where user_id=a.owner_id and id=req and kind='payment') then raise exception 'Ledger payment missing' using errcode='22023';end if;
    insert into public.pro_payment_transactions(owner_id,id,provider,event_id,kind,attempt_id,link_id,entry_id,invoice_payment_id,amount_cents)
    values(a.owner_id,gen_random_uuid(),wh.provider,wh.event_id,'payment',a.id,l.id,req,case when l.target='invoice' then req end,a.amount_cents);
    update public.pro_payment_links set status='paid',paid_at=now() where owner_id=l.owner_id and id=l.id;
   exception when others then review:=left('ledger_refused: '||sqlerrm,280);
   end;
  end if;
  update public.pro_integration_webhooks set status='processed',processed_at=now(),last_error=review where id=wh.id;
  return jsonb_build_object('status','processed','duplicate',false,'review',review,'entryId',case when review is null then req end);
 elsif typ='payment.failed' then
  if a.status in('pending','requires_action') then update public.pro_payment_attempts set status='failed',failure_code=left(coalesce(wh.payload->>'failureCode','declined'),60) where owner_id=a.owner_id and id=a.id;end if;
  update public.pro_integration_webhooks set status='processed',processed_at=now() where id=wh.id;
  return jsonb_build_object('status','processed','duplicate',false,'review',null);
 elsif typ='payment.refunded' then
  if a.status='refunded' or exists(select 1 from public.pro_payment_transactions where owner_id=a.owner_id and attempt_id=a.id and kind='refund') then
   update public.pro_integration_webhooks set status='processed',processed_at=now(),last_error='already_refunded' where id=wh.id;
   return jsonb_build_object('status','processed','duplicate',true,'review',null);
  end if;
  if a.status<>'succeeded' then
   update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='attempt_'||a.status where id=wh.id;
   return jsonb_build_object('status','ignored','duplicate',false,'review','attempt_'||a.status);
  end if;
  update public.pro_payment_attempts set status='refunded' where owner_id=a.owner_id and id=a.id;
  select * into t from public.pro_payment_transactions where owner_id=a.owner_id and attempt_id=a.id and kind='payment';
  if t.id is null then
   -- Refund of money never booked (an exception): nothing to reverse in the ledger.
   update public.pro_integration_webhooks set status='processed',processed_at=now(),last_error='refund_without_ledger' where id=wh.id;
   return jsonb_build_object('status','processed','duplicate',false,'review','refund_without_ledger');
  end if;
  select id into void_id from public.pro_client_entries where user_id=a.owner_id and reversal_id=t.entry_id and kind='payment_void';
  if void_id is null then
   void_id:=public.pro_payment_derived_uuid('ccr-online-refund:'||wh.provider||':'||wh.event_id);
   select revision into rev from public.pro_workspace_core where user_id=a.owner_id;
   perform public.pro_record_client_operation(a.owner_id,jsonb_build_object('actionId',void_id,'clientId',l.client_id,'workId',l.work_id,'kind','payment_void','entryId',t.entry_id,
    'note',left('Reembolso en línea · '||a.processor_ref||coalesce(' · '||(select r.reason from public.pro_payment_refund_requests r where r.owner_id=a.owner_id and r.transaction_id=t.id),''),160)),rev);
  end if;
  insert into public.pro_payment_transactions(owner_id,id,provider,event_id,kind,attempt_id,link_id,entry_id,amount_cents) values(a.owner_id,gen_random_uuid(),wh.provider,wh.event_id,'refund',a.id,l.id,void_id,t.amount_cents);
  update public.pro_integration_webhooks set status='processed',processed_at=now() where id=wh.id;
  return jsonb_build_object('status','processed','duplicate',false,'review',null,'entryId',void_id);
 end if;
 update public.pro_integration_webhooks set status='ignored',processed_at=now(),last_error='unknown_type' where id=wh.id;
 return jsonb_build_object('status','ignored','duplicate',false,'review','unknown_type');
end $$;

-- Owner asks for a refund of an online payment (the server then calls the processor adapter).
create or replace function public.pro_payment_refund_request(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare t public.pro_payment_transactions;a public.pro_payment_attempts;prior public.pro_payment_refund_requests;aid uuid;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 select * into t from public.pro_payment_transactions where owner_id=p_actor and id=(p_input->>'transactionId')::uuid and kind='payment';
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select * into a from public.pro_payment_attempts where owner_id=p_actor and id=t.attempt_id;
 select * into prior from public.pro_payment_refund_requests where owner_id=p_actor and transaction_id=t.id;
 if found then
  if prior.action_id<>aid then raise exception 'Refund already requested' using errcode='23505',hint='pro_payment_refund_exists';end if;
 else
  if a.status<>'succeeded' then raise exception 'Not refundable' using errcode='22023';end if;
  if length(coalesce(trim(p_input->>'reason'),'')) not between 1 and 160 then raise exception 'Reason required' using errcode='22023';end if;
  insert into public.pro_payment_refund_requests(owner_id,action_id,transaction_id,reason) values(p_actor,aid,t.id,trim(p_input->>'reason'));
 end if;
 return jsonb_build_object('transactionId',t.id,'processorRef',a.processor_ref,'provider',a.provider,'mode',a.mode,'amountCents',t.amount_cents,'status',a.status);
end $$;

-- Reconciliation: every attempt with its ledger booking, classified.
create or replace function public.pro_payment_reconciliation(p_actor uuid,p_filter text default 'all') returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare rows jsonb;summ jsonb;
begin
 if not public.pro_private_work_tools_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_filter not in('all','exceptions') then raise exception 'Invalid filter' using errcode='22023';end if;
 with base as(
  select a.*,l.description,l.target,l.draft_id,l.plan_id,l.work_id,l.status link_status,
   (select t.entry_id from public.pro_payment_transactions t where t.owner_id=a.owner_id and t.attempt_id=a.id and t.kind='payment') pay_entry,
   (select t.id from public.pro_payment_transactions t where t.owner_id=a.owner_id and t.attempt_id=a.id and t.kind='payment') pay_tx,
   (select t.entry_id from public.pro_payment_transactions t where t.owner_id=a.owner_id and t.attempt_id=a.id and t.kind='refund') refund_entry,
   (select w.last_error from public.pro_integration_webhooks w where w.provider=a.provider and w.payload->>'processorRef'=a.processor_ref and w.event_type='payment.succeeded' order by w.received_at desc limit 1) review,
   exists(select 1 from public.pro_payment_refund_requests r join public.pro_payment_transactions t on t.owner_id=r.owner_id and t.id=r.transaction_id where r.owner_id=a.owner_id and t.attempt_id=a.id) refund_requested
  from public.pro_payment_attempts a join public.pro_payment_links l on l.owner_id=a.owner_id and l.id=a.link_id where a.owner_id=p_actor
 ),classified as(
  select b.*,case
   when b.status='succeeded' and b.pay_entry is null then 'exception'
   when b.status='succeeded' and exists(select 1 from public.pro_client_entries v where v.user_id=b.owner_id and v.reversal_id=b.pay_entry and v.kind='payment_void') then 'exception'
   when b.status='refunded' and b.pay_entry is not null and b.refund_entry is null then 'exception'
   when b.status='refunded' then 'refunded' when b.status='succeeded' then 'matched'
   when b.status in('pending','requires_action') then 'pending' else 'failed' end as recon
  from base b
 )
 select coalesce((select jsonb_agg(jsonb_build_object('attemptId',id,'processorRef',processor_ref,'provider',provider,'mode',mode,'method',method,'status',status,'amountCents',amount_cents,'cardLast4',card_last4,
   'sinpeReference',sinpe_reference,'failureCode',failure_code,'description',description,'target',target,'draftId',draft_id,'planId',plan_id,'workId',work_id,'linkStatus',link_status,
   'entryId',pay_entry,'transactionId',pay_tx,'refundEntryId',refund_entry,'refundRequested',refund_requested,'review',review,'reconciliation',recon,'at',created_at) order by created_at desc)
   from (select * from classified where p_filter='all' or recon='exception' order by created_at desc limit 200) x),'[]'),
  (select jsonb_build_object(
   'receivedCents',coalesce(sum(amount_cents) filter(where status in('succeeded','refunded')),0),
   'bookedCents',coalesce(sum(amount_cents) filter(where recon='matched'),0),
   'refundedCents',coalesce(sum(amount_cents) filter(where recon='refunded'),0),
   'exceptions',count(*) filter(where recon='exception'),'pending',count(*) filter(where recon='pending'),'failed',count(*) filter(where recon='failed')) from classified)
 into rows,summ;
 return jsonb_build_object('items',rows,'summary',summ);
end $$;

do $$declare n text;begin foreach n in array array['pro_payment_links','pro_payment_attempts','pro_payment_transactions','pro_payment_refund_requests','pro_payment_link_actions'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro\_payment\_link%' or p.proname like 'pro\_payment\_attempt%' or p.proname in('pro_payment_event_apply','pro_payment_refund_request','pro_payment_reconciliation','pro_payment_immutable','pro_payment_derived_uuid')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_payment_immutable(%' and f::text not like 'pro_payment_link_guard(%' and f::text not like 'pro_payment_attempt_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
