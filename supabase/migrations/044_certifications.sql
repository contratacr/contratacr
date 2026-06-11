-- 044_certifications.sql
-- Professional certifications as TEXT entries (no images): each entry is
-- { id, name, institution?, year? }. Listed as-is (authenticity not verified yet;
-- optional admin verification is a future enhancement).

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS certifications jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
