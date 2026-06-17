-- 058_profiles_cedula_nullable.sql
-- ============================================================================
-- Clients register WITHOUT a cédula (it's collected later, at booking /
-- completar-perfil — see sprint 179). So the profile-creation step — the auth
-- `handle_new_user` trigger AND /api/register/client — MUST succeed with a NULL
-- cédula.
--
-- 001 created `profiles.cedula` as `text unique NOT NULL`; 003 & 005 dropped the
-- NOT NULL. This RE-ASSERTS nullable in case the live DB drifted back to NOT NULL
-- (which is exactly what broke manual client signup after the cédula field was
-- removed: the trigger's profile-insert was swallowed by its EXCEPTION handler,
-- and the API insert — which used to carry the cédula — then violated the
-- constraint, leaving an orphaned auth user + the generic "No pudimos crear tu
-- cuenta" error).
--
-- Idempotent and safe: professionals still provide a cédula in their own flow;
-- the UNIQUE index on cédula stays PARTIAL (007: only WHERE cedula IS NOT NULL),
-- so any number of NULL-cédula clients are allowed.
-- ============================================================================

ALTER TABLE public.profiles ALTER COLUMN cedula DROP NOT NULL;

-- Reload PostgREST so the relaxed constraint takes effect immediately.
NOTIFY pgrst, 'reload schema';
