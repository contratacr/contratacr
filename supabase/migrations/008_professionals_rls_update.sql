-- ============================================================
-- 008 — Allow professionals to update their own record
-- Safe to run multiple times (idempotent)
-- ============================================================

-- Without this policy, UPDATE calls from the client (anon key) are silently
-- ignored by RLS, so availability, profile edits, and portfolio photos
-- appear to save but are discarded on reload.

DROP POLICY IF EXISTS "Professionals can update their own record" ON public.professionals;
CREATE POLICY "Professionals can update their own record" ON public.professionals
  FOR UPDATE USING (auth.uid() = profile_id);

-- Also ensure SELECT is allowed so the dashboard can read their own data
DROP POLICY IF EXISTS "Professionals can read their own record" ON public.professionals;
CREATE POLICY "Professionals can read their own record" ON public.professionals
  FOR SELECT USING (true);  -- public read (profile pages need this too)
