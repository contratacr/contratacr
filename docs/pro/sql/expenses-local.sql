-- LOCAL ONLY: internal supplier/expense ledger. No fiscal issuance or external payments.
begin;
create table if not exists public.pro_expense_state(user_id uuid primary key references public.profiles(id) on delete cascade,revision bigint not null default 0 check(revision>=0));
create table if not exists public.pro_expense_suppliers(user_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,name text not null check(length(trim(name)) between 1 and 160),identification text not null default '' check(length(identification)<=40),email text not null default '' check(length(email)<=254),phone text not null default '' check(length(phone)<=40),archived boolean not null default false,primary key(user_id,id));
create table if not exists public.pro_internal_expenses(user_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,supplier_id uuid not null,supplier_name text not null check(length(trim(supplier_name)) between 1 and 160),expense_date date not null,due_date date,currency text not null check(currency='CRC'),concept text not null check(length(trim(concept)) between 1 and 300),amount_cents bigint not null check(amount_cents between 1 and 10000000000),created_at timestamptz not null default now(),primary key(user_id,id),foreign key(user_id,supplier_id) references pro_expense_suppliers(user_id,id),check(due_date is null or due_date>=expense_date));
create table if not exists public.pro_expense_payments(user_id uuid not null,expense_id uuid not null,id uuid not null,kind text not null check(kind in ('payment','reverse')),payment_id uuid,amount_cents bigint not null check(amount_cents between 1 and 10000000000),paid_on date not null,method text not null check(method in ('cash','transfer','card','other')),reference text not null check(length(reference)<=160),note text not null check(length(note)<=300),created_at timestamptz not null default now(),primary key(user_id,id),foreign key(user_id,expense_id) references pro_internal_expenses(user_id,id) on delete cascade,unique(user_id,expense_id,id),foreign key(user_id,expense_id,payment_id) references pro_expense_payments(user_id,expense_id,id),check((kind='payment' and payment_id is null) or (kind='reverse' and payment_id is not null and length(trim(note))>0)));
create unique index if not exists pro_expense_one_reverse on pro_expense_payments(user_id,payment_id) where kind='reverse';
create index if not exists pro_expense_payments_expense on pro_expense_payments(user_id,expense_id,id);
create table if not exists public.pro_expense_requests(user_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result_id uuid not null,revision bigint not null,primary key(user_id,action_id));
create or replace function public.pro_expense_summary(p_user uuid,p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'supplierId',e.supplier_id,'supplierName',e.supplier_name,'date',e.expense_date,'dueDate',e.due_date,'currency',e.currency,'concept',e.concept,'amountCents',e.amount_cents,'paidCents',v.paid,'balanceCents',e.amount_cents-v.paid,'status',case when v.paid=0 then 'pending' when v.paid=e.amount_cents then 'paid' else 'partial' end)
 from pro_internal_expenses e cross join lateral(select coalesce(sum(case when kind='payment' then amount_cents else -amount_cents end),0)::bigint paid from pro_expense_payments where user_id=e.user_id and expense_id=e.id) v where e.user_id=p_user and e.id=p_id;
