-- Sprint 32: schedules belong to a (profession/service + location) pair, not just
-- a location. A professional with multiple professions (e.g. nutricionista +
-- entrenador) and multiple locations sets hours per profession per location, so a
-- client searching a given service at a given place sees only the matching hours.
ALTER TABLE public.availability_slots ADD COLUMN IF NOT EXISTS category_id text;

NOTIFY pgrst, 'reload schema';
