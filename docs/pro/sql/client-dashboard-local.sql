-- LOCAL PRO ONLY. Owner-configured customer view for one job (Houzz-style
-- "Client Dashboard" customization, family 33). Presentation preferences only:
-- hiding a section is NOT an access revocation. Shared versions, files and
-- publications keep their own permission checks and remain unchanged.
-- No changes to work, request, update, daily log, file, change or delivery rows.
begin;
create table if not exists public.pro_client_dashboards(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,
 show_updates boolean not null default true,show_daily_logs boolean not null default true,show_files boolean not null default true,
 welcome_text text check(welcome_text is null or length(btrim(welcome_text)) between 1 and 1000),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,work_id),foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
-- Family 75 (allowances): opt-in section, off by default. Existing rows keep the
-- previous customer view because the column defaults to false; reapplicable.
alter table public.pro_client_dashboards add column if not exists show_allowances boolean not null default false;
-- Family 62 (selections): opt-in section, off by default; same compatibility rule as allowances.
alter table public.pro_client_dashboards add column if not exists show_selections boolean not null default false;
-- Families 13/15 (schedule and punch list): opt-in sections, off by default; same compatibility rule.
alter table public.pro_client_dashboards add column if not exists show_schedule boolean not null default false;
alter table public.pro_client_dashboards add column if not exists show_punchlist boolean not null default false;
-- Row 40 (contracts): opt-in section, off by default; same compatibility rule.
alter table public.pro_client_dashboards add column if not exists show_contracts boolean not null default false;
-- Row 61 (idea boards): opt-in section, off by default; same compatibility rule.
alter table public.pro_client_dashboards add column if not exists show_mood_boards boolean not null default false;
create table if not exists public.pro_client_dashboard_history(
 owner_id uuid not null,work_id text not null,action_id uuid not null,before_settings jsonb,after_settings jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id),foreign key(owner_id,work_id) references public.pro_client_dashboards(owner_id,work_id) on delete cascade
);
create index if not exists pro_client_dashboard_history_page on public.pro_client_dashboard_history(owner_id,work_id,((after_settings->>'revision')::integer) desc);
create table if not exists public.pro_client_dashboard_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
-- Defaults (revision 0) reproduce the customer view that existed before this module.
create or replace function public.pro_client_dashboard_settings_json(p_work text,p_row public.pro_client_dashboards) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('workId',p_work,'showUpdates',coalesce(p_row.show_updates,true),'showDailyLogs',coalesce(p_row.show_daily_logs,true),
 'showFiles',coalesce(p_row.show_files,true),'showAllowances',coalesce(p_row.show_allowances,false),'showSelections',coalesce(p_row.show_selections,false),'showSchedule',coalesce(p_row.show_schedule,false),'showPunchlist',coalesce(p_row.show_punchlist,false),'showContracts',coalesce(p_row.show_contracts,false),'showMoodBoards',coalesce(p_row.show_mood_boards,false),'welcomeText',p_row.welcome_text,'revision',coalesce(p_row.revision,0),'updatedAt',p_row.updated_at);
$$;
create or replace function public.pro_client_dashboard_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare settings public.pro_client_dashboards;hist jsonb;recipient_name text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid dashboard query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select * into settings from public.pro_client_dashboards where owner_id=p_actor and work_id=p_work;
 select ar.client_name into recipient_name from public.pro_appointment_requests ar join public.profiles c on c.id=ar.client_user_id
  where ar.owner_id=p_actor and ar.work_id=p_work and ar.status in('confirmed','completed') and not coalesce(c.is_disabled,false)
  order by ar.updated_at desc,ar.id desc limit 1; -- deterministic: most recently updated confirmed request
 select coalesce(jsonb_agg(x.content order by x.revision desc),'[]'::jsonb) into hist from (
  select (h.after_settings->>'revision')::integer as revision,jsonb_build_object('actionId',h.action_id,'at',h.at,'before',h.before_settings,'after',h.after_settings) as content
  from public.pro_client_dashboard_history h where h.owner_id=p_actor and h.work_id=p_work order by (h.after_settings->>'revision')::integer desc limit 20
 ) x;
 return jsonb_build_object('settings',public.pro_client_dashboard_settings_json(p_work,settings),'history',hist,'recipientName',recipient_name);
end $$;
create or replace function public.pro_client_dashboard_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;settings public.pro_client_dashboards;req_status text;
begin
 -- Same audience as the shared readers: the linked customer of this request only.
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id,status into owner,wid,req_status from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select * into settings from public.pro_client_dashboards where owner_id=owner and work_id=wid;
 -- The welcome message is live owner text, not a shared version: only the linked
 -- customer the owner editor names (confirmed/completed request) receives it.
 return jsonb_build_object('showUpdates',coalesce(settings.show_updates,true),'showDailyLogs',coalesce(settings.show_daily_logs,true),
  'showFiles',coalesce(settings.show_files,true),'welcomeText',case when req_status in('confirmed','completed') then settings.welcome_text end);
