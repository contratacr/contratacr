-- Jobs marketplace refinements:
-- - Link each job to a ContrataCR service/category when applicable.
-- - Store the applicant email submitted with the application so employers can contact them.

alter table public.job_posts
  add column if not exists service_category_id text;

create index if not exists job_posts_service_category_idx
  on public.job_posts (service_category_id);

alter table public.job_applications
  add column if not exists applicant_email text;

notify pgrst, 'reload schema';