$$;
create or replace function public.pro_expenses_read(p_user uuid,p_query jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare rows jsonb;cursor_id uuid:=nullif(p_query->>'after','')::uuid;detail_id uuid:=nullif(p_query->>'id','')::uuid;rev bigint;result jsonb;
begin
 if length(coalesce(p_query->>'q',''))>160 or coalesce(p_query->>'kind','expenses') not in ('suppliers','expenses') then raise exception 'Invalid query' using errcode='22023';end if;
 select coalesce((select revision from pro_expense_state where user_id=p_user),0) into rev;
 if detail_id is not null and p_query->>'kind'='suppliers' then
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'identification',s.identification,'email',s.email,'phone',s.phone,'archived',s.archived)),'[]') into rows from pro_expense_suppliers s where s.user_id=p_user and s.id=detail_id;
 return jsonb_build_object('revision',rev,'items',rows,'nextCursor',null);
 end if;
 if detail_id is not null then
 select coalesce(jsonb_agg(row order by id),'[]') into rows from(select p.id,jsonb_build_object('id',p.id,'kind',p.kind,'paymentId',p.payment_id,'amountCents',p.amount_cents,'date',p.paid_on,'method',p.method,'reference',p.reference,'note',p.note,'createdAt',p.created_at,'reversed',exists(select 1 from pro_expense_payments r where r.user_id=p.user_id and r.payment_id=p.id)) row from pro_expense_payments p where p.user_id=p_user and detail_id=p.expense_id and (cursor_id is null or p.id>cursor_id) order by p.id limit 21) t;
 return jsonb_build_object('revision',rev,'items','[]'::jsonb,'nextCursor',case when jsonb_array_length(rows)>20 then rows->19->>'id' else null end,'expense',pro_expense_summary(p_user,detail_id),'payments',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(rows) with ordinality t(e,n) where n<=20));
 end if;
 if coalesce(p_query->>'kind','expenses')='suppliers' then
 select coalesce(jsonb_agg(row order by id),'[]') into rows from(select s.id,jsonb_build_object('id',s.id,'name',s.name,'identification',s.identification,'email',s.email,'phone',s.phone,'archived',s.archived) row from pro_expense_suppliers s where s.user_id=p_user and (cursor_id is null or s.id>cursor_id) and s.archived=(coalesce(p_query->>'archived','0')='1') and strpos(lower(concat_ws(' ',s.name,s.identification,s.email)),lower(coalesce(p_query->>'q','')))>0 order by s.id limit 21) t;
 else
 select coalesce(jsonb_agg(row order by id),'[]') into rows from(select e.id,pro_expense_summary(p_user,e.id) row from pro_internal_expenses e where e.user_id=p_user and (cursor_id is null or e.id>cursor_id) and strpos(lower(concat_ws(' ',e.concept,e.supplier_name)),lower(coalesce(p_query->>'q','')))>0 order by e.id limit 21) t;
 end if;
 result:=jsonb_build_object('revision',rev,'items',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(rows) with ordinality t(e,n) where n<=20),'nextCursor',case when jsonb_array_length(rows)>20 then rows->19->>'id' else null end);return result;