end $$;
create or replace function public.pro_client_dashboard_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;aid uuid;rev integer;keys text[];receipt public.pro_client_dashboard_actions;settings public.pro_client_dashboards;before_json jsonb;after_json jsonb;result jsonb;welcome text;allowances boolean;selections boolean;schedule boolean;punchlist boolean;contracts boolean;moodboards boolean;base_keys text[];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid dashboard' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 -- showAllowances and showSelections are optional so older clients keep working; when absent the stored value is kept.
 select array_agg(k order by k) into base_keys from unnest(keys) k where k not in('showAllowances','showSelections','showSchedule','showContracts','showPunchlist','showMoodBoards');
 if base_keys is distinct from array['actionId','revision','showDailyLogs','showFiles','showUpdates','welcomeText','workId']
 or (p_input?'showAllowances' and jsonb_typeof(p_input->'showAllowances') is distinct from 'boolean')
 or (p_input?'showSelections' and jsonb_typeof(p_input->'showSelections') is distinct from 'boolean')
 or (p_input?'showSchedule' and jsonb_typeof(p_input->'showSchedule') is distinct from 'boolean')
 or (p_input?'showPunchlist' and jsonb_typeof(p_input->'showPunchlist') is distinct from 'boolean')
 or (p_input?'showContracts' and jsonb_typeof(p_input->'showContracts') is distinct from 'boolean')
 or (p_input?'showMoodBoards' and jsonb_typeof(p_input->'showMoodBoards') is distinct from 'boolean')
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
  schedule:=coalesce((p_input->>'showSchedule')::boolean,false);punchlist:=coalesce((p_input->>'showPunchlist')::boolean,false);contracts:=coalesce((p_input->>'showContracts')::boolean,false);moodboards:=coalesce((p_input->>'showMoodBoards')::boolean,false);
  insert into public.pro_client_dashboards(owner_id,work_id,show_updates,show_daily_logs,show_files,show_allowances,show_selections,show_schedule,show_contracts,show_punchlist,show_mood_boards,welcome_text)
   values(p_actor,wid,(p_input->>'showUpdates')::boolean,(p_input->>'showDailyLogs')::boolean,(p_input->>'showFiles')::boolean,allowances,selections,schedule,contracts,punchlist,moodboards,welcome) returning * into settings;
 else
  if rev<>settings.revision then raise exception 'Dashboard changed' using errcode='40001';end if;
  before_json:=public.pro_client_dashboard_settings_json(wid,settings);allowances:=coalesce((p_input->>'showAllowances')::boolean,settings.show_allowances);selections:=coalesce((p_input->>'showSelections')::boolean,settings.show_selections);
  schedule:=coalesce((p_input->>'showSchedule')::boolean,settings.show_schedule);punchlist:=coalesce((p_input->>'showPunchlist')::boolean,settings.show_punchlist);contracts:=coalesce((p_input->>'showContracts')::boolean,settings.show_contracts);moodboards:=coalesce((p_input->>'showMoodBoards')::boolean,settings.show_mood_boards);
  if settings.show_allowances=allowances and settings.show_selections=selections and settings.show_schedule=schedule and settings.show_punchlist=punchlist and settings.show_contracts=contracts and settings.show_mood_boards=moodboards and settings.show_updates=(p_input->>'showUpdates')::boolean and settings.show_daily_logs=(p_input->>'showDailyLogs')::boolean
   and settings.show_files=(p_input->>'showFiles')::boolean and settings.welcome_text is not distinct from welcome then raise exception 'No dashboard changes' using errcode='22023';end if;
  update public.pro_client_dashboards set show_updates=(p_input->>'showUpdates')::boolean,show_daily_logs=(p_input->>'showDailyLogs')::boolean,
   show_files=(p_input->>'showFiles')::boolean,show_allowances=allowances,show_selections=selections,show_schedule=schedule,show_contracts=contracts,show_punchlist=punchlist,show_mood_boards=moodboards,welcome_text=welcome,revision=revision+1,updated_at=now() where owner_id=p_actor and work_id=wid returning * into settings;
 end if;
 after_json:=public.pro_client_dashboard_settings_json(wid,settings);result:=jsonb_build_object('settings',after_json);
 insert into public.pro_client_dashboard_history(owner_id,work_id,action_id,before_settings,after_settings) values(p_actor,wid,aid,before_json,after_json);
 insert into public.pro_client_dashboard_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
create or replace function public.pro_client_dashboard_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Dashboard history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_client_dashboard_history_immutable on public.pro_client_dashboard_history;
create trigger pro_client_dashboard_history_immutable before update on public.pro_client_dashboard_history for each row execute function public.pro_client_dashboard_immutable();
drop trigger if exists pro_client_dashboard_action_immutable on public.pro_client_dashboard_actions;
create trigger pro_client_dashboard_action_immutable before update on public.pro_client_dashboard_actions for each row execute function public.pro_client_dashboard_immutable();
alter table public.pro_client_dashboards enable row level security;
alter table public.pro_client_dashboard_history enable row level security;
alter table public.pro_client_dashboard_actions enable row level security;
revoke all on public.pro_client_dashboards,public.pro_client_dashboard_history,public.pro_client_dashboard_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_client_dashboards,public.pro_client_dashboard_history,public.pro_client_dashboard_actions to service_role;
revoke all on function public.pro_client_dashboard_settings_json(text,public.pro_client_dashboards),public.pro_client_dashboard_read(uuid,text),public.pro_client_dashboard_client_read(uuid,uuid),public.pro_client_dashboard_mutate(uuid,jsonb),public.pro_client_dashboard_immutable() from public,anon,authenticated;
grant execute on function public.pro_client_dashboard_settings_json(text,public.pro_client_dashboards),public.pro_client_dashboard_read(uuid,text),public.pro_client_dashboard_client_read(uuid,uuid),public.pro_client_dashboard_mutate(uuid,jsonb) to service_role;
commit;
