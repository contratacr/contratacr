\set ON_ERROR_STOP on

select set_config('app.regression_password', :'regression_password', false);

do $$
declare
  contratacr_id constant uuid := '048f1b3a-23c0-41bc-8728-10f8aed70fdb';
  contratacr_professional_id constant uuid := 'ae9caa2b-1fca-4411-9aeb-7736f5bbf42f';
  sg_id constant uuid := '347f5202-8b3e-4c11-8db8-1060ea5e487d';
  sg_professional_id constant uuid := '988428c7-a0b6-4d9e-a9b8-e0209a1ca296';
  regression_password text := current_setting('app.regression_password');
begin
  if not exists (
    select 1 from public.professionals p
    where p.id = contratacr_professional_id
      and p.profile_id = contratacr_id
      and lower(trim(coalesce(p.business_name, ''))) = 'contratacr'
  ) then
    raise exception 'Production mirror must contain canonical ContrataCR';
  end if;

  if not exists (
    select 1 from public.professionals p
    where p.id = sg_professional_id
      and p.profile_id = sg_id
      and lower(trim(coalesce(p.business_name, ''))) = 'sg solutions'
  ) then
    raise exception 'Production mirror must contain canonical SG Solutions';
  end if;

  if not exists (select 1 from auth.users u where u.id = contratacr_id)
     or not exists (select 1 from auth.users u where u.id = sg_id) then
    raise exception 'Canonical regression actors are missing from Auth';
  end if;

  -- Preserve public names, business content and production images, but prevent
  -- test from emailing/calling real users or exposing identity fields.
  update auth.users
  set email = 'prod+' || replace(id::text, '-', '') || '@mirror.contratacr.test',
      encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')),
      email_confirmed_at = now(),
      confirmation_token = '',
      recovery_token = '',
      email_change_token_new = '',
      email_change = '',
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
      confirmation_token = '',
      recovery_token = '',
      email_change_token_new = '',
      email_change = '',
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = jsonb_build_object('regressionActor', 'ContrataCR'),
      updated_at = now()
  where id = contratacr_id;

  update auth.users
  set email = 'e2e.pro@contratacr.test',
      encrypted_password = crypt(regression_password, gen_salt('bf')),
      email_confirmed_at = now(),
      confirmation_token = '',
      recovery_token = '',
      email_change_token_new = '',
      email_change = '',
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
