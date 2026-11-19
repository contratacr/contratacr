-- LOCAL ONLY. Internal allocation of money already received; never fiscal issuance or a charge.
-- Install after the invoice stack, client operations, and invoice management.
begin;
create table if not exists public.pro_invoice_payments(
 user_id uuid not null references profiles(id) on delete cascade,id uuid not null,
 client_id text not null,work_id text,entry_id uuid,
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 received_on date not null,method text not null check(method in ('cash','card','transfer','sinpe','other')),
 reference text not null check(length(reference)<=160),created_at timestamptz not null default now(),
 primary key(user_id,id),unique(user_id,entry_id),
 foreign key(user_id,client_id) references pro_clients(user_id,id) on delete cascade,
 foreign key(user_id,work_id) references pro_work(user_id,id) on delete cascade,
 foreign key(user_id,entry_id) references pro_client_entries(user_id,id) on delete cascade,
 check((work_id is null)=(entry_id is null))
);
create table if not exists public.pro_invoice_payment_applications(
 user_id uuid not null references profiles(id) on delete cascade,id uuid not null,draft_id uuid not null,payment_id uuid not null,
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),created_at timestamptz not null default now(),
 primary key(user_id,id),foreign key(user_id,draft_id) references pro_invoice_drafts(user_id,id) on delete cascade,
 foreign key(user_id,payment_id) references pro_invoice_payments(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_payment_voids(
 user_id uuid not null references profiles(id) on delete cascade,id uuid not null,application_id uuid not null,
 reason text not null check(length(trim(reason)) between 1 and 160),created_at timestamptz not null default now(),
 primary key(user_id,id),unique(user_id,application_id),foreign key(user_id,application_id) references pro_invoice_payment_applications(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_payment_state(
 user_id uuid not null,draft_id uuid not null,revision integer not null default 0 check(revision>=0),
 primary key(user_id,draft_id),foreign key(user_id,draft_id) references pro_invoice_drafts(user_id,id) on delete cascade
);
create table if not exists public.pro_invoice_payment_requests(
 user_id uuid not null,request_id uuid not null,input jsonb not null,draft_id uuid not null,revision integer not null,
 primary key(user_id,request_id),foreign key(user_id,draft_id) references pro_invoice_drafts(user_id,id) on delete cascade
);
create index if not exists pro_invoice_payments_scope on pro_invoice_payments(user_id,client_id,work_id,created_at desc,id desc);
create index if not exists pro_invoice_payment_applications_draft on pro_invoice_payment_applications(user_id,draft_id,created_at desc,id desc);
create index if not exists pro_invoice_payment_applications_payment on pro_invoice_payment_applications(user_id,payment_id);
create or replace function public.pro_invoice_payment_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Payment snapshots and allocation events are immutable' using errcode='22023';end $$;
do $$declare name text;begin foreach name in array array['pro_invoice_payments','pro_invoice_payment_applications','pro_invoice_payment_voids','pro_invoice_payment_state','pro_invoice_payment_requests'] loop
 execute format('alter table %I enable row level security',name);execute format('revoke all on %I from public,anon,authenticated',name);execute format('grant select on %I to authenticated',name);execute format('grant all on %I to service_role',name);
 if not exists(select 1 from pg_policies where schemaname='public' and tablename=name and policyname=name||'_owner') then execute format('create policy %I on %I for select to authenticated using(user_id=(select auth.uid()))',name||'_owner',name);end if;
 if name in ('pro_invoice_payments','pro_invoice_payment_applications','pro_invoice_payment_voids','pro_invoice_payment_requests') then execute format('drop trigger if exists pro_invoice_payment_immutable on %I',name);execute format('create trigger pro_invoice_payment_immutable before update on %I for each row execute function pro_invoice_payment_immutable()',name);end if;
end loop;end $$;
create or replace function public.pro_invoice_payment_used(p_user uuid,p_payment uuid,p_draft uuid default null) returns bigint
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(sum(a.amount_cents),0)::bigint from pro_invoice_payment_applications a join pro_invoice_payments p on p.user_id=a.user_id and p.id=a.payment_id
 where a.user_id=p_user and (p_payment is null or a.payment_id=p_payment) and (p_draft is null or a.draft_id=p_draft)
 and not exists(select 1 from pro_invoice_payment_voids v where v.user_id=a.user_id and v.application_id=a.id)
 and not exists(select 1 from pro_client_entries e where e.user_id=p.user_id and e.reversal_id=p.entry_id and e.kind='payment_void');
$$;
-- Credit notes (credits-retainers-local.sql) are not money, but they reduce what is still owed on
-- a draft (pro_credit_draft_balance). Resolved at run time so this file still installs before or
-- without the credits module; then it is 0 and the behaviour is exactly the previous one.
create or replace function public.pro_invoice_payment_credit_notes(p_user uuid,p_draft uuid) returns bigint
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v bigint;
begin
 if to_regprocedure('public.pro_credit_note_applied(uuid,uuid)') is null then return 0;end if;
 execute 'select public.pro_credit_note_applied($1,$2)' into v using p_user,p_draft;
 return coalesce(v,0);
end $$;
-- Constraint checks reselect the FINAL header, not any temporary totals used by
-- invoice tax/extras writers. This permits a valid multi-step recalculation.
-- A base-only fallback allows older installations; correction SQL replaces it.
-- Reinstalling this consumer must never overwrite the correction-aware helper.
do $install$ begin
 if to_regprocedure('public.pro_invoice_payment_metadata(uuid,uuid)') is null then
 execute $definition$create function public.pro_invoice_payment_metadata(p_user uuid,p_id uuid) returns jsonb
 language sql stable security invoker set search_path=public,pg_temp as $body$
 select jsonb_build_object('receivedOn',p.received_on,'method',p.method,'reference',p.reference,'revision',0)
 from pro_client_entries e left join pro_invoice_payments p on p.user_id=e.user_id and p.entry_id=e.id
 where e.user_id=p_user and e.id=p_id and e.kind='payment'
 union all select jsonb_build_object('receivedOn',p.received_on,'method',p.method,'reference',p.reference,'revision',0)
 from pro_invoice_payments p where p.user_id=p_user and p.id=p_id and p.entry_id is null and p.work_id is null limit 1;
 $body$$definition$;
 end if;
end $install$;
create or replace function public.pro_invoice_payment_total_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d pro_invoice_drafts;
begin
 select * into d from pro_invoice_drafts where user_id=new.user_id and id=new.id;
 if d.id is not null and d.total_cents<pro_invoice_payment_used(d.user_id,null,d.id) then raise exception 'Invoice total is below active applications' using errcode='22023';end if;
 return null;
end $$;
drop trigger if exists pro_invoice_payment_total_guard on pro_invoice_drafts;
create constraint trigger pro_invoice_payment_total_guard after update on pro_invoice_drafts deferrable initially deferred for each row execute function pro_invoice_payment_total_guard();
create or replace function public.pro_invoice_payments_read(p_user uuid,p_id uuid,p_after jsonb default null,p_candidates_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d pro_invoice_drafts;c pro_clients;w pro_work;archived boolean;applied bigint;credit_notes bigint;rev integer;account jsonb;items jsonb;next_cursor jsonb;candidates jsonb;next_candidate jsonb;work_balance bigint;
begin
 select * into d from pro_invoice_drafts where user_id=p_user and id=p_id;if d.id is null then return null;end if;
 select * into c from pro_clients where user_id=p_user and id=d.client_id;select * into w from pro_work where user_id=p_user and id=d.work_id;
 select coalesce((select m.archived from pro_invoice_draft_management m where m.user_id=p_user and m.draft_id=d.id),false) into archived;
 applied:=pro_invoice_payment_used(p_user,null,d.id);credit_notes:=pro_invoice_payment_credit_notes(p_user,d.id);select coalesce((select revision from pro_invoice_payment_state where user_id=p_user and draft_id=d.id),0) into rev;
 if d.work_id is not null then account:=pro_work_account(p_user,d.work_id);if account->>'agreedCents' is not null then work_balance:=(account->>'balanceCents')::bigint;end if;end if;
 if p_after is not null and (nullif(p_after->>'at','') is null or nullif(p_after->>'id','') is null) or p_candidates_after is not null and (nullif(p_candidates_after->>'at','') is null or nullif(p_candidates_after->>'id','') is null) then raise exception 'Invalid cursor' using errcode='22023';end if;
 with matching as (
 select a.id,a.created_at,jsonb_build_object('id',a.id,'paymentId',p.id,'entryId',p.entry_id,'amountCents',a.amount_cents,'paymentAmountCents',p.amount_cents,'receivedOn',meta.value->'receivedOn','method',meta.value->'method','reference',meta.value->'reference','createdAt',a.created_at,'voided',v.id is not null,'voidReason',v.reason,'sourceReversed',exists(select 1 from pro_client_entries e where e.user_id=p.user_id and e.reversal_id=p.entry_id and e.kind='payment_void')) document
 from pro_invoice_payment_applications a join pro_invoice_payments p on p.user_id=a.user_id and p.id=a.payment_id left join pro_invoice_payment_voids v on v.user_id=a.user_id and v.application_id=a.id cross join lateral (select pro_invoice_payment_metadata(p_user,coalesce(p.entry_id,p.id)) value) meta
 where a.user_id=p_user and a.draft_id=d.id and (p_after is null or (a.created_at,a.id)<((p_after->>'at')::timestamptz,(p_after->>'id')::uuid)) order by a.created_at desc,a.id desc limit 21
 ), page as(select * from matching order by created_at desc,id desc limit 20)
 select coalesce((select jsonb_agg(document order by created_at desc,id desc) from page),'[]'),case when (select count(*) from matching)>20 then (select jsonb_build_object('at',created_at,'id',id) from page order by created_at asc,id asc limit 1) else null end into items,next_cursor;
 with sources as (
 select e.id,e.id entry_id,p.id payment_id,e.amount_cents,e.label,e.created_at registered_at,(pro_invoice_payment_metadata(p_user,e.id)->>'receivedOn')::date received_on,pro_invoice_payment_metadata(p_user,e.id)->>'method' method,pro_invoice_payment_metadata(p_user,e.id)->>'reference' reference
 from pro_client_entries e left join pro_invoice_payments p on p.user_id=e.user_id and p.entry_id=e.id
 where d.work_id is not null and e.user_id=p_user and e.client_id=d.client_id and e.work_id=d.work_id and e.kind='payment' and not exists(select 1 from pro_client_entries v where v.user_id=e.user_id and v.reversal_id=e.id and v.kind='payment_void')
 union all
 select p.id,null::uuid,p.id,p.amount_cents,pro_invoice_payment_metadata(p_user,p.id)->>'reference',p.created_at,(pro_invoice_payment_metadata(p_user,p.id)->>'receivedOn')::date,pro_invoice_payment_metadata(p_user,p.id)->>'method',pro_invoice_payment_metadata(p_user,p.id)->>'reference' from pro_invoice_payments p where d.work_id is null and p.user_id=p_user and p.client_id=d.client_id and p.work_id is null
 ), available as(select s.*,s.amount_cents-case when s.payment_id is null then 0 else pro_invoice_payment_used(p_user,s.payment_id,null) end available_cents from sources s),matching as(
 select * from available where available_cents>0 and (p_candidates_after is null or (registered_at,id)<((p_candidates_after->>'at')::timestamptz,(p_candidates_after->>'id')::uuid)) order by registered_at desc,id desc limit 21
 ),page as(select * from matching order by registered_at desc,id desc limit 20)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'entryId',entry_id,'paymentId',payment_id,'amountCents',amount_cents,'availableCents',available_cents,'label',label,'registeredAt',registered_at,'receivedOn',received_on,'method',method,'reference',reference) order by registered_at desc,id desc) from page),'[]'),case when (select count(*) from matching)>20 then (select jsonb_build_object('at',registered_at,'id',id) from page order by registered_at asc,id asc limit 1) else null end into candidates,next_candidate;
 return jsonb_build_object('draft',jsonb_build_object('id',d.id,'title',d.title,'clientId',d.client_id,'clientName',c.name,'workId',d.work_id,'workTitle',w.service,'totalCents',d.total_cents,'revision',d.revision,'archived',archived),'revision',rev,'summary',jsonb_build_object('appliedCents',applied,'creditNotesCents',credit_notes,'balanceCents',d.total_cents-applied-credit_notes,'workBalanceCents',work_balance,'canRecord',not archived and not c.archived and d.total_cents>applied+credit_notes and (d.work_id is null or coalesce(not w.cancelled and work_balance>0,false))),'items',items,'nextCursor',next_cursor,'candidates',candidates,'nextCandidateCursor',next_candidate);
