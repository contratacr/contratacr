-- Migration 031: two-way reputation — professionals can report clients.
-- Repeated reports flag a client and surface to admin moderation. The platform
-- surfaces info; it does NOT warrant a client's identity (pro confirms in person).
-- Idempotent.

-- Extend reports to also cover clients (reported_client_id) and record who reported.
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reported_client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reporter_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reports_client_idx ON public.reports(reported_client_id);

-- Client flag state (surfaced to professionals before they accept, and to admin).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS flag_count integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
