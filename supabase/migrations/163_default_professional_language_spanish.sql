-- Spanish is the implicit service language for Costa Rican professionals.
-- Persist it so filtering, public profiles and completion state agree.

ALTER TABLE public.professionals
  ALTER COLUMN languages SET DEFAULT ARRAY['es']::text[];

UPDATE public.professionals
SET languages = ARRAY['es']::text[]
WHERE languages IS NULL OR cardinality(languages) = 0;
