-- Persist the card data needed to render favorites consistently across browsers.
alter table public.saved_professionals
  add column if not exists snapshot jsonb;

notify pgrst, 'reload schema';
