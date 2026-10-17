-- Own views/contacts are not audience activity. Apply the same rule to every
-- writer/report, and keep the historical correction recoverable privately.
create table if not exists public.excluded_self_interactions (
  event_id uuid primary key,
  viewer_user_id uuid not null references public.profiles(id) on delete cascade,
  event jsonb not null,
  excluded_at timestamptz not null default now()
);
alter table public.excluded_self_interactions enable row level security;
revoke all on public.excluded_self_interactions from public,anon,authenticated;
grant all on public.excluded_self_interactions to service_role;

create or replace function public.is_own_marketplace_interaction(
  p_actor uuid, p_professional uuid, p_type text, p_metadata jsonb
) returns boolean language plpgsql stable security definer set search_path=public as $$
declare target_id text;
begin
  if p_actor is null or p_type is null or p_type not in (
    'profile_view','whatsapp_click','phone_click','email_click',
    'availability_view','schedule_slot_selected','favorite_add','favorite_remove',
    'profile_share','external_link_click','project_view','project_lead_whatsapp',
    'project_lead_phone','job_view','job_application_sent','offer_view',
    'contact_gate_shown'
  ) then return false; end if;

  -- A professional contacting somebody else's project is legitimate: in that
  -- event professional_id identifies the actor, not the owner of the project.
  target_id := coalesce(p_metadata->>'projectId',p_metadata->>'project_id');
  if target_id is not null then
    return exists(select 1 from projects where id::text=target_id and client_id=p_actor);
  end if;
  target_id := coalesce(p_metadata->>'jobId',p_metadata->>'job_id');
  if target_id is not null then
    return exists(select 1 from job_posts j join professionals p on p.id=j.employer_id
      where j.id::text=target_id and p.profile_id=p_actor);
  end if;
  target_id := coalesce(p_metadata->>'offerId',p_metadata->>'offer_id');
  if target_id is not null then
    return exists(select 1 from professional_offers o join professionals p on p.id=o.professional_id
      where o.id::text=target_id and p.profile_id=p_actor);
  end if;
  -- Missing/invalid post identifiers must not make the actor's professional
  -- identity look like their own target. Creation/business activity is kept.
  if p_type in ('project_view','project_lead_whatsapp','project_lead_phone','job_view','job_application_sent','offer_view') then
    return false;
  end if;
  return exists(select 1 from professionals where id=p_professional and profile_id=p_actor);
end $$;
revoke all on function public.is_own_marketplace_interaction(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.is_own_marketplace_interaction(uuid,uuid,text,jsonb) to service_role;

create or replace function public.skip_own_marketplace_interaction()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.is_own_marketplace_interaction(NEW.viewer_user_id,NEW.professional_id,NEW.event_type,NEW.metadata) then
    return null;
  end if;
  return NEW;
end $$;
revoke all on function public.skip_own_marketplace_interaction() from public,anon,authenticated;
drop trigger if exists skip_own_marketplace_interaction on public.interaction_events;
create trigger skip_own_marketplace_interaction before insert or update on public.interaction_events
for each row execute function public.skip_own_marketplace_interaction();

with removed as (
  delete from public.interaction_events e
  where public.is_own_marketplace_interaction(e.viewer_user_id,e.professional_id,e.event_type,e.metadata)
  returning *
)
insert into public.excluded_self_interactions(event_id,viewer_user_id,event)
select r.id,r.viewer_user_id,to_jsonb(r) from removed r
on conflict(event_id) do nothing;

notify pgrst,'reload schema';
