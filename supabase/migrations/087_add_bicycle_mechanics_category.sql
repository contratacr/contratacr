-- Migration 087: add bicycle mechanics as a Costa Rica service.
-- Additive only: keeps existing professionals and categories untouched.

INSERT INTO public.categories (
  id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta
)
VALUES (
  'mecanica_bicicletas',
  'Mecánica de bicicletas',
  'Bicycle repair',
  'automotriz',
  false,
  false,
  false
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  group_id = EXCLUDED.group_id,
  is_hidden = false,
  es_salud = false,
  supports_videoconsulta = false,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
