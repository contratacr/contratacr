-- LOCAL PRO ONLY. Internal job costs; no invoice issuance, bank operation or workspace rewrite.
begin;
create table if not exists public.pro_work_cost_state(user_id uuid primary key references profiles(id) on delete cascade,revision bigint not null default 0 check(revision>=0));
create table if not exists public.pro_work_cost_entries(
 user_id uuid not null references profiles(id) on delete cascade,id uuid not null,work_id text not null,position bigint generated always as identity,
 kind text not null check(kind in ('time','time_void','expense','expense_unlink')),recorded_on date not null,minutes integer,hourly_cost_cents bigint,amount_cents bigint,note text not null default '' check(length(note)<=300),expense_id uuid,supplier_name text,reversal_id uuid,created_at timestamptz not null default now(),
 primary key(user_id,id),foreign key(user_id,work_id) references pro_work(user_id,id),foreign key(user_id,expense_id) references pro_internal_expenses(user_id,id),foreign key(user_id,reversal_id) references pro_work_cost_entries(user_id,id),
 check((kind in ('time','time_void') and minutes between 1 and 1440 and (hourly_cost_cents is null or hourly_cost_cents between 0 and 10000000000) and expense_id is null and supplier_name is null and amount_cents is not distinct from case when hourly_cost_cents is null then null else round(minutes::numeric*hourly_cost_cents/60)::bigint end) or (kind in ('expense','expense_unlink') and expense_id is not null and minutes is null and hourly_cost_cents is null and amount_cents between 1 and 10000000000 and supplier_name is not null)),
 check((kind in ('time','expense') and reversal_id is null) or (kind in ('time_void','expense_unlink') and reversal_id is not null and length(btrim(note))>0))
);
-- Conditional SQL checks must reject unknown NULL results explicitly.
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.pro_work_cost_entries'::regclass and conname='pro_work_cost_required_values') then
  alter table public.pro_work_cost_entries add constraint pro_work_cost_required_values check((kind in ('time','time_void') and minutes is not null) or (kind in ('expense','expense_unlink') and amount_cents is not null));
 end if;
