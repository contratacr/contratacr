alter table public.job_posts
  drop constraint if exists job_posts_salary_period_check;

alter table public.job_posts
  add constraint job_posts_salary_period_check
  check (salary_period in ('hourly', 'biweekly', 'monthly', 'annual', 'project'));