end $$;
create or replace function public.pro_expenses_save(p_user uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare rev bigint;act text:=p_input->>'action';aid uuid:=(p_input->>'actionId')::uuid;rid uuid;prior pro_expense_requests;exp pro_internal_expenses;supplier pro_expense_suppliers;payment pro_expense_payments;paid bigint;amount bigint;dt date;
begin
 if not exists(select 1 from profiles where id=p_user and not coalesce(is_disabled,false)) then raise exception 'Invalid owner' using errcode='22023';end if;
 insert into pro_expense_state(user_id) values(p_user) on conflict do nothing;
 select revision into rev from pro_expense_state where user_id=p_user for update;
 select * into prior from pro_expense_requests where user_id=p_user and action_id=aid;
 if found then if prior.input<>p_input then raise exception 'Request changed' using errcode='22023';end if;return jsonb_build_object('id',prior.result_id,'revision',prior.revision);end if;
 if (p_input->>'revision')::bigint is distinct from rev then raise exception 'Revision changed' using errcode='40001';end if;
 if act='supplier' then
 rid:=(p_input->>'id')::uuid;
 insert into pro_expense_suppliers(user_id,id,name,identification,email,phone,archived) values(p_user,rid,trim(p_input->>'name'),p_input->>'identification',p_input->>'email',p_input->>'phone',(p_input->>'archived')::boolean)
 on conflict(user_id,id) do update set name=excluded.name,identification=excluded.identification,email=excluded.email,phone=excluded.phone,archived=excluded.archived;
 elsif act='expense' then
 rid:=(p_input->>'id')::uuid;select * into exp from pro_internal_expenses where user_id=p_user and id=rid;
 select * into supplier from pro_expense_suppliers where user_id=p_user and id=(p_input->>'supplierId')::uuid;
 if not found or supplier.archived and (exp.id is null or exp.supplier_id<>supplier.id) then raise exception 'Invalid supplier' using errcode='22023';end if;
 amount:=(p_input->>'amountCents')::bigint;dt:=(p_input->>'date')::date;
 select coalesce(sum(case when kind='payment' then amount_cents else -amount_cents end),0) into paid from pro_expense_payments where user_id=p_user and expense_id=rid;
 if amount<paid or exists(select 1 from pro_expense_payments where user_id=p_user and expense_id=rid and paid_on<dt) then raise exception 'Expense below payments or invalid date' using errcode='22023';end if;
 insert into pro_internal_expenses(user_id,id,supplier_id,supplier_name,expense_date,due_date,currency,concept,amount_cents) values(p_user,rid,supplier.id,case when exp.supplier_id=supplier.id then exp.supplier_name else supplier.name end,dt,(p_input->>'dueDate')::date,p_input->>'currency',trim(p_input->>'concept'),amount)
 on conflict(user_id,id) do update set supplier_id=excluded.supplier_id,supplier_name=excluded.supplier_name,expense_date=excluded.expense_date,due_date=excluded.due_date,currency=excluded.currency,concept=excluded.concept,amount_cents=excluded.amount_cents;
 elsif act in ('payment','reverse') then
 select * into exp from pro_internal_expenses where user_id=p_user and id=(p_input->>'expenseId')::uuid;
 if not found then raise exception 'Invalid expense' using errcode='22023';end if;
 rid:=aid;dt:=(p_input->>'date')::date;if dt<exp.expense_date then raise exception 'Invalid payment date' using errcode='22023';end if;
 if act='payment' then
 amount:=(p_input->>'amountCents')::bigint;select coalesce(sum(case when kind='payment' then amount_cents else -amount_cents end),0) into paid from pro_expense_payments where user_id=p_user and expense_id=exp.id;
 if amount>exp.amount_cents-paid then raise exception 'Payment exceeds balance' using errcode='22023';end if;
 insert into pro_expense_payments(user_id,expense_id,id,kind,amount_cents,paid_on,method,reference,note) values(p_user,exp.id,rid,'payment',amount,dt,p_input->>'method',p_input->>'reference',p_input->>'note');
 else
 select * into payment from pro_expense_payments where user_id=p_user and expense_id=exp.id and id=(p_input->>'paymentId')::uuid and kind='payment';
 if not found or dt<payment.paid_on then raise exception 'Invalid reversal' using errcode='22023';end if;
 insert into pro_expense_payments(user_id,expense_id,id,kind,payment_id,amount_cents,paid_on,method,reference,note) values(p_user,exp.id,rid,'reverse',payment.id,payment.amount_cents,dt,payment.method,payment.reference,trim(p_input->>'note'));
 end if;
 else raise exception 'Invalid action' using errcode='22023';end if;
 update pro_expense_state set revision=revision+1 where user_id=p_user returning revision into rev;
 insert into pro_expense_requests values(p_user,aid,p_input,rid,rev);return jsonb_build_object('id',rid,'revision',rev);
end $$;
do $$ declare name text;begin foreach name in array array['pro_expense_state','pro_expense_suppliers','pro_internal_expenses','pro_expense_payments','pro_expense_requests'] loop execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from public,anon,authenticated',name);execute format('grant select on public.%I to authenticated',name);execute format('grant all on public.%I to service_role',name);if not exists(select 1 from pg_policies where schemaname='public' and tablename=name and policyname=name||'_owner') then execute format('create policy %I on public.%I for select to authenticated using(user_id=(select auth.uid()))',name||'_owner',name);end if;end loop;end $$;
revoke all on function pro_expense_summary(uuid,uuid),pro_expenses_read(uuid,jsonb),pro_expenses_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_expense_summary(uuid,uuid),pro_expenses_read(uuid,jsonb),pro_expenses_save(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
