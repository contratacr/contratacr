-- Migration 027: Automatic identity verification (TSE padrón) — "Identidad verificada".
-- - Self-hosted padrón reference table (matching only; data minimization).
-- - Verification result columns on professionals (store RESULT only, not padrón PII).
-- - Status renamed authorized → verified (legal-safe: identity, not authorization).
-- - Support tickets for failed-twice appeals.
-- Idempotent.

-- ============================================================
-- 1. Padrón reference table (matching data only — cédula + names)
--    Service-role only (no public RLS policies). NOT copied into profiles.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.padron (
  cedula     text PRIMARY KEY,
  nombre     text,
  papellido  text,
  sapellido  text
);
ALTER TABLE public.padron ENABLE ROW LEVEL SECURITY;
-- No policies → only the service-role client can read it (used by the verifier).

-- Staging table for safe atomic reloads (load here, then swap).
CREATE TABLE IF NOT EXISTS public.padron_staging (
  cedula     text PRIMARY KEY,
  nombre     text,
  papellido  text,
  sapellido  text
);
ALTER TABLE public.padron_staging ENABLE ROW LEVEL SECURITY;

-- Atomic swap: promote freshly-loaded staging to live, recreate empty staging.
-- Verification is never down mid-update (single transactional rename).
CREATE OR REPLACE FUNCTION public.finalize_padron_swap()
RETURNS void AS $$
BEGIN
  DROP TABLE IF EXISTS public.padron_old;
  ALTER TABLE IF EXISTS public.padron RENAME TO padron_old;
  ALTER TABLE public.padron_staging RENAME TO padron;
  CREATE TABLE public.padron_staging (
    cedula text PRIMARY KEY, nombre text, papellido text, sapellido text
  );
  ALTER TABLE public.padron_staging ENABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS public.padron_old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Verification RESULT columns on professionals (data minimization:
--    store only the outcome, never the padrón person data).
-- ============================================================
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS verification_method text;    -- 'automatic' | 'manual'
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS verification_provider text;   -- e.g. 'self_hosted_padron'
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Status: authorized → verified (identity-only badge).
UPDATE public.professionals SET verification_status = 'verified' WHERE verification_status = 'authorized';
ALTER TABLE public.professionals DROP CONSTRAINT IF EXISTS professionals_verification_status_check;
ALTER TABLE public.professionals ADD CONSTRAINT professionals_verification_status_check
  CHECK (verification_status IN ('pending', 'verified', 'rejected', 'under_appeal'));

-- ============================================================
-- 3. Support tickets — only created when an appeal re-run STILL fails
--    (the rare tail of the funnel the owner handles manually).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  professional_id uuid        REFERENCES public.professionals(id) ON DELETE CASCADE,
  type            text        NOT NULL DEFAULT 'verification',
  subject         text,
  detail          text,
  status          text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets(status, created_at DESC);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'Owners read their tickets') THEN
    CREATE POLICY "Owners read their tickets" ON public.support_tickets
      FOR SELECT USING (auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id));
  END IF;
END $$;

-- ============================================================
-- 4. Notification type for "pendiente de revisión".
-- ============================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'review_request','booking_received','booking_confirmed','booking_completed',
    'booking_cancelled','booking_rescheduled','proposal_received','proposal_accepted','new_project',
    'verification_approved','verification_rejected','verification_appeal_received','verification_reverted','verification_pending',
    'project_proposal_accepted','project_work_done','project_completed'
  ));

NOTIFY pgrst, 'reload schema';
