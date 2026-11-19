-- LOCAL ONLY. Additive storage: no backfill, inferred debt, or workspace JSON changes.
begin;
create table if not exists public.pro_client_entries(
 user_id uuid not null,
 id uuid not null,
 position bigint generated always as identity,
 client_id text not null,
 work_id text not null,
 kind text not null check(kind in ('agreement','payment','material','payment_void','material_return')),
 amount_cents bigint check(amount_cents between 0 and 10000000000),
 product_id text,
 quantity numeric(14,3) check(quantity>0 and quantity<=100000),
 unit_cost numeric,
 label text not null check(length(label)<=160),
 reversal_id uuid,
 request_hash text not null,
 created_at timestamptz not null default now(),
 primary key(user_id,id),
 foreign key(user_id,work_id) references public.pro_work(user_id,id),
 foreign key(user_id,client_id) references public.pro_clients(user_id,id),
 foreign key(user_id,product_id) references public.pro_products(user_id,id),
 foreign key(user_id,reversal_id) references public.pro_client_entries(user_id,id),
 check((kind in ('agreement','payment','payment_void') and amount_cents is not null and product_id is null and quantity is null and unit_cost is null)
 or (kind in ('material','material_return') and amount_cents is null and product_id is not null and quantity is not null and unit_cost is not null)),
 check((kind in ('payment_void','material_return'))=(reversal_id is not null))
);
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.pro_client_entries'::regclass and conname='pro_client_entries_owner_fkey') then
  alter table public.pro_client_entries add constraint pro_client_entries_owner_fkey foreign key(user_id) references public.profiles(id) on delete cascade;
 end if;
