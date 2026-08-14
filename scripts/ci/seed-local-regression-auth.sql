\set ON_ERROR_STOP on

select set_config('app.local_seed_guard', :'local_seed_guard', false);

do $$
begin
  if current_setting('app.local_seed_guard') <> 'contratacr-local-only' then
    raise exception 'Refusing to seed Auth without the local-only guard';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from public.provincias where id = 'sj')
    or not exists (select 1 from public.provincias where id = 'al')
    or not exists (select 1 from public.cantones where id = 'sj-sj' and provincia_id = 'sj')
    or not exists (select 1 from public.cantones where id = 'al-at' and provincia_id = 'al') then
    raise exception 'Required local geography fixtures are missing after migrations';
  end if;
end $$;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '048f1b3a-23c0-41bc-8728-10f8aed70fdb',
    'authenticated',
    'authenticated',
    'e2e.client@contratacr.test',
    crypt(:'regression_password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"ContrataCR","role":"professional","is_provider":true,"onboarding_completed":true,"localRegression":true}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '347f5202-8b3e-4c11-8db8-1060ea5e487d',
    'authenticated',
    'authenticated',
    'e2e.pro@contratacr.test',
    crypt(:'regression_password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"SG Solutions","role":"professional","is_provider":true,"onboarding_completed":true,"localRegression":true}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

delete from auth.identities
where user_id in (
  '048f1b3a-23c0-41bc-8728-10f8aed70fdb',
  '347f5202-8b3e-4c11-8db8-1060ea5e487d'
);

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '048f1b3a-23c0-41bc-8728-10f8aed70fdb',
    '048f1b3a-23c0-41bc-8728-10f8aed70fdb',
    '{"sub":"048f1b3a-23c0-41bc-8728-10f8aed70fdb","email":"e2e.client@contratacr.test","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '347f5202-8b3e-4c11-8db8-1060ea5e487d',
    '347f5202-8b3e-4c11-8db8-1060ea5e487d',
    '{"sub":"347f5202-8b3e-4c11-8db8-1060ea5e487d","email":"e2e.pro@contratacr.test","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  );

insert into public.padron (cedula, nombre, papellido, sapellido)
values
  ('100000001', 'LOCAL', 'CONTRATACR', 'PRUEBA'),
  ('100000002', 'LOCAL', 'SOLUTIONS', 'PRUEBA')
on conflict (cedula) do update set
  nombre = excluded.nombre,
  papellido = excluded.papellido,
  sapellido = excluded.sapellido;
