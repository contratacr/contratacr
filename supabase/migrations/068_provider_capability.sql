-- Migration 068: ONE account, two capabilities (Airbnb-style host model)
-- ---------------------------------------------------------------------------
-- An account ALWAYS can SEEK (search/hire) — that needs no flag, it's implicit.
-- OFFERING services is a CAPABILITY that is UNLOCKED by completing the
-- professional profile (= having a `professionals` row), exactly like Airbnb
-- unlocks "hosting" when you publish a listing.
--
-- `profiles.is_provider` makes that capability first-class and queryable, and a
-- trigger keeps it AUTHORITATIVE (drift-proof): it flips true the moment a
-- professional profile is created and false if it is ever removed. The legacy
-- `profiles.role` column is retained for back-compat (admin/notifications/RLS),
-- but the app now reasons about capabilities via `is_provider` (offer) +
-- the always-on seek capability — not a fixed "client vs professional" identity.

-- 1) The capability flag --------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_provider boolean NOT NULL DEFAULT false;

-- 2) Backfill from the existing model: anyone who already has a professional
--    profile (or the legacy role) can offer.
UPDATE public.profiles p
SET is_provider = true
WHERE p.is_provider = false
  AND (p.role = 'professional'
       OR EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.profile_id = p.id));

-- 3) Keep it authoritative: a professional profile created/removed toggles the
--    capability automatically, so it can never drift from reality.
CREATE OR REPLACE FUNCTION public.sync_is_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET is_provider = true WHERE id = NEW.profile_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE profile_id = OLD.profile_id) THEN
      UPDATE public.profiles SET is_provider = false WHERE id = OLD.profile_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS professionals_sync_is_provider ON public.professionals;
CREATE TRIGGER professionals_sync_is_provider
  AFTER INSERT OR DELETE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.sync_is_provider();

-- 4) Make the capability readable client-side alongside `role` (it is not
--    sensitive — it only says "this account can offer services"). The owner's
--    full row already comes back through `get_my_profile()` (select *), so the
--    new column is automatically available there too.
GRANT SELECT (is_provider) ON public.profiles TO anon, authenticated;

-- Reload PostgREST so the new column + grant take effect immediately.
NOTIFY pgrst, 'reload schema';
