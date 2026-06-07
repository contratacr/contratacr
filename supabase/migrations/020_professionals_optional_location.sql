-- Migration 020: province & canton are optional for professionals now
-- (sprint 17 made them optional in the UI). Drop NOT NULL so registration
-- without a location no longer fails. Idempotent.

ALTER TABLE public.professionals ALTER COLUMN provincia_id DROP NOT NULL;
ALTER TABLE public.professionals ALTER COLUMN canton_id DROP NOT NULL;

-- Bio is also optional (service description requirement was removed).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'professionals' AND column_name = 'bio' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.professionals ALTER COLUMN bio DROP NOT NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
