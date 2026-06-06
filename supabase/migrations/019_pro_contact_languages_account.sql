-- Migration 019: professional contact preference, languages, and account type.
-- Idempotent — safe to run multiple times.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS contact_preference text NOT NULL DEFAULT 'ambas',
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS business_name text;

-- Constrain the enumerated columns to known values.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'professionals_contact_preference_check') THEN
    ALTER TABLE public.professionals
      ADD CONSTRAINT professionals_contact_preference_check
      CHECK (contact_preference IN ('solo_whatsapp', 'solo_citas', 'ambas'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'professionals_account_type_check') THEN
    ALTER TABLE public.professionals
      ADD CONSTRAINT professionals_account_type_check
      CHECK (account_type IN ('individual', 'empresa'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
