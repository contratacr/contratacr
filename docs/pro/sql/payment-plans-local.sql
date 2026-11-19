-- LOCAL PRO ONLY. Round 5 (2026-11-13): «Plan de pagos» — the professional's OWN installment plan for
-- a job. ContrataCR never lends, charges interest or involves a third party: the plan only SCHEDULES the
-- customer balance of the single formula (pro_work_account, client-balance-local.sql), it never changes it.
--
-- * One active plan per job. Every edit is a NEW immutable revision (total, down payment, installments,
--   optional fixed fee and late fee as plain amounts shown as terms). Amounts always sum exactly to the
--   total; the automatic split uses whole colones and the LAST installment absorbs the rounding.
-- * An installment is due on a date, or on a key date (milestone) or when a task is completed.
-- * Applied = payments of the ledger recorded AFTER the plan started (ledger position above the plan's
--   base_position) net of their own voids, capped at [0, total], allocated oldest-first (plan order).
--   Round 6A fix: a void of a payment made BEFORE the plan never touches the plan (it only changes the
--   balance). Derived on every read: a voided post-plan payment is re-allocated automatically.
-- * Status per installment: pending, partial, paid, overdue (due date before today in America/Costa_Rica).
-- * Optional invoice DRAFT for an installment through the same direct-draft writer as Round 4B
--   (pro_invoice_extras_save 'create_direct') with a pro_invoice_billing_items row 'installment'. An
--   installment is billed once while its draft is active; a job is billed either by installments or by
--   quote lines / agreed progress, never both. Archiving the draft releases it; editing or cancelling the
--   plan is refused while one of its installments has an active draft.
-- * Customer view: opt-in section show_payment_plan (OFF by default). The verified linked customer can
--   read it and must ACCEPT the current revision explicitly (timestamp, revision and content hash). A
--   new revision needs a new acceptance. Nothing is e-mailed, notified or charged.
-- Supersedes pro_client_dashboard_settings_json / _mutate (client-view-finances-local.sql) with the same
-- signatures and only the ADDED key showPaymentPlan.
begin;

-- ---------------------------------------------------------------- customer-view section (off by default)
alter table public.pro_client_dashboards add column if not exists show_payment_plan boolean not null default false;

create or replace function public.pro_client_dashboard_settings_json(p_work text,p_row public.pro_client_dashboards) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('workId',p_work,'showUpdates',coalesce(p_row.show_updates,true),'showDailyLogs',coalesce(p_row.show_daily_logs,true),
 'showFiles',coalesce(p_row.show_files,true),'showAllowances',coalesce(p_row.show_allowances,false),'showSelections',coalesce(p_row.show_selections,false),'showSchedule',coalesce(p_row.show_schedule,false),'showPunchlist',coalesce(p_row.show_punchlist,false),'showContracts',coalesce(p_row.show_contracts,false),'showMoodBoards',coalesce(p_row.show_mood_boards,false),'showFinances',coalesce(p_row.show_finances,false),'showPaymentPlan',coalesce(p_row.show_payment_plan,false),'welcomeText',p_row.welcome_text,'revision',coalesce(p_row.revision,0),'updatedAt',p_row.updated_at);
$$;

