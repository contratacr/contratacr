\set ON_ERROR_STOP on

select set_config('app.regression_password', :'regression_password', false);

do $$
declare
  contratacr_id uuid;
  sg_id uuid;
  regression_password text := current_setting('app.regression_password');
begin
  select profile_id into contratacr_id
  from public.professionals
  where lower(trim(coalesce(business_name, ''))) = 'contratacr'
  order by updated_at desc nulls last
  limit 1;

  select profile_id into sg_id
  from public.professionals
  where lower(trim(coalesce(business_name, ''))) = 'sg solutions'
  order by updated_at desc nulls last
  limit 1;

  if contratacr_id is null or sg_id is null then
    raise exception 'Production mirror must contain ContrataCR and SG Solutions';
  end if;
  if contratacr_id = sg_id then
    raise exception 'ContrataCR and SG Solutions must be distinct profiles';
  end if;

  -- Preserve public names, business content and production images, but prevent
  -- test from emailing/calling real users or exposing identity fields.
  update auth.users
  set email = 'prod+' || replace(id::text, '-', '') || '@mirror.contratacr.test',
      encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')),
      email_confirmed_at = now(),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = '{}'::jsonb,
      updated_at = now();

  update public.profiles
  set email = 'prod+' || replace(id::text, '-', '') || '@mirror.contratacr.test',
      phone = null,
      cedula = null,
      date_of_birth = null;

  update public.professionals
  set contact_email = null,
      call_phone = null,
      allow_phone_call = false,
      whatsapp = '+506 0000 0000';

  update auth.users
  set email = 'e2e.client@contratacr.test',
      encrypted_password = crypt(regression_password, gen_salt('bf')),
      email_confirmed_at = now(),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = jsonb_build_object('regressionActor', 'ContrataCR'),
      updated_at = now()
  where id = contratacr_id;

  update auth.users
  set email = 'e2e.pro@contratacr.test',
      encrypted_password = crypt(regression_password, gen_salt('bf')),
      email_confirmed_at = now(),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = jsonb_build_object('regressionActor', 'SG Solutions'),
      updated_at = now()
  where id = sg_id;

  update public.profiles set email = 'e2e.client@contratacr.test' where id = contratacr_id;
  update public.profiles set email = 'e2e.pro@contratacr.test' where id = sg_id;

  delete from auth.identities where user_id in (contratacr_id, sg_id);
  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values
    (
      contratacr_id::text, contratacr_id,
      jsonb_build_object('sub', contratacr_id::text, 'email', 'e2e.client@contratacr.test', 'email_verified', true),
      'email', now(), now(), now()
    ),
    (
      sg_id::text, sg_id,
      jsonb_build_object('sub', sg_id::text, 'email', 'e2e.pro@contratacr.test', 'email_verified', true),
      'email', now(), now(), now()
    );
end $$;
