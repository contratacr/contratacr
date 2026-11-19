-- LOCAL PRO ONLY. Own time tracking (families 21/22): activities with an hourly
-- rate (CRC cents) and optional internal cost, one running timer per account kept
-- on the server, and manual entries. A stopped or manual entry becomes exactly one
-- existing job-cost time line (pro_work_costs_mutate 'add_time'), so job costs
-- count every minute once; voiding uses the existing 'void_time' reversal.
-- No payroll, no clock-in for third parties, no invoices or notifications.
begin;
create table if not exists public.pro_time_activities(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 80),
 rate_cents bigint not null check(rate_cents between 0 and 10000000000),
 cost_cents bigint check(cost_cents is null or cost_cents between 0 and 10000000000),
 billable boolean not null default true,archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create table if not exists public.pro_time_entries(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,activity_id uuid,
 source text not null check(source in('timer','manual')),status text not null check(status in('running','stopped','discarded')),
 started_at timestamptz,stopped_at timestamptz,minutes integer,recorded_on date,
 billable boolean not null,rate_cents bigint check(rate_cents is null or rate_cents between 0 and 10000000000),
 cost_cents bigint check(cost_cents is null or cost_cents between 0 and 10000000000),
 note text not null default '' check(length(note)<=300),cost_entry_id uuid,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),
 primary key(owner_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,activity_id) references public.pro_time_activities(owner_id,id),
 foreign key(owner_id,cost_entry_id) references public.pro_work_cost_entries(user_id,id),
 check((status='running' and source='timer' and started_at is not null and stopped_at is null and minutes is null and recorded_on is null and cost_entry_id is null)
  or(status='discarded' and source='timer' and started_at is not null and stopped_at is not null and minutes is null and cost_entry_id is null)
  or(status='stopped' and minutes between 1 and 1440 and recorded_on is not null and cost_entry_id is not null and(source='manual' or(started_at is not null and stopped_at is not null))))
);
-- One running timer per account, across every job and tab.
create unique index if not exists pro_time_entries_one_running on public.pro_time_entries(owner_id) where status='running';
create unique index if not exists pro_time_entries_cost_line on public.pro_time_entries(owner_id,cost_entry_id) where cost_entry_id is not null;
create index if not exists pro_time_entries_work_page on public.pro_time_entries(owner_id,work_id,recorded_on desc,created_at desc);
create table if not exists public.pro_time_history(
 owner_id uuid not null,action_id uuid not null,subject text not null check(subject in('activity','entry')),subject_id uuid not null,
 action text not null,before_row jsonb,after_row jsonb not null,at timestamptz not null default now(),primary key(owner_id,action_id)
);
create table if not exists public.pro_time_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
create or replace function public.pro_time_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Time history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_time_history_immutable on public.pro_time_history;
create trigger pro_time_history_immutable before update on public.pro_time_history for each row execute function public.pro_time_immutable();
drop trigger if exists pro_time_actions_immutable on public.pro_time_actions;
create trigger pro_time_actions_immutable before update on public.pro_time_actions for each row execute function public.pro_time_immutable();

create or replace function public.pro_time_activity_json(p_row public.pro_time_activities) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'name',p_row.name,'rateCents',p_row.rate_cents,'costCents',p_row.cost_cents,'billable',p_row.billable,'archived',p_row.archived,'revision',p_row.revision);
$$;
-- QA 2026-11-11: an edit in Costs (edit_time) reverses the line and records a new
-- one with id = requestId. Follow that chain to the live line: the entry is void only
-- when the chain ends in a plain reversal; otherwise it is "adjusted in Costs" and its
-- minutes/amounts come from the live line, so Hours and Costs never disagree.
create index if not exists pro_work_cost_requests_edit_time on public.pro_work_cost_requests(user_id,lower(input->>'entryId')) where input->>'action'='edit_time';
create or replace function public.pro_time_live_line(p_owner uuid,p_line uuid) returns uuid
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare cur uuid:=p_line;nxt uuid;
begin
 for i in 1..100 loop
  if cur is null then return null;end if;
  if not exists(select 1 from public.pro_work_cost_entries r where r.user_id=p_owner and r.reversal_id=cur) then return cur;end if;
  nxt:=null;select (q.result->>'id')::uuid into nxt from public.pro_work_cost_requests q where q.user_id=p_owner and q.input->>'action'='edit_time' and lower(q.input->>'entryId')=cur::text limit 1;
  cur:=nxt;
 end loop;
 return null;
