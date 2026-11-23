-- Pro family 52 (delivery follow-up): correct a receipt with an immutable reversal, record a return of delivered quantity, and read how the
-- purchase order lines linked to approved selections compare with the selection tracking (offered explicitly, never written automatically).
-- Reversals and returns are NEGATIVE rows of pro_purchase_order_receipts (kind 'reverse' / 'return'), so every existing sum (received quantity,
-- "received more than ordered", status) nets out without changing pro_purchase_orders_mutate. Rows are never edited or deleted.
-- pro_purchase_order_json is re-defined from migration 300 adding kind, reversesId and reversed to each receipt entry; nothing else changes.
-- Reapplicable.
begin;
alter table public.pro_purchase_order_receipts add column if not exists kind text not null default 'receipt';
alter table public.pro_purchase_order_receipts add column if not exists reverses_receipt_id uuid;
do $$declare c text;begin
 for c in select conname from pg_constraint where conrelid='public.pro_purchase_order_receipts'::regclass and contype='c' and pg_get_constraintdef(oid) like '%0.001%'
  and conname not in('pro_purchase_order_receipt_qty') loop
  execute format('alter table public.pro_purchase_order_receipts drop constraint %I',c);
 end loop;
 alter table public.pro_purchase_order_receipts drop constraint if exists pro_purchase_order_receipt_kind;
 alter table public.pro_purchase_order_receipts add constraint pro_purchase_order_receipt_kind check(kind in('receipt','reverse','return'));
 alter table public.pro_purchase_order_receipts drop constraint if exists pro_purchase_order_receipt_qty;
 alter table public.pro_purchase_order_receipts add constraint pro_purchase_order_receipt_qty check((kind='receipt' and quantity between 0.001 and 1000000) or (kind<>'receipt' and quantity between -1000000 and -0.001));
 alter table public.pro_purchase_order_receipts drop constraint if exists pro_purchase_order_receipt_shape;
 alter table public.pro_purchase_order_receipts add constraint pro_purchase_order_receipt_shape check((kind='reverse')=(reverses_receipt_id is not null) and (kind='receipt' or note is not null));
 for c in select conname from pg_constraint where conrelid='public.pro_purchase_order_history'::regclass and contype='c' and pg_get_constraintdef(oid) like '%reverse_payment%'
  and conname<>'pro_purchase_order_history_action_v2' loop
  execute format('alter table public.pro_purchase_order_history drop constraint %I',c);
 end loop;
 alter table public.pro_purchase_order_history drop constraint if exists pro_purchase_order_history_action_v2;
 alter table public.pro_purchase_order_history add constraint pro_purchase_order_history_action_v2 check(action in('create','update','issue','receive','pay','reverse_payment','cancel','reverse_receipt','return'));
end $$;
create unique index if not exists pro_purchase_order_one_receipt_reverse on public.pro_purchase_order_receipts(owner_id,reverses_receipt_id,line_id) where kind='reverse';

create or replace function public.pro_purchase_order_json(p_row public.pro_purchase_orders) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select public.pro_purchase_order_summary(p_row)||jsonb_build_object('notes',p_row.notes,'cancelReason',p_row.cancel_reason,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'position',l.position,'description',l.description,'quantity',l.quantity,'unit',l.unit,
    'unitCents',l.unit_cents,'taxRate',l.tax_rate,'subtotalCents',l.subtotal_cents,'taxCents',l.tax_cents,'totalCents',l.subtotal_cents+l.tax_cents,
    'budgetCodeId',l.budget_code_id,'selectionOptionId',l.selection_option_id,'allowanceId',l.allowance_id,
    'receivedQuantity',coalesce((select sum(r.quantity) from public.pro_purchase_order_receipts r where r.owner_id=l.owner_id and r.line_id=l.id),0)) order by l.position)
   from public.pro_purchase_order_lines l where l.owner_id=p_row.owner_id and l.order_id=p_row.id),'[]'::jsonb),
  'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'lineId',r.line_id,'quantity',r.quantity,'receivedOn',r.received_on,'note',r.note,'createdAt',r.created_at,
    'kind',r.kind,'reversesId',r.reverses_receipt_id,'reversed',r.kind='receipt' and exists(select 1 from public.pro_purchase_order_receipts x where x.owner_id=r.owner_id and x.reverses_receipt_id=r.id and x.line_id=r.line_id)) order by r.created_at,r.id,r.line_id)
   from public.pro_purchase_order_receipts r where r.owner_id=p_row.owner_id and r.order_id=p_row.id),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'paymentId',p.payment_id,'amountCents',p.amount_cents,'paidOn',p.paid_on,
    'method',p.method,'reference',p.reference,'note',p.note,'createdAt',p.created_at,
    'reversed',p.kind='payment' and exists(select 1 from public.pro_purchase_order_payments x where x.owner_id=p.owner_id and x.payment_id=p.id)) order by p.created_at,p.id)
   from public.pro_purchase_order_payments p where p.owner_id=p_row.owner_id and p.order_id=p_row.id),'[]'::jsonb));
