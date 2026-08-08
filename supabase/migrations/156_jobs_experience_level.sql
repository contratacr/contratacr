alter table public.job_posts
  add column if not exists experience_level text not null default 'any'
  check (experience_level in ('any', 'one_plus', 'two_plus', 'three_plus', 'five_plus'));

create index if not exists job_posts_experience_level_idx
  on public.job_posts (experience_level);

notify pgrst, 'reload schema';
