-- LOCAL ONLY. Private internal acknowledgement of an EXISTING recorded payment.
-- No payment/debt/ledger creation, numbering, fiscal receipt, issuance or delivery.
-- Install after client-operations, invoice-issuer and client-fiscal SQL.
begin;
create table if not exists public.pro_payment_receipts(
 user_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 entry_id uuid not null,
 client_id text not null,
 work_id text not null,
 client_name text not null,
 work_title text not null,
 receiver jsonb not null check(jsonb_typeof(receiver)='object'),
 issuer jsonb not null check(jsonb_typeof(issuer)='object'),
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 payment_registered_at timestamptz not null,
 prepared_at timestamptz not null default now(),
 note text not null,
 primary key(user_id,id),unique(user_id,entry_id),
 foreign key(user_id,entry_id) references public.pro_client_entries(user_id,id) on delete cascade,
 check(id=entry_id)
);
create index if not exists pro_payment_receipts_page on public.pro_payment_receipts(user_id,prepared_at desc,id asc);
create index if not exists pro_payment_receipts_client_page on public.pro_payment_receipts(user_id,client_id,prepared_at desc,id asc);
create or replace function public.pro_payment_receipt_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 raise exception 'Prepared payment receipt snapshots are immutable' using errcode='22023';
end $$;
drop trigger if exists pro_payment_receipt_immutable on public.pro_payment_receipts;
create trigger pro_payment_receipt_immutable before update on public.pro_payment_receipts for each row execute function pro_payment_receipt_immutable();
alter table public.pro_payment_receipts enable row level security;
drop policy if exists pro_payment_receipts_owner on public.pro_payment_receipts;
create policy pro_payment_receipts_owner on public.pro_payment_receipts for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pro_payment_receipts from public,anon,authenticated;
grant select on public.pro_payment_receipts to authenticated;
grant all on public.pro_payment_receipts to service_role;
create or replace function public.pro_payment_receipt_read(p_user uuid,p_id uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'entryId',r.entry_id,'clientId',r.client_id,'workId',r.work_id,'clientName',r.client_name,'workTitle',r.work_title,'receiver',r.receiver,'issuer',r.issuer,'amountCents',r.amount_cents,'currency','CRC','paymentRegisteredAt',r.payment_registered_at,'preparedAt',r.prepared_at,'note',r.note,'reversed',v.id is not null,'voidedAt',v.created_at,'voidReason',v.label)
 from pro_payment_receipts r
 left join pro_client_entries v on v.user_id=r.user_id and v.reversal_id=r.entry_id and v.kind='payment_void'
 where r.user_id=p_user and r.id=p_id;
$$;
create or replace function public.pro_payment_receipt_prepare(p_user uuid,p_entry uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing jsonb;e pro_client_entries;c pro_clients;w pro_work;receiver_snapshot jsonb;issuer_snapshot jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 existing:=pro_payment_receipt_read(p_user,p_entry);
 if existing is not null then return existing;end if;
 select * into e from pro_client_entries where user_id=p_user and id=p_entry and kind='payment' for share;
 if e.id is null then return null;end if;
 select * into c from pro_clients where user_id=p_user and id=e.client_id;
 select * into w from pro_work where user_id=p_user and id=e.work_id;
 if c.id is null or w.id is null then return null;end if;
 receiver_snapshot:=pro_client_fiscal_read(p_user,e.client_id)->'receiver';
 issuer_snapshot:=pro_invoice_issuer_read(p_user)->'issuer';
 insert into pro_payment_receipts(user_id,id,entry_id,client_id,work_id,client_name,work_title,receiver,issuer,amount_cents,payment_registered_at,note)
 values(p_user,e.id,e.id,e.client_id,e.work_id,c.name,w.service,receiver_snapshot,issuer_snapshot,e.amount_cents,e.created_at,e.label);
 return pro_payment_receipt_read(p_user,e.id);
end $$;
create or replace function public.pro_payment_receipts_page(p_user uuid,p_query text default '',p_status text default 'all',p_client text default '',p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_query is null or length(p_query)>160 or p_status is null or p_status not in ('all','active','reversed') or p_client is null or length(p_client)>160 then raise exception 'Invalid receipt query' using errcode='22023';end if;
 if p_after is not null and (jsonb_typeof(p_after)<>'object' or nullif(p_after->>'at','') is null or nullif(p_after->>'id','') is null) then raise exception 'Invalid receipt cursor' using errcode='22023';end if;
 with matches as (
 select r.prepared_at,r.id,pro_payment_receipt_read(p_user,r.id)-'receiver'-'issuer' as document
 from pro_payment_receipts r
 where r.user_id=p_user and (p_client='' or r.client_id=p_client)
 and (p_status='all' or (p_status='reversed')=exists(select 1 from pro_client_entries v where v.user_id=r.user_id and v.reversal_id=r.entry_id and v.kind='payment_void'))
 -- strpos gives literal matching: %, _ and backslash never become SQL wildcards.
 and strpos(pro_catalog_search(concat_ws(' ',r.client_name,r.work_title,r.receiver->>'name',r.receiver->>'identification',r.issuer->>'issuerName',r.note)),pro_catalog_search(p_query))>0
 and (p_after is null or r.prepared_at<(p_after->>'at')::timestamptz or r.prepared_at=(p_after->>'at')::timestamptz and r.id>(p_after->>'id')::uuid)
 order by r.prepared_at desc,r.id asc limit 21
 ), page as (select * from matches order by prepared_at desc,id asc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(document order by prepared_at desc,id asc) from page),'[]'::jsonb),'nextCursor',case when (select count(*) from matches)>20 then (select jsonb_build_object('at',prepared_at,'id',id) from page order by prepared_at asc,id desc limit 1) else null end) into result;
 return result;
end $$;
revoke all on function pro_payment_receipt_immutable(),pro_payment_receipt_read(uuid,uuid),pro_payment_receipt_prepare(uuid,uuid),pro_payment_receipts_page(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function pro_payment_receipt_immutable(),pro_payment_receipt_read(uuid,uuid),pro_payment_receipt_prepare(uuid,uuid),pro_payment_receipts_page(uuid,text,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
