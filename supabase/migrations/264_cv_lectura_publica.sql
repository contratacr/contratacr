-- Only owner-confirmed public CV fields; do not expose contact or private documents.
-- Existing row-level visibility policies still apply.
grant select (cv_profile) on public.professionals to anon;
notify pgrst, 'reload schema';
