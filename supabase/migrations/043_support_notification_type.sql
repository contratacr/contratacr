-- 043_support_notification_type.sql
-- Allow the 'support_reply' notification type so an admin reply also lands in the
-- user's general Notifications (bell), tagged "Soporte", linking to the ticket.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'review_request','booking_received','booking_confirmed','booking_completed',
    'booking_cancelled','booking_rescheduled','proposal_received','proposal_accepted','new_project',
    'verification_approved','verification_rejected','verification_appeal_received','verification_reverted','verification_pending',
    'project_proposal_accepted','project_work_done','project_completed',
    'support_reply'
  ));

NOTIFY pgrst, 'reload schema';
