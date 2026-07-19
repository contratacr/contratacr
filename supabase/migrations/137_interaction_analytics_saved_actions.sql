-- Track durable marketplace actions, not only frontend clicks.

alter table public.interaction_events
  drop constraint if exists interaction_events_event_type_check;

alter table public.interaction_events
  add constraint interaction_events_event_type_check
  check (event_type in (
    'profile_view',
    'whatsapp_click',
    'phone_click',
    'availability_view',
    'schedule_slot_selected',
    'favorite_add',
    'favorite_remove',
    'profile_share',
    'external_link_click',
    'service_request_started',
    'service_request_created',
    'project_published',
    'proposal_sent',
    'proposal_accepted',
    'review_created'
  ));

create or replace function public.get_admin_interaction_analytics(p_since timestamptz)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with all_events as (
    select * from public.interaction_events
  ),
  scoped as (
    select * from public.interaction_events where created_at >= p_since
  ),
  totals as (
    select
      count(*)::int as total,
      count(distinct visitor_hash)::int as unique_visitors
    from all_events
  ),
  by_type as (
    select event_type, count(*)::int as total
    from all_events
    group by event_type
  ),
  daily as (
    select (created_at at time zone 'America/Costa_Rica')::date as day, count(*)::int as total
    from scoped
    group by day
  ),
  per_professional as (
    select
      p.id as professional_id,
      p.slug,
      coalesce(nullif(trim(p.business_name), ''), pr.full_name, 'Profesional') as professional_name,
      count(e.id)::int as total,
      count(e.id) filter (where e.event_type = 'profile_view')::int as profile_views,
      count(e.id) filter (where e.event_type = 'whatsapp_click')::int as whatsapp_clicks,
      count(e.id) filter (where e.event_type = 'phone_click')::int as phone_clicks,
      count(e.id) filter (where e.event_type in ('availability_view', 'schedule_slot_selected'))::int as availability_actions,
      count(e.id) filter (where e.event_type = 'favorite_add')::int as favorites,
      count(e.id) filter (where e.event_type = 'service_request_created')::int as service_requests_created,
      count(e.id) filter (where e.event_type = 'proposal_sent')::int as proposals_sent,
      count(e.id) filter (where e.event_type = 'proposal_accepted')::int as proposals_accepted,
      count(e.id) filter (where e.event_type = 'review_created')::int as reviews_received,
      count(distinct e.visitor_hash)::int as unique_visitors
    from all_events e
    join public.professionals p on p.id = e.professional_id
    left join public.profiles pr on pr.id = p.profile_id
    group by p.id, p.slug, p.business_name, pr.full_name
    order by total desc, professional_name asc
    limit 100
  )
  select jsonb_build_object(
    'total', (select total from totals),
    'uniqueVisitors', (select unique_visitors from totals),
    'byType', coalesce((select jsonb_agg(jsonb_build_object('type', event_type, 'total', total) order by total desc) from by_type), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'total', total) order by day) from daily), '[]'::jsonb),
    'professionals', coalesce((select jsonb_agg(to_jsonb(per_professional) order by total desc, professional_name asc) from per_professional), '[]'::jsonb)
  );
$$;

create or replace function public.get_admin_professional_interactions(
  p_search text default '',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with aggregated as (
    select
      p.id as professional_id,
      p.profile_id,
      p.slug,
      coalesce(nullif(trim(p.business_name), ''), pr.full_name, 'Profesional') as professional_name,
      count(e.id)::int as total,
      count(e.id) filter (where e.event_type = 'profile_view')::int as profile_views,
      count(e.id) filter (where e.event_type = 'whatsapp_click')::int as whatsapp_clicks,
      count(e.id) filter (where e.event_type = 'phone_click')::int as phone_clicks,
      count(e.id) filter (where e.event_type in ('availability_view', 'schedule_slot_selected'))::int as availability_actions,
      count(e.id) filter (where e.event_type = 'favorite_add')::int as favorites,
      count(e.id) filter (where e.event_type = 'service_request_created')::int as service_requests_created,
      count(e.id) filter (where e.event_type = 'proposal_sent')::int as proposals_sent,
      count(e.id) filter (where e.event_type = 'proposal_accepted')::int as proposals_accepted,
      count(e.id) filter (where e.event_type = 'review_created')::int as reviews_received,
      count(distinct e.visitor_hash)::int as unique_visitors
    from public.interaction_events e
    join public.professionals p on p.id = e.professional_id
    left join public.profiles pr on pr.id = p.profile_id
    group by p.id, p.profile_id, p.slug, p.business_name, pr.full_name
  ),
  filtered as (
    select *
    from aggregated
    where nullif(trim(p_search), '') is null
       or professional_name ilike '%' || trim(p_search) || '%'
  ),
  page_rows as (
    select *
    from filtered
    order by total desc, professional_name asc
    limit least(greatest(p_limit, 1), 100)
    offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*)::int from filtered),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(page_rows) order by total desc, professional_name asc) from page_rows),
      '[]'::jsonb
    )
  );
$$;

notify pgrst, 'reload schema';
