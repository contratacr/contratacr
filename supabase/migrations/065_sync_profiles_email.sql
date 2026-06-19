-- Migration 065: keep public.profiles.email IN SYNC with auth.users.email.
--
-- ROOT CAUSE of "Este correo ya está registrado. Inicia sesión." for an email that is
-- actually FREE in Supabase Auth (e.g. isanchezm421@gmail.com):
--   * migration 007 put a PARTIAL UNIQUE INDEX `idx_profiles_email_unique` on
--     profiles.email (mirrors auth's uniqueness).
--   * migration 003's `handle_new_user` trigger fills profiles.email on INSERT only.
--   * NOTHING updated profiles.email when an account CHANGED its email — so the OLD
--     email lingered in profiles. A new signup with that (now free in Auth) email then
--     collided with the stale profiles row → the unique index raised → the route mapped
--     it to "email_taken". The email was free in Auth but still "taken" in profiles.
--
-- FIX: an AFTER UPDATE OF email trigger on auth.users mirrors every future email change
-- into profiles.email automatically (no app code can forget it), PLUS a one-time backfill
-- that re-syncs all existing rows so already-stale emails become available again.

-- 1) Trigger function — mirror an auth email change onto the profile row.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- 2) One-time backfill — re-sync every profile to its real (current) auth email, so any
--    email already freed by a past change becomes reusable. auth.users.email is unique,
--    so the result is conflict-free under idx_profiles_email_unique.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

-- NOTE on truly ORPHANED rows (a profile whose auth user was DELETED, not changed):
-- profiles.id references auth.users(id) ON DELETE CASCADE, so a deleted auth user removes
-- its profile automatically and frees the email. If you still see a stale email after this
-- migration, find any orphan with:
--   select p.id, p.email from public.profiles p
--   left join auth.users u on u.id = p.id where u.id is null;
-- and delete those rows (they have no owner): delete from public.profiles where id in (...).

notify pgrst, 'reload schema';
