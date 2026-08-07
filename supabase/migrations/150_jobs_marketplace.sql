-- Employment marketplace: job posts and applications.

create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.professionals(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 30 and 5000),
  responsibilities text[] not null default '{}',
  requirements text[] not null default '{}',
  benefits text[] not null default '{}',
  employment_type text not null check (employment_type in ('full_time','part_time','contract','temporary','internship')),
  workplace_type text not null check (workplace_type in ('onsite','hybrid','remote')),
  provincia_id text,
  canton_id text,
  location_label text,
  salary_min integer check (salary_min is null or salary_min >= 0),
  salary_max integer check (salary_max is null or salary_max >= 0),
  salary_period text not null default 'monthly' check (salary_period in ('hourly','monthly','annual','project')),
  currency text not null default 'CRC' check (currency in ('CRC','USD')),
  show_salary boolean not null default true,
  openings smallint not null default 1 check (openings between 1 and 100),
  application_deadline date,
  status text not null default 'published' check (status in ('draft','published','paused','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_max is null or salary_min is null or salary_max >= salary_min),
  check (workplace_type = 'remote' or nullif(trim(location_label), '') is not null)
);

create index if not exists job_posts_public_index
  on public.job_posts (status, created_at desc);
create index if not exists job_posts_employer_index
  on public.job_posts (employer_id, created_at desc);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_posts(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  cover_letter text not null check (char_length(trim(cover_letter)) between 20 and 3000),
  phone text,
  resume_url text,
  portfolio_url text,
  status text not null default 'submitted' check (status in ('submitted','reviewing','shortlisted','rejected','hired','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, applicant_id)
);

create index if not exists job_applications_job_index
  on public.job_applications (job_id, created_at desc);
create index if not exists job_applications_applicant_index
  on public.job_applications (applicant_id, created_at desc);

alter table public.job_posts enable row level security;
alter table public.job_applications enable row level security;

create policy "Published jobs are public"
  on public.job_posts for select
  using (
    status = 'published'
    or exists (
      select 1 from public.professionals p
      where p.id = employer_id and p.profile_id = auth.uid()
    )
  );

create policy "Professionals create their jobs"
  on public.job_posts for insert
  with check (
    exists (
      select 1 from public.professionals p
      where p.id = employer_id and p.profile_id = auth.uid()
    )
  );

create policy "Professionals update their jobs"
  on public.job_posts for update
  using (
    exists (
      select 1 from public.professionals p
      where p.id = employer_id and p.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.professionals p
      where p.id = employer_id and p.profile_id = auth.uid()
    )
  );

create policy "Professionals delete their jobs"
  on public.job_posts for delete
  using (
    exists (
      select 1 from public.professionals p
      where p.id = employer_id and p.profile_id = auth.uid()
    )
  );

create policy "Applicants create applications"
  on public.job_applications for insert
  with check (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.job_posts j
      where j.id = job_id and j.status = 'published'
        and (j.application_deadline is null or j.application_deadline >= current_date)
    )
  );

create policy "Applicants view their applications"
  on public.job_applications for select
  using (
    applicant_id = auth.uid()
    or exists (
      select 1
      from public.job_posts j
      join public.professionals p on p.id = j.employer_id
      where j.id = job_id and p.profile_id = auth.uid()
    )
  );

create policy "Applicants withdraw applications"
  on public.job_applications for update
  using (applicant_id = auth.uid())
  with check (applicant_id = auth.uid() and status = 'withdrawn');

create policy "Employers manage application status"
  on public.job_applications for update
  using (
    exists (
      select 1
      from public.job_posts j
      join public.professionals p on p.id = j.employer_id
      where j.id = job_id and p.profile_id = auth.uid()
    )
  );

create or replace function public.touch_job_marketplace_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_job_posts_updated_at on public.job_posts;
create trigger touch_job_posts_updated_at before update on public.job_posts
for each row execute function public.touch_job_marketplace_updated_at();

drop trigger if exists touch_job_applications_updated_at on public.job_applications;
create trigger touch_job_applications_updated_at before update on public.job_applications
for each row execute function public.touch_job_marketplace_updated_at();

notify pgrst, 'reload schema';
