-- Pro area D (money): every internal expense gets an automatic reference number (GA-00001, per account) and a Taxable flag.
-- Side table keyed by the expense, assigned by a trigger so no existing writer changes. Owner only, service_role only,
-- optimistic concurrency (revision). Idempotent: existing expenses are numbered once by creation order.
begin;
create table if not exists public.pro_expense_ref_counter(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 last_number bigint not null default 0 check(last_number>=0)
);
create table if not exists public.pro_expense_meta(
 user_id uuid not null,expense_id uuid not null,
 ref_number text not null check(ref_number ~ '^GA-[0-9]{5,12}$'),
 taxable boolean not null default false,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(user_id,expense_id),unique(user_id,ref_number),
 foreign key(user_id,expense_id) references public.pro_internal_expenses(user_id,id) on delete cascade
);

create or replace function public.pro_expense_meta_assign() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_number bigint;
begin
 insert into public.pro_expense_ref_counter as c(user_id,last_number) values(new.user_id,1)
  on conflict(user_id) do update set last_number=c.last_number+1 returning c.last_number into v_number;
 insert into public.pro_expense_meta(user_id,expense_id,ref_number) values(new.user_id,new.id,'GA-'||lpad(v_number::text,5,'0'));
 return new;
end $$;
drop trigger if exists pro_expense_meta_assign on public.pro_internal_expenses;
create trigger pro_expense_meta_assign after insert on public.pro_internal_expenses for each row execute function public.pro_expense_meta_assign();

do $$declare r record;v_number bigint;begin
 for r in select e.user_id as user_id,e.id as id from public.pro_internal_expenses e
  where not exists(select 1 from public.pro_expense_meta m where m.user_id=e.user_id and m.expense_id=e.id) order by e.created_at,e.id loop
  insert into public.pro_expense_ref_counter as c(user_id,last_number) values(r.user_id,1)
   on conflict(user_id) do update set last_number=c.last_number+1 returning c.last_number into v_number;
  insert into public.pro_expense_meta(user_id,expense_id,ref_number) values(r.user_id,r.id,'GA-'||lpad(v_number::text,5,'0'));
 end loop;
end $$;

create or replace function public.pro_expense_meta_read(p_actor uuid,p_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)<1 or cardinality(p_ids)>50 then raise exception 'Invalid expenses' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(m.expense_id::text,jsonb_build_object('expenseId',m.expense_id,'ref',m.ref_number,'taxable',m.taxable,'revision',m.revision))
  from public.pro_expense_meta m where m.user_id=p_actor and m.expense_id=any(p_ids)),'{}'::jsonb);
end $$;

create or replace function public.pro_expense_meta_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_keys text[];v_id uuid;v_rev integer;v_taxable boolean;v_cur public.pro_expense_meta;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid expense data' using errcode='22023';end if;
 select array_agg(k order by k) into v_keys from jsonb_object_keys(p_input) as k;
 if v_keys is distinct from array['expenseId','revision','taxable']
  or jsonb_typeof(p_input->'expenseId') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false)
  or jsonb_typeof(p_input->'taxable') is distinct from 'boolean' then raise exception 'Invalid expense fields' using errcode='22023';end if;
 if not coalesce((p_input->>'expenseId')~'^[0-9a-fA-F-]{36}$',false) then raise exception 'Invalid expense' using errcode='22023';end if;
 v_id:=(p_input->>'expenseId')::uuid;v_rev:=(p_input->>'revision')::integer;v_taxable:=(p_input->>'taxable')::boolean;
 select * into v_cur from public.pro_expense_meta where user_id=p_actor and expense_id=v_id for update;
 if not found then raise exception 'Expense unavailable' using errcode='P0002';end if;
 if v_cur.revision<>v_rev then raise exception 'Stale expense data' using errcode='40001';end if;
 update public.pro_expense_meta set taxable=v_taxable,revision=revision+1,updated_at=now() where user_id=p_actor and expense_id=v_id;
 return public.pro_expense_meta_read(p_actor,array[v_id])->(v_id::text);
end $$;

do $$declare f record;begin
 alter table public.pro_expense_meta enable row level security;
 alter table public.pro_expense_ref_counter enable row level security;
 revoke all on public.pro_expense_meta,public.pro_expense_ref_counter from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_expense_meta,public.pro_expense_ref_counter to service_role;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_expense_meta_assign','pro_expense_meta_read','pro_expense_meta_set') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
