-- Migration 104: add "Comercios" as its own segment.
-- Keeps event services focused on events and places daily local businesses under shops.

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order, is_hidden)
VALUES
  ('comercios', 'Comercios', 'Shops', 'store', 75, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_hidden = false,
  updated_at = now();

UPDATE public.categories
SET group_id = 'comercios'
WHERE group_id = 'restaurantes'
   OR id IN (
    'restaurantes_comida',
    'cafeterias',
    'panaderias',
    'farmacias',
    'gasolineras',
    'supermercados_minisuper',
    'ferreterias',
    'papelerias_librerias',
    'carnicerias_verdulerias',
    'tiendas_mascotas'
  );

INSERT INTO public.categories (id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta)
VALUES
  ('restaurantes_comida', 'Restaurantes y comida', 'Restaurants & food', 'comercios', false, false, false),
  ('cafeterias', 'Cafeterías', 'Coffee shops', 'comercios', false, false, false),
  ('panaderias', 'Panaderías y reposterías', 'Bakeries & pastry shops', 'comercios', false, false, false),
  ('farmacias', 'Farmacias', 'Pharmacies', 'comercios', false, false, false),
  ('gasolineras', 'Gasolineras', 'Gas stations', 'comercios', false, false, false),
  ('supermercados_minisuper', 'Supermercados y minisúper', 'Supermarkets & convenience stores', 'comercios', false, false, false),
  ('ferreterias', 'Ferreterías', 'Hardware stores', 'comercios', false, false, false),
  ('papelerias_librerias', 'Papelerías y librerías', 'Stationery & bookstores', 'comercios', false, false, false),
  ('carnicerias_verdulerias', 'Carnicerías y verdulerías', 'Butcher shops & produce stores', 'comercios', false, false, false),
  ('tiendas_mascotas', 'Tiendas de mascotas', 'Pet stores', 'comercios', false, false, false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  group_id = EXCLUDED.group_id,
  is_hidden = false,
  es_salud = false,
  supports_videoconsulta = false;

UPDATE public.category_groups
SET is_hidden = true, updated_at = now()
WHERE id = 'restaurantes';
