-- 179: the one-off payments ContrataCR already made before the Costos section
-- existed, so "spent since the start" is right from day one. Fixed ids so the
-- migration can run again without duplicating; the admin can delete or edit
-- any of them from /admin/costos.

insert into public.admin_cost_entries (id, kind, service_id, vendor, description, amount, currency, spent_on, quantity, notes)
values
  ('00000000-0000-4000-8000-000000000101', 'unico', 'vercel', 'Vercel', 'Un mes del plan Pro', 20, 'USD', '2026-06-05', null, null),
  ('00000000-0000-4000-8000-000000000102', 'unico', 'vercel', 'Vercel', 'Cargos por uso', 45, 'USD', '2026-07-05', null, null),
  ('00000000-0000-4000-8000-000000000103', 'unico', 'supabase', 'Supabase', 'Un mes del plan Pro', 25, 'USD', '2026-07-05', null, null),
  ('00000000-0000-4000-8000-000000000104', 'unico', 'google-play', 'Google Play Console', 'Cuenta de desarrollador (pago único)', 25, 'USD', '2026-07-15', null, null)
on conflict (id) do nothing;
