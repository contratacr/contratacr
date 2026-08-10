-- Keep marketplace notification copy UTF-8 clean and provide structured data
-- so clients can localize dynamic notifications without parsing prose.

-- Reassert the complete notification contract. Supabase tracks migrations by
-- version, so this also repairs environments where an older 159 was recorded
-- before marketplace notification types were added to its constraint.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'review_request','review_received','booking_received','booking_confirmed','booking_completed',
    'booking_completed_by_client','booking_cancelled','booking_cancelled_by_client',
    'booking_rescheduled','booking_update','proposal_received','proposal_withdrawn',
    'proposal_accepted','project_proposal_declined','proposal_updated','new_project',
    'project_proposal_accepted','project_work_done','project_completed','project_cancelled',
    'project_deleted','support_reply','verification','verification_approved',
    'verification_rejected','verification_appeal_received','verification_reverted',
    'verification_pending','suggestion_approved','suggestion_rejected','direct_message',
    'professional_follow','followed_professional_activity','job_application','job_application_status'
  ));

create or replace function public.publish_professional_activity(
  p_professional_id uuid,
  p_type text,
  p_content_id text,
  p_title text,
  p_summary text,
  p_image_url text,
  p_href text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_activity_id uuid;
  v_label text;
begin
  insert into public.professional_activity (
    professional_id, activity_type, content_id, title, summary, image_url, href
  ) values (
    p_professional_id, p_type, p_content_id, p_title, nullif(trim(p_summary), ''),
    nullif(trim(p_image_url), ''), p_href
  )
  on conflict (professional_id, activity_type, content_id) do nothing
  returning id into v_activity_id;

  if v_activity_id is null then return; end if;

  select coalesce(nullif(trim(p.business_name), ''), nullif(trim(pr.full_name), ''), 'Un profesional')
    into v_name
  from public.professionals p
  join public.profiles pr on pr.id = p.profile_id
  where p.id = p_professional_id;

  v_label := case p_type
    when 'success_case' then 'publicó un nuevo caso de éxito'
    when 'service' then 'agregó un nuevo servicio'
    when 'offer' then 'publicó una nueva oferta'
    when 'job' then 'publicó una nueva oportunidad de empleo'
    else 'publicó una novedad'
  end;

  insert into public.notifications (user_id, type, title, message, data)
  select
    f.follower_id,
    'followed_professional_activity',
    'Nueva publicación de ' || v_name,
    v_name || ' ' || v_label || ': ' || p_title || '.',
    jsonb_build_object(
      'link', p_href,
      'activity_id', v_activity_id,
      'professional_id', p_professional_id,
      'activity_type', p_type,
      'content_id', p_content_id,
      'actor_name', v_name,
      'content_title', p_title
    )
  from public.professional_follows f
  where f.professional_id = p_professional_id
    and f.follower_id <> (
      select profile_id from public.professionals where id = p_professional_id
    );
end;
$$;

create or replace function public.notify_professional_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_owner uuid;
  v_follower_name text;
begin
  select profile_id into v_professional_owner
  from public.professionals
  where id = new.professional_id;

  if v_professional_owner is null or v_professional_owner = new.follower_id then
    return new;
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_follower_name
  from public.profiles
  where id = new.follower_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_professional_owner,
    'professional_follow',
    'Nuevo seguidor',
    coalesce(v_follower_name, 'Alguien') || ' empezó a seguir tu perfil profesional.',
    jsonb_build_object(
      'link', '/dashboard/profesional?tab=network&network=followers',
      'professional_id', new.professional_id,
      'follower_id', new.follower_id,
      'follower_name', coalesce(v_follower_name, 'Alguien')
    )
  );

  return new;
end;
$$;

create or replace function public.notify_job_application_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_job_title text;
  v_applicant_name text;
begin
  select p.profile_id, j.title
    into v_owner_id, v_job_title
  from public.job_posts j
  join public.professionals p on p.id = j.employer_id
  where j.id = new.job_id;

  if v_owner_id is null or v_owner_id = new.applicant_id then
    return new;
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_applicant_name
  from public.profiles
  where id = new.applicant_id;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    v_owner_id,
    'job_application',
    'Nueva postulación',
    coalesce(v_applicant_name, 'Alguien') || ' se postuló a ' || coalesce(v_job_title, 'tu empleo') || '.',
    jsonb_build_object(
      'link', '/dashboard/profesional?mode=offer&tab=jobs&job=' || new.job_id::text,
      'job_id', new.job_id,
      'application_id', new.id,
      'applicant_id', new.applicant_id,
      'applicant_name', coalesce(v_applicant_name, 'Alguien'),
      'job_title', coalesce(v_job_title, 'tu empleo')
    )
  );

  return new;
end;
$$;

create or replace function public.notify_job_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_title text;
  v_status_label text;
begin
  if new.status is not distinct from old.status then return new; end if;

  select title into v_job_title from public.job_posts where id = new.job_id;
  v_status_label := case new.status
    when 'reviewing' then 'está en revisión'
    when 'shortlisted' then 'fue preseleccionada'
    when 'rejected' then 'no fue seleccionada'
    when 'hired' then 'fue aceptada'
    when 'withdrawn' then 'fue retirada'
    else 'fue actualizada'
  end;

  insert into public.notifications (user_id, type, title, message, data)
  values (
    new.applicant_id,
    'job_application_status',
    'Actualización de postulación',
    'Tu postulación a ' || coalesce(v_job_title, 'este empleo') || ' ' || v_status_label || '.',
    jsonb_build_object(
      'link', '/empleos/' || new.job_id::text,
      'job_id', new.job_id,
      'application_id', new.id,
      'status', new.status,
      'job_title', coalesce(v_job_title, 'este empleo')
    )
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
