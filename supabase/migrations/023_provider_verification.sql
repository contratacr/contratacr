-- Migration 023: Admin role + "Proveedor Autorizado" verification system
-- Adds: admin role, provider verification lifecycle, audit trail, appeals,
-- and new notification types. Idempotent — safe to re-run.

-- ============================================================
-- 1. Admin role on profiles
--    Extend the role check to allow 'admin' (separate from client/professional).
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client', 'professional', 'admin'));

-- ============================================================
-- 2. Verification lifecycle on professionals
--    Replaces the binary is_verified flag with a status lifecycle.
--    is_verified is kept and mirrored (authorized => true) for back-compat.
-- ============================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.professionals DROP CONSTRAINT IF EXISTS professionals_verification_status_check;
ALTER TABLE public.professionals ADD CONSTRAINT professionals_verification_status_check
  CHECK (verification_status IN ('pending', 'authorized', 'rejected', 'under_appeal'));

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS verification_reason text;            -- latest rejection reason (provider-visible)
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS verification_updated_at timestamptz; -- when the status last changed

-- Backfill: any pre-existing verified pros become 'authorized'.
UPDATE public.professionals
  SET verification_status = 'authorized'
  WHERE is_verified = true AND verification_status = 'pending';

CREATE INDEX IF NOT EXISTS professionals_verification_status_idx
  ON public.professionals(verification_status);

-- ============================================================
-- 3. Audit trail — every verification decision (permanent record)
--    who (admin), when, action, from/to status, reason.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_verification_log (
  id              uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  professional_id uuid        REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
  admin_id        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_name      text,
  action          text        NOT NULL,        -- authorized | rejected | under_appeal | appeal_received | reverted_pending
  from_status     text,
  to_status       text,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_verification_log_pro_idx
  ON public.provider_verification_log(professional_id, created_at DESC);

ALTER TABLE public.provider_verification_log ENABLE ROW LEVEL SECURITY;
-- Service role (admin client) writes/reads. Owner may read their own history.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_verification_log' AND policyname = 'Owners read their verification log'
  ) THEN
    CREATE POLICY "Owners read their verification log" ON public.provider_verification_log
      FOR SELECT USING (
        auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id)
      );
  END IF;
END $$;

-- ============================================================
-- 4. Appeals — provider's in-app appeal text attached to the case
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_appeals (
  id              uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  professional_id uuid        REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
  message         text        NOT NULL,
  status          text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS provider_appeals_pro_idx
  ON public.provider_appeals(professional_id, created_at DESC);

ALTER TABLE public.provider_appeals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_appeals' AND policyname = 'Owners read their appeals'
  ) THEN
    CREATE POLICY "Owners read their appeals" ON public.provider_appeals
      FOR SELECT USING (
        auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id)
      );
  END IF;
END $$;

-- ============================================================
-- 5. Notification types — verification status changes
-- ============================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'review_request','booking_received','booking_confirmed','booking_completed',
    'booking_cancelled','booking_rescheduled','proposal_received','proposal_accepted','new_project',
    'verification_approved','verification_rejected','verification_appeal_received','verification_reverted'
  ));

NOTIFY pgrst, 'reload schema';
