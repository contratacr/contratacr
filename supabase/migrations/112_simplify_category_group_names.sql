-- Migration 112: simplify visible group names.
-- Keeps stable group ids unchanged.

UPDATE public.category_groups
SET
  label = 'Construcción',
  label_en = 'Construction',
  updated_at = now()
WHERE id = 'construccion_ingenieria';

UPDATE public.category_groups
SET
  label = 'Moda',
  label_en = 'Fashion',
  updated_at = now()
WHERE id = 'moda_y_cuidado_personal';

UPDATE public.category_groups
SET
  label = 'Vehículos',
  label_en = 'Vehicles',
  updated_at = now()
WHERE id = 'automotriz';

NOTIFY pgrst, 'reload schema';
