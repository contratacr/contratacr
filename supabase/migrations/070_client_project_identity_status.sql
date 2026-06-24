-- 070_client_project_identity_status.sql
-- Store explicit client identity status for open project postings.
-- `profiles` keeps the account-level state; `projects` keeps the snapshot shown
-- to professionals in Oportunidades without exposing the client's ID number.

alter table public.profiles
  add column if not exists client_identity_status text not null default 'unverified',
  add column if not exists client_identity_verified_at timestamptz,
  add column if not exists client_identity_provider text;

alter table public.profiles
  drop constraint if exists profiles_client_identity_status_check;

alter table public.profiles
  add constraint profiles_client_identity_status_check
  check (client_identity_status in ('verified', 'pending', 'unverified'));

alter table public.projects
  add column if not exists client_identity_status text not null default 'unverified';

alter table public.projects
  drop constraint if exists projects_client_identity_status_check;

alter table public.projects
  add constraint projects_client_identity_status_check
  check (client_identity_status in ('verified', 'pending', 'unverified'));

create index if not exists projects_client_identity_status_idx
  on public.projects (client_identity_status);

notify pgrst, 'reload schema';
