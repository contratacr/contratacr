\set ON_ERROR_STOP on

-- The workflow creates and fills the session-local production_profile_ids
-- table immediately before including this file in the same psql session.

-- Never copy production sessions, tokens, MFA factors, identities or passwords.
truncate table auth.sessions, auth.refresh_tokens cascade;

do $$
declare
  table_list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
    into table_list
  from pg_tables
  where schemaname = 'public'
    and tablename not in ('padron', 'padron_staging');

  if table_list is not null then
    execute 'truncate table ' || table_list || ' restart identity cascade';
  end if;
end $$;

-- Remove identities belonging to old fixtures and obsolete fake users. Keep
-- the single manual advertising login; its public profile is rebuilt after the
-- mirror with isolated test-only data. Regression actor logins are re-enabled
-- separately after the public restore.
delete from auth.identities
where user_id not in (
  select id from auth.users where lower(email) = 'publicidad@contratacr.test'
);
delete from auth.users
where id not in (select id from production_profile_ids)
  and lower(email) <> 'publicidad@contratacr.test';

set session_replication_role = replica;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  source.id,
  'authenticated',
  'authenticated',
  'prod+' || replace(source.id::text, '-', '') || '@mirror.contratacr.test',
  crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from production_profile_ids source
on conflict (id) do nothing;
set session_replication_role = origin;

notify pgrst, 'reload schema';
