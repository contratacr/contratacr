-- Complete the isolated deletion contract introduced in migration 165.
--
-- Foreign-key cascades remove rows owned by the target account. This revision
-- also removes cross-account notifications that point at those rows through
-- JSON metadata, handles legacy SET NULL tables without retaining personal
-- content, and fixes the whatsapp follow-up CHECK that could otherwise block a
-- profile deletion. Every predicate is resolved from one requested user id.

-- Completed requests keep operational status/timestamps for retry auditing,
-- but not a permanent identifier for an account that no longer exists.
alter table public.account_deletion_requests
  alter column user_id drop not null;

update public.account_deletion_requests
set user_id = null,
    updated_at = now()
where status = 'completed' and user_id is not null;

-- Resolve every Storage object whose lifecycle is owned by the account. Current
-- uploads are written through the service role, so storage.owner_id is often
-- NULL. In those cases ownership is encoded in an exact path segment or in the
-- database row that references the object (conversation attachment / job CV).
create or replace function public.account_deletion_storage_objects(p_request_id uuid)
returns table (bucket_id text, object_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_professional_ids uuid[] := array[]::uuid[];
  target_conversation_ids uuid[] := array[]::uuid[];
  target_job_ids uuid[] := array[]::uuid[];
  target_application_ids uuid[] := array[]::uuid[];
  target_relation_ids uuid[] := array[]::uuid[];
  target_storage_paths text[] := array[]::text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select r.user_id into target_user_id
  from public.account_deletion_requests r
  where r.id = p_request_id and r.status <> 'completed';

  if target_user_id is null then return; end if;

  select coalesce(array_agg(p.id), array[]::uuid[])
    into target_professional_ids
  from public.professionals p
  where p.profile_id = target_user_id;

  select coalesce(array_agg(c.id), array[]::uuid[])
    into target_conversation_ids
  from public.direct_conversations c
  where c.client_id = target_user_id
     or c.professional_profile_id = target_user_id
     or c.professional_id = any(target_professional_ids);

  select coalesce(array_agg(j.id), array[]::uuid[])
    into target_job_ids
  from public.job_posts j
  where j.employer_id = any(target_professional_ids);

  select coalesce(array_agg(a.id), array[]::uuid[])
    into target_application_ids
  from public.job_applications a
  where a.applicant_id = target_user_id
     or a.job_id = any(target_job_ids);

  target_relation_ids := target_conversation_ids || target_job_ids || target_application_ids;

  select coalesce(array_agg(distinct paths.path), array[]::text[])
    into target_storage_paths
  from (
    select nullif(a.resume_url, '') as path
    from public.job_applications a
    where a.id = any(target_application_ids)
    union
    select nullif(attachment.value->>'path', '') as path
    from public.direct_messages m
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(m.attachment_urls) = 'array' then m.attachment_urls
        else '[]'::jsonb
      end
    ) as attachment(value)
    where m.conversation_id = any(target_conversation_ids)
  ) as paths
  where paths.path is not null;

  return query
  select o.bucket_id::text, o.name::text
  from storage.objects o
  where o.owner_id = target_user_id::text
     or o.name ~ ('(^|/)' || target_user_id::text || '(/|$)')
     or o.name = any(target_storage_paths)
     or exists (
       select 1
       from unnest(target_relation_ids) as relations(relation_id)
       where o.name ~ ('(^|/)' || relation_id::text || '(/|$)')
     );
end;
$$;

revoke all on function public.account_deletion_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_storage_objects(uuid) to service_role;

