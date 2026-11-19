-- LOCAL PRO ONLY. Montos previstos para materiales por elegir (family 75 of the
-- parity register). Provisional budget lines per job (pro_work) that are later
-- defined with the actual choice and reconciled against the planned amount.
-- Amounts are CRC céntimos (bigint), like work-budget and work-changes.
-- Nothing here creates debt, invoices, charges or notifications: an optional
-- extra for a positive difference is proposed through the existing
-- pro_work_changes_mutate flow (customer approval required) and only linked here.
begin;
create table if not exists public.pro_work_allowances(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 position bigint generated always as identity,
 name text not null check(length(btrim(name)) between 1 and 160),
 category text check(category is null or length(btrim(category)) between 1 and 80),
 planned_cents bigint not null check(planned_cents between 0 and 10000000000),
 due_date date,notes text check(notes is null or length(btrim(notes)) between 1 and 1000),
 status text not null default 'open' check(status in('open','decided','reopened')),
 choice_description text check(choice_description is null or length(btrim(choice_description)) between 1 and 300),
 choice_supplier text check(choice_supplier is null or length(btrim(choice_supplier)) between 1 and 160),
 choice_quantity numeric(12,2) check(choice_quantity is null or choice_quantity between 0.01 and 1000000),
 actual_cents bigint check(actual_cents is null or actual_cents between 0 and 10000000000),
 decided_at timestamptz,change_id uuid,archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 check((status='decided')=(choice_description is not null and choice_quantity is not null and actual_cents is not null and decided_at is not null)),
 check(change_id is null or status='decided')
);
create unique index if not exists pro_work_allowance_global_id on public.pro_work_allowances(id);
create index if not exists pro_work_allowance_page on public.pro_work_allowances(owner_id,work_id,position);
create table if not exists public.pro_work_allowance_history(
 owner_id uuid not null,work_id text not null,allowance_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','decide','reopen','archive','restore','link_change')),
 before_item jsonb,after_item jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id),foreign key(owner_id,allowance_id) references public.pro_work_allowances(owner_id,id) on delete cascade
);
create index if not exists pro_work_allowance_history_page on public.pro_work_allowance_history(owner_id,work_id,at desc);
create table if not exists public.pro_work_allowance_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
-- Costa Rica calendar day (UTC-6, no DST) used for overdue decisions.
create or replace function public.pro_work_allowance_today() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (now() at time zone 'America/Costa_Rica')::date $$;
create or replace function public.pro_work_allowance_json(p_row public.pro_work_allowances) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'position',p_row.position,'name',p_row.name,'category',p_row.category,
  'plannedCents',p_row.planned_cents,'dueDate',p_row.due_date,'notes',p_row.notes,'status',p_row.status,
  'choice',case when p_row.status='decided' then jsonb_build_object('description',p_row.choice_description,'supplier',p_row.choice_supplier,
   'quantity',p_row.choice_quantity,'actualCents',p_row.actual_cents,'decidedAt',p_row.decided_at) end,
  'differenceCents',case when p_row.status='decided' then p_row.actual_cents-p_row.planned_cents end,
  'variance',case when p_row.status<>'decided' then null when p_row.actual_cents>p_row.planned_cents then 'over' when p_row.actual_cents<p_row.planned_cents then 'under' else 'equal' end,
  'overdue',p_row.status<>'decided' and not p_row.archived and p_row.due_date is not null and p_row.due_date<public.pro_work_allowance_today(),
  'changeId',p_row.change_id,'archived',p_row.archived,'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at);
