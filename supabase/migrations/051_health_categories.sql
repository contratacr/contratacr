-- Migration 051: complete the health (salud) taxonomy. Adds the home-health /
-- wellness categories that were missing from the catalog and flags every health
-- category with es_salud = true (drives the booking DOB question). Idempotent.
-- Run in the Supabase SQL Editor.

-- ── New health categories (id, name, icon) ─────────────────────────────────────
INSERT INTO public.categories (id, name, icon) VALUES
  ('medicina_domicilio',  'Medicina general a domicilio',          '🩺'),
  ('terapia_lenguaje',    'Terapia del lenguaje',                  '🗣️'),
  ('terapia_ocupacional', 'Terapia ocupacional',                   '🧩'),
  ('podologia',           'Podología',                             '🦶'),
  ('acupuntura',          'Acupuntura y medicina alternativa',     '📍'),
  ('cuidado_discapacidad','Cuidado de personas con discapacidad',  '♿')
ON CONFLICT (id) DO NOTHING;

-- ── es_salud flag: full, authoritative health set (never inferred from names) ──
UPDATE public.categories SET es_salud = true WHERE id IN (
  'entrenamiento_personal','nutricion','masajes','psicologia','fisioterapia',
  'enfermeria','medicina_domicilio','terapia_lenguaje','terapia_ocupacional',
  'podologia','acupuntura','cuidado_adultos','cuidado_discapacidad','cuidado_infantil'
);

NOTIFY pgrst, 'reload schema';