$$;

-- Correct a receipt (reverse_receipt: the whole receipt line, kept in the record) or register a return of delivered quantity (return).
-- The status is recomputed from the net received quantity: all lines complete = received, something received = partial, nothing = issued.
create or replace function public.pro_purchase_order_receipt_adjust(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];wid text;aid uuid;rid uuid;rev integer;lid uuid;recid uuid;q numeric;v_day date;v_reason text;receipt public.pro_purchase_order_actions;r public.pro_purchase_orders;w record;
 target public.pro_purchase_order_receipts;ln public.pro_purchase_order_lines;net numeric;before_json jsonb;after_json jsonb;result jsonb;all_received boolean;any_received boolean;today date:=public.pro_purchase_order_today();
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid adjustment' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from (case act when 'reverse_receipt' then array['action','actionId','id','lineId','reason','receiptId','revision','workId']
   when 'return' then array['action','actionId','id','lineId','quantity','reason','returnedOn','revision','workId'] end)
  or jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) then raise exception 'Invalid adjustment fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=public.pro_po_uuid_value(p_input->'actionId');rid:=public.pro_po_uuid_value(p_input->'id');lid:=public.pro_po_uuid_value(p_input->'lineId');rev:=(p_input->>'revision')::integer;
 v_reason:=public.pro_purchase_order_text(p_input->'reason',300,true);
 if act='reverse_receipt' then recid:=public.pro_po_uuid_value(p_input->'receiptId');v_day:=today;
 else
  if jsonb_typeof(p_input->'quantity') is distinct from 'number' then raise exception 'Invalid quantity' using errcode='22023';end if;
  q:=(p_input->>'quantity')::numeric;if q<>round(q,3) or q not between 0.001 and 1000000 then raise exception 'Invalid quantity' using errcode='22023';end if;
  v_day:=public.pro_purchase_order_day(p_input->'returnedOn',true);
 end if;
 select w2.cancelled into w from public.pro_work w2 where w2.user_id=p_actor and w2.id=wid;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-purchase-order-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_purchase_order_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-purchase-order-work:'||p_actor::text||':'||wid,0));
 select * into r from public.pro_purchase_orders where owner_id=p_actor and work_id=wid and id=rid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if r.revision<>rev then raise exception 'Purchase order changed' using errcode='40001';end if;
 if r.status not in('issued','partial','received') then raise exception 'Only delivered orders can be adjusted' using errcode='22023';end if;
 select * into ln from public.pro_purchase_order_lines where owner_id=p_actor and order_id=rid and id=lid;
 if not found then raise exception 'Unknown line' using errcode='22023';end if;
 select coalesce(sum(x.quantity),0) into net from public.pro_purchase_order_receipts x where x.owner_id=p_actor and x.line_id=lid;
 before_json:=public.pro_purchase_order_json(r);
 if act='reverse_receipt' then
  select * into target from public.pro_purchase_order_receipts where owner_id=p_actor and order_id=rid and id=recid and line_id=lid and kind='receipt';
  if not found then raise exception 'Unknown receipt' using errcode='22023';end if;
  if exists(select 1 from public.pro_purchase_order_receipts where owner_id=p_actor and reverses_receipt_id=recid and line_id=lid) then raise exception 'Receipt already reversed' using errcode='22023';end if;
  if net-target.quantity<0 then raise exception 'Reverse the returns of this line first' using errcode='22023';end if;
  insert into public.pro_purchase_order_receipts(owner_id,order_id,id,line_id,quantity,received_on,note,kind,reverses_receipt_id) values(p_actor,rid,aid,lid,-target.quantity,v_day,v_reason,'reverse',recid);
 else
  if v_day<r.issue_date or v_day>today then raise exception 'Invalid return date' using errcode='22023';end if;
  if q>net then raise exception 'Returned more than received' using errcode='22023';end if;
  insert into public.pro_purchase_order_receipts(owner_id,order_id,id,line_id,quantity,received_on,note,kind) values(p_actor,rid,aid,lid,-q,v_day,v_reason,'return');
 end if;
 select coalesce(bool_and(coalesce(s.net,0)>=l.quantity),false),coalesce(bool_or(coalesce(s.net,0)>0),false) into all_received,any_received
  from public.pro_purchase_order_lines l left join lateral(select sum(x.quantity) net from public.pro_purchase_order_receipts x where x.owner_id=l.owner_id and x.line_id=l.id) s on true
  where l.owner_id=p_actor and l.order_id=rid;
 update public.pro_purchase_orders set status=case when all_received then 'received' when any_received then 'partial' else 'issued' end,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
 after_json:=public.pro_purchase_order_json(r);result:=jsonb_build_object('order',after_json);
 insert into public.pro_purchase_order_history(owner_id,work_id,order_id,action_id,action,before_value,after_value) values(p_actor,wid,rid,aid,act,before_json,after_json);
 insert into public.pro_purchase_order_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Selections linked to the lines of an order: where the selection tracking is, what the order says, and the move that would reflect it.