end $$;
create unique index if not exists pro_work_cost_one_reversal on public.pro_work_cost_entries(user_id,reversal_id) where reversal_id is not null;
create index if not exists pro_work_cost_work on public.pro_work_cost_entries(user_id,work_id,position);
create table if not exists public.pro_work_expense_assignments(user_id uuid not null references profiles(id) on delete cascade,expense_id uuid not null,work_id text not null,entry_id uuid not null,primary key(user_id,expense_id),foreign key(user_id,expense_id) references pro_internal_expenses(user_id,id),foreign key(user_id,work_id) references pro_work(user_id,id),foreign key(user_id,entry_id) references pro_work_cost_entries(user_id,id));
create table if not exists public.pro_work_cost_requests(user_id uuid not null references profiles(id) on delete cascade,request_id uuid not null,input jsonb not null,result jsonb not null,primary key(user_id,request_id));
create or replace function public.pro_work_costs_mutate(p_user uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;cid text;rid uuid;rev bigint;current_rev bigint;prior pro_work_cost_requests;w pro_work;c pro_clients;original pro_work_cost_entries;expense pro_internal_expenses;eid uuid;rate bigint;mins integer;dt date;amt bigint;note_value text;reason text;expense_result jsonb;expense_rev bigint;result jsonb;keys text[];
begin
 if p_user is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& array['action','clientId','workId','requestId','revision']) or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'clientId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'requestId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]{1,15}$' then raise exception 'Invalid operation' using errcode='22023';end if;
 act:=p_input->>'action';wid:=p_input->>'workId';cid:=p_input->>'clientId';rid:=(p_input->>'requestId')::uuid;rev:=(p_input->>'revision')::bigint;
 keys:=array['action','clientId','workId','requestId','revision']||case act when 'add_time' then array['date','minutes','hourlyCostCents','note'] when 'edit_time' then array['entryId','reason','date','minutes','hourlyCostCents','note'] when 'void_time' then array['entryId','reason'] when 'link_expense' then array['expenseId','expenseRevision'] when 'unlink_expense' then array['entryId','reason'] when 'create_expense' then array['expenseId','supplierId','date','concept','amountCents','expenseRevision'] else null end;
 if act not in ('add_time','edit_time','void_time','link_expense','unlink_expense','create_expense') or keys is null or (p_input-keys)<>'{}'::jsonb or not(p_input ?& keys) or length(wid) not between 1 and 160 or length(cid) not between 1 and 160 or not exists(select 1 from profiles where id=p_user and not coalesce(is_disabled,false)) then raise exception 'Invalid operation' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('work-costs:'||p_user::text,0));
 select * into prior from pro_work_cost_requests where user_id=p_user and request_id=rid;
 if found then if prior.input<>p_input then raise exception 'Request changed' using errcode='22023';end if;return prior.result;end if;
 select * into w from pro_work where user_id=p_user and id=wid and "clientId"=cid for update;
 if not found then raise exception 'Invalid work' using errcode='P0002';end if;
 select * into c from pro_clients where user_id=p_user and id=cid;
 if act not in ('void_time','unlink_expense') and (w.cancelled or c.archived) then raise exception 'Inactive work or client' using errcode='22023';end if;
 insert into pro_work_cost_state(user_id) values(p_user) on conflict do nothing;
 select revision into current_rev from pro_work_cost_state where user_id=p_user for update;
 if current_rev<>rev then raise exception 'Costs changed' using errcode='40001';end if;
 if act in ('add_time','edit_time','create_expense') then
  if jsonb_typeof(p_input->'date') is distinct from 'string' or (p_input->>'date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
  dt:=(p_input->>'date')::date;if dt<'1900-01-01'::date or dt>(now() at time zone 'America/Costa_Rica')::date then raise exception 'Invalid date' using errcode='22023';end if;
 end if;
 if act in ('add_time','edit_time') then
  if jsonb_typeof(p_input->'minutes') is distinct from 'number' or (p_input->>'minutes')!~'^[0-9]{1,4}$' or jsonb_typeof(p_input->'hourlyCostCents') not in ('number','null') or jsonb_typeof(p_input->'note') is distinct from 'string' or length(btrim(p_input->>'note'))>300 then raise exception 'Invalid time' using errcode='22023';end if;
  mins:=(p_input->>'minutes')::integer;if mins not between 1 and 1440 then raise exception 'Invalid duration' using errcode='22023';end if;
  if jsonb_typeof(p_input->'hourlyCostCents')='number' then if (p_input->>'hourlyCostCents')!~'^[0-9]{1,11}$' then raise exception 'Invalid rate' using errcode='22023';end if;rate:=(p_input->>'hourlyCostCents')::bigint;if rate>10000000000 then raise exception 'Invalid rate' using errcode='22023';end if;end if;
  note_value:=btrim(p_input->>'note');amt:=case when rate is null then null else round(mins::numeric*rate/60)::bigint end;
 end if;
 if act in ('void_time','edit_time','unlink_expense') then
  if jsonb_typeof(p_input->'entryId') is distinct from 'string' or jsonb_typeof(p_input->'reason') is distinct from 'string' or length(btrim(p_input->>'reason')) not between 1 and 300 then raise exception 'Invalid reversal' using errcode='22023';end if;
  reason:=btrim(p_input->>'reason');
  select * into original from pro_work_cost_entries where user_id=p_user and id=(p_input->>'entryId')::uuid and work_id=wid and kind=case when act='unlink_expense' then 'expense' else 'time' end for update;
  if not found or exists(select 1 from pro_work_cost_entries where user_id=p_user and reversal_id=original.id) then raise exception 'Invalid entry' using errcode='22023';end if;
  if act='unlink_expense' then
   select * into expense from pro_internal_expenses where user_id=p_user and id=original.expense_id for update;
   if not found then raise exception 'Invalid expense' using errcode='22023';end if;
  end if;
  insert into pro_work_cost_entries(user_id,id,work_id,kind,recorded_on,minutes,hourly_cost_cents,amount_cents,note,expense_id,supplier_name,reversal_id)
  values(p_user,case when act='edit_time' then gen_random_uuid() else rid end,wid,case when act='unlink_expense' then 'expense_unlink' else 'time_void' end,(now() at time zone 'America/Costa_Rica')::date,original.minutes,original.hourly_cost_cents,case when act='unlink_expense' then expense.amount_cents else original.amount_cents end,reason,original.expense_id,case when act='unlink_expense' then expense.supplier_name else original.supplier_name end,original.id);
  if act='unlink_expense' then delete from pro_work_expense_assignments where user_id=p_user and expense_id=original.expense_id and entry_id=original.id;end if;
 end if;
 if act in ('add_time','edit_time') then
  insert into pro_work_cost_entries(user_id,id,work_id,kind,recorded_on,minutes,hourly_cost_cents,amount_cents,note) values(p_user,rid,wid,'time',dt,mins,rate,amt,note_value);
 elsif act in ('link_expense','create_expense') then
  if jsonb_typeof(p_input->'expenseId') is distinct from 'string' or jsonb_typeof(p_input->'expenseRevision') is distinct from 'number' or (p_input->>'expenseRevision')!~'^[0-9]{1,15}$' then raise exception 'Invalid expense' using errcode='22023';end if;
  eid:=(p_input->>'expenseId')::uuid;
  insert into pro_expense_state(user_id) values(p_user) on conflict do nothing;
  select revision into expense_rev from pro_expense_state where user_id=p_user for update;
  if expense_rev<>(p_input->>'expenseRevision')::bigint then raise exception 'Expenses changed' using errcode='40001';end if;
  if act='create_expense' then
   if jsonb_typeof(p_input->'supplierId') is distinct from 'string' or jsonb_typeof(p_input->'concept') is distinct from 'string' or length(btrim(p_input->>'concept')) not between 1 and 300 or jsonb_typeof(p_input->'amountCents') is distinct from 'number' or (p_input->>'amountCents')!~'^[0-9]{1,11}$' or (p_input->>'amountCents')::bigint not between 1 and 10000000000 or exists(select 1 from pro_internal_expenses where user_id=p_user and id=eid) then raise exception 'Invalid new expense' using errcode='22023';end if;
   expense_result:=pro_expenses_save(p_user,jsonb_build_object('action','expense','id',eid,'supplierId',p_input->>'supplierId','date',dt,'dueDate',null,'currency','CRC','concept',btrim(p_input->>'concept'),'amountCents',(p_input->>'amountCents')::bigint,'actionId',rid,'revision',expense_rev));
   expense_rev:=(expense_result->>'revision')::bigint;
  end if;
  select * into expense from pro_internal_expenses where user_id=p_user and id=eid for update;
  if not found then raise exception 'Invalid expense' using errcode='22023';end if;
  insert into pro_work_cost_entries(user_id,id,work_id,kind,recorded_on,amount_cents,note,expense_id,supplier_name) values(p_user,rid,wid,'expense',expense.expense_date,expense.amount_cents,expense.concept,eid,expense.supplier_name);
  insert into pro_work_expense_assignments(user_id,expense_id,work_id,entry_id) values(p_user,eid,wid,rid);
 end if;
 update pro_work_cost_state set revision=current_rev+1 where user_id=p_user;
 result:=jsonb_build_object('id',rid,'revision',current_rev+1,'expenseRevision',coalesce((select revision from pro_expense_state where user_id=p_user),0));
 insert into pro_work_cost_requests(user_id,request_id,input,result) values(p_user,rid,p_input,result);
 return result;
end $$;
create or replace function public.pro_work_costs_read(p_user uuid,p_client text,p_work text,p_kind text default 'entries',p_search text default '',p_after jsonb default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;account jsonb;context jsonb;rev bigint;expense_rev bigint;labor bigint;material bigint;extras bigint;minutes_total bigint;unknown_minutes bigint;unknown_count bigint;agreed bigint;rows jsonb;fingerprint text;agreed_tax bigint;agreed_net bigint;committed bigint;
begin
 if p_user is null or p_client is null or p_work is null or length(p_client) not between 1 and 160 or length(p_work) not between 1 and 160 or p_kind is null or p_kind not in ('entries','candidates') or p_search is null or length(p_search)>160 then raise exception 'Invalid query' using errcode='22023';end if;
 select jsonb_build_object('id',w.id,'clientId',w."clientId",'title',w.service,'cancelled',w.cancelled,'clientArchived',c.archived) into context from pro_work w join pro_clients c on c.user_id=w.user_id and c.id=w."clientId" where w.user_id=p_user and w.id=p_work and c.id=p_client;
 if context is null then return null;end if;
 rev:=coalesce((select revision from pro_work_cost_state where user_id=p_user),0);expense_rev:=coalesce((select revision from pro_expense_state where user_id=p_user),0);
 if p_kind='candidates' then
  if p_after is not null and (jsonb_typeof(p_after) is distinct from 'object' or jsonb_typeof(p_after->'id') is distinct from 'string' or (p_after-array['id'])<>'{}'::jsonb) then raise exception 'Invalid cursor' using errcode='22023';end if;
  with candidates as materialized(select e.* from pro_internal_expenses e where e.user_id=p_user and not exists(select 1 from pro_work_expense_assignments a where a.user_id=e.user_id and a.expense_id=e.id) and strpos(pro_catalog_search(e.concept||' '||e.supplier_name),pro_catalog_search(p_search))>0),matches as(select * from candidates where p_after is null or id>(p_after->>'id')::uuid order by id limit 21),page as(select * from matches order by id limit 20)
  select jsonb_build_object('revision',rev,'expenseRevision',expense_rev,'fingerprint',md5(rev::text||expense_rev::text||coalesce((select jsonb_agg(jsonb_build_object('id',id,'amount',amount_cents,'concept',concept,'date',expense_date,'supplier',supplier_name) order by id)::text from candidates),'[]')),'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'concept',concept,'supplierName',supplier_name,'date',expense_date,'amountCents',amount_cents) order by id) from page),'[]'),'nextCursor',case when(select count(*) from matches)>20 then(select jsonb_build_object('id',id) from page order by id desc limit 1) else null end) into result;
  return result;
 end if;
 if p_after is not null and (jsonb_typeof(p_after) is distinct from 'object' or jsonb_typeof(p_after->'position') is distinct from 'string' or (p_after->>'position')!~'^[0-9]{1,18}$' or (p_after-array['position'])<>'{}'::jsonb) then raise exception 'Invalid cursor' using errcode='22023';end if;
 account:=pro_work_account(p_user,p_work);agreed:=(account->>'agreedCents')::bigint;material:=round((account->>'materialCost')::numeric*100)::bigint;
 select coalesce(sum(e.minutes),0),coalesce(sum(e.minutes) filter(where e.hourly_cost_cents is null),0),count(*) filter(where e.hourly_cost_cents is null),coalesce(sum(e.amount_cents),0) into minutes_total,unknown_minutes,unknown_count,labor from pro_work_cost_entries e where e.user_id=p_user and e.work_id=p_work and e.kind='time' and not exists(select 1 from pro_work_cost_entries r where r.user_id=e.user_id and r.reversal_id=e.id);
 select coalesce(sum(e.amount_cents),0) into extras from pro_work_expense_assignments a join pro_internal_expenses e on e.user_id=a.user_id and e.id=a.expense_id where a.user_id=p_user and a.work_id=p_work;
 -- Round 1 (2026-11-12): same base. When the agreed amount comes from the accepted estimate its
 -- tax is known and the result uses the amount WITHOUT tax (costs are recorded without tax);
 -- otherwise the result says it compares the amount as agreed. Purchase orders not cancelled
 -- are a separate committed line (subtotal without tax), never mixed into recorded costs.
 agreed_tax:=(account->>'agreedTaxCents')::bigint;agreed_net:=case when agreed is null then null else agreed-coalesce(agreed_tax,0) end;
 begin
  select coalesce(sum(l.subtotal_cents),0)::bigint into committed from pro_purchase_order_lines l join pro_purchase_orders o on o.owner_id=l.owner_id and o.id=l.order_id where l.owner_id=p_user and l.work_id=p_work and o.status<>'cancelled';
 exception when undefined_table then committed:=0;end;
 with events as materialized(
  select e.position,jsonb_build_object('id',e.id,'kind',e.kind,'date',case when a.entry_id=e.id then x.expense_date else e.recorded_on end,'minutes',e.minutes,'hourlyCostCents',e.hourly_cost_cents,'amountCents',case when a.entry_id=e.id then x.amount_cents else e.amount_cents end,'note',case when a.entry_id=e.id then x.concept else e.note end,'expenseId',e.expense_id,'supplierName',case when a.entry_id=e.id then x.supplier_name else e.supplier_name end,'reversalId',e.reversal_id,'reversed',exists(select 1 from pro_work_cost_entries r where r.user_id=e.user_id and r.reversal_id=e.id),'at',e.created_at) row
  from pro_work_cost_entries e left join pro_work_expense_assignments a on a.user_id=e.user_id and a.expense_id=e.expense_id and a.entry_id=e.id left join pro_internal_expenses x on x.user_id=a.user_id and x.id=a.expense_id where e.user_id=p_user and e.work_id=p_work
 ),matches as(select * from events where p_after is null or position<(p_after->>'position')::bigint order by position desc limit 21),page as(select * from matches order by position desc limit 20)
 select jsonb_build_object('revision',rev,'expenseRevision',expense_rev,'fingerprint',md5(context::text||account::text||rev::text||coalesce((select jsonb_agg(row order by position)::text from events),'[]')),'work',context,'summary',jsonb_build_object('minutes',minutes_total,'uncostedMinutes',unknown_minutes,'uncostedCount',unknown_count,'laborCents',labor,'materialCents',material,'expensesCents',extras,'totalCostCents',labor+material+extras,'agreedCents',agreed,'agreedSource',account->'agreedSource','agreedTaxCents',agreed_tax,'agreedNetCents',agreed_net,'resultBasis',case when agreed_tax is not null then 'without_tax' else 'as_agreed' end,'committedCents',committed,'resultCents',case when agreed is null or unknown_count>0 then null else agreed_net-labor-material-extras end,'resultWithCommittedCents',case when agreed is null or unknown_count>0 then null else agreed_net-labor-material-extras-committed end),'items',coalesce((select jsonb_agg(row order by position desc) from page),'[]'),'nextCursor',case when(select count(*) from matches)>20 then(select jsonb_build_object('position',position::text) from page order by position limit 1) else null end) into result;
 return result;
end $$;
create or replace function public.pro_protect_work_cost_history() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (new.user_id,new.id,new."clientId") is distinct from (old.user_id,old.id,old."clientId") and exists(select 1 from pro_work_cost_entries where user_id=old.user_id and work_id=old.id) then raise exception 'Job cost history cannot change owner or client' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_protect_work_cost_history on public.pro_work;
create trigger pro_protect_work_cost_history before update on public.pro_work for each row execute function public.pro_protect_work_cost_history();
revoke all on function public.pro_protect_work_cost_history() from public,anon,authenticated;
grant execute on function public.pro_protect_work_cost_history() to service_role;
do $$declare n text;begin foreach n in array array['pro_work_cost_state','pro_work_cost_entries','pro_work_expense_assignments','pro_work_cost_requests'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select on public.%I to authenticated',n);execute format('grant all on public.%I to service_role',n);
 if not exists(select 1 from pg_policies where schemaname='public' and tablename=n and policyname=n||'_owner') then execute format('create policy %I on public.%I for select to authenticated using(user_id=(select auth.uid()))',n||'_owner',n);end if;
 end loop;end $$;
grant usage,select on sequence public.pro_work_cost_entries_position_seq to service_role;
revoke all on function public.pro_work_costs_mutate(uuid,jsonb),public.pro_work_costs_read(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.pro_work_costs_mutate(uuid,jsonb),public.pro_work_costs_read(uuid,text,text,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
