-- Pro row 75 (batch F): purchase-order commitments in the allowance reconciliation. Purchase order lines could already be
-- linked to an allowance (migration 300, allowance_id); the allowance panel did not show them. pro_work_allowance_commitments
-- sums, per allowance of one job, the lines linked to it:
--   committedCents = Σ(subtotal+tax) of lines on ISSUED, PARTIAL or RECEIVED orders (sent to the supplier),
--   draftCents     = Σ(subtotal+tax) of lines on DRAFT orders (not a commitment yet, shown apart),
--   receivedCents  = Σ round((subtotal+tax) × net received quantity / ordered quantity) on non-cancelled orders
--                    (receipts, reversals and returns of migration 411 net out),
--   orders         = number, status and id of each non-cancelled order with a linked line.
-- Cancelled orders never count. pro_work_allowances_read (migration 300) is re-defined with the same checks and keys plus a
-- top-level 'commitments' object (allowance id -> figures) and 'commitmentTotals', so the item JSON and the immutable history
-- stay unchanged. Read only: nothing is written, sent or charged. Reapplicable.
begin;
create or replace function public.pro_work_allowance_commitments(p_owner uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with lines as materialized(
  select l.allowance_id aid,o.id oid,o.number,o.status,(l.subtotal_cents+l.tax_cents)::bigint cents,l.quantity,
   coalesce((select sum(r.quantity) from public.pro_purchase_order_receipts r where r.owner_id=l.owner_id and r.line_id=l.id),0) received
  from public.pro_purchase_order_lines l join public.pro_purchase_orders o on o.owner_id=l.owner_id and o.id=l.order_id
  where l.owner_id=p_owner and l.work_id=p_work and o.work_id=p_work and l.allowance_id is not null and o.status<>'cancelled'),
 per as(
  select aid,
   coalesce(sum(cents) filter(where status in('issued','partial','received')),0)::bigint committed,
   coalesce(sum(cents) filter(where status='draft'),0)::bigint draft,
   coalesce(sum(round(cents*greatest(received,0)/quantity)),0)::bigint received,
   (select jsonb_agg(jsonb_build_object('id',x.oid,'number',x.number,'status',x.status) order by x.number)
     from (select distinct l2.oid,l2.number,l2.status from lines l2 where l2.aid=lines.aid) x) orders
  from lines group by aid)
 select coalesce(jsonb_object_agg(aid::text,jsonb_build_object('committedCents',committed,'draftCents',draft,'receivedCents',received,'orders',orders)),'{}'::jsonb) from per;
$$;
create or replace function public.pro_work_allowances_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;hist jsonb;linked jsonb;commitments jsonb;live_ids text[];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid allowance query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(public.pro_work_allowance_json(a) order by a.archived,a.position),'[]'::jsonb) into items
  from public.pro_work_allowances a where a.owner_id=p_actor and a.work_id=p_work;
 select coalesce(jsonb_object_agg(c.id::text,c.status),'{}'::jsonb) into linked from public.pro_work_changes c
  where c.owner_id=p_actor and c.work_id=p_work and c.id in(select a.change_id from public.pro_work_allowances a where a.owner_id=p_actor and a.work_id=p_work and a.change_id is not null);
 select coalesce(jsonb_agg(x.content order by x.at desc,x.action_id),'[]'::jsonb) into hist from (
  select h.at,h.action_id,jsonb_build_object('actionId',h.action_id,'allowanceId',h.allowance_id,'action',h.action,'at',h.at,'before',h.before_item,'after',h.after_item) as content
  from public.pro_work_allowance_history h where h.owner_id=p_actor and h.work_id=p_work order by h.at desc,h.action_id limit 100
 ) x;
 commitments:=public.pro_work_allowance_commitments(p_actor,p_work);
 -- Totals follow the allowance totals: archived allowances stay out.
 select coalesce(array_agg(a.id::text),array[]::text[]) into live_ids from public.pro_work_allowances a where a.owner_id=p_actor and a.work_id=p_work and not a.archived;
 return jsonb_build_object('workId',p_work,'today',public.pro_work_allowance_today(),'items',items,'totals',public.pro_work_allowance_totals(p_actor,p_work),'history',hist,'changeStatuses',linked,
  'commitments',commitments,
  'commitmentTotals',jsonb_build_object(
   'committedCents',coalesce((select sum((v->>'committedCents')::bigint) from jsonb_each(commitments) e(k,v) where k=any(live_ids)),0),
   'draftCents',coalesce((select sum((v->>'draftCents')::bigint) from jsonb_each(commitments) e(k,v) where k=any(live_ids)),0),
   'receivedCents',coalesce((select sum((v->>'receivedCents')::bigint) from jsonb_each(commitments) e(k,v) where k=any(live_ids)),0)));
end $$;
do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_work_allowance_commitments','pro_work_allowances_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
