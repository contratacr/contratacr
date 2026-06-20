-- Migration 067: free ALREADY-STALE emails so old (changed-away) addresses can be reused.
--
-- Companion cleanup for the "old email still blocked after an email change" bug. The
-- structural fixes are already in place (migration 065's auth.users email trigger + the
-- /auth/callback mirror + the self-healing signup added in this sprint), but a profiles row
-- whose email went stale BEFORE those ran still reserves the old email under
-- idx_profiles_email_unique. This re-syncs every profiles row to its real Auth email and
-- removes any orphaned rows, so all currently-stale emails become available again.
-- Idempotent — safe to run (again) in the SQL Editor.

-- 1) Re-sync each profile to its CURRENT auth email (auth.users.email is unique, so the
--    result is conflict-free under idx_profiles_email_unique). This frees any email that
--    an account changed away from.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

-- 2) Remove ORPHANED profiles (no matching auth user). profiles.id references
--    auth.users(id) ON DELETE CASCADE, so these normally can't exist — but if any linger
--    (e.g. a manual delete before the FK), they'd keep an email reserved forever.
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

-- To INSPECT what (if anything) is still stale/orphaned BEFORE/AFTER running, use:
--   select p.id, p.email as profile_email, u.email as auth_email
--   from public.profiles p left join auth.users u on u.id = p.id
--   where u.id is null or p.email is distinct from u.email;

notify pgrst, 'reload schema';
