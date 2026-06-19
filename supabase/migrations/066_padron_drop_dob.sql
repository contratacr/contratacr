-- Migration 066: DROP the unused padrón birth-date column (reverses migration 053).
--
-- Migration 053 added `fecha_nacimiento` to padron / padron_staging + the padron_lookup
-- RPC, intending to AUTOCOMPLETE the DOB on health bookings from the cédula. That data
-- never materialized: the TSE electoral roll carries NO birth date (its date field is the
-- cédula's EXPIRY, not a DOB), and the loader (scripts/load-padron.mjs) only ever writes
-- cedula / nombre / papellido / sapellido — so `fecha_nacimiento` has always been NULL and
-- the auto-fill never fired. DOB is now collected manually and stored separately
-- (profiles.date_of_birth + beneficiary_dob, migration 064). The column is dead weight and
-- is removed here. Idempotent — safe to run in the SQL Editor.
--
-- This ONLY removes the obsolete birth-date column; the cédula-verification columns
-- (cedula, nombre, papellido, sapellido) and the lookup/name behavior are untouched.

-- 1) Drop the always-NULL column from both the live + staging tables.
ALTER TABLE public.padron         DROP COLUMN IF EXISTS fecha_nacimiento;
ALTER TABLE public.padron_staging DROP COLUMN IF EXISTS fecha_nacimiento;

-- 2) Recreate the lookup RPC WITHOUT fecha_nacimiento (back to the migration-050 shape).
--    DROP first: CREATE OR REPLACE cannot change a function's return type.
DROP FUNCTION IF EXISTS public.padron_lookup(text);

CREATE OR REPLACE FUNCTION public.padron_lookup(p_cedula text)
RETURNS TABLE (nombre text, papellido text, sapellido text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.nombre, p.papellido, p.sapellido
  FROM public.padron p
  WHERE p.cedula = p_cedula
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.padron_lookup(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.padron_lookup(text) TO service_role;

-- 3) Keep the atomic-reload swap in sync: recreate padron_staging WITHOUT the column.
CREATE OR REPLACE FUNCTION public.finalize_padron_swap()
RETURNS void AS $$
BEGIN
  DROP TABLE IF EXISTS public.padron_old;
  ALTER TABLE IF EXISTS public.padron RENAME TO padron_old;
  ALTER TABLE public.padron_staging RENAME TO padron;
  CREATE TABLE public.padron_staging (
    cedula text PRIMARY KEY, nombre text, papellido text, sapellido text
  );
  ALTER TABLE public.padron_staging ENABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS public.padron_old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
