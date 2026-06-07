-- Migration 024: Two-sided project completion lifecycle + delete support.
-- Lifecycle: open → in_progress (proposal accepted) → awaiting_confirmation
-- (pro marks "trabajo realizado") → completed (client confirms, or auto after 7d).
-- Idempotent — safe to re-run.

-- Project status values + completion timestamps + accepted pro.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('open', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled'));

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS work_done_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS accepted_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;

-- Notification types for the completion flow.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'review_request','booking_received','booking_confirmed','booking_completed',
    'booking_cancelled','booking_rescheduled','proposal_received','proposal_accepted','new_project',
    'verification_approved','verification_rejected','verification_appeal_received','verification_reverted',
    'project_proposal_accepted','project_work_done','project_completed'
  ));

NOTIFY pgrst, 'reload schema';
