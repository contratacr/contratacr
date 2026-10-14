-- Estadísticas privadas por cuenta. Solo auth.uid() determina el dueño; el
-- navegador nunca puede pedir las cifras de otra persona.
alter table public.interaction_events drop constraint if exists interaction_events_event_type_check;
alter table public.interaction_events add constraint interaction_events_event_type_check check (event_type in (
  'profile_view','whatsapp_click','phone_click','availability_view','schedule_slot_selected',
  'favorite_add','favorite_remove','profile_share','external_link_click','email_click',
  'quote_created','quote_accepted','quote_declined','internal_message_sent',
  'project_lead_whatsapp','project_lead_phone','project_view','identity_verified',
  'campaign_click','service_request_started','service_request_created','project_published',
  'proposal_sent','proposal_accepted','review_created','search_performed','job_view',
  'job_application_sent','offer_view','assistant_question','page_freeze',
  'contact_gate_shown','contact_lead_created'
));

create index if not exists interaction_events_project_stats_idx
  on public.interaction_events ((metadata->>'projectId'), created_at desc)
  where event_type = 'project_view';
create index if not exists interaction_events_project_contact_stats_idx
  on public.interaction_events ((metadata->>'project_id'), created_at desc)
  where event_type = 'project_lead_whatsapp';
create index if not exists interaction_events_job_stats_idx
  on public.interaction_events ((metadata->>'jobId'), created_at desc)
  where event_type in ('job_view','whatsapp_click');
create index if not exists interaction_events_offer_stats_idx
  on public.interaction_events ((metadata->>'offerId'), created_at desc)
  where event_type in ('offer_view','whatsapp_click');

create or replace function public.get_account_activity(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := auth.uid();
  v_professional_id uuid;
  since_at timestamptz;
  result jsonb;
begin
  if v_owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_days is null or p_days not in (7,30,90) then raise exception 'Invalid period' using errcode='22023'; end if;
  since_at := now() - make_interval(days => p_days);
  select id into v_professional_id from public.professionals where profile_id=v_owner_id limit 1;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'views', count(*) filter (where e.event_type='profile_view'),
      'whatsapp', count(*) filter (where e.event_type='whatsapp_click' and e.source in ('profile','profile_service')),
      'calls', count(*) filter (where e.event_type='phone_click' and e.source='profile')
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
