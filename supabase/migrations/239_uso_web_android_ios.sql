-- First-party usage. Store visits separately so they cannot inflate contacts
-- or professional profile interaction totals. No client database write access.
create table if not exists public.app_usage_tracking_start (
  id boolean primary key default true check(id), started_at timestamptz not null default now()
);
insert into public.app_usage_tracking_start(id) values(true) on conflict do nothing;
create table if not exists public.app_usage_events (
  event_key text primary key,
  event_type text not null check(event_type in ('session','screen','access','first_use')),
  runtime text not null check(runtime in ('web','android','ios','native_unknown')),
  session_id uuid not null,
  visitor_hash text not null,
  viewer_user_id uuid references public.profiles(id) on delete set null,
  path text not null,
  tab text,
  created_at timestamptz not null default now()
);
create index if not exists app_usage_by_date on public.app_usage_events(created_at,runtime);
create index if not exists app_usage_anonymous_session on public.app_usage_events(session_id,visitor_hash) where viewer_user_id is null;
create table if not exists public.app_registration_sources (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  runtime text not null check(runtime in ('web','android','ios','native_unknown')),
  captured_at timestamptz not null default now()
);
alter table public.app_usage_tracking_start enable row level security;
alter table public.app_usage_events enable row level security;
alter table public.app_registration_sources enable row level security;
revoke all on public.app_usage_tracking_start,public.app_usage_events,public.app_registration_sources from anon,authenticated;
grant all on public.app_usage_tracking_start,public.app_usage_events,public.app_registration_sources to service_role;

create or replace function public.record_registration_platform(p_user_id uuid,p_runtime text)
returns void language sql security definer set search_path=public as $$
  insert into app_registration_sources(user_id,runtime)
  select p.id,p_runtime from profiles p,app_usage_tracking_start s
  where p.id=p_user_id and p.created_at>=s.started_at
  on conflict(user_id) do nothing;
$$;
create or replace function public.record_app_usage(p_visitor text,p_user_id uuid,p_session uuid,p_screen uuid,p_runtime text,p_path text,p_tab text,p_first_use boolean default false)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_runtime not in ('web','android','ios','native_unknown') then raise exception 'Invalid runtime'; end if;
  insert into app_usage_events(event_key,event_type,runtime,session_id,visitor_hash,viewer_user_id,path,tab)
  values ('session:'||p_runtime||':'||p_session,'session',p_runtime,p_session,p_visitor,p_user_id,p_path,p_tab),
    ('screen:'||p_runtime||':'||p_screen,'screen',p_runtime,p_session,p_visitor,p_user_id,p_path,p_tab)
  on conflict(event_key) do nothing;
  if p_user_id is not null then
    -- Associate guest session/screens when their owner subsequently signs in.
    update app_usage_events set viewer_user_id=p_user_id
      where session_id=p_session and visitor_hash=p_visitor and viewer_user_id is null;
    insert into app_usage_events(event_key,event_type,runtime,session_id,visitor_hash,viewer_user_id,path,tab)
    values('access:'||p_runtime||':'||p_session||':'||p_user_id,'access',p_runtime,p_session,p_visitor,p_user_id,p_path,p_tab)
    on conflict(event_key) do nothing;
    perform record_registration_platform(p_user_id,p_runtime);
  end if;
  if p_first_use and p_runtime<>'web' then
    insert into app_usage_events(event_key,event_type,runtime,session_id,visitor_hash,viewer_user_id,path,tab)
    values('first:'||p_runtime||':'||p_visitor,'first_use',p_runtime,p_session,p_visitor,p_user_id,p_path,p_tab)
    on conflict(event_key) do nothing;
  end if;
end $$;

create or replace function public.get_admin_runtime_analytics(p_days integer default 7)
returns jsonb language sql security definer set search_path=public as $$
with period as (select now()-make_interval(days=>greatest(1,least(p_days,90))) since),
runtimes(runtime) as (values('web'),('android'),('ios'),('native_unknown'),('unknown')),
usage as (select e.* from app_usage_events e,period p where e.created_at>=p.since),
interactions as (
  select case when metadata->>'runtime' in ('web','android','ios','native_unknown') then metadata->>'runtime'
    when metadata->>'platform'='native' then 'native_unknown'
    when metadata->>'platform'='web' then 'web' else 'unknown' end runtime,
    event_type kind from interaction_events,period p where created_at>=p.since
),
conversions as (
  select case when attribution->>'runtime' in ('web','android','ios','native_unknown') then attribution->>'runtime' else 'unknown' end runtime,
    'conversion_'||action kind from growth_conversion_events,period p where created_at>=p.since and not is_baseline
),
actions as (select * from interactions union all select * from conversions),
action_counts as (select runtime,kind,count(*) total from actions group by runtime,kind),
registrations as (
  select r.runtime,count(*) total from app_registration_sources r join profiles a on a.id=r.user_id,period p
  where a.created_at>=p.since group by r.runtime
),
rows as (select r.runtime,
 (select count(*) from usage u where u.runtime=r.runtime and u.event_type='session') sessions,
 (select count(distinct visitor_hash) from usage u where u.runtime=r.runtime) visitors,
 (select count(distinct viewer_user_id) from usage u where u.runtime=r.runtime) users,
 (select count(*) from usage u where u.runtime=r.runtime and u.event_type='access') accesses,
 (select count(*) from usage u where u.runtime=r.runtime and u.event_type='screen') screens,
 (select count(*) from usage u where u.runtime=r.runtime and u.event_type='first_use') first_uses,
 coalesce((select total from registrations a where a.runtime=r.runtime),0) registrations,
 coalesce((select jsonb_object_agg(kind,total) from action_counts a where a.runtime=r.runtime),'{}'::jsonb) actions,
 coalesce((select jsonb_agg(to_jsonb(a)) from (
   select p.id,p.full_name,max(u.created_at) last_seen,count(distinct u.session_id) sessions
   from usage u join profiles p on p.id=u.viewer_user_id where u.runtime=r.runtime
   group by p.id,p.full_name order by max(u.created_at) desc limit 20) a),'[]'::jsonb) recent_accounts,
 coalesce((select jsonb_agg(to_jsonb(s)) from (
   select path,tab,count(*) views from usage u where u.runtime=r.runtime and u.event_type='screen'
   group by path,tab order by count(*) desc limit 12) s),'[]'::jsonb) top_screens
 from runtimes r)
select jsonb_build_object('since',(select started_at from app_usage_tracking_start where id),
 'days',greatest(1,least(p_days,90)),'rows',coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb)) from rows;
$$;
revoke all on function public.record_registration_platform(uuid,text) from public,anon,authenticated;
revoke all on function public.record_app_usage(text,uuid,uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.get_admin_runtime_analytics(integer) from public,anon,authenticated;
grant execute on function public.record_registration_platform(uuid,text) to service_role;
grant execute on function public.record_app_usage(text,uuid,uuid,uuid,text,text,text,boolean) to service_role;
grant execute on function public.get_admin_runtime_analytics(integer) to service_role;
notify pgrst,'reload schema';
