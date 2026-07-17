-- Migration 105: restore Beauty and Fashion/accessories as first-class groups.
-- This only changes category group placement. Service ids and professional
-- relationships remain untouched.

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order, is_hidden)
VALUES
  ('belleza', 'Belleza', 'Beauty & aesthetics', 'star', 42, false),
  ('moda_y_cuidado_personal', 'Moda y accesorios', 'Fashion & accessories', 'shirt', 44, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_hidden = false,
  updated_at = now();

UPDATE public.categories
SET group_id = 'belleza'
WHERE id IN (
  'belleza',
  'peluqueria',
  'maquillaje',
  'unhas',
  'pestanas',
  'depilacion',
  'estetica_facial',
  'spa',
  'bronceado'
);

UPDATE public.categories
SET group_id = 'moda_y_cuidado_personal'
WHERE id IN (
  'costura_y_arreglos_de_ropa',
  'lavanderia',
  'zapateria',
  'relojeria',
  'joyeria'
);

UPDATE public.categories
SET group_id = 'bienestar'
WHERE id IN (
  'entrenamiento_personal',
  'entrenamiento_deportivo',
  'masajes',
  'acupuntura',
  'coaching'
);
