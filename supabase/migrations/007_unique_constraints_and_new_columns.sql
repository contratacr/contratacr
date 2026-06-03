-- ============================================================
-- 007 — Unique constraints, new columns for professionals
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Add avatar_url to profiles (used for profile photos)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Add service-related columns to professionals
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS service_type text DEFAULT 'mobile';
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS address text;

-- 3. Unique index on profiles.email (partial: only where email is set)
--    Supabase auth already enforces email uniqueness on auth.users, this mirrors it on profiles.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique
  ON public.profiles (email)
  WHERE email IS NOT NULL AND email != '';

-- 4. Unique index on profiles.cedula (partial: only where cedula is set)
--    Multiple OAuth users can have NULL cedula — that is fine.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cedula_unique
  ON public.profiles (cedula)
  WHERE cedula IS NOT NULL AND cedula != '';

-- 5. RLS: allow users to update their own profile (needed for avatar_url updates)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
