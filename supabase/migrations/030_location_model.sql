-- Migration 030: location model — pins as the single source of truth.
-- - workplaces (jsonb) pins now also carry derived provinciaId/cantonId/distrito
--   (schemaless jsonb — no DDL needed for those per-pin fields).
-- - coverage_areas: provincia+cantón pairs the pro travels to ("me desplazo").
-- - search_provincias / search_cantones: denormalized arrays (workplaces +
--   coverage) so /buscar can match every zone a pro covers with an array contains.
-- Idempotent.

ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS coverage_areas jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS search_provincias text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS search_cantones text[] NOT NULL DEFAULT '{}';

-- GIN indexes for fast array-contains (.cs) lookups from search.
CREATE INDEX IF NOT EXISTS professionals_search_cantones_idx ON public.professionals USING gin (search_cantones);
CREATE INDEX IF NOT EXISTS professionals_search_provincias_idx ON public.professionals USING gin (search_provincias);

NOTIFY pgrst, 'reload schema';