create or replace function public.pro_client_dashboard_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;aid uuid;rev integer;keys text[];receipt public.pro_client_dashboard_actions;settings public.pro_client_dashboards;before_json jsonb;after_json jsonb;result jsonb;welcome text;allowances boolean;selections boolean;schedule boolean;punchlist boolean;contracts boolean;moodboards boolean;finances boolean;plan boolean;base_keys text[];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid dashboard' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 -- Every optional section key may be absent so older clients keep working; when absent the stored value is kept.
 select array_agg(k order by k) into base_keys from unnest(keys) k where k not in('showAllowances','showSelections','showSchedule','showContracts','showPunchlist','showMoodBoards','showFinances','showPaymentPlan');
 if base_keys is distinct from array['actionId','revision','showDailyLogs','showFiles','showUpdates','welcomeText','workId']
 or (p_input?'showAllowances' and jsonb_typeof(p_input->'showAllowances') is distinct from 'boolean')
 or (p_input?'showSelections' and jsonb_typeof(p_input->'showSelections') is distinct from 'boolean')
 or (p_input?'showSchedule' and jsonb_typeof(p_input->'showSchedule') is distinct from 'boolean')
 or (p_input?'showPunchlist' and jsonb_typeof(p_input->'showPunchlist') is distinct from 'boolean')
 or (p_input?'showContracts' and jsonb_typeof(p_input->'showContracts') is distinct from 'boolean')
 or (p_input?'showMoodBoards' and jsonb_typeof(p_input->'showMoodBoards') is distinct from 'boolean')
 or (p_input?'showFinances' and jsonb_typeof(p_input->'showFinances') is distinct from 'boolean')
 or (p_input?'showPaymentPlan' and jsonb_typeof(p_input->'showPaymentPlan') is distinct from 'boolean')
 or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
 or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false)
 or jsonb_typeof(p_input->'showUpdates') is distinct from 'boolean' or jsonb_typeof(p_input->'showDailyLogs') is distinct from 'boolean'
 or jsonb_typeof(p_input->'showFiles') is distinct from 'boolean' or jsonb_typeof(p_input->'welcomeText') not in('string','null') then raise exception 'Invalid dashboard fields' using errcode='22023';end if;
 if (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;
 if length(wid) not between 1 and 160 then raise exception 'Invalid dashboard identity' using errcode='22023';end if;
 welcome:=nullif(btrim(coalesce(p_input->>'welcomeText','')),'');
 if welcome is not null and length(welcome)>1000 then raise exception 'Invalid welcome text' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-client-dashboard-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_client_dashboard_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-client-dashboard:'||p_actor::text||':'||wid,0));
 perform 1 from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select * into settings from public.pro_client_dashboards where owner_id=p_actor and work_id=wid for update;
 if not found then
  if rev<>0 then raise exception 'Dashboard changed' using errcode='40001';end if;
  before_json:=null;allowances:=coalesce((p_input->>'showAllowances')::boolean,false);selections:=coalesce((p_input->>'showSelections')::boolean,false);
  schedule:=coalesce((p_input->>'showSchedule')::boolean,false);punchlist:=coalesce((p_input->>'showPunchlist')::boolean,false);contracts:=coalesce((p_input->>'showContracts')::boolean,false);moodboards:=coalesce((p_input->>'showMoodBoards')::boolean,false);finances:=coalesce((p_input->>'showFinances')::boolean,false);plan:=coalesce((p_input->>'showPaymentPlan')::boolean,false);
  insert into public.pro_client_dashboards(owner_id,work_id,show_updates,show_daily_logs,show_files,show_allowances,show_selections,show_schedule,show_contracts,show_punchlist,show_mood_boards,show_finances,show_payment_plan,welcome_text)
   values(p_actor,wid,(p_input->>'showUpdates')::boolean,(p_input->>'showDailyLogs')::boolean,(p_input->>'showFiles')::boolean,allowances,selections,schedule,contracts,punchlist,moodboards,finances,plan,welcome) returning * into settings;
 else
  if rev<>settings.revision then raise exception 'Dashboard changed' using errcode='40001';end if;
  before_json:=public.pro_client_dashboard_settings_json(wid,settings);allowances:=coalesce((p_input->>'showAllowances')::boolean,settings.show_allowances);selections:=coalesce((p_input->>'showSelections')::boolean,settings.show_selections);
  schedule:=coalesce((p_input->>'showSchedule')::boolean,settings.show_schedule);punchlist:=coalesce((p_input->>'showPunchlist')::boolean,settings.show_punchlist);contracts:=coalesce((p_input->>'showContracts')::boolean,settings.show_contracts);moodboards:=coalesce((p_input->>'showMoodBoards')::boolean,settings.show_mood_boards);finances:=coalesce((p_input->>'showFinances')::boolean,settings.show_finances);plan:=coalesce((p_input->>'showPaymentPlan')::boolean,settings.show_payment_plan);
  if settings.show_allowances=allowances and settings.show_selections=selections and settings.show_schedule=schedule and settings.show_punchlist=punchlist and settings.show_contracts=contracts and settings.show_mood_boards=moodboards and settings.show_finances=finances and settings.show_payment_plan=plan and settings.show_updates=(p_input->>'showUpdates')::boolean and settings.show_daily_logs=(p_input->>'showDailyLogs')::boolean
   and settings.show_files=(p_input->>'showFiles')::boolean and settings.welcome_text is not distinct from welcome then raise exception 'No dashboard changes' using errcode='22023';end if;
  update public.pro_client_dashboards set show_updates=(p_input->>'showUpdates')::boolean,show_daily_logs=(p_input->>'showDailyLogs')::boolean,
   show_files=(p_input->>'showFiles')::boolean,show_allowances=allowances,show_selections=selections,show_schedule=schedule,show_contracts=contracts,show_punchlist=punchlist,show_mood_boards=moodboards,show_finances=finances,show_payment_plan=plan,welcome_text=welcome,revision=revision+1,updated_at=now() where owner_id=p_actor and work_id=wid returning * into settings;
 end if;
 after_json:=public.pro_client_dashboard_settings_json(wid,settings);result:=jsonb_build_object('settings',after_json);
 insert into public.pro_client_dashboard_history(owner_id,work_id,action_id,before_settings,after_settings) values(p_actor,wid,aid,before_json,after_json);
 insert into public.pro_client_dashboard_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.pro_payment_plans(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 work_id text not null check(length(work_id) between 1 and 160),
 id uuid not null,
 status text not null default 'active' check(status in('active','cancelled')),
 revision integer not null default 1 check(revision between 1 and 100000),
 base_paid_cents bigint not null,
 base_position bigint,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 cancelled_at timestamptz,cancel_reason text check(cancel_reason is null or length(cancel_reason) between 1 and 500),
 primary key(owner_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 check((status='cancelled')=(cancelled_at is not null))
);
create unique index if not exists pro_payment_plans_one_active on public.pro_payment_plans(owner_id,work_id) where status='active';
-- Round 6A: ledger position at plan creation (payments above it belong to the plan). Older plans are
-- backfilled with the last ledger position of the owner recorded up to the plan's creation instant.
alter table public.pro_payment_plans add column if not exists base_position bigint;
update public.pro_payment_plans p set base_position=coalesce((select max(e.position) from public.pro_client_entries e where e.user_id=p.owner_id and e.created_at<=p.created_at),0) where p.base_position is null;
-- Payments of a job recorded after a ledger position, net of their own voids (voids of earlier payments are ignored).
create or replace function public.pro_payment_plan_paid_since(p_owner uuid,p_work text,p_position bigint) returns bigint
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(sum(e.amount_cents),0)::bigint-coalesce((select sum(v.amount_cents) from public.pro_client_entries v join public.pro_client_entries o on o.user_id=v.user_id and o.id=v.reversal_id
   where v.user_id=p_owner and v.work_id=p_work and v.kind='payment_void' and o.kind='payment' and o.position>coalesce(p_position,0)),0)::bigint
 from public.pro_client_entries e where e.user_id=p_owner and e.work_id=p_work and e.kind='payment' and e.position>coalesce(p_position,0) $$;
create index if not exists pro_payment_plans_work on public.pro_payment_plans(owner_id,work_id,created_at desc);

create table if not exists public.pro_payment_plan_revisions(
 owner_id uuid not null,plan_id uuid not null,revision integer not null check(revision between 1 and 100000),
 total_cents bigint not null check(total_cents between 100 and 10000000000),
 down_payment_cents bigint not null check(down_payment_cents>=0),
 frequency text not null check(frequency in('weekly','biweekly','monthly','custom')),
 fee_cents bigint not null default 0 check(fee_cents between 0 and 1000000000),
 late_fee_cents bigint not null default 0 check(late_fee_cents between 0 and 1000000000),
 terms text not null default '' check(length(terms)<=1000),
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 action_id uuid not null,created_at timestamptz not null default now(),
 primary key(owner_id,plan_id,revision),
 foreign key(owner_id,plan_id) references public.pro_payment_plans(owner_id,id) on delete cascade,
 check(down_payment_cents<total_cents)
);
create table if not exists public.pro_payment_plan_items(
 owner_id uuid not null,plan_id uuid not null,revision integer not null,seq integer not null check(seq between 0 and 60),
 kind text not null check(kind in('down','installment')),
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 due_date date check(due_date between date '2000-01-01' and date '2100-12-31'),
 milestone_id uuid,task_id uuid,
 primary key(owner_id,plan_id,revision,seq),
 foreign key(owner_id,plan_id,revision) references public.pro_payment_plan_revisions(owner_id,plan_id,revision) on delete cascade,
 check((kind='down')=(seq=0)),
 check(num_nonnulls(due_date,milestone_id,task_id)=1),
 check(kind='installment' or due_date is not null)
);
create table if not exists public.pro_payment_plan_acceptances(
 owner_id uuid not null,plan_id uuid not null,revision integer not null,
 client_user_id uuid not null references public.profiles(id) on delete cascade,request_id uuid not null,
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),action_id uuid not null,accepted_at timestamptz not null default now(),
 primary key(owner_id,plan_id,revision),
 foreign key(owner_id,plan_id,revision) references public.pro_payment_plan_revisions(owner_id,plan_id,revision) on delete cascade
);
create table if not exists public.pro_payment_plan_history(
 id bigint generated always as identity primary key,
 owner_id uuid not null,plan_id uuid not null,work_id text not null,actor_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','edit','cancel','accept','invoice')),
 revision integer not null,before_state jsonb,after_state jsonb not null,at timestamptz not null default now(),
 foreign key(owner_id,plan_id) references public.pro_payment_plans(owner_id,id) on delete cascade
);
create index if not exists pro_payment_plan_history_plan on public.pro_payment_plan_history(owner_id,plan_id,id desc);
create table if not exists public.pro_payment_plan_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);

