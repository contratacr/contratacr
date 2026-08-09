-- Notification coverage for jobs, offers, followed professionals and applications.

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
      'content_id', p_content_id
    )
  from public.professional_follows f
  where f.professional_id = p_professional_id
    and f.follower_id <> (
      select profile_id from public.professionals where id = p_professional_id
    );
end;
$$;

create or replace function public.capture_offer_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;

  perform public.publish_professional_activity(
    new.professional_id,
    'offer',
    new.id::text,
    new.title,
    new.description,
    new.image_urls[1],
    '/ofertas?offer=' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_capture_offer_activity on public.professional_offers;
create trigger trg_capture_offer_activity after insert or update of status on public.professional_offers
for each row execute function public.capture_offer_activity();

create or replace function public.capture_job_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;

  perform public.publish_professional_activity(
    new.employer_id,
    'job',
    new.id::text,
    new.title,
    new.description,
    null,
    '/empleos?job=' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_capture_job_activity on public.job_posts;
create trigger trg_capture_job_activity after insert or update of status on public.job_posts
for each row execute function public.capture_job_activity();

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
      'follower_id', new.follower_id
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_professional_follow_notification on public.professional_follows;
create trigger trg_professional_follow_notification
  after insert on public.professional_follows
  for each row execute function public.notify_professional_on_follow();
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

  select nullif(trim(coalesce(full_name, '')), '')
    into v_applicant_name
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
      'applicant_id', new.applicant_id
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_job_application_received_notification on public.job_applications;
create trigger trg_job_application_received_notification
  after insert on public.job_applications
  for each row execute function public.notify_job_application_received();

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
  if new.status is not distinct from old.status then
    return new;
  end if;

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
      'link', '/empleos?job=' || new.job_id::text,
      'job_id', new.job_id,
      'application_id', new.id,
      'status', new.status
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_job_application_status_notification on public.job_applications;
create trigger trg_job_application_status_notification
  after update of status on public.job_applications
  for each row execute function public.notify_job_application_status();

notify pgrst, 'reload schema';