$$;
create or replace function public.pro_work_allowance_totals(p_owner uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('count',count(*),'plannedCents',coalesce(sum(planned_cents),0),
  'decidedPlannedCents',coalesce(sum(planned_cents) filter(where status='decided'),0),'actualCents',coalesce(sum(actual_cents) filter(where status='decided'),0),
  'differenceCents',coalesce(sum(actual_cents-planned_cents) filter(where status='decided'),0),
  'projectedCents',coalesce(sum(case when status='decided' then actual_cents else planned_cents end),0),
  'decidedCount',count(*) filter(where status='decided'),'pendingCount',count(*) filter(where status<>'decided'),
  'overdueCount',count(*) filter(where status<>'decided' and due_date is not null and due_date<public.pro_work_allowance_today()))
 from public.pro_work_allowances where owner_id=p_owner and work_id=p_work and not archived;
$$;
create or replace function public.pro_work_allowances_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;hist jsonb;linked jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid allowance query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(public.pro_work_allowance_json(a) order by a.archived,a.position),'[]'::jsonb) into items
  from public.pro_work_allowances a where a.owner_id=p_actor and a.work_id=p_work;
 -- QA: live status of each linked extra (it can be accepted, declined or withdrawn
 -- later in Extras y cambios); kept out of the item JSON so stored history is unchanged.
 select coalesce(jsonb_object_agg(c.id::text,c.status),'{}'::jsonb) into linked from public.pro_work_changes c
  where c.owner_id=p_actor and c.work_id=p_work and c.id in(select a.change_id from public.pro_work_allowances a where a.owner_id=p_actor and a.work_id=p_work and a.change_id is not null);
 select coalesce(jsonb_agg(x.content order by x.at desc,x.action_id),'[]'::jsonb) into hist from (
  select h.at,h.action_id,jsonb_build_object('actionId',h.action_id,'allowanceId',h.allowance_id,'action',h.action,'at',h.at,'before',h.before_item,'after',h.after_item) as content
  from public.pro_work_allowance_history h where h.owner_id=p_actor and h.work_id=p_work order by h.at desc,h.action_id limit 100
 ) x;
 return jsonb_build_object('workId',p_work,'today',public.pro_work_allowance_today(),'items',items,'totals',public.pro_work_allowance_totals(p_actor,p_work),'history',hist,'changeStatuses',linked);
end $$;
-- Customer read: only the linked customer of a confirmed/completed request, and
-- only when the owner turned the section on (off by default). No internal notes,
-- revisions, linked change ids or history.
create or replace function public.pro_work_allowances_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;req_status text;enabled boolean;items jsonb;totals jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id,status into owner,wid,req_status from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select coalesce(show_allowances,false) into enabled from public.pro_client_dashboards where owner_id=owner and work_id=wid;
 if req_status not in('confirmed','completed') or not coalesce(enabled,false) then return jsonb_build_object('visible',false);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'category',a.category,'plannedCents',a.planned_cents,'dueDate',a.due_date,'status',a.status,
   'choice',case when a.status='decided' then jsonb_build_object('description',a.choice_description,'supplier',a.choice_supplier,'quantity',a.choice_quantity,'actualCents',a.actual_cents) end,
   'differenceCents',case when a.status='decided' then a.actual_cents-a.planned_cents end,
   'variance',case when a.status<>'decided' then null when a.actual_cents>a.planned_cents then 'over' when a.actual_cents<a.planned_cents then 'under' else 'equal' end) order by a.position),'[]'::jsonb) into items
  from public.pro_work_allowances a where a.owner_id=owner and a.work_id=wid and not a.archived;
 totals:=public.pro_work_allowance_totals(owner,wid);
 return jsonb_build_object('visible',true,'items',items,'totals',jsonb_build_object('plannedCents',totals->'plannedCents','actualCents',totals->'actualCents',
  'decidedPlannedCents',totals->'decidedPlannedCents','differenceCents',totals->'differenceCents','pendingCount',totals->'pendingCount','decidedCount',totals->'decidedCount'));
