-- Migration 088: broaden Automotriz to Vehículos y movilidad.
-- Keeps the stable group id `automotriz` so existing services/profiles do not break.

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order, is_hidden, updated_at)
VALUES ('automotriz', 'Vehículos y movilidad', 'Vehicles & Mobility', 'car', 120, false, now())
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = COALESCE(public.category_groups.icon_key, EXCLUDED.icon_key),
  sort_order = EXCLUDED.sort_order,
  is_hidden = false,
  updated_at = now();

UPDATE public.categories
SET group_id = 'automotriz',
    is_hidden = false,
    es_salud = false,
    supports_videoconsulta = false,
    updated_at = now()
WHERE id = 'mecanica_bicicletas';

NOTIFY pgrst, 'reload schema';
