-- El historial completo usa todos los eventos guardados para esta cuenta.
-- Los contactos iniciados en resultados de búsqueda también pertenecen al profesional.
create or replace function public.get_account_activity(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := auth.uid();
  v_professional_id uuid;
  since_at timestamptz;
  result jsonb;
begin
  if v_owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_days is null or p_days not in (0,7,30,90) then raise exception 'Invalid period' using errcode='22023'; end if;
  since_at := case when p_days=0 then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
  select id into v_professional_id from public.professionals where profile_id=v_owner_id limit 1;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'views', count(*) filter (where e.event_type='profile_view'),
      'whatsapp', count(*) filter (where e.event_type='whatsapp_click' and e.source in ('profile','profile_service','search')),
      'calls', count(*) filter (where e.event_type='phone_click' and e.source in ('profile','search'))
    ),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'title',p.title,
        'views',(select count(*) from public.interaction_events x where x.event_type='project_view' and x.created_at>=since_at and x.metadata->>'projectId'=p.id::text and x.viewer_user_id is distinct from v_owner_id),
        'whatsapp',(select count(*) from public.interaction_events x where x.event_type='project_lead_whatsapp' and x.created_at>=since_at and x.metadata->>'project_id'=p.id::text and x.metadata->>'channel'='whatsapp' and x.viewer_user_id is distinct from v_owner_id)
      ) order by p.created_at desc)
      from public.projects p where p.client_id=v_owner_id
    ),'[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',j.id,'title',j.title,
        'views',(select count(*) from public.interaction_events x where x.event_type='job_view' and x.created_at>=since_at and x.metadata->>'jobId'=j.id::text and x.viewer_user_id is distinct from v_owner_id),
        'whatsapp',(select count(*) from public.interaction_events x where x.event_type='whatsapp_click' and x.created_at>=since_at and x.metadata->>'jobId'=j.id::text and x.viewer_user_id is distinct from v_owner_id)
      ) order by j.created_at desc)
      from public.job_posts j where j.employer_id=v_professional_id
    ),'[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'title',o.title,
        'views',(select count(*) from public.interaction_events x where x.event_type='offer_view' and x.created_at>=since_at and x.metadata->>'offerId'=o.id::text and x.viewer_user_id is distinct from v_owner_id),
        'whatsapp',(select count(*) from public.interaction_events x where x.event_type='whatsapp_click' and x.created_at>=since_at and x.metadata->>'offerId'=o.id::text and x.viewer_user_id is distinct from v_owner_id)
      ) order by o.created_at desc)
      from public.professional_offers o where o.professional_id=v_professional_id
    ),'[]'::jsonb)
  ) into result
  from public.interaction_events e
  where e.professional_id=v_professional_id and e.created_at>=since_at
    and e.viewer_user_id is distinct from v_owner_id;
  return result;
end $$;

revoke all on function public.get_account_activity(integer) from public,anon;
grant execute on function public.get_account_activity(integer) to authenticated;
notify pgrst, 'reload schema';
