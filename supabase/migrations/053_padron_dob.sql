-- Migration 053: optional birth date in the padrón so HEALTH-category bookings can
-- AUTOCOMPLETE the beneficiary's fecha de nacimiento from the cédula (instead of
-- asking manually). The plumbing (route -> verifier -> booking auto-fill) already
-- exists; the only missing piece was the data layer not carrying a birth date.
--
-- NOTE: the TSE electoral roll itself does NOT include a birth date. This column
-- is populated only when a DOB-bearing dataset (e.g. Registro Civil) is loaded.
-- When it's empty for a given cédula, the booking flow falls back to MANUAL entry
-- (unchanged behavior) — and a cédula NOT in the padrón is still asked manually.
--
-- Privacy is preserved exactly as before: the padrón table stays private and is
-- read ONLY server-side through the SECURITY DEFINER `padron_lookup` RPC
-- (EXECUTE granted to service_role only). Idempotent — run in the SQL Editor.

ALTER TABLE public.padron         ADD COLUMN IF NOT EXISTS fecha_nacimiento date;
ALTER TABLE public.padron_staging ADD COLUMN IF NOT EXISTS fecha_nacimiento date;

-- Keep the new column across atomic reloads (staging is recreated on each swap).
CREATE OR REPLACE FUNCTION public.finalize_padron_swap()
RETURNS void AS $$
BEGIN
  DROP TABLE IF EXISTS public.padron_old;
  ALTER TABLE IF EXISTS public.padron RENAME TO padron_old;
  ALTER TABLE public.padron_staging RENAME TO padron;
  CREATE TABLE public.padron_staging (
    cedula text PRIMARY KEY, nombre text, papellido text, sapellido text,
    fecha_nacimiento date
  );
  ALTER TABLE public.padron_staging ENABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS public.padron_old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC now also returns the birth date (server-side only; padrón stays private).
CREATE OR REPLACE FUNCTION public.padron_lookup(p_cedula text)
RETURNS TABLE (nombre text, papellido text, sapellido text, fecha_nacimiento date)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.nombre, p.papellido, p.sapellido, p.fecha_nacimiento
  FROM public.padron p
  WHERE p.cedula = p_cedula
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.padron_lookup(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.padron_lookup(text) TO service_role;

NOTIFY pgrst, 'reload schema';