end $$;
create or replace function public.pro_time_entry_json(p_row public.pro_time_entries) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'workTitle',(select w.service from public.pro_work w where w.user_id=p_row.owner_id and w.id=p_row.work_id),
  'activityId',p_row.activity_id,'activityName',(select a.name from public.pro_time_activities a where a.owner_id=p_row.owner_id and a.id=p_row.activity_id),
  'source',p_row.source,'status',p_row.status,'startedAt',p_row.started_at,'stoppedAt',p_row.stopped_at,'minutes',coalesce(l.minutes,p_row.minutes),
  'recordedOn',case when p_row.recorded_on is null then null else to_char(p_row.recorded_on,'YYYY-MM-DD') end,
  'billable',p_row.billable,'rateCents',p_row.rate_cents,'costCents',p_row.cost_cents,'note',p_row.note,'costEntryId',p_row.cost_entry_id,
  'billableCents',case when p_row.status='stopped' and p_row.billable and p_row.rate_cents is not null then round(coalesce(l.minutes,p_row.minutes)::numeric*p_row.rate_cents/60)::bigint end,
  'voided',p_row.cost_entry_id is not null and l.id is null,
  'adjusted',l.id is not null and l.id<>p_row.cost_entry_id,
  'revision',p_row.revision)
 from (select 1) one left join public.pro_work_cost_entries l on l.user_id=p_row.owner_id and l.id=public.pro_time_live_line(p_row.owner_id,p_row.cost_entry_id);
$$;