create or replace function public.pro_payment_plan_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Payment plan revisions, installments, acceptances, history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_payment_plan_revision_immutable on public.pro_payment_plan_revisions;
create trigger pro_payment_plan_revision_immutable before update on public.pro_payment_plan_revisions for each row execute function public.pro_payment_plan_immutable();
drop trigger if exists pro_payment_plan_item_immutable on public.pro_payment_plan_items;
create trigger pro_payment_plan_item_immutable before update on public.pro_payment_plan_items for each row execute function public.pro_payment_plan_immutable();
drop trigger if exists pro_payment_plan_acceptance_immutable on public.pro_payment_plan_acceptances;
create trigger pro_payment_plan_acceptance_immutable before update on public.pro_payment_plan_acceptances for each row execute function public.pro_payment_plan_immutable();
drop trigger if exists pro_payment_plan_history_immutable on public.pro_payment_plan_history;
create trigger pro_payment_plan_history_immutable before update on public.pro_payment_plan_history for each row execute function public.pro_payment_plan_immutable();
drop trigger if exists pro_payment_plan_action_immutable on public.pro_payment_plan_actions;
create trigger pro_payment_plan_action_immutable before update on public.pro_payment_plan_actions for each row execute function public.pro_payment_plan_immutable();

-- ---------------------------------------------------------------- invoice drafts: installment source
alter table public.pro_invoice_billing_items drop constraint if exists pro_invoice_billing_items_source_type_check;
alter table public.pro_invoice_billing_items add constraint pro_invoice_billing_items_source_type_check check(source_type in('estimate_line','agreement','time','expense','installment'));
create unique index if not exists pro_invoice_billing_installment_once on public.pro_invoice_billing_items(user_id,source_key) where active and source_type='installment';

-- An installment item can only be (re)activated for the CURRENT revision of an ACTIVE plan; a job is
-- billed by installments OR by quote lines / agreed progress (23505 → the restore or the draft is refused).
create or replace function public.pro_payment_plan_billing_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare plan_id uuid;rev integer;
begin
 if not new.active then return new;end if;
 if new.source_type='installment' then
  if new.source_key!~'^[0-9a-f-]{36}:[0-9]{1,6}:[0-9]{1,2}$' then raise exception 'Invalid installment key' using errcode='22023';end if;
  plan_id:=split_part(new.source_key,':',1)::uuid;rev:=split_part(new.source_key,':',2)::integer;
  if not exists(select 1 from public.pro_payment_plans p where p.owner_id=new.user_id and p.id=plan_id and p.work_id=new.work_id and p.status='active' and p.revision=rev) then
   raise exception 'Installment no longer in the current plan' using errcode='23505',hint='pro_billing_already';end if;
  if exists(select 1 from public.pro_invoice_billing_items i where i.user_id=new.user_id and i.work_id=new.work_id and i.active and i.source_type in('estimate_line','agreement')) then
   raise exception 'Job already billed by another method' using errcode='23505',hint='pro_billing_already';end if;
 elsif new.source_type in('estimate_line','agreement') then
  if exists(select 1 from public.pro_invoice_billing_items i where i.user_id=new.user_id and i.work_id=new.work_id and i.active and i.source_type='installment') then
   raise exception 'Job already billed by installments' using errcode='23505',hint='pro_billing_already';end if;
 end if;
 return new;
end $$;
drop trigger if exists pro_payment_plan_billing_guard on public.pro_invoice_billing_items;
create trigger pro_payment_plan_billing_guard before insert or update on public.pro_invoice_billing_items for each row execute function public.pro_payment_plan_billing_guard();

-- ---------------------------------------------------------------- helpers
create or replace function public.pro_payment_plan_today() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (clock_timestamp() at time zone 'America/Costa_Rica')::date $$;

