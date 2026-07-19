-- Paginated professional interaction analytics for the admin panel.
-- Keeps the admin directory complete without returning an unbounded payload.

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

revoke all on function public.get_admin_professional_interactions(text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_admin_professional_interactions(text, integer, integer) to service_role;

notify pgrst, 'reload schema';