create or replace function public.pro_time_read(p_actor uuid,p_work text,p_from text,p_to text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare first_day date;last_day date;running public.pro_time_entries;activities jsonb;entries jsonb;totals jsonb;by_activity jsonb;ledger jsonb;ledger_totals jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_from is null or p_to is null or not p_from~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not p_to~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid time query' using errcode='22023';end if;
 first_day:=p_from::date;last_day:=p_to::date;
 if first_day<date'1900-01-01' or last_day>date'2100-12-31' or last_day-first_day not between 0 and 366 then raise exception 'Invalid time period' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select * into running from public.pro_time_entries where owner_id=p_actor and status='running';
 select coalesce(jsonb_agg(public.pro_time_activity_json(a) order by a.archived,a.name,a.id),'[]'::jsonb) into activities from (select * from public.pro_time_activities where owner_id=p_actor order by archived,name,id limit 100) a;
 select coalesce(jsonb_agg(public.pro_time_entry_json(e) order by e.recorded_on desc,e.created_at desc,e.id),'[]'::jsonb) into entries
  from (select * from public.pro_time_entries where owner_id=p_actor and work_id=p_work and status='stopped' and recorded_on between first_day and last_day order by recorded_on desc,created_at desc,id limit 200) e;
 with live as(select e.owner_id,e.activity_id,e.billable,e.rate_cents,l.minutes,l.hourly_cost_cents line_cost,l.amount_cents line_amount,a.name activity_name
   from public.pro_time_entries e join public.pro_work_cost_entries l on l.user_id=e.owner_id and l.id=public.pro_time_live_line(e.owner_id,e.cost_entry_id)
   left join public.pro_time_activities a on a.owner_id=e.owner_id and a.id=e.activity_id
   where e.owner_id=p_actor and e.work_id=p_work and e.status='stopped' and e.recorded_on between first_day and last_day)
 select jsonb_build_object('entries',count(*),'minutes',coalesce(sum(minutes),0),'billableMinutes',coalesce(sum(minutes) filter(where billable),0),
   'billableCents',coalesce(sum(round(minutes::numeric*rate_cents/60)) filter(where billable and rate_cents is not null),0)::bigint,
   'costCents',coalesce(sum(line_amount) filter(where line_cost is not null),0)::bigint,
   'uncostedMinutes',coalesce(sum(minutes) filter(where line_cost is null),0)),
  coalesce((select jsonb_agg(jsonb_build_object('activityId',g.activity_id,'name',g.activity_name,'minutes',g.minutes,'billableCents',g.billable_cents) order by g.minutes desc,g.activity_name nulls last)
   from (select activity_id,activity_name,sum(minutes) minutes,coalesce(sum(round(minutes::numeric*rate_cents/60)) filter(where billable and rate_cents is not null),0)::bigint billable_cents from live group by activity_id,activity_name) g),'[]'::jsonb)
 into totals,by_activity from live;
 -- Round 1 (2026-11-12): ONE time ledger. Hours recorded directly in «Costos y pagos» (live time lines of
 -- pro_work_cost_entries not produced by this module) are listed here read-only (source 'ledger') and
 -- counted in the totals, so «Horas» and «Costos y pagos» always show the same hours.
 with mine as(select public.pro_time_live_line(e.owner_id,e.cost_entry_id) line from public.pro_time_entries e where e.owner_id=p_actor and e.work_id=p_work and e.cost_entry_id is not null),
 lines as(select l.* from public.pro_work_cost_entries l where l.user_id=p_actor and l.work_id=p_work and l.kind='time' and l.recorded_on between first_day and last_day
   and not exists(select 1 from public.pro_work_cost_entries r where r.user_id=l.user_id and r.reversal_id=l.id)
   and not exists(select 1 from mine where mine.line=l.id)
   and not exists(select 1 from public.pro_time_entries e where e.owner_id=p_actor and e.cost_entry_id=l.id))
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'workId',l.work_id,'workTitle',(select w.service from public.pro_work w where w.user_id=p_actor and w.id=l.work_id),'activityId',null,'activityName',null,
   'source','ledger','status','stopped','startedAt',null,'stoppedAt',null,'minutes',l.minutes,'recordedOn',to_char(l.recorded_on,'YYYY-MM-DD'),'billable',false,'rateCents',null,'costCents',l.hourly_cost_cents,
   'note',l.note,'costEntryId',l.id,'billableCents',null,'voided',false,'adjusted',false,'revision',1) order by l.recorded_on desc,l.created_at desc,l.id),'[]'::jsonb),
  jsonb_build_object('entries',count(*),'minutes',coalesce(sum(l.minutes),0),'costCents',coalesce(sum(l.amount_cents) filter(where l.hourly_cost_cents is not null),0),'uncostedMinutes',coalesce(sum(l.minutes) filter(where l.hourly_cost_cents is null),0))
 into ledger,ledger_totals from (select * from lines order by recorded_on desc,created_at desc,id limit 200) l;
 select coalesce(jsonb_agg(x order by x->>'recordedOn' desc),'[]'::jsonb) into entries from (select jsonb_array_elements(entries) x union all select jsonb_array_elements(ledger)) y(x);
 if jsonb_array_length(entries)>200 then select jsonb_agg(x) into entries from (select x from jsonb_array_elements(entries) with ordinality t(x,n) where n<=200 order by n) z;end if;
 totals:=totals||jsonb_build_object('entries',(totals->>'entries')::bigint+(ledger_totals->>'entries')::bigint,'minutes',(totals->>'minutes')::bigint+(ledger_totals->>'minutes')::bigint,
  'costCents',(totals->>'costCents')::bigint+(ledger_totals->>'costCents')::bigint,'uncostedMinutes',(totals->>'uncostedMinutes')::bigint+(ledger_totals->>'uncostedMinutes')::bigint);
 if (ledger_totals->>'minutes')::bigint>0 then by_activity:=by_activity||jsonb_build_array(jsonb_build_object('activityId',null,'name',null,'minutes',(ledger_totals->>'minutes')::bigint,'billableCents',0));end if;
 return jsonb_build_object('workId',p_work,'serverNow',clock_timestamp(),'period',jsonb_build_object('from',p_from,'to',p_to),
  'running',case when running.id is null then null else public.pro_time_entry_json(running) end,
  'activities',activities,'entries',entries,'totals',totals||jsonb_build_object('byActivity',by_activity));
end $$;

-- Records one job-cost time line through the existing writer (same lock, current revision).
create or replace function public.pro_time_cost_line(p_actor uuid,p_work text,p_request uuid,p_day date,p_minutes integer,p_cost bigint,p_note text) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare cid text;rev bigint;answer jsonb;
begin
 select "clientId" into cid from public.pro_work where user_id=p_actor and id=p_work;
 if cid is null then raise exception 'Job without customer' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('work-costs:'||p_actor::text,0));
 insert into public.pro_work_cost_state(user_id) values(p_actor) on conflict do nothing;
 select revision into rev from public.pro_work_cost_state where user_id=p_actor;
 answer:=public.pro_work_costs_mutate(p_actor,jsonb_build_object('action','add_time','clientId',cid,'workId',p_work,'requestId',p_request,'revision',rev,
  'date',to_char(p_day,'YYYY-MM-DD'),'minutes',p_minutes,'hourlyCostCents',p_cost,'note',left(p_note,300)));
 return (answer->>'id')::uuid;
