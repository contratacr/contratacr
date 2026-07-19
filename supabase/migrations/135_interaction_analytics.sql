-- First-party marketplace interaction analytics.
-- Stores product intent without phone numbers, emails, messages or IP addresses.

create table if not exists public.interaction_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in (
    'profile_view',
    'whatsapp_click',
    'phone_click',
    'availability_view',
    'schedule_slot_selected',
    'favorite_add',
    'favorite_remove',
    'profile_share',
    'external_link_click',
    'service_request_started'
  )),
  professional_id uuid references public.professionals(id) on delete cascade,
  viewer_user_id uuid references public.profiles(id) on delete set null,
  visitor_hash text not null,
  source text not null default 'unknown',
  locale text not null default 'es' check (locale in ('es', 'en')),
  category_id text,
  metadata jsonb not null default '{}'::jsonb,
  legacy_source text
);

alter table public.interaction_events enable row level security;

create index if not exists interaction_events_created_idx
  on public.interaction_events(created_at desc);
create index if not exists interaction_events_professional_idx
  on public.interaction_events(professional_id, created_at desc);
create index if not exists interaction_events_type_idx
  on public.interaction_events(event_type, created_at desc);
create index if not exists interaction_events_visitor_idx
  on public.interaction_events(visitor_hash, created_at desc);
create unique index if not exists interaction_events_legacy_source_uidx
  on public.interaction_events(legacy_source)
  where legacy_source is not null;

-- Recover the WhatsApp history already collected by the review follow-up feature,
-- when that feature is present in the target environment. This remains idempotent.
do $$
begin
  if to_regclass('public.whatsapp_contact_followups') is not null then
    execute $backfill$
      insert into public.interaction_events (
        created_at,
        event_type,
        professional_id,
        viewer_user_id,
        visitor_hash,
        source,
        locale,
        metadata,
        legacy_source
      )
      select
        contacted_at,
        'whatsapp_click',
        professional_id,
        client_id,
        coalesce(client_id::text, anonymous_token_hash, id::text),
        'whatsapp_followup',
        'es',
        jsonb_build_object('backfilled', true),
        'whatsapp_contact_followups:' || id::text
      from public.whatsapp_contact_followups
      on conflict (legacy_source) where legacy_source is not null do nothing
    $backfill$;
  end if;
end $$;

-- One compact RPC avoids row limits and keeps aggregation in PostgreSQL.
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

revoke all on function public.get_admin_interaction_analytics(timestamptz) from public, anon, authenticated;
grant execute on function public.get_admin_interaction_analytics(timestamptz) to service_role;

notify pgrst, 'reload schema';
