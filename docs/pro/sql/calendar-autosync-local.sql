-- LOCAL PRO ONLY. Round 6C (2026-11-13): follow-up of Round 6B — automatic calendar sync on a schedule.
-- The owner chooses an interval per connected calendar (off by default; 15/30/60/120 minutes). While the Pro
-- app is open, an in-app ticker asks the server to run due syncs; pro_calendar_autosync_claim decides
-- atomically (row lock + next_run_at) so two tabs or two devices never run the same window twice. Each run is
-- an immutable row (started → ok/error with the counts). Same sync code as «Sincronizar» (mock by default).
begin;

create table if not exists public.pro_calendar_autosync(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in('google','microsoft')),
 interval_minutes integer not null default 0 check(interval_minutes in(0,15,30,60,120)),
 next_run_at timestamptz,last_run_at timestamptz,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,provider),
 check((interval_minutes=0)=(next_run_at is null))
);
create table if not exists public.pro_calendar_autosync_runs(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 run_id uuid not null,provider text not null check(provider in('google','microsoft')),
 status text not null default 'running' check(status in('running','ok','error')),
 summary jsonb check(summary is null or (jsonb_typeof(summary)='object' and octet_length(summary::text)<=2048)),
 started_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 primary key(owner_id,run_id),check((status='running')=(finished_at is null))
);
create index if not exists pro_calendar_autosync_runs_recent on public.pro_calendar_autosync_runs(owner_id,started_at desc);
create table if not exists public.pro_calendar_autosync_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,action_id)
);
create or replace function public.pro_calendar_autosync_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_table_name='pro_calendar_autosync_actions' or old.status<>'running' or (new.owner_id,new.run_id,new.provider,new.started_at) is distinct from (old.owner_id,old.run_id,old.provider,old.started_at) then
  raise exception 'Auto-sync history is immutable' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_calendar_autosync_runs_guard on public.pro_calendar_autosync_runs;
create trigger pro_calendar_autosync_runs_guard before update on public.pro_calendar_autosync_runs for each row execute function public.pro_calendar_autosync_guard();
drop trigger if exists pro_calendar_autosync_actions_guard on public.pro_calendar_autosync_actions;
create trigger pro_calendar_autosync_actions_guard before update on public.pro_calendar_autosync_actions for each row execute function public.pro_calendar_autosync_guard();

create or replace function public.pro_calendar_autosync_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'settings',(select coalesce(jsonb_agg(jsonb_build_object('provider',p.provider,'intervalMinutes',coalesce(s.interval_minutes,0),'nextRunAt',s.next_run_at,'lastRunAt',s.last_run_at,'revision',coalesce(s.revision,0)) order by p.provider),'[]')
   from (values('google'),('microsoft')) p(provider) left join public.pro_calendar_autosync s on s.owner_id=p_actor and s.provider=p.provider),
  'runs',coalesce((select jsonb_agg(jsonb_build_object('runId',r.run_id,'provider',r.provider,'status',r.status,'summary',r.summary,'startedAt',r.started_at,'finishedAt',r.finished_at) order by r.started_at desc)
   from (select * from public.pro_calendar_autosync_runs where owner_id=p_actor order by started_at desc limit 10) r),'[]'));
end $$;
create or replace function public.pro_calendar_autosync_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;prov text:=p_input->>'provider';mins integer;receipt public.pro_calendar_autosync_actions;s public.pro_calendar_autosync;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or prov not in('google','microsoft') or jsonb_typeof(p_input->'intervalMinutes')<>'number' or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid auto-sync' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 mins:=(p_input->>'intervalMinutes')::integer;if aid is null or mins not in(0,15,30,60,120) then raise exception 'Invalid auto-sync' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-calendar-autosync:'||p_actor::text,0));
 select * into receipt from public.pro_calendar_autosync_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input<>p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 select * into s from public.pro_calendar_autosync where owner_id=p_actor and provider=prov for update;
 if (p_input->>'revision')::integer is distinct from coalesce(s.revision,0) then raise exception 'Auto-sync changed' using errcode='40001';end if;
 insert into public.pro_calendar_autosync(owner_id,provider,interval_minutes,next_run_at) values(p_actor,prov,mins,case when mins>0 then now() end)
 on conflict(owner_id,provider) do update set interval_minutes=excluded.interval_minutes,next_run_at=excluded.next_run_at,revision=pro_calendar_autosync.revision+1,updated_at=now();
 result:=public.pro_calendar_autosync_read(p_actor);
 insert into public.pro_calendar_autosync_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
-- Atomic claim of one due window: true only for the first caller; moves next_run_at forward.
create or replace function public.pro_calendar_autosync_claim(p_actor uuid,p_provider text,p_run uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.pro_calendar_autosync;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into s from public.pro_calendar_autosync where owner_id=p_actor and provider=p_provider for update;
 if not found or s.interval_minutes=0 or s.next_run_at>now() then return false;end if;
 if exists(select 1 from public.pro_calendar_autosync_runs where owner_id=p_actor and run_id=p_run) then return false;end if;
 update public.pro_calendar_autosync set next_run_at=now()+make_interval(mins=>s.interval_minutes),last_run_at=now() where owner_id=p_actor and provider=p_provider;
 insert into public.pro_calendar_autosync_runs(owner_id,run_id,provider) values(p_actor,p_run,p_provider);
 return true;
end $$;
create or replace function public.pro_calendar_autosync_finish(p_actor uuid,p_run uuid,p_ok boolean,p_summary jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.pro_calendar_autosync_runs set status=case when p_ok then 'ok' else 'error' end,summary=p_summary,finished_at=clock_timestamp()
  where owner_id=p_actor and run_id=p_run and status='running';
end $$;

do $$declare n text;begin foreach n in array array['pro_calendar_autosync','pro_calendar_autosync_runs','pro_calendar_autosync_actions'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_calendar\_autosync\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_calendar_autosync_guard(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
