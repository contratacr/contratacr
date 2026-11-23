-- Row 20 (2026-11-23): daily log weather by provider (adapter) and automatic draft entries.
--  * pro_daily_log_weather_settings: provider choice (auto = server default, sandbox, open-meteo, manual) and the
--    coordinates of the owner's usual site. The provider call itself lives in src/lib/pro/weather.ts (adapter).
--  * pro_daily_log_automation: when enabled, the owner's open Bitacora creates a PRIVATE draft entry for a recent day
--    that had work (hours, timers or completed tasks) and no entry yet. Never published, never shared. One draft per
--    job/day ever (pro_daily_log_auto_runs), so archiving the draft does not recreate it.
-- Reminders stay in the notification center (event daily_log_missing, per-event preferences already configurable).
begin;
create table if not exists public.pro_daily_log_weather_settings(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 provider text not null default 'auto' check(provider in('auto','sandbox','open-meteo','manual')),
 latitude numeric(8,5) not null default 9.93 check(latitude between -90 and 90),
 longitude numeric(8,5) not null default -84.08 check(longitude between -180 and 180),
 place text not null default '' check(length(place)<=120),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now());
create table if not exists public.pro_daily_log_automation(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false,
 include_weather boolean not null default true,
 lookback_days integer not null default 2 check(lookback_days between 1 and 7),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now());
create table if not exists public.pro_daily_log_auto_runs(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 work_id text not null,
 log_date date not null,
 log_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,work_id,log_date));
