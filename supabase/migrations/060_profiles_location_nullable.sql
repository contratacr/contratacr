-- 060_profiles_location_nullable.sql
-- ============================================================================
-- Clients no longer set a provincia/cantón at signup (they indicate location when
-- SEARCHING / REQUESTING A SERVICE, where it's actually used). So the profile-creation
-- step — the auth `handle_new_user` trigger AND /api/register/client — MUST succeed
-- with NULL provincia_id/canton_id on `profiles`.
--
-- These columns were added to `profiles` outside the tracked migrations, so their
-- nullability in the live DB is unknown. This DEFENSIVELY ensures they're NULLABLE —
-- the exact lesson from the cédula removal (058): a NOT NULL the trigger never sets
-- silently breaks signup (orphaned auth user + the generic "No pudimos crear tu
-- cuenta" error). Idempotent: dropping NOT NULL on an already-nullable column is a
-- no-op.
--
-- Professionals' location is on the `professionals` table (already nullable since 020)
-- and is untouched here. Clients still provide location at search / service request.
-- ============================================================================

ALTER TABLE public.profiles ALTER COLUMN provincia_id DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN canton_id   DROP NOT NULL;

-- Reload PostgREST so the relaxed constraints take effect immediately.
NOTIFY pgrst, 'reload schema';
