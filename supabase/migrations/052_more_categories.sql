-- Migration 052: extend the service catalog (Sprint 110).
-- Adds new hireable-service categories and completes the health set, flagging the
-- new health categories with es_salud = true (drives the booking DOB question).
-- Product-selling categories are intentionally excluded (ContrataCR lists services
-- you hire, not products). Idempotent — run in the Supabase SQL Editor.

-- ── New categories (id, name, icon) ────────────────────────────────────────────
INSERT INTO public.categories (id, name, icon) VALUES
  -- Hogar y construcción
  ('servicio_gas',                'Servicio de gas',                 '🔥'),
  ('reparacion_electrodomesticos','Reparación de electrodomésticos', '🔌'),
  -- Salud y bienestar
  ('odontologia',                 'Odontología',                     '🦷'),
  ('pediatria',                   'Pediatría',                       '🧒'),
  ('optometria',                  'Optometría',                      '👓'),
  ('entrenamiento_deportivo',     'Entrenamiento deportivo',         '⚽'),
  ('cuido_mascotas',              'Cuido y paseo de mascotas',       '🐾'),
  -- Eventos / gastronomía
  ('chef',                        'Chef privado y cocina',           '👨‍🍳')
ON CONFLICT (id) DO NOTHING;

-- Keep the general-medicine label in sync with the app taxonomy.
UPDATE public.categories SET name = 'Medicina general' WHERE id = 'medicina_domicilio';

-- ── es_salud: ONLY the genuinely health/medical additions (age matters). Sports
--    training and pet care are NOT health, so they never trigger the DOB step. ──
UPDATE public.categories SET es_salud = true WHERE id IN (
  'odontologia', 'pediatria', 'optometria'
);

NOTIFY pgrst, 'reload schema';
