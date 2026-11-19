-- LOCAL ONLY. Optional draft preparation; never fiscal authorization or payment settlement.
begin;
create table if not exists public.pro_invoice_preparation(
 user_id uuid not null,draft_id uuid not null,
 issuer_name text not null check(length(issuer_name)<=160),
 issuer_id_type text not null check(issuer_id_type in ('','individual','company','dimex','nite','foreign')),
 issuer_id text not null check(length(issuer_id)<=40),issuer_email text not null check(length(issuer_email)<=254),
 issuer_phone text not null check(length(issuer_phone)<=30),issuer_address text not null check(length(issuer_address)<=500),
 issuer_activity text not null check(issuer_activity='' or issuer_activity ~ '^[0-9.]{1,12}$'),
 planned_date date,sale_condition text not null check(sale_condition in ('','cash','credit')),
 credit_days integer not null check(credit_days between 0 and 3650),
 payment_method text not null check(payment_method in ('','cash','card','transfer','sinpe','other')),
 order_reference text not null check(length(order_reference)<=80),
 primary key(user_id,draft_id),foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade,
 check((sale_condition='credit' and credit_days>=1 and planned_date is not null) or (sale_condition<>'credit' and credit_days=0))
);
alter table pro_invoice_preparation enable row level security;
drop policy if exists pro_invoice_preparation_owner on pro_invoice_preparation;
create policy pro_invoice_preparation_owner on pro_invoice_preparation for select to authenticated using(user_id=auth.uid());
revoke all on pro_invoice_preparation from public,anon,authenticated;
grant select on pro_invoice_preparation to authenticated;
grant all on pro_invoice_preparation to service_role;
create or replace function public.pro_invoice_full_read(p_user uuid,p_id uuid,p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select pro_invoice_draft_read(p_user,p_id,p_after)||jsonb_build_object('preparation',(
 select jsonb_build_object('issuerName',issuer_name,'issuerIdType',issuer_id_type,'issuerId',issuer_id,'issuerEmail',issuer_email,'issuerPhone',issuer_phone,'issuerAddress',issuer_address,'issuerActivity',issuer_activity,'plannedDate',coalesce(planned_date::text,''),'saleCondition',sale_condition,'creditDays',credit_days,'paymentMethod',payment_method,'orderReference',order_reference)
 from pro_invoice_preparation where user_id=p_user and draft_id=p_id));
$$;
create or replace function public.pro_invoice_full_save(p_user uuid,p_input jsonb) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved uuid;existing text;v jsonb:=p_input->'preparation';
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'action'='create' then existing:=pro_invoice_source(p_user,p_input->>'kind',p_input->>'sourceId')->>'existingId';end if;
 saved:=pro_invoice_draft_save(p_user,p_input);
 -- A retry of create must never overwrite any existing snapshot or receiver.
 if existing is not null or not(p_input ? 'preparation') then return saved;end if;
 if p_input->>'action' not in ('create','update') or jsonb_typeof(v)<>'object' then raise exception 'Invalid preparation' using errcode='22023';end if;
 insert into pro_invoice_preparation(user_id,draft_id,issuer_name,issuer_id_type,issuer_id,issuer_email,issuer_phone,issuer_address,issuer_activity,planned_date,sale_condition,credit_days,payment_method,order_reference)
 values(p_user,saved,v->>'issuerName',v->>'issuerIdType',v->>'issuerId',v->>'issuerEmail',v->>'issuerPhone',v->>'issuerAddress',v->>'issuerActivity',nullif(v->>'plannedDate','')::date,v->>'saleCondition',(v->>'creditDays')::integer,v->>'paymentMethod',v->>'orderReference')
 on conflict(user_id,draft_id) do update set issuer_name=excluded.issuer_name,issuer_id_type=excluded.issuer_id_type,issuer_id=excluded.issuer_id,issuer_email=excluded.issuer_email,issuer_phone=excluded.issuer_phone,issuer_address=excluded.issuer_address,issuer_activity=excluded.issuer_activity,planned_date=excluded.planned_date,sale_condition=excluded.sale_condition,credit_days=excluded.credit_days,payment_method=excluded.payment_method,order_reference=excluded.order_reference;
 return saved;
end $$;
revoke all on function pro_invoice_full_read(uuid,uuid,jsonb),pro_invoice_full_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_invoice_full_read(uuid,uuid,jsonb),pro_invoice_full_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
