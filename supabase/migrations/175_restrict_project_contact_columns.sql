-- 175: project contact data is not public.
--
-- "Open projects visible to authenticated users" (migration 010) carried no
-- TO clause, so PostgREST's anon role — the key shipped in every browser —
-- could list every open project with the client's name, email, phone and the
-- beneficiary's name and date of birth. Authenticated professionals could
-- read the same columns through any user-scoped query.
--
-- The app never needs those columns through a user-scoped client: owners and
-- the proposal feed are served by /api/projects with the service role after
-- an ownership check. So, like migration 047 did for profiles, the table-level
-- SELECT is replaced by a grant on the public-safe columns only, and the open
-- projects policy is limited to authenticated users.

drop policy if exists "Open projects visible to authenticated users" on public.projects;
create policy "Open projects visible to authenticated users" on public.projects
  for select to authenticated using (status = 'open');

revoke select on public.projects from anon;

revoke select on public.projects from authenticated;
grant select (
  id,
  client_id,
  category_id,
  title,
  description,
  provincia_id,
  canton_id,
  budget_min,
  budget_max,
  timeline,
  photo_urls,
  status,
  created_at,
  updated_at,
  work_done_at,
  completed_at,
  accepted_professional_id,
  client_identity_status,
  archived_by_client,
  for_someone_else,
  beneficiary_is_minor
) on public.projects to authenticated;

-- Withheld from user-scoped reads on purpose: client_name_snapshot,
-- client_email_snapshot, client_phone_snapshot, beneficiary_name,
-- beneficiary_dob, created_source_host, created_app_environment,
-- created_supabase_project_ref. New columns added later must be granted here
-- explicitly if a user-scoped query is ever meant to read them.
