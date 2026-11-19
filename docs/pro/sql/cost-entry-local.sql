-- LOCAL PRO ONLY. Round 7C (2026-11-13): one «Registrar costo» form.
-- «Registrar gasto» in a job's Costs & payments now carries the same fields as «Nuevo gasto» in
-- Expenses: supplier, category, amount, VAT included, billable, payment method (+ receipt, uploaded
-- by the existing receipts route afterwards). This wrapper runs the existing job writer
-- (pro_work_costs_mutate 'create_expense': creates the expense and links it to the job, CAS on both
-- revisions, idempotent requestId) and stores the metadata in the SAME transaction exactly as the
-- expense metadata writer does (pro_expense_billing). Nothing else changes.
begin;
create or replace function public.pro_work_cost_expense_create(p_user uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare meta_keys text[]:=array['billable','paymentMethod','vatRateBps','category'];result jsonb;eid uuid;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is distinct from 'create_expense' then raise exception 'Invalid cost' using errcode='22023';end if;
 if (p_input ? 'billable' and jsonb_typeof(p_input->'billable') is distinct from 'boolean')
  or (p_input ? 'paymentMethod' and (jsonb_typeof(p_input->'paymentMethod') not in('string','null') or p_input->>'paymentMethod' not in('cash','transfer','card','sinpe','check','other')))
  or (p_input ? 'vatRateBps' and (jsonb_typeof(p_input->'vatRateBps') not in('number','null') or (p_input->>'vatRateBps')::integer not in(50,100,200,400,1300)))
  or (p_input ? 'category' and (jsonb_typeof(p_input->'category') not in('string','null') or p_input->>'category' not in('materials','labor','subcontract','equipment','transport','permits','other'))) then
  raise exception 'Invalid cost metadata' using errcode='22023';end if;
 result:=public.pro_work_costs_mutate(p_user,p_input-meta_keys);
 eid:=(p_input->>'expenseId')::uuid;
 if p_input ?| meta_keys and exists(select 1 from public.pro_internal_expenses where user_id=p_user and id=eid) then
  insert into public.pro_expense_billing(user_id,expense_id,billable,payment_method,vat_rate_bps,category)
  values(p_user,eid,coalesce((p_input->>'billable')::boolean,false),p_input->>'paymentMethod',(p_input->>'vatRateBps')::integer,p_input->>'category')
  on conflict(user_id,expense_id) do update set billable=excluded.billable,payment_method=excluded.payment_method,vat_rate_bps=excluded.vat_rate_bps,category=excluded.category,updated_at=now();
 end if;
 return result;
end $$;
revoke all on function public.pro_work_cost_expense_create(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_work_cost_expense_create(uuid,jsonb) to service_role;
commit;
notify pgrst,'reload schema';
