-- Migration 072: admin-managed category flags for video consult.
-- `es_salud` already drives DOB/booking-for-someone-else. This adds the same
-- operational control for videoconsulta so admins can adjust categories without
-- a code deploy.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS supports_videoconsulta boolean NOT NULL DEFAULT false;

UPDATE public.categories
SET supports_videoconsulta = true
WHERE id IN (
  'nutricion', 'psicologia', 'medicina_domicilio',
  'terapia_lenguaje', 'terapia_ocupacional',
  'contabilidad', 'legal', 'consultoria', 'traduccion',
  'recursos_humanos', 'marketing_digital', 'bienes_raices',
  'arquitectura', 'ingenieria_civil',
  'desarrollo_web', 'diseno_grafico', 'diseno_apps', 'soporte_tecnico',
  'tutorias', 'idiomas', 'musica', 'matematicas',
  'preparacion_universitaria', 'entrenamiento_personal'
);

NOTIFY pgrst, 'reload schema';
