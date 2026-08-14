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

-- The hosted Supabase bootstrap grants table privileges before application
-- migrations run, so later security migrations can narrow them. This local
-- reconstruction grants after the migrations and must therefore replay those
-- deliberate restrictions instead of undoing them.
revoke select on table public.profiles from anon, authenticated;
grant select (id, full_name, avatar_url, role, is_disabled, created_at, updated_at)
  on table public.profiles to anon, authenticated;

do $$
declare
  public_professional_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into public_professional_columns
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'professionals'
     and column_name not in ('banned_reason', 'verification_reason', 'id_document_note');

  execute 'revoke select on table public.professionals from anon';
  execute format(
    'grant select (%s) on table public.professionals to anon',
    public_professional_columns
  );
end $$;

revoke all on table
  public.padron,
  public.padron_staging,
  public.account_deletion_requests,
  public.user_media_assets,
  public.user_push_tokens,
  public.notification_push_outbox,
  public.notification_push_deliveries
from public, anon, authenticated;
