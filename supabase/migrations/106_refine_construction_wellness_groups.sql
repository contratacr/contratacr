-- Migration 106: refine construction/engineering and wellness groups.
-- Only changes group placement and group icons. Service ids and user links stay intact.

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order, is_hidden)
VALUES
  ('construccion_ingenieria', 'Construcción e ingeniería', 'Construction & engineering', 'hard-hat', 15, false),
  ('bienestar', 'Bienestar', 'Wellness', 'heart-handshake', 40, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_hidden = false,
  updated_at = now();

UPDATE public.categories
SET group_id = 'construccion_ingenieria'
WHERE id IN (
  'construccion',
  'maestro_obras',
  'remodelacion',
  'ingenieria_civil',
  'ingenieria_electrica',
  'ingenieria_mecanica',
  'arquitectura',
  'topografia'
);

UPDATE public.category_groups
SET icon_key = 'heart-handshake', updated_at = now()
WHERE id = 'bienestar';