end $$;
create unique index if not exists pro_client_entry_reversal on public.pro_client_entries(user_id,reversal_id) where reversal_id is not null;
create index if not exists pro_client_entries_work on public.pro_client_entries(user_id,work_id,position desc);
create index if not exists pro_client_entries_customer on public.pro_client_entries(user_id,client_id,position desc);
alter table public.pro_client_entries enable row level security;
drop policy if exists pro_client_entries_owner on public.pro_client_entries;
create policy pro_client_entries_owner on public.pro_client_entries for select to authenticated using(user_id=auth.uid());
revoke all on public.pro_client_entries from public,anon,authenticated;
grant select on public.pro_client_entries to authenticated;
grant all on public.pro_client_entries to service_role;
grant usage,select on sequence public.pro_client_entries_position_seq to service_role;
create or replace function public.pro_work_account(p_user uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with account_values as (
 select w.*,
 (select amount_cents from pro_client_entries where user_id=p_user and work_id=w.id and kind='agreement' order by position desc limit 1) as agreed,
 (select coalesce(sum(case when kind='payment' then amount_cents when kind='payment_void' then -amount_cents else 0 end),0) from pro_client_entries where user_id=p_user and work_id=w.id) as paid,
 (select count(*) from pro_client_entries e where e.user_id=p_user and e.work_id=w.id and e.kind='material' and not exists(select 1 from pro_client_entries r where r.user_id=e.user_id and r.reversal_id=e.id)) as materials,
 (select coalesce(sum(case when kind='material' then round(quantity*unit_cost,2) when kind='material_return' then -round(quantity*unit_cost,2) else 0 end),0) from pro_client_entries where user_id=p_user and work_id=w.id) as material_cost
 from pro_work w where w.user_id=p_user and w.id=p_work
 ) select jsonb_build_object('id',id,'service',service,'stage',stage,'cancelled',cancelled,'start',start,'quoteId',"quoteId",'externalQuoteId',"externalQuoteId",'agreedCents',agreed,'paidCents',paid,'balanceCents',coalesce(agreed,0)-paid,'materialCount',materials,'materialCost',material_cost) from account_values;
$$;
create or replace function public.pro_client_operations_page(p_user uuid,p_client text,p_work text default '',p_after jsonb default null,p_entries_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with accounts as materialized (
 select pro_work_account(p_user,w.id) as a,coalesce(to_char(pro_instant(w.start) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'') as at from pro_work w where w.user_id=p_user and w."clientId"=p_client
 ), page as (
 select a,at from accounts where p_after is null or at<p_after->>'at' or at=p_after->>'at' and a->>'id'>p_after->>'id' order by at desc,a->>'id' limit 21
 ), entries as (
 select e.*,exists(select 1 from pro_client_entries r where r.user_id=e.user_id and r.reversal_id=e.id) as reversed
 from pro_client_entries e where e.user_id=p_user and e.client_id=p_client and e.work_id=p_work and (p_entries_after is null or e.position<(p_entries_after->>'position')::bigint) order by e.position desc limit 21
 ) select jsonb_build_object(
 'revision',(select revision from pro_workspace_core where user_id=p_user),
 'summary',jsonb_build_object('agreedCents',coalesce((select sum((a->>'agreedCents')::bigint) from accounts),0),'paidCents',coalesce((select sum((a->>'paidCents')::bigint) from accounts),0),'balanceCents',coalesce((select sum((a->>'balanceCents')::bigint) from accounts),0),'unpriced',(select count(*) from accounts where a->>'agreedCents' is null and not(a->>'cancelled')::boolean)),
 'items',coalesce((select jsonb_agg(a order by at desc,a->>'id') from (select a,at from page order by at desc,a->>'id' limit 20) p),'[]'),
 'nextCursor',case when (select count(*) from page)>20 then (select jsonb_build_object('at',at,'id',a->>'id') from page order by at desc,a->>'id' offset 19 limit 1) else null end,
 'work',(select a from accounts where a->>'id'=p_work),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amountCents',amount_cents,'quantity',quantity,'label',label,'at',created_at,'reversed',reversed) order by position desc) from (select * from entries order by position desc limit 20) p),'[]'),
 'nextEntryCursor',case when (select count(*) from entries)>20 then (select jsonb_build_object('position',position::text) from entries order by position desc offset 19 limit 1) else null end
 ) where exists(select 1 from pro_clients where user_id=p_user and id=p_client) and (p_work='' or exists(select 1 from pro_work where user_id=p_user and "clientId"=p_client and id=p_work));
$$;
create or replace function public.pro_record_client_operation(p_user uuid,p_input jsonb,p_revision integer) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integer; w pro_work; c pro_clients; product pro_products; original pro_client_entries; previous pro_client_entries;
 account jsonb; k text:=p_input->>'kind'; n bigint; qty numeric; title text; prod text; cost numeric; reverse_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into v from pro_workspace_core where user_id=p_user for update;
 select * into previous from pro_client_entries where user_id=p_user and id=(p_input->>'actionId')::uuid;
 if found then
  if previous.request_hash<>md5(p_input::text) then raise exception 'Request changed' using errcode='22023';end if;
  return v;
 end if;
 if v is null or v<>p_revision then raise exception 'Revision changed' using errcode='40001';end if;
 select * into w from pro_work where user_id=p_user and id=p_input->>'workId' for update;
 select * into c from pro_clients where user_id=p_user and id=p_input->>'clientId';
 if w.id is null or c.id is null or w."clientId"<>c.id then raise exception 'Invalid relationship' using errcode='22023';end if;
 if k not in ('payment_void','material_return') and (w.cancelled or c.archived) then raise exception 'Inactive work/customer' using errcode='22023';end if;
 account:=pro_work_account(p_user,w.id);
 if k in ('agreement','payment') then
  n:=(p_input->>'amountCents')::bigint;
  if n is null or n<0 or n>10000000000 or (p_input->>'amountCents')::numeric<>n then raise exception 'Invalid amount' using errcode='22023';end if;
  if k='agreement' and n<(account->>'paidCents')::bigint then raise exception 'Below paid amount' using errcode='22023';end if;
  if k='payment' and (n=0 or account->>'agreedCents' is null or n>(account->>'balanceCents')::bigint) then raise exception 'Invalid payment' using errcode='22023';end if;
  title:=coalesce(p_input->>'note','');
 elsif k='material' then
  qty:=(p_input->>'quantity')::numeric;
  select * into product from pro_products where user_id=p_user and id=p_input->>'productId' for update;
  if product.id is null or product.archived or product."itemType"='service' or qty is null or qty<=0 or qty>100000 or qty<>round(qty,3) or product.stock<qty then raise exception 'Invalid stock' using errcode='22023';end if;
  prod:=product.id;cost:=product.cost;title:=product.name;
 elsif k in ('payment_void','material_return') then
  select * into original from pro_client_entries where user_id=p_user and id=(p_input->>'entryId')::uuid;
  if original.id is null or original.work_id<>w.id or original.client_id<>c.id or original.kind<>(case when k='payment_void' then 'payment' else 'material' end) or exists(select 1 from pro_client_entries where user_id=p_user and reversal_id=original.id) or nullif(trim(p_input->>'note'),'') is null then raise exception 'Invalid reversal' using errcode='22023';end if;
  reverse_id:=original.id;title:=p_input->>'note';n:=original.amount_cents;qty:=original.quantity;prod:=original.product_id;cost:=original.unit_cost;
 else raise exception 'Invalid operation' using errcode='22023';end if;
 insert into pro_client_entries(user_id,id,client_id,work_id,kind,amount_cents,product_id,quantity,unit_cost,label,reversal_id,request_hash)
 values(p_user,(p_input->>'actionId')::uuid,c.id,w.id,k,n,prod,qty,cost,title,reverse_id,md5(p_input::text));
 if k in ('material','material_return') then
  update pro_products set stock=round(stock+(case when k='material' then -qty else qty end),3) where user_id=p_user and id=prod;
  insert into pro_movements(user_id,id,"productId",delta,reason,at) values(p_user,'client-operation:'||(p_input->>'actionId'),prod,case when k='material' then -qty else qty end,left((case when k='material' then 'Material utilizado: ' else 'Devolución: ' end)||w.service,160),to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 end if;
 update pro_workspace_core set revision=revision+1,updated_at=now() where user_id=p_user returning revision into v;
 return v;
end $$;
-- Protect operational history from reassignments through both scoped and compatibility writers.
create or replace function public.pro_protect_work_account() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (old."clientId"<>new."clientId" or old."quoteId" is distinct from new."quoteId" or old."externalQuoteId" is distinct from new."externalQuoteId") and exists(select 1 from pro_client_entries where user_id=old.user_id and work_id=old.id) then raise exception 'Work with entries cannot be reassigned' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists pro_protect_work_account on public.pro_work;
create trigger pro_protect_work_account before update on public.pro_work for each row execute function public.pro_protect_work_account();
revoke all on function public.pro_work_account(uuid,text),public.pro_client_operations_page(uuid,text,text,jsonb,jsonb),public.pro_record_client_operation(uuid,jsonb,integer),public.pro_protect_work_account() from public,anon,authenticated;
grant execute on function public.pro_work_account(uuid,text),public.pro_client_operations_page(uuid,text,text,jsonb,jsonb),public.pro_record_client_operation(uuid,jsonb,integer),public.pro_protect_work_account() to service_role;
notify pgrst,'reload schema';
commit;
