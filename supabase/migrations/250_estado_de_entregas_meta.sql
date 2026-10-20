create index if not exists growth_conversion_created on public.growth_conversion_events(created_at desc) where not is_baseline;
create or replace function public.admin_meta_delivery(p_days integer default 7)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(status,total),'{}'::jsonb) from (
  select status,count(*) as total from growth_conversion_events
  where not is_baseline and created_at>=now()-make_interval(days=>least(90,greatest(1,p_days))) group by status
 ) counts;
$$;
revoke all on function public.admin_meta_delivery(integer) from public,anon,authenticated;
grant execute on function public.admin_meta_delivery(integer) to service_role;