create or replace function public.finalize_account_deletion(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_request_status text;
  target_emails text[] := array[]::text[];
  target_professional_ids uuid[] := array[]::uuid[];
  target_booking_ids uuid[] := array[]::uuid[];
  target_project_ids uuid[] := array[]::uuid[];
  target_proposal_ids uuid[] := array[]::uuid[];
  target_job_ids uuid[] := array[]::uuid[];
  target_application_ids uuid[] := array[]::uuid[];
  target_offer_ids uuid[] := array[]::uuid[];
  target_activity_ids uuid[] := array[]::uuid[];
  target_follow_ids uuid[] := array[]::uuid[];
  target_review_ids uuid[] := array[]::uuid[];
  target_report_ids uuid[] := array[]::uuid[];
  target_ticket_ids uuid[] := array[]::uuid[];
  target_conversation_ids uuid[] := array[]::uuid[];
  target_contact_ids uuid[] := array[]::uuid[];
  target_relation_ids uuid[] := array[]::uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select r.user_id, r.status into target_user_id, target_request_status
  from public.account_deletion_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Deletion request not found' using errcode = 'P0002';
  end if;

  if target_request_status = 'completed' then
    return true;
  end if;

  if target_user_id is null then
    raise exception 'Deletion request has no account' using errcode = 'P0002';
  end if;

  update public.account_deletion_requests
  set status = 'processing', attempts = attempts + 1,
      processing_started_at = now(), updated_at = now(), last_error = null
  where id = p_request_id;

  if exists (
    select 1 from public.account_deletion_storage_objects(p_request_id)
  ) then
    raise exception 'Owned storage objects remain' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.user_media_assets m where m.user_id = target_user_id) then
    raise exception 'Owned media assets remain' using errcode = 'P0001';
  end if;

  -- Reports predate reporter_user_id. Recover current and previously-audited
  -- profile emails only from records that are strongly linked to this UUID; do
  -- not trust user-entered contact fields or guess from similar addresses. An
  -- email changed before migration 100 cannot be proven to belong to this user.
  select coalesce(array_agg(distinct known.email), array[]::text[])
    into target_emails
  from (
    select nullif(lower(trim(coalesce(p.email, u.email, ''))), '') as email
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = target_user_id
    union
    select nullif(lower(trim(a.before_data->>'email')), '')
    from public.user_action_audit a
    where a.entity_table = 'profiles' and a.entity_id = target_user_id::text
    union
    select nullif(lower(trim(a.after_data->>'email')), '')
    from public.user_action_audit a
    where a.entity_table = 'profiles' and a.entity_id = target_user_id::text
  ) as known
  where known.email is not null;

  select coalesce(array_agg(p.id), array[]::uuid[])
    into target_professional_ids
  from public.professionals p
  where p.profile_id = target_user_id;

  select coalesce(array_agg(b.id), array[]::uuid[])
    into target_booking_ids
  from public.bookings b
  where b.client_id = target_user_id
     or b.professional_id = any(target_professional_ids);

  select coalesce(array_agg(p.id), array[]::uuid[])
    into target_project_ids
  from public.projects p
  where p.client_id = target_user_id;

  select coalesce(array_agg(p.id), array[]::uuid[])
    into target_proposal_ids
  from public.proposals p
  where p.professional_id = any(target_professional_ids)
     or p.project_id = any(target_project_ids);

  select coalesce(array_agg(j.id), array[]::uuid[])
    into target_job_ids
  from public.job_posts j
  where j.employer_id = any(target_professional_ids);

  select coalesce(array_agg(a.id), array[]::uuid[])
    into target_application_ids
  from public.job_applications a
  where a.applicant_id = target_user_id
     or a.job_id = any(target_job_ids);

  select coalesce(array_agg(o.id), array[]::uuid[])
    into target_offer_ids
  from public.professional_offers o
  where o.professional_id = any(target_professional_ids);

  select coalesce(array_agg(a.id), array[]::uuid[])
    into target_activity_ids
  from public.professional_activity a
  where a.professional_id = any(target_professional_ids);

  select coalesce(array_agg(f.id), array[]::uuid[])
    into target_follow_ids
  from public.professional_follows f
  where f.follower_id = target_user_id
     or f.professional_id = any(target_professional_ids);

  select coalesce(array_agg(r.id), array[]::uuid[])
    into target_review_ids
  from public.reviews r
  where r.client_id = target_user_id
     or r.professional_id = any(target_professional_ids);

  select coalesce(array_agg(r.id), array[]::uuid[])
    into target_report_ids
  from public.reports r
  where r.reported_client_id = target_user_id
     or r.professional_id = any(target_professional_ids)
     or r.reporter_professional_id = any(target_professional_ids)
     or lower(r.reporter_email) = any(target_emails);

  select coalesce(array_agg(t.id), array[]::uuid[])
    into target_ticket_ids
  from public.support_tickets t
  where t.user_id = target_user_id;

  select coalesce(array_agg(c.id), array[]::uuid[])
    into target_conversation_ids
  from public.direct_conversations c
  where c.client_id = target_user_id
     or c.professional_profile_id = target_user_id;

  select coalesce(array_agg(w.id), array[]::uuid[])
    into target_contact_ids
  from public.whatsapp_contact_followups w
  where w.client_id = target_user_id
     or w.professional_id = any(target_professional_ids);

  target_relation_ids :=
    target_professional_ids || target_booking_ids || target_project_ids ||
    target_proposal_ids || target_job_ids || target_application_ids ||
    target_offer_ids || target_activity_ids || target_follow_ids ||
    target_review_ids || target_report_ids || target_ticket_ids || target_conversation_ids ||
    target_contact_ids;

  -- Disable the generic row-audit trigger before touching any table below.
  -- Otherwise the privacy cleanup itself would create fresh audit rows that
  -- copy the very support/report content being erased.
  perform set_config('app.account_deletion_user_id', target_user_id::text, true);

  -- Notifications have a recipient FK, but their subject/actor references live
  -- in JSON. Remove only alerts that contain the target UUID/email or an exact
  -- UUID of a row that will cascade with this account.
  delete from public.notifications n
  where n.user_id = target_user_id
     or n.data::text like ('%' || target_user_id::text || '%')
     or exists (
       select 1
       from unnest(target_emails) as emails(known_email)
       where strpos(lower(coalesce(n.data::text, '')), known_email) > 0
     )
     or exists (
       select 1
       from unnest(target_relation_ids) as relations(relation_id)
       where n.data::text like ('%' || relation_id::text || '%')
     );

  -- These historical tables intentionally retain operational rows. Strip the
  -- deleted account's content/identity while leaving unrelated records intact.
  update public.support_ticket_messages
  set sender_id = null,
      sender_name = 'Cuenta eliminada',
      body = '[Contenido eliminado por solicitud del usuario]'
  where sender_id = target_user_id
     or ticket_id = any(target_ticket_ids);

  update public.support_tickets
  set user_id = null,
      name = 'Cuenta eliminada',
      email = 'eliminada@anonimo.invalid',
      subject = 'Cuenta eliminada',
      detail = '[Contenido eliminado por solicitud del usuario]',
      message = '[Contenido eliminado por solicitud del usuario]'
  where user_id = target_user_id;

  update public.support_messages
  set user_id = null,
      name = 'Cuenta eliminada',
      email = 'eliminada@anonimo.invalid',
      subject = 'Cuenta eliminada',
      message = '[Contenido eliminado por solicitud del usuario]'
  where user_id = target_user_id;

  update public.support_tickets
  set handled_by = null,
      handled_by_name = 'Cuenta eliminada'
  where handled_by = target_user_id;

  -- A client-backed follow-up has no anonymous token. ON DELETE SET NULL would
  -- violate its CHECK, so remove only the target client's follow-ups explicitly.
  delete from public.whatsapp_contact_followups
  where client_id = target_user_id;

  delete from public.interaction_events
  where viewer_user_id = target_user_id;

  -- saved_items intentionally has a polymorphic UUID rather than a foreign
  -- key. Remove bookmarks owned by other users that point at content which is
  -- about to cascade, including their denormalized title/image snapshot.
  delete from public.saved_items s
  where (s.item_type = 'job' and s.item_id = any(target_job_ids))
     or (s.item_type = 'offer' and s.item_id = any(target_offer_ids));

  -- Approved catalog contributions remain useful to everyone, but no longer
  -- retain who suggested them. Unapproved personal tickets can be removed.
  delete from public.category_suggestions
  where suggested_by = target_user_id and approved = false;
  update public.category_suggestions
  set suggested_by = null, suggested_name = null
  where suggested_by = target_user_id;

  delete from public.insurers
  where suggested_by = target_user_id and approved = false;
  update public.insurers
  set suggested_by = null, suggested_name = null
  where suggested_by = target_user_id;

  update public.reports
  set professional_id = case
        when professional_id = any(target_professional_ids) then null
        else professional_id end,
      professional_slug = case
        when professional_id = any(target_professional_ids) then null
        else professional_slug end,
      professional_name = case
        when professional_id = any(target_professional_ids)
          or reported_client_id = target_user_id
        then 'Cuenta eliminada' else professional_name end,
      reported_client_id = case
        when reported_client_id = target_user_id then null
        else reported_client_id end,
      reporter_professional_id = case
        when reporter_professional_id = any(target_professional_ids) then null
        else reporter_professional_id end,
      reporter_email = case
        when reporter_professional_id = any(target_professional_ids)
          or lower(reporter_email) = any(target_emails)
        then null else reporter_email end,
      reason = case
        when professional_id = any(target_professional_ids)
          or reported_client_id = target_user_id
        then '[Contenido eliminado por solicitud del usuario]'
        else reason end
  where id = any(target_report_ids);

  update public.user_action_audit
  set actor_user_id = case when actor_user_id = target_user_id then null else actor_user_id end,
      entity_owner_user_id = case
        when entity_owner_user_id = target_user_id then null else entity_owner_user_id end,
      actor_role = case when actor_user_id = target_user_id then null else actor_role end,
      entity_id = case
        when entity_id = target_user_id::text
          or exists (
            select 1 from unnest(target_relation_ids) as relations(relation_id)
            where entity_id = relation_id::text
          )
        then null else entity_id end,
      request_method = case when actor_user_id = target_user_id then null else request_method end,
      request_path = case
        when actor_user_id = target_user_id
          or strpos(coalesce(request_path, ''), target_user_id::text) > 0
          or exists (
            select 1 from unnest(target_relation_ids) as relations(relation_id)
            where strpos(coalesce(request_path, ''), relation_id::text) > 0
          )
          or exists (
            select 1 from unnest(target_emails) as emails(known_email)
            where strpos(lower(coalesce(request_path, '')), known_email) > 0
          )
        then null else request_path end,
      request_host = case when actor_user_id = target_user_id then null else request_host end,
      request_ip = case when actor_user_id = target_user_id then null else request_ip end,
      user_agent = case when actor_user_id = target_user_id then null else user_agent end,
      referer = case
        when actor_user_id = target_user_id
          or strpos(coalesce(referer, ''), target_user_id::text) > 0
          or exists (
            select 1 from unnest(target_relation_ids) as relations(relation_id)
            where strpos(coalesce(referer, ''), relation_id::text) > 0
          )
          or exists (
            select 1 from unnest(target_emails) as emails(known_email)
            where strpos(lower(coalesce(referer, '')), known_email) > 0
          )
        then null else referer end,
      before_data = null,
      after_data = null,
      metadata = jsonb_build_object('account_deleted', true)
  where actor_user_id = target_user_id
     or entity_owner_user_id = target_user_id
     or entity_id = target_user_id::text
     or strpos(coalesce(request_path, ''), target_user_id::text) > 0
     or strpos(coalesce(referer, ''), target_user_id::text) > 0
     or before_data::text like ('%' || target_user_id::text || '%')
     or after_data::text like ('%' || target_user_id::text || '%')
     or metadata::text like ('%' || target_user_id::text || '%')
     or exists (
       select 1
       from unnest(target_relation_ids) as relations(relation_id)
       where entity_id = relation_id::text
          or strpos(coalesce(request_path, ''), relation_id::text) > 0
          or strpos(coalesce(referer, ''), relation_id::text) > 0
          or before_data::text like ('%' || relation_id::text || '%')
          or after_data::text like ('%' || relation_id::text || '%')
          or metadata::text like ('%' || relation_id::text || '%')
     )
     or exists (
       select 1
       from unnest(target_emails) as emails(known_email)
       where strpos(lower(coalesce(before_data::text, '')), known_email) > 0
          or strpos(lower(coalesce(after_data::text, '')), known_email) > 0
          or strpos(lower(coalesce(metadata::text, '')), known_email) > 0
          or strpos(lower(coalesce(request_path, '')), known_email) > 0
          or strpos(lower(coalesce(referer, '')), known_email) > 0
     );

  update public.provider_verification_log
  set admin_id = null,
      admin_name = 'Cuenta eliminada'
  where admin_id = target_user_id;

  update public.subscription_payments
  set recorded_by = null,
      reviewed_by = null,
      note = case when recorded_by = target_user_id then null else note end
  where recorded_by = target_user_id
     or reviewed_by = target_user_id;

  delete from public.profiles where id = target_user_id;
  delete from auth.users where id = target_user_id;

  update public.account_deletion_requests
  set user_id = null,
      status = 'completed', completed_at = now(), updated_at = now(), last_error = null
  where id = p_request_id;

  return true;
end;
$$;

revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finalize_account_deletion(uuid) to service_role;

notify pgrst, 'reload schema';
