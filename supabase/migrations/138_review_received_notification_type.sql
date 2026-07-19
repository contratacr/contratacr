-- Allow in-app notifications when a professional receives a review.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'review_request',
    'review_received',
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
    'project_proposal_declined',
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
    'suggestion_rejected',
    'direct_message'
  ));