end $$;
create or replace function public.pro_work_allowances_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;aid uuid;rid uuid;rev integer;keys text[];expected text[];receipt public.pro_work_allowance_actions;r public.pro_work_allowances;
 before_json jsonb;after_json jsonb;result jsonb;v_name text;v_category text;v_notes text;v_due date;v_planned numeric;v_desc text;v_supplier text;v_qty numeric;v_actual numeric;v_change uuid;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid allowance' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'create' then array['action','actionId','category','dueDate','id','name','notes','plannedCents','workId']
  when 'update' then array['action','actionId','category','dueDate','id','name','notes','plannedCents','revision','workId']
  when 'decide' then array['action','actionId','actualCents','choiceDescription','id','quantity','revision','supplier','workId']
  when 'link_change' then array['action','actionId','changeId','id','revision','workId']
  when 'reopen' then array['action','actionId','id','revision','workId'] when 'archive' then array['action','actionId','id','revision','workId'] when 'restore' then array['action','actionId','id','revision','workId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
  or jsonb_typeof(p_input->'id') is distinct from 'string' then raise exception 'Invalid allowance fields' using errcode='22023';end if;
 if act<>'create' and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'id')::uuid;rev:=case when act<>'create' then (p_input->>'revision')::integer end;
 if length(wid) not between 1 and 160 then raise exception 'Invalid allowance identity' using errcode='22023';end if;
 if act in('create','update') then
  if jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'category') not in('string','null') or jsonb_typeof(p_input->'notes') not in('string','null')
   or jsonb_typeof(p_input->'dueDate') not in('string','null') or jsonb_typeof(p_input->'plannedCents') is distinct from 'number' then raise exception 'Invalid allowance fields' using errcode='22023';end if;
  v_name:=btrim(p_input->>'name');v_category:=nullif(btrim(coalesce(p_input->>'category','')),'');v_notes:=nullif(btrim(coalesce(p_input->>'notes','')),'');
  v_planned:=(p_input->>'plannedCents')::numeric;
  if length(v_name) not between 1 and 160 or length(v_category)>80 or length(v_notes)>1000 or v_planned<>round(v_planned) or v_planned not between 0 and 10000000000 then raise exception 'Invalid allowance values' using errcode='22023';end if;
  if p_input->>'dueDate' is not null then
   if not (p_input->>'dueDate')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid due date' using errcode='22023';end if;
   v_due:=(p_input->>'dueDate')::date;if to_char(v_due,'YYYY-MM-DD')<>p_input->>'dueDate' then raise exception 'Invalid due date' using errcode='22023';end if;
  end if;
 elsif act='decide' then
  if jsonb_typeof(p_input->'choiceDescription') is distinct from 'string' or jsonb_typeof(p_input->'supplier') not in('string','null') or jsonb_typeof(p_input->'quantity') is distinct from 'number'
   or jsonb_typeof(p_input->'actualCents') is distinct from 'number' then raise exception 'Invalid choice fields' using errcode='22023';end if;
  v_desc:=btrim(p_input->>'choiceDescription');v_supplier:=nullif(btrim(coalesce(p_input->>'supplier','')),'');v_qty:=(p_input->>'quantity')::numeric;v_actual:=(p_input->>'actualCents')::numeric;
  if length(v_desc) not between 1 and 300 or length(v_supplier)>160 or v_qty<>round(v_qty,2) or v_qty not between 0.01 and 1000000 or v_actual<>round(v_actual) or v_actual not between 0 and 10000000000 then raise exception 'Invalid choice values' using errcode='22023';end if;
 elsif act='link_change' then
  if jsonb_typeof(p_input->'changeId') is distinct from 'string' then raise exception 'Invalid change link' using errcode='22023';end if;
  v_change:=(p_input->>'changeId')::uuid;
 end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-allowance-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_allowance_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-allowance:'||p_actor::text||':'||wid,0));
 perform 1 from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if act='create' then
  if exists(select 1 from public.pro_work_allowances where id=rid) then raise exception 'Allowance id already used' using errcode='23505';end if;
  if (select count(*) from public.pro_work_allowances where owner_id=p_actor and work_id=wid)>=200 then raise exception 'Allowance limit' using errcode='54000';end if;
  before_json:=null;
  insert into public.pro_work_allowances(owner_id,id,work_id,name,category,planned_cents,due_date,notes)
   values(p_actor,rid,wid,v_name,v_category,v_planned::bigint,v_due,v_notes) returning * into r;
 else
  select * into r from public.pro_work_allowances where owner_id=p_actor and id=rid and work_id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if r.revision<>rev then raise exception 'Allowance changed' using errcode='40001';end if;
  before_json:=public.pro_work_allowance_json(r);
  if act='update' then
   if r.archived or r.status='decided' then raise exception 'Reopen or restore before editing' using errcode='22023';end if;
   if r.name=v_name and r.category is not distinct from v_category and r.planned_cents=v_planned::bigint and r.due_date is not distinct from v_due and r.notes is not distinct from v_notes then raise exception 'No allowance changes' using errcode='22023';end if;
   update public.pro_work_allowances set name=v_name,category=v_category,planned_cents=v_planned::bigint,due_date=v_due,notes=v_notes,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='decide' then
   if r.archived or r.status='decided' then raise exception 'Allowance already defined' using errcode='22023';end if;
   update public.pro_work_allowances set status='decided',choice_description=v_desc,choice_supplier=v_supplier,choice_quantity=v_qty,actual_cents=v_actual::bigint,decided_at=now(),change_id=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='reopen' then
   if r.archived or r.status<>'decided' then raise exception 'Only defined allowances can be reopened' using errcode='22023';end if;
   -- The previous choice stays in the immutable history (before_item).
   update public.pro_work_allowances set status='reopened',choice_description=null,choice_supplier=null,choice_quantity=null,actual_cents=null,decided_at=null,change_id=null,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='archive' then
   if r.archived then raise exception 'Already archived' using errcode='22023';end if;
   update public.pro_work_allowances set archived=true,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='restore' then
   if not r.archived then raise exception 'Not archived' using errcode='22023';end if;
   update public.pro_work_allowances set archived=false,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  elsif act='link_change' then
   if r.archived or r.status<>'decided' or r.change_id is not null or r.actual_cents<=r.planned_cents then raise exception 'Nothing to link' using errcode='22023';end if;
   -- Only a real proposal of this same job for exactly this positive difference.
   if not exists(select 1 from public.pro_work_changes c where c.owner_id=p_actor and c.id=v_change and c.work_id=wid and c.delta_cents=r.actual_cents-r.planned_cents) then raise exception 'Unknown change' using errcode='22023';end if;
   update public.pro_work_allowances set change_id=v_change,revision=revision+1,updated_at=now() where owner_id=p_actor and id=rid returning * into r;
  end if;
 end if;
 after_json:=public.pro_work_allowance_json(r);result:=jsonb_build_object('item',after_json);
 insert into public.pro_work_allowance_history(owner_id,work_id,allowance_id,action_id,action,before_item,after_item) values(p_actor,wid,rid,aid,act,before_json,after_json);
 insert into public.pro_work_allowance_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.pro_work_allowance_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Allowance history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_work_allowance_history_immutable on public.pro_work_allowance_history;