end $$;

create or replace function public.pro_time_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;eid uuid;keys text[];expected text[];receipt public.pro_time_actions;a public.pro_time_activities;e public.pro_time_entries;w public.pro_work;
 before_json jsonb;after_json jsonb;result jsonb;subject text;sid uuid;v_name text;v_rate bigint;v_cost bigint;v_note text;v_minutes integer;v_day date;elapsed numeric;cost_line uuid;rev bigint;cid text;already boolean:=false;today date;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid time operation' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'activity_save' then array['action','actionId','activityId','billable','costCents','name','rateCents','revision']
  when 'activity_archive' then array['action','actionId','activityId','revision'] when 'activity_restore' then array['action','actionId','activityId','revision']
  when 'start' then array['action','actionId','activityId','billable','entryId','note','workId']
  when 'stop' then array['action','actionId','entryId','minutes','note']
  when 'discard' then array['action','actionId','entryId']
  when 'manual' then array['action','actionId','activityId','billable','date','entryId','minutes','note','workId']
  when 'void' then array['action','actionId','entryId','reason','revision'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected then raise exception 'Invalid time fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;today:=(now() at time zone 'America/Costa_Rica')::date;
 if act like 'activity_%' then
  if jsonb_typeof(p_input->'activityId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid activity identity' using errcode='22023';end if;
  if act='activity_save' then
   if jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'rateCents') is distinct from 'number' or jsonb_typeof(p_input->'costCents') not in('number','null') or jsonb_typeof(p_input->'billable') is distinct from 'boolean'
    or not coalesce((p_input->>'rateCents')~'^[0-9]{1,11}$',false) or (p_input->>'costCents' is not null and not coalesce((p_input->>'costCents')~'^[0-9]{1,11}$',false)) then raise exception 'Invalid activity fields' using errcode='22023';end if;
   v_name:=btrim(p_input->>'name');v_rate:=(p_input->>'rateCents')::bigint;v_cost:=(p_input->>'costCents')::bigint;
   if length(v_name) not between 1 and 80 or v_rate>10000000000 or v_cost>10000000000 then raise exception 'Invalid activity values' using errcode='22023';end if;
  end if;
 else
  if jsonb_typeof(p_input->'entryId') is distinct from 'string' then raise exception 'Invalid entry identity' using errcode='22023';end if;
  eid:=(p_input->>'entryId')::uuid;
  if act in('start','manual') then
   if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 or jsonb_typeof(p_input->'activityId') not in('string','null') or jsonb_typeof(p_input->'billable') is distinct from 'boolean' then raise exception 'Invalid entry fields' using errcode='22023';end if;
  end if;
  if act in('start','manual','stop') then
   if jsonb_typeof(p_input->'note') is distinct from 'string' or length(btrim(p_input->>'note'))>300 then raise exception 'Invalid note' using errcode='22023';end if;v_note:=btrim(p_input->>'note');
  end if;
  if act in('manual','stop') then
   if act='manual' and jsonb_typeof(p_input->'minutes') is distinct from 'number' or jsonb_typeof(p_input->'minutes') not in('number','null') then raise exception 'Invalid minutes' using errcode='22023';end if;
   if p_input->>'minutes' is not null then
    if not coalesce((p_input->>'minutes')~'^[0-9]{1,4}$',false) or (p_input->>'minutes')::integer not between 1 and 1440 then raise exception 'Invalid minutes' using errcode='22023';end if;
    v_minutes:=(p_input->>'minutes')::integer;
   end if;
  end if;
  if act='manual' then
   if jsonb_typeof(p_input->'date') is distinct from 'string' or not coalesce((p_input->>'date')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid date' using errcode='22023';end if;
   v_day:=(p_input->>'date')::date;if to_char(v_day,'YYYY-MM-DD')<>p_input->>'date' or v_day<date'1900-01-01' or v_day>today then raise exception 'Invalid date' using errcode='22023';end if;
  end if;
  if act='void' then
   if jsonb_typeof(p_input->'reason') is distinct from 'string' or length(btrim(p_input->>'reason')) not between 1 and 300 or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646 then raise exception 'Invalid void' using errcode='22023';end if;
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-time-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_time_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 -- Every timer/entry change of the account is serialized: one running session, no lost stop.
 perform pg_advisory_xact_lock(hashtextextended('pro-time:'||p_actor::text,0));
 if act like 'activity_%' then
  subject:='activity';sid:=(p_input->>'activityId')::uuid;
  select * into a from public.pro_time_activities where owner_id=p_actor and id=sid for update;
  if found then
   before_json:=public.pro_time_activity_json(a);
   if (p_input->>'revision')::integer<>a.revision then raise exception 'Activity changed' using errcode='40001';end if;
   if act='activity_save' then
    if a.archived then raise exception 'Restore the activity first' using errcode='22023';end if;
    update public.pro_time_activities set name=v_name,rate_cents=v_rate,cost_cents=v_cost,billable=(p_input->>'billable')::boolean,revision=revision+1,updated_at=now() where owner_id=p_actor and id=sid returning * into a;
   else
    if a.archived=(act='activity_archive') then raise exception 'Invalid archive transition' using errcode='22023';end if;
    update public.pro_time_activities set archived=(act='activity_archive'),revision=revision+1,updated_at=now() where owner_id=p_actor and id=sid returning * into a;
   end if;
  else
   if act<>'activity_save' or (p_input->>'revision')::integer<>0 then raise exception 'Activity changed' using errcode='40001';end if;
   if (select count(*) from public.pro_time_activities where owner_id=p_actor)>=100 then raise exception 'Activity limit reached' using errcode='54000';end if;
   insert into public.pro_time_activities(owner_id,id,name,rate_cents,cost_cents,billable) values(p_actor,sid,v_name,v_rate,v_cost,(p_input->>'billable')::boolean) returning * into a;
  end if;
  after_json:=public.pro_time_activity_json(a);result:=jsonb_build_object('activity',after_json);
 else
  subject:='entry';sid:=eid;
  if act in('start','manual') then
   select * into w from public.pro_work where user_id=p_actor and id=p_input->>'workId';
   if not found then raise exception 'Forbidden' using errcode='42501';end if;
   if w.cancelled or exists(select 1 from public.pro_clients c where c.user_id=p_actor and c.id=w."clientId" and c.archived) then raise exception 'Inactive job' using errcode='22023';end if;
   if exists(select 1 from public.pro_time_entries where owner_id=p_actor and id=eid) then raise exception 'Entry identity already exists' using errcode='22023';end if;
   if p_input->>'activityId' is not null then
    select * into a from public.pro_time_activities where owner_id=p_actor and id=(p_input->>'activityId')::uuid;
    if not found or a.archived then raise exception 'Activity unavailable' using errcode='40001';end if;
   end if;
   if act='start' then
    if exists(select 1 from public.pro_time_entries where owner_id=p_actor and status='running') then raise exception 'Another timer is running' using errcode='40001';end if;
    insert into public.pro_time_entries(owner_id,id,work_id,activity_id,source,status,started_at,billable,rate_cents,cost_cents,note)
     values(p_actor,eid,w.id,a.id,'timer','running',clock_timestamp(),(p_input->>'billable')::boolean,a.rate_cents,a.cost_cents,v_note) returning * into e;
   else
    cost_line:=public.pro_time_cost_line(p_actor,w.id,overlay(overlay(md5('pro-time:'||eid::text) placing '4' from 13) placing '8' from 17)::uuid,v_day,v_minutes,a.cost_cents,concat_ws(' · ',a.name,nullif(v_note,'')));
    insert into public.pro_time_entries(owner_id,id,work_id,activity_id,source,status,minutes,recorded_on,billable,rate_cents,cost_cents,note,cost_entry_id)
     values(p_actor,eid,w.id,a.id,'manual','stopped',v_minutes,v_day,(p_input->>'billable')::boolean,a.rate_cents,a.cost_cents,v_note,cost_line) returning * into e;
   end if;
  else
   select * into e from public.pro_time_entries where owner_id=p_actor and id=eid for update;
   if not found then raise exception 'Forbidden' using errcode='42501';end if;
   before_json:=public.pro_time_entry_json(e);
   if act='stop' then
    if e.status='stopped' then already:=true;
    elsif e.status='discarded' then raise exception 'Timer was discarded' using errcode='40001';
    else
     elapsed:=extract(epoch from clock_timestamp()-e.started_at)/60;
     if v_minutes is null then
      if elapsed>1440 then raise exception 'Timer longer than a day; enter the minutes' using errcode='22023';end if;
      v_minutes:=greatest(1,round(elapsed))::integer;
     elsif v_minutes>greatest(1,ceil(elapsed)) then raise exception 'Minutes exceed the elapsed time' using errcode='22023';end if;
     v_day:=today;
     cost_line:=public.pro_time_cost_line(p_actor,e.work_id,overlay(overlay(md5('pro-time:'||eid::text) placing '4' from 13) placing '8' from 17)::uuid,v_day,v_minutes,e.cost_cents,
      concat_ws(' · ',(select x.name from public.pro_time_activities x where x.owner_id=p_actor and x.id=e.activity_id),nullif(coalesce(nullif(v_note,''),e.note),'')));
     update public.pro_time_entries set status='stopped',stopped_at=clock_timestamp(),minutes=v_minutes,recorded_on=v_day,note=coalesce(nullif(v_note,''),note),cost_entry_id=cost_line,revision=revision+1 where owner_id=p_actor and id=eid returning * into e;
    end if;
   elsif act='discard' then
    if e.status<>'running' then raise exception 'Timer is not running' using errcode='40001';end if;
    update public.pro_time_entries set status='discarded',stopped_at=clock_timestamp(),revision=revision+1 where owner_id=p_actor and id=eid returning * into e;
   else
    if e.status<>'stopped' or (p_input->>'revision')::integer<>e.revision then raise exception 'Entry changed' using errcode='40001';end if;
    cost_line:=public.pro_time_live_line(p_actor,e.cost_entry_id);-- the current line, also after an edit in Costs
    if cost_line is null then raise exception 'Entry already void' using errcode='40001';end if;
    select "clientId" into cid from public.pro_work where user_id=p_actor and id=e.work_id;
    perform pg_advisory_xact_lock(hashtextextended('work-costs:'||p_actor::text,0));
    insert into public.pro_work_cost_state(user_id) values(p_actor) on conflict do nothing;
    select revision into rev from public.pro_work_cost_state where user_id=p_actor;
    perform public.pro_work_costs_mutate(p_actor,jsonb_build_object('action','void_time','clientId',cid,'workId',e.work_id,'requestId',overlay(overlay(md5('pro-time-void:'||eid::text) placing '4' from 13) placing '8' from 17)::uuid,'revision',rev,'entryId',cost_line,'reason',btrim(p_input->>'reason')));
    update public.pro_time_entries set revision=revision+1 where owner_id=p_actor and id=eid returning * into e;
   end if;
  end if;
  after_json:=public.pro_time_entry_json(e);result:=jsonb_build_object('entry',after_json,'alreadyStopped',already);
 end if;
 insert into public.pro_time_history(owner_id,action_id,subject,subject_id,action,before_row,after_row) values(p_actor,aid,subject,sid,act,before_json,after_json);
 insert into public.pro_time_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

alter table public.pro_time_activities enable row level security;
alter table public.pro_time_entries enable row level security;
alter table public.pro_time_history enable row level security;
alter table public.pro_time_actions enable row level security;
revoke all on public.pro_time_activities,public.pro_time_entries,public.pro_time_history,public.pro_time_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_time_activities,public.pro_time_entries,public.pro_time_history,public.pro_time_actions to service_role;
revoke all on function public.pro_time_immutable(),public.pro_time_live_line(uuid,uuid),public.pro_time_activity_json(public.pro_time_activities),public.pro_time_entry_json(public.pro_time_entries),public.pro_time_read(uuid,text,text,text),public.pro_time_cost_line(uuid,text,uuid,date,integer,bigint,text),public.pro_time_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_time_live_line(uuid,uuid),public.pro_time_activity_json(public.pro_time_activities),public.pro_time_entry_json(public.pro_time_entries),public.pro_time_read(uuid,text,text,text),public.pro_time_cost_line(uuid,text,uuid,date,integer,bigint,text),public.pro_time_mutate(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
