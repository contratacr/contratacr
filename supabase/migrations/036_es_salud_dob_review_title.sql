-- Migration 036 (sprint 30): health-category flag driving DOB, client DOB on
-- bookings (health only), and a job-title snapshot on reviews. Idempotent.

-- ── es_salud flag on categories (drives DOB; never inferred from names) ────────
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS es_salud boolean NOT NULL DEFAULT false;
UPDATE public.categories SET es_salud = true WHERE id IN (
  'entrenamiento_personal','nutricion','masajes','psicologia','fisioterapia',
  'enfermeria','cuidado_adultos','cuidado_infantil'
);

-- ── Client DOB on bookings — stored ONLY for health-category solicitudes ───────
-- Data minimization (Ley 8968): non-health bookings never store DOB.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS client_dob date;

-- ── Job-title snapshot on reviews (so each per-job review shows its context) ───
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS job_title text;

NOTIFY pgrst, 'reload schema';
