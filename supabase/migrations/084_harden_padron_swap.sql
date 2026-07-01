-- Migration 084: harden the TSE padron refresh swap.
--
-- The padron refresh should never be callable by browser roles and should never
-- promote an empty/partial staging table. This function only touches padron data.

CREATE OR REPLACE FUNCTION public.finalize_padron_swap()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staging_count bigint;
BEGIN
  SELECT count(*) INTO staging_count FROM public.padron_staging;

  IF staging_count < 3000000 THEN
    RAISE EXCEPTION 'padron_staging has only % rows; refusing to swap', staging_count;
  END IF;

  DROP TABLE IF EXISTS public.padron_old;
  ALTER TABLE IF EXISTS public.padron RENAME TO padron_old;
  ALTER TABLE public.padron_staging RENAME TO padron;

  CREATE TABLE public.padron_staging (
    cedula text PRIMARY KEY,
    nombre text,
    papellido text,
    sapellido text
  );

  ALTER TABLE public.padron ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.padron_staging ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE public.padron, public.padron_staging FROM public, anon, authenticated;
  GRANT SELECT ON TABLE public.padron TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.padron_staging TO service_role;

  DROP TABLE IF EXISTS public.padron_old;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_padron_swap() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_padron_swap() TO service_role;

REVOKE ALL ON TABLE public.padron, public.padron_staging FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.padron TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.padron_staging TO service_role;

NOTIFY pgrst, 'reload schema';