end $$;
create or replace function public.pro_invoice_payment_mutate(p_user uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare req uuid:=(p_input->>'requestId')::uuid;act text:=p_input->>'action';prior pro_invoice_payment_requests;d pro_invoice_drafts;c pro_clients;e pro_client_entries;p pro_invoice_payments;a pro_invoice_payment_applications;rev integer;amount numeric;received date;method_value text;reference_value text;core_rev integer;metadata jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into prior from pro_invoice_payment_requests where user_id=p_user and request_id=req;
 if found then if prior.input<>p_input then raise exception 'Payment request changed' using errcode='40001';end if;return jsonb_build_object('id',prior.draft_id,'revision',prior.revision);end if;
 select * into d from pro_invoice_drafts where user_id=p_user and id=(p_input->>'draftId')::uuid for update;if d.id is null then return null;end if;
 insert into pro_invoice_payment_state(user_id,draft_id) values(p_user,d.id) on conflict do nothing;
 select revision into rev from pro_invoice_payment_state where user_id=p_user and draft_id=d.id for update;
 if jsonb_typeof(p_input->'draftRevision') is distinct from 'number' or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'draftRevision')::numeric<1 or (p_input->>'draftRevision')::numeric<>round((p_input->>'draftRevision')::numeric,0) or (p_input->>'revision')::numeric<0 or (p_input->>'revision')::numeric<>round((p_input->>'revision')::numeric,0) then raise exception 'Invalid revision' using errcode='22023';end if;
 if (p_input->>'draftRevision')::numeric is distinct from d.revision::numeric or (p_input->>'revision')::numeric is distinct from rev::numeric then raise exception 'Invoice payment state changed' using errcode='40001';end if;
 if act='apply' then
 select * into c from pro_clients where user_id=p_user and id=d.client_id;
 if c.id is null or c.archived or exists(select 1 from pro_invoice_draft_management where user_id=p_user and draft_id=d.id and archived) then raise exception 'Restore active invoice/customer before applying' using errcode='22023';end if;
 amount:=(p_input->>'amountCents')::numeric;
 if jsonb_typeof(p_input->'amountCents') is distinct from 'number' or amount is null or amount<>round(amount,0) or amount<1 or amount>10000000000 or amount>d.total_cents-pro_invoice_payment_used(p_user,null,d.id) then raise exception 'Invalid application amount or invoice balance' using errcode='22023',hint='pro_invoice_balance';end if;
 -- Same balance the credits module enforces: total − payments − applied credit notes.
 if amount>d.total_cents-pro_invoice_payment_used(p_user,null,d.id)-pro_invoice_payment_credit_notes(p_user,d.id) then raise exception 'Amount exceeds the balance left after credit notes' using errcode='22023',hint='pro_credit_notes_balance';end if;
 if p_input->>'source'='new' then
 if p_input ? 'candidateId' then raise exception 'New payment has no candidate' using errcode='22023';end if;
 elsif p_input->>'source'='existing' then
 if d.work_id is not null then
 select * into e from pro_client_entries where user_id=p_user and id=(p_input->>'candidateId')::uuid and kind='payment' and client_id=d.client_id and work_id=d.work_id;
 if e.id is null or exists(select 1 from pro_client_entries where user_id=p_user and reversal_id=e.id and kind='payment_void') then raise exception 'Invalid owned work payment' using errcode='22023';end if;
 select * into p from pro_invoice_payments where user_id=p_user and entry_id=e.id;
 else
 select * into p from pro_invoice_payments where user_id=p_user and id=(p_input->>'candidateId')::uuid and client_id=d.client_id and work_id is null and entry_id is null;
 if p.id is null then raise exception 'Invalid standalone payment' using errcode='22023';end if;
 end if;
 else raise exception 'Invalid payment source' using errcode='22023';end if;
 -- Base snapshots stay immutable; reuse checks the latest audited metadata.
 metadata:=pro_invoice_payment_metadata(p_user,coalesce(e.id,p.id));
 if p.id is not null or coalesce((metadata->>'revision')::integer,0)>0 then
 received:=(metadata->>'receivedOn')::date;method_value:=metadata->>'method';reference_value:=metadata->>'reference';
 if p_input ? 'receivedOn' and p_input->>'receivedOn' is distinct from received::text or p_input ? 'method' and p_input->>'method' is distinct from method_value or p_input ? 'reference' and p_input->>'reference' is distinct from reference_value then raise exception 'Payment metadata cannot change' using errcode='22023';end if;
 else
 if jsonb_typeof(p_input->'receivedOn') is distinct from 'string' or p_input->>'receivedOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid received date' using errcode='22023';end if;
 received:=(p_input->>'receivedOn')::date;
 if received<date '1900-01-01' or to_char(received,'YYYY-MM-DD')<>p_input->>'receivedOn' or received>(now() at time zone 'America/Costa_Rica')::date then raise exception 'Invalid or future received date' using errcode='22023';end if;
 method_value:=p_input->>'method';reference_value:=p_input->>'reference';
 if jsonb_typeof(p_input->'method') is distinct from 'string' or method_value not in ('cash','card','transfer','sinpe','other') or jsonb_typeof(p_input->'reference') is distinct from 'string' or length(reference_value)>160 then raise exception 'Invalid payment method/reference' using errcode='22023';end if;
 end if;
 if p.id is null then
 if p_input->>'source'='new' and d.work_id is not null then
 select revision into core_rev from pro_workspace_core where user_id=p_user for update;
 perform pro_record_client_operation(p_user,jsonb_build_object('actionId',req,'clientId',d.client_id,'workId',d.work_id,'kind','payment','amountCents',amount,'note',reference_value),core_rev);
 select * into e from pro_client_entries where user_id=p_user and id=req;
 end if;
 insert into pro_invoice_payments(user_id,id,client_id,work_id,entry_id,amount_cents,received_on,method,reference) values(p_user,coalesce(e.id,req),d.client_id,d.work_id,e.id,coalesce(e.amount_cents,amount::bigint),received,method_value,reference_value) returning * into p;
 end if;
 if amount>p.amount_cents-pro_invoice_payment_used(p_user,p.id,null) then raise exception 'Payment is already allocated' using errcode='22023';end if;
 insert into pro_invoice_payment_applications(user_id,id,draft_id,payment_id,amount_cents) values(p_user,req,d.id,p.id,amount::bigint);
 elsif act='unapply' then
 select * into a from pro_invoice_payment_applications where user_id=p_user and id=(p_input->>'id')::uuid and draft_id=d.id;
 if a.id is null or exists(select 1 from pro_invoice_payment_voids where user_id=p_user and application_id=a.id) or jsonb_typeof(p_input->'reason') is distinct from 'string' or length(trim(p_input->>'reason')) not between 1 and 160 then raise exception 'Invalid application reversal' using errcode='22023';end if;
 insert into pro_invoice_payment_voids(user_id,id,application_id,reason) values(p_user,req,a.id,trim(p_input->>'reason'));
 else raise exception 'Invalid payment action' using errcode='22023';end if;
 update pro_invoice_payment_state set revision=revision+1 where user_id=p_user and draft_id=d.id returning revision into rev;
 insert into pro_invoice_payment_requests values(p_user,req,p_input,d.id,rev);
 return jsonb_build_object('id',d.id,'revision',rev);
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation or foreign_key_violation or unique_violation or datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid internal payment data' using errcode='22023';
end $$;
revoke all on function pro_invoice_payment_immutable(),pro_invoice_payment_used(uuid,uuid,uuid),pro_invoice_payment_credit_notes(uuid,uuid),pro_invoice_payment_metadata(uuid,uuid),pro_invoice_payment_total_guard(),pro_invoice_payments_read(uuid,uuid,jsonb,jsonb),pro_invoice_payment_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_payment_immutable(),pro_invoice_payment_used(uuid,uuid,uuid),pro_invoice_payment_credit_notes(uuid,uuid),pro_invoice_payment_metadata(uuid,uuid),pro_invoice_payment_total_guard(),pro_invoice_payments_read(uuid,uuid,jsonb,jsonb),pro_invoice_payment_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
