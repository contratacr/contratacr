-- First-party journeys remain separate from business conversion counts.
create table public.app_journey_events (
  event_id uuid primary key,
  action text not null check(action in ('navigation','button','filter','form_start','form_submit','form_abandon','form_error','scroll','client_error','measurement_status')),
  target text not null,
  section text not null,
  value integer check(value between 0 and 100),
  viewer_user_id uuid references public.profiles(id) on delete set null,
  visitor_hash text not null,
  runtime text not null check(runtime in ('web','web_desktop','web_mobile','android','ios','native_unknown')),
  created_at timestamptz not null default now()
);
create index app_journey_recent on public.app_journey_events(created_at desc,event_id desc);
create index app_journey_visitor on public.app_journey_events(visitor_hash,created_at desc);
create index app_journey_account on public.app_journey_events(viewer_user_id,created_at desc);
alter table public.app_journey_events enable row level security;
revoke all on public.app_journey_events from anon, authenticated;
grant all on public.app_journey_events to service_role;
comment on table public.app_journey_events is 'Internal operational events, no input content; delete after 90 days.';

create or replace function public.admin_activity_journey(
 p_days integer default 7, p_runtime text default '', p_actor text default '',
 p_before timestamptz default now(), p_key text default '~'
) returns jsonb language sql stable security definer set search_path=public as $$
 with events as (
  select 'j:'||event_id::text as key,created_at,viewer_user_id,visitor_hash,runtime,
   action as event,section as page,jsonb_build_object('target',target,'value',value) as details
  from app_journey_events where created_at>=now()-make_interval(days=>least(90,greatest(1,p_days)))
  union all
  select 'u:'||event_key,created_at,viewer_user_id,visitor_hash,runtime,
   event_type,path,jsonb_build_object('tab',tab)
  from app_usage_events where event_type in ('screen','first_use','access') and created_at>=now()-make_interval(days=>least(90,greatest(1,p_days)))
  union all
  select 'i:'||id::text,created_at,viewer_user_id,visitor_hash,coalesce(metadata->>'runtime','web'),
   event_type,coalesce(source,'unknown'),
   case when event_type='search_performed' then jsonb_build_object('q',left(metadata->>'q',100),'provincia',metadata->>'provincia','canton',metadata->>'canton','results',metadata->'results') else '{}'::jsonb end
  from interaction_events where created_at>=now()-make_interval(days=>least(90,greatest(1,p_days)))
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
-- Existing retention scheduler invokes cleanup_operational_data. Keep its
-- implementation intact; a separate daily cron handles this new bounded table.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('journey-retention','23 8 * * *',$job$delete from public.app_journey_events where created_at < now()-interval '90 days'$job$);
 end if;
end $$;
