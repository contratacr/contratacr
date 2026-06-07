-- Migration 022: unified workplaces (fixed locations).
-- Replaces the separate "affiliations" text list + single fixed-location pin
-- with one structured list. Each entry: { id, name, address, lat, lng }.
-- Every entry is both a pin on /buscar and a workplace on the profile.
-- Idempotent.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS workplaces jsonb NOT NULL DEFAULT '[]'::jsonb;

-- affiliations (migration 021) is superseded by workplaces. Left in place
-- (nullable, harmless) for backward compatibility; no longer read by the app.

NOTIFY pgrst, 'reload schema';
