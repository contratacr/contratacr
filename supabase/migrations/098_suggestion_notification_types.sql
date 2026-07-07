-- Migration 098: notifications suggestion review types
-- Allow in-app notifications for approved/rejected category suggestions.

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
    'proposal_updated',
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
    'verification_pending',
    'suggestion_approved',
    'suggestion_rejected'
  ));