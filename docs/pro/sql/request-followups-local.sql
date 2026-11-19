-- LOCAL PRO ONLY. Additive private follow-up on existing customer requests.
-- Does not alter request data, create messages, notifications, charges or jobs.
begin;
-- Existing request IDs are unique; the additional owner identity supports a scoped FK.
create unique index if not exists pro_appointment_request_owner_identity on public.pro_appointment_requests(owner_id,id);
create table if not exists public.pro_request_followups(
 owner_id uuid not null,request_id uuid not null,
 due_date date check(due_date between date '1900-01-01' and date '2100-12-31'),
 note text not null default '' check(length(note)<=1000),
 status text not null default 'open' check(status in('open','done')),
 revision integer not null check(revision>0),updated_at timestamptz not null default now(),
 primary key(owner_id,request_id),
 foreign key(owner_id,request_id) references public.pro_appointment_requests(owner_id,id) on delete cascade
);
create index if not exists pro_request_followups_upcoming on public.pro_request_followups(owner_id,due_date,request_id) where status='open' and due_date is not null;
create table if not exists public.pro_request_followup_history(
 owner_id uuid not null,request_id uuid not null,action_id uuid not null,
 action text not null check(action in('save','complete','reopen')),
 before_followup jsonb,after_followup jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id),
 foreign key(owner_id,request_id) references public.pro_request_followups(owner_id,request_id) on delete cascade
);
create index if not exists pro_request_followup_history_page on public.pro_request_followup_history(owner_id,request_id,((after_followup->>'revision')::integer) desc);
create table if not exists public.pro_request_followup_actions(
 actor_id uuid not null,action_id uuid not null,request_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id),
 foreign key(actor_id,request_id) references public.pro_appointment_requests(owner_id,id) on delete cascade
);
create or replace function public.pro_request_followup_json(p_followup public.pro_request_followups,p_request uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('requestId',p_request,'dueDate',case when p_followup.due_date is null then null else to_char(p_followup.due_date,'YYYY-MM-DD') end,
 'note',coalesce(p_followup.note,''),'status',coalesce(p_followup.status,'open'),'revision',coalesce(p_followup.revision,0),'updatedAt',p_followup.updated_at);
$$;
create or replace function public.pro_request_followup_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare followup public.pro_request_followups;hist jsonb;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.pro_appointment_requests where id=p_request and owner_id=p_actor) then return null;end if;
 select * into followup from public.pro_request_followups where owner_id=p_actor and request_id=p_request;
 select coalesce(jsonb_agg(x.content order by x.revision desc),'[]'::jsonb) into hist from (
  select (h.after_followup->>'revision')::integer as revision,jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_followup,'after',h.after_followup) as content
  from public.pro_request_followup_history h where h.owner_id=p_actor and h.request_id=p_request order by (h.after_followup->>'revision')::integer desc limit 20
 ) x;
 return jsonb_build_object('followup',public.pro_request_followup_json(followup,p_request),'history',hist);
