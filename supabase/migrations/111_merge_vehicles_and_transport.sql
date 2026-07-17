-- Migration 111: merge Transporte into Automotriz as "Vehiculos".
-- Keeps service ids unchanged; only the visible group changes.

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order, is_hidden)
VALUES ('automotriz', U&'Veh\00EDculos', 'Vehicles', 'car', 50, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_hidden = false,
  updated_at = now();

UPDATE public.categories
SET group_id = 'automotriz'
WHERE group_id = 'transporte'
  AND id <> 'transporte_mascotas';

UPDATE public.categories
SET group_id = 'mascotas'
WHERE id = 'transporte_mascotas';

UPDATE public.category_groups
SET is_hidden = true, updated_at = now()
WHERE id = 'transporte';

NOTIFY pgrst, 'reload schema';
