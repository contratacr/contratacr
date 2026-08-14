\set ON_ERROR_STOP on

select set_config('app.local_seed_guard', :'local_seed_guard', false);

do $$
begin
  if current_setting('app.local_seed_guard') <> 'contratacr-local-only' then
    raise exception 'Refusing to grant regression privileges without the local-only guard';
  end if;
  if exists (select 1 from auth.users) then
    raise exception 'Refusing to grant local regression privileges to a database with existing Auth users';
  end if;
end $$;

-- Hosted Supabase projects bootstrap these privileges outside application
-- migrations. A database rebuilt only from migrations does not, so reproduce
-- the standard API-role contract locally without changing production grants.
-- RLS remains the authorization boundary for anon/authenticated; without the
-- table grants PostgREST returns empty/error states before policies can run.
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC by default,
-- and the migrations explicitly revoke sensitive RPCs such as padron_lookup.
-- Do not blanket regrant functions to browser roles after those revocations.
grant execute on all functions in schema public to service_role;