end $$;
create or replace function public.pro_request_followups_upcoming(p_actor uuid,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare cursor_due date;items jsonb;cursor_id uuid;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_after is not null then
  select due_date into cursor_due from public.pro_request_followups where owner_id=p_actor and request_id=p_after;
  if not found or cursor_due is null then raise exception 'Invalid follow-up cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(x.content order by x.due_date,x.request_id),'[]'::jsonb) into items from (
  select f.due_date,f.request_id,public.pro_request_followup_json(f,f.request_id)||jsonb_build_object('service',r.service,'clientName',r.client_name) as content
  from public.pro_request_followups f join public.pro_appointment_requests r on r.owner_id=f.owner_id and r.id=f.request_id
  where f.owner_id=p_actor and f.status='open' and f.due_date is not null and (p_after is null or (f.due_date,f.request_id)>(cursor_due,p_after))
  order by f.due_date,f.request_id limit 21
 ) x;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'requestId')::uuid;items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_request_followup_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rid uuid;aid uuid;act text;rev integer;keys text[];receipt public.pro_request_followup_actions;followup public.pro_request_followups;exists_followup boolean;before_json jsonb;after_json jsonb;result jsonb;due date;followup_note text;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid follow-up' using errcode='22023';end if;
 act:=p_input->>'action';
 if act is null or act not in('save','complete','reopen') or jsonb_typeof(p_input->'requestId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
 or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) then raise exception 'Invalid identity' using errcode='22023';end if;
 if (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 rid:=(p_input->>'requestId')::uuid;aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if act='save' then
  if keys<>array['action','actionId','dueDate','note','requestId','revision'] or jsonb_typeof(p_input->'note') is distinct from 'string' or not coalesce(jsonb_typeof(p_input->'dueDate') in('null','string'),false) then raise exception 'Invalid follow-up fields' using errcode='22023';end if;
  followup_note:=btrim(p_input->>'note');if length(followup_note)>1000 then raise exception 'Note too long' using errcode='22023';end if;
  if p_input->'dueDate'<>'null'::jsonb then
   if not coalesce((p_input->>'dueDate')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid date' using errcode='22023';end if;
   due:=(p_input->>'dueDate')::date;
   if due<date '1900-01-01' or due>date '2100-12-31' or to_char(due,'YYYY-MM-DD')<>p_input->>'dueDate' then raise exception 'Invalid date' using errcode='22023';end if;
  end if;
 else
  if keys<>array['action','actionId','requestId','revision'] or rev=0 then raise exception 'Invalid follow-up action' using errcode='22023';end if;
 end if;
 if not exists(select 1 from public.pro_appointment_requests where id=rid and owner_id=p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-request-followup-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_request_followup_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-request-followup:'||p_actor::text||':'||rid::text,0));
 select * into followup from public.pro_request_followups where owner_id=p_actor and request_id=rid for update;
 exists_followup:=found;
 if not exists_followup then
  if act<>'save' or rev<>0 then raise exception 'Follow-up changed' using errcode='40001';end if;
  insert into public.pro_request_followups(owner_id,request_id,due_date,note,status,revision) values(p_actor,rid,due,followup_note,'open',1) returning * into followup;
 else
  if rev<>followup.revision then raise exception 'Follow-up changed' using errcode='40001';end if;
  before_json:=public.pro_request_followup_json(followup,rid);
  if act='save' then
   update public.pro_request_followups set due_date=due,note=followup_note,revision=revision+1,updated_at=now() where owner_id=p_actor and request_id=rid returning * into followup;
  else
   if (act='complete' and followup.status<>'open') or (act='reopen' and followup.status<>'done') then raise exception 'Invalid follow-up transition' using errcode='22023';end if;
   update public.pro_request_followups set status=case when act='complete' then 'done' else 'open' end,revision=revision+1,updated_at=now() where owner_id=p_actor and request_id=rid returning * into followup;
  end if;
 end if;
 after_json:=public.pro_request_followup_json(followup,rid);result:=jsonb_build_object('followup',after_json);
 insert into public.pro_request_followup_history(owner_id,request_id,action_id,action,before_followup,after_followup) values(p_actor,rid,aid,act,before_json,after_json);
 insert into public.pro_request_followup_actions(actor_id,action_id,request_id,input,result) values(p_actor,aid,rid,p_input,result);
 return result;
end $$;
create or replace function public.pro_request_followup_history_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Follow-up history is immutable' using errcode='23514';end $$;
drop trigger if exists pro_request_followup_history_immutable on public.pro_request_followup_history;
create trigger pro_request_followup_history_immutable before update on public.pro_request_followup_history for each row execute function public.pro_request_followup_history_immutable();
drop trigger if exists pro_request_followup_action_immutable on public.pro_request_followup_actions;
create trigger pro_request_followup_action_immutable before update on public.pro_request_followup_actions for each row execute function public.pro_request_followup_history_immutable();
alter table public.pro_request_followups enable row level security;
alter table public.pro_request_followup_history enable row level security;
alter table public.pro_request_followup_actions enable row level security;
revoke all on public.pro_request_followups,public.pro_request_followup_history,public.pro_request_followup_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_request_followups,public.pro_request_followup_history,public.pro_request_followup_actions to service_role;
revoke all on function public.pro_request_followup_json(public.pro_request_followups,uuid),public.pro_request_followup_read(uuid,uuid),public.pro_request_followups_upcoming(uuid,uuid),public.pro_request_followup_mutate(uuid,jsonb),public.pro_request_followup_history_immutable() from public,anon,authenticated;
grant execute on function public.pro_request_followup_json(public.pro_request_followups,uuid),public.pro_request_followup_read(uuid,uuid),public.pro_request_followups_upcoming(uuid,uuid),public.pro_request_followup_mutate(uuid,jsonb) to service_role;
commit;
