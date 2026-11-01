-- p_days=0 means all retained history; retention and consent stay unchanged.
begin;
create or replace function public.get_admin_runtime_analytics(p_days integer default 7)
returns jsonb language sql security definer set search_path=public as $$
with period as (select case when p_days=0 then '-infinity'::timestamptz else now()-make_interval(days=>greatest(1,least(p_days,90))) end since),
runtimes(runtime) as (values('web_desktop'),('web_mobile'),('web'),('android'),('ios'),('native_unknown'),('unknown')),
usage as (select e.* from app_usage_events e,period p where e.created_at>=p.since),
interactions as (
  select case when metadata->>'runtime' in ('web','web_desktop','web_mobile','android','ios','native_unknown') then metadata->>'runtime'
    when metadata->>'platform'='native' then 'native_unknown'
    when metadata->>'platform'='web' then 'web' else 'unknown' end runtime,
    event_type kind from interaction_events,period p where created_at>=p.since
),
conversions as (
  select case when attribution->>'runtime' in ('web','web_desktop','web_mobile','android','ios','native_unknown') then attribution->>'runtime' else 'unknown' end runtime,
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
 'days',case when p_days=0 then 0 else greatest(1,least(p_days,90)) end,'rows',coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb)) from rows;
$$;

revoke all on function public.get_admin_runtime_analytics(integer) from public,anon,authenticated;
grant execute on function public.get_admin_runtime_analytics(integer) to service_role;
create or replace function public.admin_activity_journey(
 p_days integer default 7, p_runtime text default '', p_actor text default '',
 p_before timestamptz default now(), p_key text default '~'
) returns jsonb language sql stable security definer set search_path=public as $$
 with events as (
  select 'j:'||event_id::text as key,created_at,viewer_user_id,visitor_hash,runtime,
   action as event,section as page,jsonb_build_object('target',target,'value',value) as details
  from app_journey_events where created_at>=case when p_days=0 then '-infinity'::timestamptz else now()-make_interval(days=>least(90,greatest(1,p_days))) end
  union all
  select 'u:'||event_key,created_at,viewer_user_id,visitor_hash,runtime,
   event_type,path,jsonb_build_object('tab',tab)
  from app_usage_events where event_type in ('screen','first_use','access') and created_at>=case when p_days=0 then '-infinity'::timestamptz else now()-make_interval(days=>least(90,greatest(1,p_days))) end
  union all
  select 'i:'||id::text,created_at,viewer_user_id,visitor_hash,coalesce(metadata->>'runtime','web'),
   event_type,coalesce(source,'unknown'),
   case when event_type='search_performed' then jsonb_build_object('q',left(metadata->>'q',100),'provincia',metadata->>'provincia','canton',metadata->>'canton','results',metadata->'results') else '{}'::jsonb end
  from interaction_events where created_at>=case when p_days=0 then '-infinity'::timestamptz else now()-make_interval(days=>least(90,greatest(1,p_days))) end
 ), limited as (
 select e.*,p.full_name as name from events e left join profiles p on p.id=e.viewer_user_id
 where (p.role is distinct from 'admin') and (p_runtime='' or e.runtime=p_runtime)
 and (p_actor='' or e.viewer_user_id::text=p_actor or e.visitor_hash=p_actor)
 and (e.created_at,e.key)<(p_before,p_key)
 order by e.created_at desc,e.key desc limit 51
 ) select coalesce(jsonb_agg(to_jsonb(limited) order by created_at desc,key desc),'[]'::jsonb) from limited;
$$;
revoke all on function public.admin_activity_journey(integer,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.admin_activity_journey(integer,text,text,timestamptz,text) to service_role;
create or replace function public.admin_meta_delivery(p_days integer default 7)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(status,total),'{}'::jsonb) from (
  select status,count(*) as total from growth_conversion_events
  where not is_baseline and created_at>=case when p_days=0 then '-infinity'::timestamptz else now()-make_interval(days=>least(90,greatest(1,p_days))) end group by status
 ) counts;
$$;
revoke all on function public.admin_meta_delivery(integer) from public,anon,authenticated;
grant execute on function public.admin_meta_delivery(integer) to service_role;

notify pgrst,'reload schema';
commit;
