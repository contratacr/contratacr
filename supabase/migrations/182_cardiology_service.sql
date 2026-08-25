-- Migration 182: add Cardiología as its own service.
--
-- The catalog already carves out Dermatología, Ginecología, Neurología,
-- Neumología, Urología, Ortopedia, Audiología and three surgical specialties,
-- but not cardiology — one of the most searched. A patient looking for a
-- cardiologist only found the generic "Médico especialista".
--
-- es_salud = true and supports_videoconsulta = true, matching the specialties
-- already in production (Dermatología, Ginecología, Neurología, Neumología,
-- Ortopedia). es_salud drives the insurer filter and the date-of-birth step;
-- both apply to a real clinical consult.
--
-- "cardiologo" stays in the keywords of `medico_especialista` on purpose, and
-- "corazon" was added there, so cardiologists already registered under that
-- service keep showing up for every heart-related search until they choose the
-- new one themselves.
--
-- Additive only: no existing category is renamed, hidden or reassigned, and no
-- professional row is touched.

INSERT INTO public.categories (
  id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta
)
VALUES (
  'cardiologia',
  'Cardiología',
  'Cardiology',
  'salud',
  false,
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  group_id = EXCLUDED.group_id,
  is_hidden = false,
  es_salud = true,
  supports_videoconsulta = true;

NOTIFY pgrst, 'reload schema';