do $$ declare t text;begin
 foreach t in array array['pro_daily_log_weather_settings','pro_daily_log_automation','pro_daily_log_auto_runs'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;end $$;

create or replace function public.pro_daily_log_settings_read(p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_daily_log_weather_settings;a public.pro_daily_log_automation;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into w from public.pro_daily_log_weather_settings where owner_id=p_owner;
 select * into a from public.pro_daily_log_automation where owner_id=p_owner;
 return jsonb_build_object(
  'weather',jsonb_build_object('provider',coalesce(w.provider,'auto'),'latitude',coalesce(w.latitude,9.93),'longitude',coalesce(w.longitude,-84.08),'place',coalesce(w.place,''),'revision',coalesce(w.revision,0)),
  'automation',jsonb_build_object('enabled',coalesce(a.enabled,false),'includeWeather',coalesce(a.include_weather,true),'lookbackDays',coalesce(a.lookback_days,2),'revision',coalesce(a.revision,0)));
end $$;

create or replace function public.pro_daily_log_settings_save(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare kind text:=p_input->>'kind';rev integer;cur integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or kind not in('weather','automation') or jsonb_typeof(p_input->'revision') is distinct from 'number' then raise exception 'Invalid settings' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;
 perform pg_advisory_xact_lock(hashtextextended('pro-daily-log-settings:'||p_owner::text||kind,0));
 if kind='weather' then
  if p_input->>'provider' not in('auto','sandbox','open-meteo','manual') or jsonb_typeof(p_input->'latitude') is distinct from 'number' or jsonb_typeof(p_input->'longitude') is distinct from 'number'
   or jsonb_typeof(p_input->'place') is distinct from 'string' or length(p_input->>'place')>120 then raise exception 'Invalid weather settings' using errcode='22023';end if;
  select revision into cur from public.pro_daily_log_weather_settings where owner_id=p_owner;
  if coalesce(cur,0)<>rev then raise exception 'Settings changed' using errcode='40001';end if;
  insert into public.pro_daily_log_weather_settings(owner_id,provider,latitude,longitude,place) values(p_owner,p_input->>'provider',(p_input->>'latitude')::numeric,(p_input->>'longitude')::numeric,btrim(p_input->>'place'))
  on conflict(owner_id) do update set provider=excluded.provider,latitude=excluded.latitude,longitude=excluded.longitude,place=excluded.place,revision=public.pro_daily_log_weather_settings.revision+1,updated_at=now();
 else
  if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or jsonb_typeof(p_input->'includeWeather') is distinct from 'boolean' or jsonb_typeof(p_input->'lookbackDays') is distinct from 'number' or (p_input->>'lookbackDays')::integer not between 1 and 7 then raise exception 'Invalid automation settings' using errcode='22023';end if;
  select revision into cur from public.pro_daily_log_automation where owner_id=p_owner;
  if coalesce(cur,0)<>rev then raise exception 'Settings changed' using errcode='40001';end if;
  insert into public.pro_daily_log_automation(owner_id,enabled,include_weather,lookback_days) values(p_owner,(p_input->>'enabled')::boolean,(p_input->>'includeWeather')::boolean,(p_input->>'lookbackDays')::integer)
  on conflict(owner_id) do update set enabled=excluded.enabled,include_weather=excluded.include_weather,lookback_days=excluded.lookback_days,revision=public.pro_daily_log_automation.revision+1,updated_at=now();
 end if;
 return public.pro_daily_log_settings_read(p_owner);
end $$;

-- Jobs/days that would get an automatic draft: days inside the lookback window with activity and without any entry.
create or replace function public.pro_daily_log_auto_candidates(p_owner uuid,p_today date) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare a public.pro_daily_log_automation;
begin
 select * into a from public.pro_daily_log_automation where owner_id=p_owner;
 if a.owner_id is null or not a.enabled or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then return jsonb_build_object('enabled',false,'items','[]'::jsonb,'includeWeather',false);end if;
 return jsonb_build_object('enabled',true,'includeWeather',a.include_weather,'items',coalesce((
  select jsonb_agg(jsonb_build_object('workId',x.work_id,'date',to_char(x.d,'YYYY-MM-DD'),'service',x.service) order by x.d desc,x.work_id) from(
   select w.id work_id,left(w.service,160) service,(p_today-1-g)::date d from public.pro_work w cross join generate_series(0,a.lookback_days-1) g
   where w.user_id=p_owner and not coalesce(w.cancelled,false)
    and not exists(select 1 from public.pro_daily_logs l where l.owner_id=p_owner and l.work_id=w.id and l.log_date=(p_today-1-g) and not l.archived)
    and not exists(select 1 from public.pro_daily_log_auto_runs r where r.owner_id=p_owner and r.work_id=w.id and r.log_date=(p_today-1-g))
    and(exists(select 1 from public.pro_time_entries e where e.owner_id=p_owner and e.work_id=w.id and e.status='stopped' and e.recorded_on=(p_today-1-g))
     or exists(select 1 from public.pro_work_timers t where t.owner_id=p_owner and t.work_id=w.id and(t.started_at at time zone 'America/Costa_Rica')::date=(p_today-1-g))
     or exists(select 1 from public.pro_work_task_history h where h.owner_id=p_owner and h.work_id=w.id and h.action='complete' and(h.at at time zone 'America/Costa_Rica')::date=(p_today-1-g)))
   limit 20) x),'[]'::jsonb));
end $$;

-- Creates ONE private draft entry (revision 1, history receipt, never published).
create or replace function public.pro_daily_log_auto_create(p_owner uuid,p_input jsonb,p_today date) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.pro_daily_log_automation;wid text:=p_input->>'workId';d date;lid uuid:=gen_random_uuid();l public.pro_daily_logs;wx jsonb:=p_input->'weather';minutes_v integer;sec jsonb;snap jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or wid is null or length(wid) not between 1 and 160 or length(coalesce(p_input->>'title',''))not between 1 and 160 or length(coalesce(p_input->>'summary',''))>2000 then raise exception 'Invalid draft' using errcode='22023';end if;
 begin d:=(p_input->>'date')::date;exception when others then raise exception 'Invalid date' using errcode='22023';end;
 select * into a from public.pro_daily_log_automation where owner_id=p_owner;
 if a.owner_id is null or not a.enabled then raise exception 'Automation is off' using errcode='42501';end if;
 if d>=p_today or d<p_today-a.lookback_days then return jsonb_build_object('created',false,'reason','out_of_window');end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-daily-log-auto:'||p_owner::text||wid||d::text,0));
 if not exists(select 1 from public.pro_work where user_id=p_owner and id=wid and not coalesce(cancelled,false)) then return jsonb_build_object('created',false,'reason','no_work');end if;
 if exists(select 1 from public.pro_daily_logs where owner_id=p_owner and work_id=wid and log_date=d and not archived) or exists(select 1 from public.pro_daily_log_auto_runs where owner_id=p_owner and work_id=wid and log_date=d) then return jsonb_build_object('created',false,'reason','exists');end if;
 if wx is not null and wx<>'null'::jsonb then
  if not a.include_weather or jsonb_typeof(wx) is distinct from 'object' or wx->>'condition' not in('clear','cloudy','rain','other') or length(coalesce(wx->>'note',''))>300 then raise exception 'Invalid weather' using errcode='22023';end if;
 else wx:=null;end if;
 minutes_v:=case when jsonb_typeof(p_input->'minutes')='number' then (p_input->>'minutes')::integer else null end;
 sec:=jsonb_build_object('weather',wx is not null,'plan',false,'tasks',false,'time',minutes_v is not null);
 snap:=jsonb_build_object('date',to_char(d,'YYYY-MM-DD'),'tasks','[]'::jsonb,'plan','[]'::jsonb,'minutes',minutes_v,'fingerprint',md5('auto:'||wid||':'||d::text));
 insert into public.pro_daily_logs(owner_id,work_id,id,log_date,title,summary,sections,weather,snapshot,revision,created_by,created_by_name)
  values(p_owner,wid,lid,d,btrim(p_input->>'title'),p_input->>'summary',sec,wx,snap,1,p_owner,public.pro_team_name(p_owner)) returning * into l;
 insert into public.pro_daily_log_history(owner_id,work_id,log_id,action_id,actor_id,actor_name,action,before_log,after_log) values(p_owner,wid,lid,gen_random_uuid(),p_owner,public.pro_team_name(p_owner),'create',null,public.pro_daily_log_json(l));
 insert into public.pro_daily_log_auto_runs(owner_id,work_id,log_date,log_id) values(p_owner,wid,d,lid);
 return jsonb_build_object('created',true,'logId',lid);
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_daily_log_settings_read','pro_daily_log_settings_save','pro_daily_log_auto_candidates','pro_daily_log_auto_create') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
