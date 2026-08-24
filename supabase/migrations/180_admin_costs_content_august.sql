-- 180: the content pieces paid in August 2026 (before the weekly rate began).

insert into public.admin_cost_entries (id, kind, service_id, vendor, description, amount, currency, spent_on, quantity, notes)
values
  ('00000000-0000-4000-8000-000000000105', 'contenido', 'sharon-content', 'Sharon Velásquez', 'Publicaciones, destacadas y videos de agosto 2026', 160000, 'CRC', '2026-08-31', null, null)
on conflict (id) do nothing;
