-- Migration 181: add the medical/dental equipment services.
--
-- Motivation: the catalog had no service for medical or dental equipment.
-- The closest entries (Ingeniería mecánica/eléctrica/industrial) are all
-- construction and industry, and Odontología is the dentist, not whoever
-- services the dental chair. Providers like "Seprodental e Ingeniería Médica"
-- had nowhere to register, and a clinic looking to calibrate an autoclave
-- could not find them.
--
-- Two services instead of one: buying equipment and servicing equipment are
-- different searches.
--
-- Group `profesional` ("Empresas"): the buyer is a business (clinic, dental
-- office), not a patient browsing the health section.
--
-- es_salud = false ON PURPOSE. The suggestion classifier flags anything
-- containing "médico" as health, which would attach the insurer filter and the
-- health-professional profile fields to a company that sells and repairs
-- equipment. Same precedent as `farmacia`.
--
-- Additive only: no existing category is renamed, hidden or reassigned, and no
-- professional row is touched.

INSERT INTO public.categories (
  id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta
)
VALUES
  (
    'mantenimiento_equipo_medico',
    'Mantenimiento de equipo médico',
    'Medical equipment maintenance',
    'profesional',
    false,
    false,
    false
  ),
  (
    'venta_equipo_medico_dental',
    'Venta de equipo médico y dental',
    'Medical & dental equipment sales',
    'profesional',
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
  supports_videoconsulta = false;

NOTIFY pgrst, 'reload schema';
