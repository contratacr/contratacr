-- Migration 035 (sprint 29): per-finished-job reviews. A client can review EACH
-- completed booking/project separately (not one global review per professional).
-- Idempotent.

-- Tie each review to its specific solicitud (booking) or proyecto (project).
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- Drop the old one-review-per-(professional, client) constraint so multiple
-- per-job reviews are allowed. The auto-generated name is reviews_professional_id_client_id_key.
DO $$
BEGIN
  ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_professional_id_client_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
-- Older deployments may have named it differently; drop any unique constraint that
-- spans exactly (professional_id, client_id).
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.reviews'::regclass AND contype = 'u'
     AND array_length(conkey, 1) = 2
     AND conkey @> ARRAY[
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.reviews'::regclass AND attname='professional_id'),
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.reviews'::regclass AND attname='client_id')
     ]
   LIMIT 1;
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.reviews DROP CONSTRAINT %I', c); END IF;
END $$;

-- One review per finished item (per client). Partial unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_client_booking_uidx ON public.reviews (client_id, booking_id) WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_client_project_uidx ON public.reviews (client_id, project_id) WHERE project_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
