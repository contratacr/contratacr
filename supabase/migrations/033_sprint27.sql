-- Migration 033 (sprint 27): hierarchical travel coverage, DB-backed insurers +
-- suggestion tickets, per-service casos de éxito, booking completion lifecycle.
-- Idempotent.

-- ── Hierarchical travel coverage ──────────────────────────────────────────────
-- coverage_areas (jsonb) already holds cantón-level pairs. Add whole-provincia and
-- whole-country coverage so /buscar can match via the hierarchy (cantón ⊂ provincia
-- ⊂ país) instead of exact text.
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS coverage_provincias text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS coverage_country boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS professionals_coverage_provincias_idx ON public.professionals USING gin (coverage_provincias);

-- ── Per-service casos de éxito ────────────────────────────────────────────────
-- Work photos attached per profession/service: [{ url, profession }]. Replaces the
-- flat portfolio_urls for display; portfolio_urls is kept for back-compat.
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS portfolio_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── DB-backed insurers + suggestion tickets ───────────────────────────────────
-- The static official list lives in code (lib/data/insurers.ts). This table holds
-- admin-approved additions AND pending suggestions. approved=true ⇒ filterable for
-- everyone; approved=false ⇒ a tracked suggestion in the admin moderation panel.
CREATE TABLE IF NOT EXISTS public.insurers (
  id text PRIMARY KEY,
  label text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',          -- 'pending' | 'approved' | 'rejected'
  suggested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  suggested_name text,                              -- raw text the user typed
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE public.insurers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurers_read_approved ON public.insurers;
CREATE POLICY insurers_read_approved ON public.insurers FOR SELECT USING (approved = true);
DROP POLICY IF EXISTS insurers_suggest ON public.insurers;
CREATE POLICY insurers_suggest ON public.insurers FOR INSERT WITH CHECK (auth.uid() = suggested_by);

-- ── Booking completion lifecycle (parity with projects) ───────────────────────
-- pro marks "trabajo realizado" → awaiting_confirmation; client confirms → completed
-- (lazy auto-confirm after 7 days). Either party can cancel with a reason.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS work_done_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancelled_by text;        -- 'client' | 'professional'
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancel_reason text;

-- bookings.status may have a CHECK constraint; widen it to include the new state.
DO $$
BEGIN
  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
