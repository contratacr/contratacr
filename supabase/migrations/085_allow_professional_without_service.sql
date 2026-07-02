-- Allow a professional to temporarily have no selected services.
-- The dashboard treats this as an incomplete profile; public search filters out
-- professionals without at least one active service.

ALTER TABLE public.professionals
  ALTER COLUMN category_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
