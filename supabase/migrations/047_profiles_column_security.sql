-- 047_profiles_column_security.sql
-- SECURITY: stop the `profiles` table from exposing sensitive identity data.
--
-- Before this migration the "Public profiles are viewable by everyone"
-- policy (USING (true)) let the PUBLIC anon key read EVERY column of EVERY
-- profile — including `cedula`, `email`, `phone` and the moderation columns.
-- Anyone with the (public) anon key could dump every user's cédula.
--
-- RLS is row-level only, but the public professional cards + reviewer names
-- legitimately embed profiles(full_name, avatar_url) for OTHER users, so we
-- can't simply restrict rows to "own profile". Instead we use COLUMN-LEVEL
-- privileges: the anon/authenticated roles may read only the public-safe
-- columns; cédula / email / phone / moderation fields are readable only by the
-- OWNER (via get_my_profile) and the service-role (admin).

-- Revoke blanket SELECT, then grant back ONLY the public-safe columns.
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, avatar_url, role, is_disabled, created_at, updated_at)
  on public.profiles to anon, authenticated;

-- The owner reads their OWN full profile (cédula, phone, …) through a
-- SECURITY DEFINER function, which bypasses the column grants but only ever
-- returns the caller's own row (auth.uid()).
create or replace function public.get_my_profile()
returns public.profiles
language sql
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- Reload PostgREST so the new function + column privileges take effect at once.
notify pgrst, 'reload schema';
