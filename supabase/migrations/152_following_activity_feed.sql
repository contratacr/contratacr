-- Activity from followed professionals: one source for the home feed and notifications.

create table if not exists public.professional_activity (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  activity_type text not null check (activity_type in ('success_case', 'service', 'offer', 'job')),
  content_id text not null,
  title text not null,
  summary text,
  image_url text,
  href text not null,
  created_at timestamptz not null default now(),
  unique (professional_id, activity_type, content_id)
);

create index if not exists professional_activity_feed_idx
  on public.professional_activity (created_at desc);
create index if not exists professional_activity_professional_idx
  on public.professional_activity (professional_id, created_at desc);

alter table public.professional_activity enable row level security;

drop policy if exists "Followers view professional activity" on public.professional_activity;
create policy "Followers view professional activity"
  on public.professional_activity for select
  using (
    exists (
      select 1 from public.professional_follows f
      where f.professional_id = professional_activity.professional_id
        and f.follower_id = auth.uid()
    )
  );

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
    'professional_follow','followed_professional_activity'
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
  where f.professional_id = p_professional_id;
end;
$$;

create or replace function public.capture_professional_profile_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_id text;
  item_title text;
  item_image text;
  service_name text;
begin
  for item in
    select value from jsonb_array_elements(coalesce(new.portfolio_items, '[]'::jsonb))
    except
    select value from jsonb_array_elements(coalesce(old.portfolio_items, '[]'::jsonb))
  loop
    item_id := coalesce(nullif(item->>'id', ''), md5(item::text));
    item_title := coalesce(nullif(item->>'title', ''), 'Nuevo caso de éxito');
    item_image := item->'photos'->>0;
    perform public.publish_professional_activity(
      new.id, 'success_case', item_id, item_title, item->>'description', item_image,
      '/profesionales/' || new.slug || '?tab=casos&case=' || item_id || '#casos'
    );
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(new.services, '[]'::jsonb))
    except
    select value from jsonb_array_elements(coalesce(old.services, '[]'::jsonb))
  loop
    item_id := coalesce(nullif(item->>'id', ''), nullif(item->>'serviceId', ''), md5(item::text));
    service_name := coalesce(nullif(item->>'name', ''), nullif(item->>'label', ''), 'Nuevo servicio');
    perform public.publish_professional_activity(
      new.id, 'service', item_id, service_name, item->>'description', item->>'imageUrl',
      '/profesionales/' || new.slug || '?tab=servicios#servicios'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_capture_professional_profile_activity on public.professionals;
create trigger trg_capture_professional_profile_activity
  after update of portfolio_items, services on public.professionals
  for each row execute function public.capture_professional_profile_activity();

create or replace function public.capture_offer_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_slug text;
begin
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;
  if new.status = 'published' then
    select slug into v_slug from public.professionals where id = new.professional_id;
    perform public.publish_professional_activity(
      new.professional_id, 'offer', new.id::text, new.title, new.description,
      new.image_urls[1], '/ofertas/' || new.id::text
    );
  end if;
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
  if new.status = 'published' then
    perform public.publish_professional_activity(
      new.employer_id, 'job', new.id::text, new.title, new.description, null,
      '/empleos/' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_job_activity on public.job_posts;
create trigger trg_capture_job_activity after insert or update of status on public.job_posts
for each row execute function public.capture_job_activity();

-- Seed the feed with useful existing publications without generating historical alerts.
insert into public.professional_activity (
  professional_id, activity_type, content_id, title, summary, image_url, href, created_at
)
select
  p.id,
  'success_case',
  coalesce(nullif(item->>'id', ''), md5(item::text)),
  coalesce(nullif(item->>'title', ''), 'Caso de éxito'),
  nullif(item->>'description', ''),
  item->'photos'->>0,
  '/profesionales/' || p.slug || '?tab=casos&case=' || coalesce(nullif(item->>'id', ''), md5(item::text)) || '#casos',
  p.updated_at
from public.professionals p
cross join lateral jsonb_array_elements(coalesce(p.portfolio_items, '[]'::jsonb)) as cases(item)
on conflict (professional_id, activity_type, content_id) do nothing;

insert into public.professional_activity (
  professional_id, activity_type, content_id, title, summary, image_url, href, created_at
)
select professional_id, 'offer', id::text, title, description, image_urls[1],
  '/ofertas/' || id::text, created_at
from public.professional_offers
where status = 'published'
on conflict (professional_id, activity_type, content_id) do nothing;

insert into public.professional_activity (
  professional_id, activity_type, content_id, title, summary, image_url, href, created_at
)
select employer_id, 'job', id::text, title, description, null,
  '/empleos/' || id::text, created_at
from public.job_posts
where status = 'published'
on conflict (professional_id, activity_type, content_id) do nothing;

notify pgrst, 'reload schema';