create trigger pro_work_allowance_history_immutable before update on public.pro_work_allowance_history for each row execute function public.pro_work_allowance_immutable();
drop trigger if exists pro_work_allowance_action_immutable on public.pro_work_allowance_actions;
create trigger pro_work_allowance_action_immutable before update on public.pro_work_allowance_actions for each row execute function public.pro_work_allowance_immutable();
alter table public.pro_work_allowances enable row level security;
alter table public.pro_work_allowance_history enable row level security;
alter table public.pro_work_allowance_actions enable row level security;
revoke all on public.pro_work_allowances,public.pro_work_allowance_history,public.pro_work_allowance_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_allowances,public.pro_work_allowance_history,public.pro_work_allowance_actions to service_role;
grant usage,select on sequence public.pro_work_allowances_position_seq to service_role;
revoke all on function public.pro_work_allowance_today(),public.pro_work_allowance_json(public.pro_work_allowances),public.pro_work_allowance_totals(uuid,text),public.pro_work_allowances_read(uuid,text),public.pro_work_allowances_client_read(uuid,uuid),public.pro_work_allowances_mutate(uuid,jsonb),public.pro_work_allowance_immutable() from public,anon,authenticated;
grant execute on function public.pro_work_allowance_today(),public.pro_work_allowance_json(public.pro_work_allowances),public.pro_work_allowance_totals(uuid,text),public.pro_work_allowances_read(uuid,text),public.pro_work_allowances_client_read(uuid,uuid),public.pro_work_allowances_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
