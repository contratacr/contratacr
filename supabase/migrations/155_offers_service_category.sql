alter table public.professional_offers
  add column if not exists service_category_id text;

create index if not exists professional_offers_service_category_idx
  on public.professional_offers (service_category_id);

notify pgrst, 'reload schema';
