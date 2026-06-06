-- Migration 016: Multi-profession support for professionals
-- A professional can offer services across MORE THAN ONE profession.
-- `category_id` remains the PRIMARY profession (kept for display / back-compat);
-- `professions` holds the full set (always includes the primary).
-- Project visibility is filtered against this set so a project is only shown to
-- professionals whose professions include the project's category.
-- Idempotent.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS professions text[] NOT NULL DEFAULT '{}'::text[];

-- Backfill: seed professions from the existing primary category.
UPDATE public.professionals
SET professions = ARRAY[category_id]
WHERE category_id IS NOT NULL
  AND (professions IS NULL OR professions = '{}'::text[]);

-- Helps the project-browse filter (`category_id = ANY(professions)`).
CREATE INDEX IF NOT EXISTS professionals_professions_idx
  ON public.professionals USING GIN (professions);

NOTIFY pgrst, 'reload schema';
