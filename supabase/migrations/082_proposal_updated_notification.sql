-- Migration 082: allow proposal update notifications
-- ---------------------------------------------------------------------------
-- When a professional edits a pending proposal, the client should see the change
-- immediately in-app and from the notifications center.

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
    'proposal_updated',
    'proposal_withdrawn',
    'proposal_accepted',
    'new_project',
    'project_proposal_accepted',
    'project_proposal_declined',
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

NOTIFY pgrst, 'reload schema';
