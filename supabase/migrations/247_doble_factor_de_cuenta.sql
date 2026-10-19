-- MFA is optional for ordinary accounts, mandatory for administrators.
-- Protect direct REST/RPC, Realtime and Storage as well as the Next.js API.
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

create or replace function public.enforce_session_mfa()
returns void language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.session_mfa_satisfied() then
    raise insufficient_privilege using message = 'MFA_REQUIRED';
  end if;
end;
$$;
revoke all on function public.enforce_session_mfa() from public;
grant execute on function public.enforce_session_mfa() to anon, authenticated, service_role;

-- A restrictive policy supplements existing ownership policies; it grants no access.
do $$
declare relation record;
begin
  for relation in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and c.relrowsecurity and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname in ('objects','buckets')))
  loop
    execute format('drop policy if exists account_mfa_required on %I.%I', relation.nspname, relation.relname);
    execute format('create policy account_mfa_required on %I.%I as restrictive for all to authenticated using ((select public.session_mfa_satisfied())) with check ((select public.session_mfa_satisfied()))', relation.nspname, relation.relname);
  end loop;
end;
$$;

-- Fail rather than replacing an unrelated pre-request security hook.
do $$
declare existing text;
begin
  select split_part(setting, '=', 2) into existing from pg_roles r, unnest(r.rolconfig) setting
    where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
  if coalesce(existing,'') not in ('','public.enforce_session_mfa') then
    raise exception 'Review the existing PostgREST pre-request hook before applying MFA';
  end if;
end;
$$;
alter role authenticator set pgrst.db_pre_request = 'public.enforce_session_mfa';
notify pgrst, 'reload config';
commit;