create or replace function public.pro_payment_plan_expect(p_input jsonb,p_keys text[]) returns void
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& p_keys) or (p_input-p_keys)<>'{}'::jsonb then raise exception 'Invalid payment plan fields' using errcode='22023';end if;
end $$;
create or replace function public.pro_payment_plan_cents(p_value jsonb,p_min bigint,p_max bigint) returns bigint
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'number' or (p_value#>>'{}')!~'^[0-9]{1,11}$' or (p_value#>>'{}')::numeric not between p_min and p_max then raise exception 'Invalid amount' using errcode='22023';end if;
 return (p_value#>>'{}')::bigint;
end $$;
create or replace function public.pro_payment_plan_day(p_value jsonb) returns date
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare d date;
begin
 if jsonb_typeof(p_value) is distinct from 'string' or (p_value#>>'{}')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date' using errcode='22023';end if;
 begin d:=(p_value#>>'{}')::date;exception when others then raise exception 'Invalid date' using errcode='22008';end;
 if to_char(d,'YYYY-MM-DD')<>(p_value#>>'{}') or d not between date '2000-01-01' and date '2100-12-31' then raise exception 'Invalid date' using errcode='22008';end if;
 return d;
end $$;
create or replace function public.pro_payment_plan_uuid(p_value jsonb) returns uuid
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'string' or (p_value#>>'{}')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid identifier' using errcode='22023';end if;
 return (p_value#>>'{}')::uuid;
end $$;

-- Automatic split: whole colones, equal installments, the LAST absorbs the rounding.
create or replace function public.pro_payment_plan_split(p_total bigint,p_down bigint,p_count integer) returns bigint[]
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare remaining bigint:=p_total-p_down;base bigint;result bigint[]:='{}';
begin
 if p_count is null or p_count not between 1 and 60 or remaining<=0 then raise exception 'Invalid split' using errcode='22023';end if;
 base:=(remaining/p_count/100)*100;
 if base<100 then raise exception 'Installments below one colón' using errcode='22023';end if;
 for k in 1..p_count-1 loop result:=result||base;end loop;
 return result||(remaining-base*(p_count-1));
end $$;
create or replace function public.pro_payment_plan_due(p_first date,p_frequency text,p_index integer) returns date
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_frequency when 'weekly' then p_first+7*p_index when 'biweekly' then p_first+14*p_index
  else (p_first+make_interval(months=>p_index))::date end $$;

-- Effective due date of one item: its date, the key date of its milestone, or the CR day its task was completed.
create or replace function public.pro_payment_plan_item_json(p_owner uuid,p_work text,p_item public.pro_payment_plan_items) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('seq',p_item.seq,'kind',p_item.kind,'amountCents',p_item.amount_cents,
  'dueDate',to_char(case when p_item.due_date is not null then p_item.due_date
   when p_item.milestone_id is not null then (select m.milestone_date from public.pro_work_schedule_milestones m where m.owner_id=p_owner and m.work_id=p_work and m.id=p_item.milestone_id and not m.archived)
   else (select (t.updated_at at time zone 'America/Costa_Rica')::date from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and t.id=p_item.task_id and t.status='done' and not t.archived) end,'YYYY-MM-DD'),
  'link',case when p_item.milestone_id is not null then jsonb_build_object('kind','milestone','id',p_item.milestone_id,
    'title',(select m.title from public.pro_work_schedule_milestones m where m.owner_id=p_owner and m.work_id=p_work and m.id=p_item.milestone_id),
    'available',exists(select 1 from public.pro_work_schedule_milestones m where m.owner_id=p_owner and m.work_id=p_work and m.id=p_item.milestone_id and not m.archived),'done',null)
   when p_item.task_id is not null then jsonb_build_object('kind','task','id',p_item.task_id,
    'title',(select t.title from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and t.id=p_item.task_id),
    'available',exists(select 1 from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and t.id=p_item.task_id and not t.archived),
    'done',exists(select 1 from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and t.id=p_item.task_id and t.status='done' and not t.archived))
   else null end);
$$;

-- Full derived state of one plan (current revision) for a given CR day. Owner data: callers filter for the customer.
create or replace function public.pro_payment_plan_state(p_owner uuid,p_plan uuid,p_today date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare p public.pro_payment_plans;r public.pro_payment_plan_revisions;account jsonb;paid bigint;applied bigint;left_over bigint;items jsonb:='[]';i public.pro_payment_plan_items;
 doc jsonb;part bigint;due date;st text;overdue_n integer:=0;overdue_c bigint:=0;upcoming_n integer:=0;upcoming_c bigint:=0;next_due date;draft uuid;acc public.pro_payment_plan_acceptances;last_acc public.pro_payment_plan_acceptances;
begin
 select * into p from public.pro_payment_plans where owner_id=p_owner and id=p_plan;
 if not found then return null;end if;
 select * into r from public.pro_payment_plan_revisions where owner_id=p_owner and plan_id=p.id and revision=p.revision;
 account:=public.pro_work_account(p_owner,p.work_id);
 -- Round 6A: only payments after the plan started, net of their own voids.
 paid:=public.pro_payment_plan_paid_since(p_owner,p.work_id,p.base_position);
 applied:=least(greatest(paid,0),r.total_cents);left_over:=applied;
 for i in select * from public.pro_payment_plan_items where owner_id=p_owner and plan_id=p.id and revision=p.revision order by seq loop
  doc:=public.pro_payment_plan_item_json(p_owner,p.work_id,i);
  part:=least(i.amount_cents,left_over);left_over:=left_over-part;due:=(doc->>'dueDate')::date;
  st:=case when part>=i.amount_cents then 'paid' when due is not null and due<p_today then 'overdue' when part>0 then 'partial' else 'pending' end;
  if p.status='active' and st='overdue' then overdue_n:=overdue_n+1;overdue_c:=overdue_c+i.amount_cents-part;end if;
  if p.status='active' and st in('pending','partial') and due is not null and due between p_today and p_today+7 then upcoming_n:=upcoming_n+1;upcoming_c:=upcoming_c+i.amount_cents-part;end if;
  if p.status='active' and st<>'paid' and due is not null and (next_due is null or due<next_due) then next_due:=due;end if;
  select b.draft_id into draft from public.pro_invoice_billing_items b where b.user_id=p_owner and b.source_type='installment' and b.active and b.source_key=p.id::text||':'||p.revision||':'||i.seq;
  items:=items||(doc||jsonb_build_object('appliedCents',part,'status',st,'invoiceDraftId',draft));
  draft:=null;
 end loop;
 select * into acc from public.pro_payment_plan_acceptances where owner_id=p_owner and plan_id=p.id and revision=p.revision;
 select * into last_acc from public.pro_payment_plan_acceptances where owner_id=p_owner and plan_id=p.id order by revision desc limit 1;
 return jsonb_build_object('planId',p.id,'workId',p.work_id,'status',p.status,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,
  'cancelledAt',p.cancelled_at,'cancelReason',p.cancel_reason,
  'totalCents',r.total_cents,'downPaymentCents',r.down_payment_cents,'frequency',r.frequency,'feeCents',r.fee_cents,'lateFeeCents',r.late_fee_cents,'terms',r.terms,
  'contentHash',r.content_hash,'revisionCreatedAt',r.created_at,
  'appliedCents',applied,'remainingCents',r.total_cents-applied,'customerBalanceCents',account->'customerBalanceCents',
  'items',items,'today',to_char(p_today,'YYYY-MM-DD'),
  'notices',jsonb_build_object('overdueCount',overdue_n,'overdueCents',overdue_c,'upcomingCount',upcoming_n,'upcomingCents',upcoming_c,'nextDue',to_char(next_due,'YYYY-MM-DD')),
  'acceptance',case when acc.plan_id is null then null else jsonb_build_object('revision',acc.revision,'acceptedAt',acc.accepted_at) end,
  'lastAcceptance',case when last_acc.plan_id is null then null else jsonb_build_object('revision',last_acc.revision,'acceptedAt',last_acc.accepted_at) end);
end $$;

-- Canonical content of a revision (what the customer accepts).
create or replace function public.pro_payment_plan_content(p_owner uuid,p_plan uuid,p_revision integer) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('planId',r.plan_id,'revision',r.revision,'totalCents',r.total_cents,'downPaymentCents',r.down_payment_cents,'frequency',r.frequency,
  'feeCents',r.fee_cents,'lateFeeCents',r.late_fee_cents,'terms',r.terms,
  'items',coalesce((select jsonb_agg(jsonb_build_array(i.seq,i.kind,i.amount_cents,i.due_date,i.milestone_id,i.task_id) order by i.seq) from public.pro_payment_plan_items i where i.owner_id=r.owner_id and i.plan_id=r.plan_id and i.revision=r.revision),'[]'::jsonb))
 from public.pro_payment_plan_revisions r where r.owner_id=p_owner and r.plan_id=p_plan and r.revision=p_revision $$;

-- Insert one revision (and its items) from a validated input; raises on any invalid field. The content
-- hash is computed from the same canonical shape as pro_payment_plan_content before the immutable insert.
create or replace function public.pro_payment_plan_write_revision(p_owner uuid,p_work text,p_plan uuid,p_revision integer,p_input jsonb,p_action uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare total bigint;down bigint;fee bigint;late bigint;terms text;sched jsonb;mode text;freq text;n integer;first_due date;down_day date;amounts bigint[];k integer;item jsonb;sum_items bigint:=0;
 last_day date;d date;mid uuid;tid uuid;cnt integer;amount bigint;rows jsonb:='[]';content jsonb;hash text;
begin
 total:=public.pro_payment_plan_cents(p_input->'totalCents',100,10000000000);
 down:=public.pro_payment_plan_cents(p_input->'downPaymentCents',0,10000000000);
 fee:=public.pro_payment_plan_cents(p_input->'feeCents',0,1000000000);late:=public.pro_payment_plan_cents(p_input->'lateFeeCents',0,1000000000);
 if down>=total then raise exception 'Down payment must be below the total' using errcode='22023';end if;
 if jsonb_typeof(p_input->'terms') is distinct from 'string' or length(p_input->>'terms')>1000 then raise exception 'Invalid terms' using errcode='22023';end if;
 terms:=btrim(p_input->>'terms');
 if down>0 then down_day:=public.pro_payment_plan_day(p_input->'downPaymentDate');
 elsif p_input->'downPaymentDate' is distinct from 'null'::jsonb then raise exception 'No down payment date without a down payment' using errcode='22023';end if;
 sched:=p_input->'schedule';
 if jsonb_typeof(sched) is distinct from 'object' or jsonb_typeof(sched->'mode') is distinct from 'string' then raise exception 'Invalid schedule' using errcode='22023';end if;
 mode:=sched->>'mode';
 if mode='auto' then
  perform public.pro_payment_plan_expect(sched,array['mode','frequency','count','firstDue']);
  freq:=sched->>'frequency';if freq is null or freq not in('weekly','biweekly','monthly') then raise exception 'Invalid frequency' using errcode='22023';end if;
  if jsonb_typeof(sched->'count') is distinct from 'number' or (sched->>'count')!~'^[0-9]{1,2}$' then raise exception 'Invalid count' using errcode='22023';end if;
  n:=(sched->>'count')::integer;first_due:=public.pro_payment_plan_day(sched->'firstDue');
  if down_day is not null and first_due<down_day then raise exception 'First installment before the down payment' using errcode='22023';end if;
  amounts:=public.pro_payment_plan_split(total,down,n);
 elsif mode='custom' then
  perform public.pro_payment_plan_expect(sched,array['mode','items']);freq:='custom';
  if jsonb_typeof(sched->'items') is distinct from 'array' or jsonb_array_length(sched->'items') not between 1 and 60 then raise exception 'Invalid installments' using errcode='22023';end if;
  n:=jsonb_array_length(sched->'items');
 else raise exception 'Invalid schedule mode' using errcode='22023';end if;
 if down>0 then rows:=rows||jsonb_build_array(jsonb_build_array(0,'down',down,down_day,null::uuid,null::uuid));sum_items:=down;end if;
 last_day:=down_day;
 for k in 1..n loop
  d:=null;mid:=null;tid:=null;
  if mode='auto' then amount:=amounts[k];d:=public.pro_payment_plan_due(first_due,freq,k-1);
  else
   item:=sched->'items'->(k-1);
   perform public.pro_payment_plan_expect(item,array['amountCents','dueDate','milestoneId','taskId']);
   select count(*) into cnt from jsonb_each(item) e where e.key in('dueDate','milestoneId','taskId') and e.value<>'null'::jsonb;
   if cnt<>1 then raise exception 'Each installment needs exactly one date or one milestone or one task' using errcode='22023';end if;
   amount:=public.pro_payment_plan_cents(item->'amountCents',1,10000000000);
   if item->'dueDate'<>'null'::jsonb then d:=public.pro_payment_plan_day(item->'dueDate');
    -- Dated installments keep the plan order (oldest first).
    if last_day is not null and d<last_day then raise exception 'Installment dates must not go backwards' using errcode='22023';end if;last_day:=d;
   elsif item->'milestoneId'<>'null'::jsonb then mid:=public.pro_payment_plan_uuid(item->'milestoneId');
    if not exists(select 1 from public.pro_work_schedule_milestones m where m.owner_id=p_owner and m.work_id=p_work and m.id=mid and not m.archived) then raise exception 'Milestone not in this job' using errcode='22023';end if;
   else tid:=public.pro_payment_plan_uuid(item->'taskId');
    if not exists(select 1 from public.pro_work_tasks t where t.owner_id=p_owner and t.work_id=p_work and t.id=tid and not t.archived) then raise exception 'Task not in this job' using errcode='22023';end if;
   end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_array(k,'installment',amount,d,mid,tid));sum_items:=sum_items+amount;
 end loop;
 -- Sum invariant: down payment + installments = total, exactly.
 if sum_items<>total then raise exception 'Installments must add up to the total' using errcode='22023',hint='pro_payment_plan_sum';end if;
 content:=jsonb_build_object('planId',p_plan,'revision',p_revision,'totalCents',total,'downPaymentCents',down,'frequency',freq,'feeCents',fee,'lateFeeCents',late,'terms',terms,'items',rows);
 hash:=encode(sha256(convert_to(content::text,'UTF8')),'hex');
 insert into public.pro_payment_plan_revisions(owner_id,plan_id,revision,total_cents,down_payment_cents,frequency,fee_cents,late_fee_cents,terms,content_hash,action_id)
  values(p_owner,p_plan,p_revision,total,down,freq,fee,late,terms,hash,p_action);
 insert into public.pro_payment_plan_items(owner_id,plan_id,revision,seq,kind,amount_cents,due_date,milestone_id,task_id)
  select p_owner,p_plan,p_revision,(r->>0)::integer,r->>1,(r->>2)::bigint,(r->>3)::date,(r->>4)::uuid,(r->>5)::uuid from jsonb_array_elements(rows) r;
 if encode(sha256(convert_to(public.pro_payment_plan_content(p_owner,p_plan,p_revision)::text,'UTF8')),'hex')<>hash then raise exception 'Payment plan content mismatch' using errcode='XX000';end if;
end $$;

-- ---------------------------------------------------------------- owner read
create or replace function public.pro_payment_plan_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;c public.pro_clients;today date:=public.pro_payment_plan_today();account jsonb;active_id uuid;state jsonb;link jsonb;visible boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 select * into w from public.pro_work where user_id=p_actor and id=p_work;
 if not found then return null;end if;
 select * into c from public.pro_clients where user_id=p_actor and id=w."clientId";
 account:=public.pro_work_account(p_actor,p_work);
 select id into active_id from public.pro_payment_plans where owner_id=p_actor and work_id=p_work and status='active';
 if active_id is not null then state:=public.pro_payment_plan_state(p_actor,active_id,today);end if;
 link:=public.pro_work_client_link_json(p_actor,p_work);
 select coalesce(d.show_payment_plan,false) into visible from public.pro_client_dashboards d where d.owner_id=p_actor and d.work_id=p_work;
 return jsonb_build_object('workId',w.id,'workTitle',w.service,'clientName',coalesce(c.name,w.client),'cancelled',w.cancelled,'clientArchived',coalesce(c.archived,true),'today',to_char(today,'YYYY-MM-DD'),
  'account',jsonb_build_object('agreedCents',account->'agreedCents','paidCents',account->'paidCents','customerBalanceCents',account->'customerBalanceCents'),
  'plan',state,
  'revisions',case when active_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('revision',r.revision,'totalCents',r.total_cents,'createdAt',r.created_at,
    'accepted',exists(select 1 from public.pro_payment_plan_acceptances a where a.owner_id=r.owner_id and a.plan_id=r.plan_id and a.revision=r.revision)) order by r.revision desc)
    from public.pro_payment_plan_revisions r where r.owner_id=p_actor and r.plan_id=active_id),'[]'::jsonb) end,
  'history',coalesce((select jsonb_agg(x.doc order by x.id desc) from (select h.id,jsonb_build_object('action',h.action,'revision',h.revision,'at',h.at,'byClient',h.actor_id<>p_actor) doc
    from public.pro_payment_plan_history h where h.owner_id=p_actor and h.work_id=p_work order by h.id desc limit 30) x),'[]'::jsonb),
  'cancelledPlans',coalesce((select jsonb_agg(jsonb_build_object('planId',p.id,'cancelledAt',p.cancelled_at,'reason',p.cancel_reason,'revision',p.revision,
    'totalCents',(select r.total_cents from public.pro_payment_plan_revisions r where r.owner_id=p.owner_id and r.plan_id=p.id and r.revision=p.revision)) order by p.cancelled_at desc)
    from (select * from public.pro_payment_plans where owner_id=p_actor and work_id=p_work and status='cancelled' order by cancelled_at desc limit 10) p),'[]'::jsonb),
  'options',jsonb_build_object(
    'milestones',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'date',to_char(m.milestone_date,'YYYY-MM-DD')) order by m.milestone_date,m.id) from (select * from public.pro_work_schedule_milestones where owner_id=p_actor and work_id=p_work and not archived order by milestone_date,id limit 100) m),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'dueDate',to_char(t.due_date,'YYYY-MM-DD')) order by t.due_date nulls last,t.id) from (select * from public.pro_work_tasks where owner_id=p_actor and work_id=p_work and not archived order by due_date nulls last,id limit 100) t),'[]'::jsonb)),
  'linkedClient',case when link is null then null else jsonb_build_object('name',link->'name') end,
  'showInClientView',coalesce(visible,false));
