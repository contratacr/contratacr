-- Migration 029: moderation surface for the re-scoped admin panel.
-- - reports table (persist profile reports/complaints for the admin to action).
-- - ban/flag columns on professionals (revoke from search, audit who/when/why).
-- Idempotent.

-- ── Reports ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id                 uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  professional_id    uuid        REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_slug  text,
  professional_name  text,
  reason             text        NOT NULL,
  reporter_email     text,
  status             text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_professional_idx ON public.reports(professional_id);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
-- No public policies → only the service-role client (admin APIs) can read/write.

-- ── Ban / flag on professionals ────────────────────────────────────────────
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS banned_reason text;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS banned_at timestamptz;

-- Audit-log actions for moderation reuse provider_verification_log (free-text action).

NOTIFY pgrst, 'reload schema';
