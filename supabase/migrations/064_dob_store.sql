-- Migration 064: persistent DATE OF BIRTH for MEDICAL bookings, stored backend-only.
-- The TSE padrón has NO birth date, so DOB CANNOT be auto-filled from the cédula. Instead
-- it's asked once for health services and remembered for reuse — and NEVER surfaced as a
-- visible field in the profile/account UI.

-- 1) Account holder's DOB. It lives on `profiles` but is NOT in the public/anon column
--    grants (migration 047 revoked blanket SELECT and granted back only the public-safe
--    columns), so it is readable ONLY by the owner via `get_my_profile()` (which does
--    `select *` of the caller's own row) — the app uses it to pre-fill future medical
--    requests; it is never shown as an account setting.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;

-- 2) Per-account beneficiary DOB, keyed by the beneficiary's cédula, so booking for the
--    same person again pre-fills their DOB. OWNER-SCOPED (privacy: each client only ever
--    sees/reuses their OWN saved entries — never a global PII registry of people's DOBs).
CREATE TABLE IF NOT EXISTS public.beneficiary_dob (
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cedula     text NOT NULL,
  dob        date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, cedula)
);
ALTER TABLE public.beneficiary_dob ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own beneficiary dob" ON public.beneficiary_dob;
CREATE POLICY "own beneficiary dob" ON public.beneficiary_dob
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beneficiary_dob TO authenticated;

NOTIFY pgrst, 'reload schema';