end $$;

-- In-app notices only (overview «Open items»): overdue and next-7-days installments, acceptance pending.
create or replace function public.pro_payment_plan_notices(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pid uuid;s jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select id into pid from public.pro_payment_plans where owner_id=p_actor and work_id=p_work and status='active';
 if pid is null then return jsonb_build_object('active',false,'overdueCount',0,'overdueCents',0,'upcomingCount',0,'upcomingCents',0,'nextDue',null,'awaitingAcceptance',false);end if;
 s:=public.pro_payment_plan_state(p_actor,pid,public.pro_payment_plan_today());
 return jsonb_build_object('active',true)||(s->'notices')||jsonb_build_object('awaitingAcceptance',s->'acceptance'='null'::jsonb and (s->>'remainingCents')::bigint>0);
end $$;

-- ---------------------------------------------------------------- owner writes
create or replace function public.pro_payment_plan_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;receipt public.pro_payment_plan_actions;w public.pro_work;c public.pro_clients;p public.pro_payment_plans;pid uuid;rev integer;before jsonb;after jsonb;result jsonb;
 base bigint;reason text;v_seq integer;it public.pro_payment_plan_items;draft uuid;v_key text;en boolean;label text;n integer;due text;today date:=public.pro_payment_plan_today();
 plan_keys text[]:=array['totalCents','downPaymentCents','downPaymentDate','schedule','feeCents','lateFeeCents','terms'];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid payment plan' using errcode='22023';end if;
 act:=p_input->>'action';
 if act='create' then perform public.pro_payment_plan_expect(p_input,array['action','actionId','workId','planId']||plan_keys);
 elsif act='edit' then perform public.pro_payment_plan_expect(p_input,array['action','actionId','workId','planId','revision']||plan_keys);
 elsif act='cancel' then perform public.pro_payment_plan_expect(p_input,array['action','actionId','workId','planId','revision','reason']);
 elsif act='invoice' then perform public.pro_payment_plan_expect(p_input,array['action','actionId','workId','planId','revision','seq','language']);
 else raise exception 'Invalid payment plan action' using errcode='22023';end if;
 aid:=public.pro_payment_plan_uuid(p_input->'actionId');pid:=public.pro_payment_plan_uuid(p_input->'planId');
 if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 if act<>'create' then
  if jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]{1,6}$' then raise exception 'Invalid revision' using errcode='22023';end if;
  rev:=(p_input->>'revision')::integer;
 end if;
 -- Invoice drafts share the owner lock of every invoice writer (archive/restore included).
 if act='invoice' then perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-payment-plan-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_payment_plan_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-payment-plan:'||p_actor::text||':'||(p_input->>'workId'),0));
 select * into w from public.pro_work where user_id=p_actor and id=p_input->>'workId' for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select * into c from public.pro_clients where user_id=p_actor and id=w."clientId";
 if act='create' then
  if w.cancelled or coalesce(c.archived,true) then raise exception 'Inactive job' using errcode='22023';end if;
  if exists(select 1 from public.pro_payment_plans where owner_id=p_actor and work_id=w.id and status='active') then raise exception 'Job already has a plan' using errcode='40001';end if;
  if exists(select 1 from public.pro_payment_plans where owner_id=p_actor and id=pid) then raise exception 'Plan identity reused' using errcode='22023';end if;
  base:=coalesce((public.pro_work_account(p_actor,w.id)->>'paidCents')::bigint,0);
  insert into public.pro_payment_plans(owner_id,work_id,id,revision,base_paid_cents,base_position) values(p_actor,w.id,pid,1,base,coalesce((select max(e.position) from public.pro_client_entries e where e.user_id=p_actor),0));
  perform public.pro_payment_plan_write_revision(p_actor,w.id,pid,1,p_input,aid);
  before:=null;after:=public.pro_payment_plan_state(p_actor,pid,today);rev:=1;
 else
  select * into p from public.pro_payment_plans where owner_id=p_actor and id=pid and work_id=w.id for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if p.status<>'active' or p.revision<>rev then raise exception 'Plan changed' using errcode='40001';end if;
  before:=public.pro_payment_plan_state(p_actor,pid,today);
  if act in('edit','cancel') then
   if exists(select 1 from public.pro_invoice_billing_items b where b.user_id=p_actor and b.work_id=w.id and b.active and b.source_type='installment' and split_part(b.source_key,':',1)=pid::text) then
    raise exception 'An installment has an active invoice draft' using errcode='22023',hint='pro_payment_plan_invoiced';end if;
  end if;
  if act='edit' then
   if w.cancelled or coalesce(c.archived,true) then raise exception 'Inactive job' using errcode='22023';end if;
   rev:=p.revision+1;
   perform public.pro_payment_plan_write_revision(p_actor,w.id,pid,rev,p_input,aid);
   update public.pro_payment_plans set revision=rev,updated_at=now() where owner_id=p_actor and id=pid;
   -- Same schedule text (content) as before is not an edit.
   if (select content_hash from public.pro_payment_plan_revisions where owner_id=p_actor and plan_id=pid and revision=rev)
     =encode(sha256(convert_to((public.pro_payment_plan_content(p_actor,pid,p.revision)||jsonb_build_object('revision',rev))::text,'UTF8')),'hex') then
    raise exception 'No payment plan changes' using errcode='22023';end if;
  elsif act='cancel' then
   if jsonb_typeof(p_input->'reason') is distinct from 'string' or length(btrim(p_input->>'reason')) not between 1 and 500 then raise exception 'Invalid reason' using errcode='22023';end if;
   reason:=btrim(p_input->>'reason');
   update public.pro_payment_plans set status='cancelled',cancelled_at=now(),cancel_reason=reason,updated_at=now() where owner_id=p_actor and id=pid;
  else -- invoice draft for one installment (same direct-draft writer as Round 4B)
   if w.cancelled or coalesce(c.archived,true) then raise exception 'Inactive job' using errcode='22023';end if;
   if jsonb_typeof(p_input->'seq') is distinct from 'number' or (p_input->>'seq')!~'^[0-9]{1,2}$' then raise exception 'Invalid installment' using errcode='22023';end if;
   if p_input->>'language' is null or p_input->>'language' not in('es','en') then raise exception 'Invalid language' using errcode='22023';end if;
   v_seq:=(p_input->>'seq')::integer;en:=p_input->>'language'='en';
   select * into it from public.pro_payment_plan_items where owner_id=p_actor and plan_id=pid and revision=p.revision and seq=v_seq;
   if not found then raise exception 'Invalid installment' using errcode='22023';end if;
   v_key:=pid::text||':'||p.revision||':'||v_seq;
   if exists(select 1 from public.pro_invoice_billing_items b where b.user_id=p_actor and b.source_type='installment' and b.active and b.source_key=v_key) then raise exception 'Installment already billed' using errcode='23505',hint='pro_billing_already';end if;
   if exists(select 1 from public.pro_invoice_drafts where user_id=p_actor and id=aid) then raise exception 'Request collision' using errcode='40001';end if;
   select count(*) into n from public.pro_payment_plan_items where owner_id=p_actor and plan_id=pid and revision=p.revision and kind='installment';
   due:=(select x->>'dueDate' from jsonb_array_elements(before->'items') x where (x->>'seq')::integer=v_seq);
   label:=left(w.service,120)||' — '||case when it.kind='down' then case when en then 'Down payment' else 'Prima' end
    else case when en then 'Installment ' else 'Cuota ' end||v_seq||case when en then ' of ' else ' de ' end||n end
    ||case when due is not null then case when en then ' · due ' else ' · vence ' end||due else '' end;
   draft:=public.pro_invoice_extras_save(p_actor,jsonb_build_object('action','create_direct','requestId',aid,'clientId',w."clientId",'title',left(label,160),'notes',
    case when en then 'Installment of the payment plan agreed with the customer. Internal draft: nothing is issued, sent or charged.' else 'Cuota del plan de pagos acordado con el cliente. Borrador interno: no se emite, no se envía ni se cobra nada.' end,
    'lines',jsonb_build_array(jsonb_build_object('kind','service','productId',null,'sku','','description',left(label,200),'unit','Sp','cabys','','quantity','1',
     'unitPrice',trim_scale(it.amount_cents::numeric/100)::text,'discountType','percent','discount','0','discountReason','','taxTreatment','pending','taxRate','0'))));
   update public.pro_invoice_drafts set work_id=w.id where user_id=p_actor and id=draft;
   insert into public.pro_invoice_billing_items(user_id,draft_id,item_number,work_id,source_type,source_key,percent_bps,amount_cents,description)
    values(p_actor,draft,1,w.id,'installment',v_key,null,it.amount_cents,left(label,200));
   rev:=p.revision;
  end if;
  after:=public.pro_payment_plan_state(p_actor,pid,today);
 end if;
 insert into public.pro_payment_plan_history(owner_id,plan_id,work_id,actor_id,action_id,action,revision,before_state,after_state) values(p_actor,pid,w.id,p_actor,aid,act,rev,before,after);
 result:=jsonb_build_object('plan',after)||case when act='invoice' then jsonb_build_object('draftId',draft) else '{}'::jsonb end;
 insert into public.pro_payment_plan_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- customer (verified linked customer only)