-- rank: not_ordered 0, ordered 1, delivered 2, installed 3. Read only; the owner applies it through the selection tracking writer.
create or replace function public.pro_purchase_order_selection_sync(p_actor uuid,p_work text,p_order uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare o public.pro_purchase_orders;install date;today date:=public.pro_purchase_order_today();
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_order is null then raise exception 'Invalid query' using errcode='22023';end if;
 select * into o from public.pro_purchase_orders where owner_id=p_actor and work_id=p_work and id=p_order;
 if not found then return null;end if;
 select t.install_on into install from public.pro_purchase_order_tracking t where t.owner_id=p_actor and t.order_id=p_order;
 return jsonb_build_object('orderId',o.id,'orderStatus',o.status,'items',case when o.status in('draft','cancelled') then '[]'::jsonb else coalesce((select jsonb_agg(row_json order by item_name) from (
  select i.name item_name,jsonb_build_object('itemId',i.id,'name',i.name,'orderedQuantity',sum(l.quantity),'receivedQuantity',sum(coalesce(s.net,0)),
   'current',coalesce(tr.status,'not_ordered'),'trackingRevision',coalesce(tr.revision,0),
   'suggested',(case when sum(coalesce(s.net,0))>=sum(l.quantity) and install is not null and install<=today then 'installed'
     when sum(coalesce(s.net,0))>=sum(l.quantity) then 'delivered' else 'ordered' end)) row_json
  from public.pro_purchase_order_lines l
  join public.pro_work_selection_items i on i.owner_id=l.owner_id and i.work_id=p_work and i.approved_option_id=l.selection_option_id and i.status='approved' and not i.archived
  left join public.pro_work_selection_tracking tr on tr.owner_id=i.owner_id and tr.item_id=i.id
  left join lateral(select sum(x.quantity) net from public.pro_purchase_order_receipts x where x.owner_id=l.owner_id and x.line_id=l.id) s on true
  where l.owner_id=p_actor and l.order_id=p_order and l.selection_option_id is not null
  group by i.id,i.name,tr.status,tr.revision) q),'[]'::jsonb) end);
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_purchase_order_json','pro_purchase_order_receipt_adjust','pro_purchase_order_selection_sync') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
