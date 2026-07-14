ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS public_business_name_only boolean NOT NULL DEFAULT false;

UPDATE public.professionals
SET public_business_name_only = false
WHERE business_name IS NULL OR btrim(business_name) = '';