-- Customer copy: amounts, dates, status and terms. Never the base, invoice ids, milestone/task ids or task names.
create or replace function public.pro_payment_plan_client_json(p_state jsonb) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('planId',p_state->'planId','revision',p_state->'revision','totalCents',p_state->'totalCents','downPaymentCents',p_state->'downPaymentCents',
  'frequency',p_state->'frequency','feeCents',p_state->'feeCents','lateFeeCents',p_state->'lateFeeCents','terms',p_state->'terms','contentHash',p_state->'contentHash',
  'appliedCents',p_state->'appliedCents','remainingCents',p_state->'remainingCents','today',p_state->'today','revisionCreatedAt',p_state->'revisionCreatedAt',
  'items',coalesce((select jsonb_agg(jsonb_build_object('seq',i->'seq','kind',i->'kind','amountCents',i->'amountCents','dueDate',i->'dueDate','appliedCents',i->'appliedCents','status',i->'status',
    'link',case when i->'link'='null'::jsonb then null when i->'link'->>'kind'='milestone' then jsonb_build_object('kind','milestone','title',i->'link'->'title') else jsonb_build_object('kind','task','title',null) end) order by (i->>'seq')::integer)
   from jsonb_array_elements(p_state->'items') i),'[]'::jsonb),
  'acceptance',p_state->'acceptance','canAccept',p_state->'acceptance'='null'::jsonb) $$;

