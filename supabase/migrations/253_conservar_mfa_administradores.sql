-- Preserve mandatory administrator enrollment and optional MFA for other accounts.
-- Reconciles TEST after the unpublished optional-administrator proposal was declined.
begin;
create or replace function public.session_mfa_satisfied()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is null
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    or (
      not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.factor_type = 'totp' and f.status = 'verified')
      and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and not coalesce(p.is_disabled, false))
    );
$$;
revoke all on function public.session_mfa_satisfied() from public;
grant execute on function public.session_mfa_satisfied() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
