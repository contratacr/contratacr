-- ============================================================
-- 006 — Add onboarding_completed flag to profiles
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Add column (no-op if it already exists)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- 2. Backfill all existing profiles as done
--    (every user before this migration went through the registration wizard)
UPDATE public.profiles SET onboarding_completed = true WHERE onboarding_completed = false;

-- 3. Update trigger to set onboarding_completed=true for email/password signups
--    (raw_user_meta_data->>'role' is set explicitly during registration)
--    OAuth users get role=NULL → onboarding_completed=false → sent to /onboarding
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, cedula, role, onboarding_completed)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        split_part(COALESCE(NEW.email, 'user@unknown.com'), '@', 1)
      ),
      NULLIF(NEW.raw_user_meta_data->>'cedula', ''),
      COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
      -- Email/password users set 'role' explicitly → onboarding done
      -- OAuth users have no 'role' in metadata → must go through /onboarding
      (NEW.raw_user_meta_data->>'role' IS NOT NULL)
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
