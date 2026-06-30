-- Migration 080: notification reliability + public schedule consistency
-- ---------------------------------------------------------------------------
-- The app now creates the modern notification rows from API routes, where each
-- action can attach the correct dashboard link and target id. Old DB triggers
-- generated duplicate/stale rows for the same actions, so only the proposal
-- created trigger remains useful.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'review_request',
    'booking_received',
    'booking_confirmed',
    'booking_completed',
    'booking_completed_by_client',
    'booking_cancelled',
    'booking_cancelled_by_client',
    'booking_rescheduled',
    'booking_update',
    'proposal_received',
    'proposal_withdrawn',
    'proposal_accepted',
    'new_project',
    'project_proposal_accepted',
    'project_work_done',
    'project_completed',
    'project_cancelled',
    'project_deleted',
    'support_reply',
    'verification',
    'verification_approved',
    'verification_rejected',
    'verification_appeal_received',
    'verification_reverted',
    'verification_pending'
  ));

DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
DROP TRIGGER IF EXISTS on_booking_completed ON public.bookings;
DROP TRIGGER IF EXISTS on_booking_confirmed ON public.bookings;
DROP TRIGGER IF EXISTS on_proposal_accepted ON public.proposals;

DROP FUNCTION IF EXISTS public.notify_professional_on_booking();
DROP FUNCTION IF EXISTS public.notify_client_review_request();
DROP FUNCTION IF EXISTS public.notify_client_on_booking_confirmed();
DROP FUNCTION IF EXISTS public.notify_pro_on_proposal_accepted();

DROP INDEX IF EXISTS public.bookings_active_slot_uidx;
CREATE UNIQUE INDEX bookings_active_slot_uidx
  ON public.bookings (professional_id, scheduled_date, scheduled_time)
  WHERE status IN ('pending', 'confirmed', 'in_progress', 'awaiting_confirmation')
    AND scheduled_date IS NOT NULL
    AND scheduled_time IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'projects'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'proposals'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.proposals;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'availability_slots'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.availability_slots;
    END IF;
  END IF;
END $$;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.proposals REPLICA IDENTITY FULL;
ALTER TABLE public.availability_slots REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
