-- Migration 003: Real auth wiring
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ============================================================
-- 1. Make cedula nullable (OAuth / Google users won't have one)
-- ============================================================
ALTER TABLE public.profiles ALTER COLUMN cedula DROP NOT NULL;

-- ============================================================
-- 2. INSERT policy so users can create their own profile row
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- 3. INSERT policy on professionals
-- ============================================================
DROP POLICY IF EXISTS "Professionals can insert their own record" ON public.professionals;
CREATE POLICY "Professionals can insert their own record" ON public.professionals
  FOR INSERT WITH CHECK (
    auth.uid() = profile_id
  );

-- ============================================================
-- 4. Trigger: auto-create profile (+ professional row) on sign-up
--    Reads raw_user_meta_data set during supabase.auth.signUp()
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta         jsonb  := NEW.raw_user_meta_data;
  profile_role text   := COALESCE(meta->>'role', 'client');
  pro_slug     text;
BEGIN
  -- Insert profile (ignore duplicate if already created by a race)
  INSERT INTO public.profiles (id, email, full_name, cedula, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(meta->>'full_name', ''), split_part(NEW.email, '@', 1)),
    NULLIF(meta->>'cedula', ''),
    profile_role
  )
  ON CONFLICT (id) DO NOTHING;

  -- For professional sign-ups, also create the professionals row
  IF profile_role = 'professional'
     AND meta->>'category' IS NOT NULL
     AND meta->>'whatsapp' IS NOT NULL
  THEN
    pro_slug := lower(
      regexp_replace(
        COALESCE(NULLIF(meta->>'full_name', ''), split_part(NEW.email, '@', 1)),
        '[^a-zA-Z0-9]+', '-', 'g'
      )
    ) || '-' || substr(gen_random_uuid()::text, 1, 8);

    INSERT INTO public.professionals (
      profile_id,
      category_id,
      bio,
      whatsapp,
      provincia_id,
      canton_id,
      years_experience,
      hourly_rate,
      slug
    )
    VALUES (
      NEW.id,
      meta->>'category',
      COALESCE(NULLIF(meta->>'bio', ''), 'Profesional en ContrataCR'),
      meta->>'whatsapp',
      COALESCE(NULLIF(meta->>'province', ''), 'sj'),
      COALESCE(NULLIF(meta->>'canton', ''), 'sj-sj'),
      NULLIF(meta->>'years_experience', '')::integer,
      NULLIF(meta->>'hourly_rate', '')::integer,
      pro_slug
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
