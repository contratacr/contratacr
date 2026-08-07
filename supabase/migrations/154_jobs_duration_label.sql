alter table public.job_posts
  add column if not exists duration_label text
  check (duration_label is null or char_length(trim(duration_label)) <= 80);

notify pgrst, 'reload schema';
