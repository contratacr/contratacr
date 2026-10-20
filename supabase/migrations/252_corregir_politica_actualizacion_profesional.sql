-- Migration 001 left a self-referencing UPDATE policy behind when 008 added
-- the direct ownership policy under a different name. PostgreSQL expands both
-- policies, so the legacy subquery can recurse even for the rightful owner.
-- Keep ownership and the restrictive account MFA policy; grant no new access.
begin;
drop policy if exists "Professionals can update their own profile" on public.professionals;
drop policy if exists "Professionals can update their own record" on public.professionals;
create policy "Professionals can update their own record" on public.professionals
  for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);
notify pgrst, 'reload schema';
commit;
