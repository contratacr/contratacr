-- 059_auth_providers_rpc.sql
-- ============================================================================
-- One email = one account. To GUIDE users to the correct sign-in method (e.g. an
-- account created with Google has NO password in our app), the app needs to know
-- which auth providers an email is registered with. `auth.users`/`auth.identities`
-- are NOT exposed via PostgREST, so this SECURITY DEFINER function reads them and
-- returns the distinct providers (comma-separated, e.g. 'google' or 'email,google'),
-- or NULL when the email has no account.
--
-- Callable ONLY by the service_role (the /api/auth/method endpoint) — never by
-- anon/authenticated — to limit account-enumeration. The endpoint rate-limits too.
-- ============================================================================
create or replace function public.auth_providers_for_email(p_email text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select string_agg(distinct i.provider, ',' order by i.provider)
  from auth.users u
  join auth.identities i on i.user_id = u.id
  where lower(u.email) = lower(trim(p_email));
$$;

revoke all on function public.auth_providers_for_email(text) from public, anon, authenticated;
grant execute on function public.auth_providers_for_email(text) to service_role;

notify pgrst, 'reload schema';
