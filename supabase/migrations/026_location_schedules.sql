-- Migration 026: per-location availability + videoconsulta.
-- Schedules now belong to a (professional, location) pair. location_id is:
--   - a workplace id (from professionals.workplaces[].id),
--   - the literal 'videoconsulta', or
--   - NULL  → "General / todas las ubicaciones" (back-compat for existing slots).
-- Idempotent.

ALTER TABLE public.availability_slots ADD COLUMN IF NOT EXISTS location_id text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS videoconsulta boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS availability_slots_location_idx
  ON public.availability_slots(professional_id, location_id);

NOTIFY pgrst, 'reload schema';
