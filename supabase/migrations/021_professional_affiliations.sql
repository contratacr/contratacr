-- Migration 021: flexible professional identity.
-- A professional may work under their own name, a brand/business name
-- (business_name, added in 019), and/or be affiliated with one or more
-- institutions/workplaces they didn't create. All optional. Idempotent.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS affiliations text[] NOT NULL DEFAULT '{}';

-- business_name already exists from migration 019; ensure it's present.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS business_name text;

-- account_type (from 019) is no longer used by the app — the binary
-- persona física / empresa choice was replaced by this flexible model.
-- It is left in place (nullable, harmless) for backward compatibility.

NOTIFY pgrst, 'reload schema';