create or replace function public.pro_payment_plan_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;visible boolean;pid uuid;w public.pro_work;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is null then raise exception 'Invalid payment plan query' using errcode='22023';end if;
 select * into r from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select coalesce(d.show_payment_plan,false) into visible from public.pro_client_dashboards d where d.owner_id=r.owner_id and d.work_id=r.work_id;
 if not coalesce(visible,false) or r.status not in('confirmed','completed') then return jsonb_build_object('visible',false);end if;
 select * into w from public.pro_work where user_id=r.owner_id and id=r.work_id;
 if not found then return jsonb_build_object('visible',false);end if;
 select id into pid from public.pro_payment_plans where owner_id=r.owner_id and work_id=r.work_id and status='active';
 return jsonb_build_object('visible',true,'workTitle',w.service,
  'plan',case when pid is null then null else public.pro_payment_plan_client_json(public.pro_payment_plan_state(r.owner_id,pid,public.pro_payment_plan_today())) end);
end $$;

create or replace function public.pro_payment_plan_client_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.pro_payment_plan_actions;r public.pro_appointment_requests;visible boolean;p public.pro_payment_plans;rv public.pro_payment_plan_revisions;rev integer;before jsonb;after jsonb;result jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 perform public.pro_payment_plan_expect(p_input,array['action','actionId','requestId','planId','revision','contentHash']);
 if p_input->>'action' is distinct from 'accept' then raise exception 'Invalid payment plan answer' using errcode='22023';end if;
 aid:=public.pro_payment_plan_uuid(p_input->'actionId');
 if jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]{1,6}$' then raise exception 'Invalid revision' using errcode='22023';end if;
 if jsonb_typeof(p_input->'contentHash') is distinct from 'string' or (p_input->>'contentHash')!~'^[a-f0-9]{64}$' then raise exception 'Invalid hash' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;
 perform pg_advisory_xact_lock(hashtextextended('pro-payment-plan-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_payment_plan_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 -- Only the customer linked to this job through a confirmed request (appointment or accepted invitation).
 select * into r from public.pro_appointment_requests where id=public.pro_payment_plan_uuid(p_input->'requestId') and client_user_id=p_actor and work_id is not null and status in('confirmed','completed');
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select coalesce(d.show_payment_plan,false) into visible from public.pro_client_dashboards d where d.owner_id=r.owner_id and d.work_id=r.work_id;
 if not coalesce(visible,false) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-payment-plan:'||r.owner_id::text||':'||r.work_id,0));
 select * into p from public.pro_payment_plans where owner_id=r.owner_id and work_id=r.work_id and id=public.pro_payment_plan_uuid(p_input->'planId') for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select * into rv from public.pro_payment_plan_revisions where owner_id=p.owner_id and plan_id=p.id and revision=p.revision;
 -- The customer accepts exactly the revision (and content) currently shown.
 if p.status<>'active' or p.revision<>rev or rv.content_hash<>p_input->>'contentHash' then raise exception 'Plan changed' using errcode='40001';end if;
 if exists(select 1 from public.pro_payment_plan_acceptances where owner_id=p.owner_id and plan_id=p.id and revision=p.revision) then raise exception 'Plan already accepted' using errcode='40001';end if;
 before:=public.pro_payment_plan_state(p.owner_id,p.id,public.pro_payment_plan_today());
 insert into public.pro_payment_plan_acceptances(owner_id,plan_id,revision,client_user_id,request_id,content_hash,action_id) values(p.owner_id,p.id,p.revision,p_actor,r.id,rv.content_hash,aid);
 after:=public.pro_payment_plan_state(p.owner_id,p.id,public.pro_payment_plan_today());
 insert into public.pro_payment_plan_history(owner_id,plan_id,work_id,actor_id,action_id,action,revision,before_state,after_state) values(p.owner_id,p.id,p.work_id,p_actor,aid,'accept',p.revision,before,after);
 result:=jsonb_build_object('plan',public.pro_payment_plan_client_json(after));
 insert into public.pro_payment_plan_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- RLS and grants (service_role only)
do $$declare n text;begin foreach n in array array['pro_payment_plans','pro_payment_plan_revisions','pro_payment_plan_items','pro_payment_plan_acceptances','pro_payment_plan_history','pro_payment_plan_actions'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select,insert,update,delete on public.%I to service_role',n);
 end loop;end $$;
do $$
declare f regprocedure;
begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_payment\_plan\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_payment_plan_immutable(%' and f::text not like 'pro_payment_plan_billing_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;
end $$;
revoke all on function public.pro_client_dashboard_settings_json(text,public.pro_client_dashboards),public.pro_client_dashboard_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_client_dashboard_settings_json(text,public.pro_client_dashboards),public.pro_client_dashboard_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
