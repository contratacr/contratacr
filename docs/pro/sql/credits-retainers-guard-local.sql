-- Local-only guard for credits & retainers (parity register row 50), applied by the leader's decision
-- on 2026-11-11 (phase 2). It attaches deferred constraint triggers to EXISTING tables
-- (pro_invoice_payment_applications, pro_invoice_drafts) so that the existing writers (invoice payments,
-- draft total edits) respect the credits invariant at commit time: a draft cannot end covered above its
-- total by payments + credit notes, and a payment cannot reuse money a credit already refunded.
-- Behaviour without credits is unchanged (both checks are no-ops when no credit rows exist).
-- QA fase 2 (P1-1): both raises keep 22023 (so every existing route still answers 400) and add a
-- HINT ('pro_credit_notes_balance' / 'pro_credit_refunded') that routes translate to clear ES/EN text.
-- Requires credits-retainers-local.sql, invoice-drafts-local.sql and invoice-payments-local.sql. Idempotent.
begin;
create or replace function public.pro_credit_existing_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare row_json jsonb:=to_jsonb(new);v_owner uuid:=(row_json->>'user_id')::uuid;v_draft uuid;v_entry uuid;refunded bigint;
begin
 v_draft:=case when tg_table_name='pro_invoice_drafts' then (row_json->>'id')::uuid else (row_json->>'draft_id')::uuid end;
 if exists(select 1 from public.pro_credit_applications a where a.owner_id=v_owner and a.draft_id=v_draft and a.invoice_application_id is null)
  and public.pro_credit_draft_balance(v_owner,v_draft)<0 then raise exception 'Invoice total is below payments and credit notes' using errcode='22023',hint='pro_credit_notes_balance';end if;
 if tg_table_name='pro_invoice_payment_applications' then
  select p.entry_id into v_entry from public.pro_invoice_payments p where p.user_id=v_owner and p.id=(row_json->>'payment_id')::uuid;
  if v_entry is not null and exists(select 1 from public.pro_credits c where c.owner_id=v_owner and c.entry_id=v_entry and c.status='active') then
   select coalesce(sum(f.amount_cents),0) into refunded from public.pro_credit_refunds f join public.pro_credits c on c.owner_id=f.owner_id and c.id=f.credit_id
    where c.owner_id=v_owner and c.entry_id=v_entry and not exists(select 1 from public.pro_credit_refund_voids v where v.owner_id=f.owner_id and v.refund_id=f.id);
   if public.pro_credit_entry_free(v_owner,v_entry)-refunded<0 then raise exception 'Payment already refunded through a credit' using errcode='22023',hint='pro_credit_refunded';end if;
  end if;
 end if;
 return null;
end $$;
drop trigger if exists pro_credit_existing_guard on public.pro_invoice_payment_applications;
create constraint trigger pro_credit_existing_guard after insert on public.pro_invoice_payment_applications deferrable initially deferred for each row execute function public.pro_credit_existing_guard();
drop trigger if exists pro_credit_existing_guard on public.pro_invoice_drafts;
create constraint trigger pro_credit_existing_guard after update on public.pro_invoice_drafts deferrable initially deferred for each row execute function public.pro_credit_existing_guard();
revoke all on function public.pro_credit_existing_guard() from public,anon,authenticated;
commit;
