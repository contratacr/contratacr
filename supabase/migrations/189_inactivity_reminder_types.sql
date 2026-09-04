-- Migration 189: notification types for the inactivity reminders.
--
-- Nothing in the app warns BEFORE something is forgotten. A daily job now
-- looks for work that has been stalled for 3 and 7 days and sends one notice
-- to whoever can act on it. Those notices need their own types, and so does
-- the professional's "retirarme del proyecto" action shipped alongside them —
-- without the allowlist entry the INSERT fails silently and the client is
-- never told the professional stepped away.
--
-- Idempotent: safe to re-run.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'review_request','review_received','booking_received','booking_confirmed','booking_completed',
    'booking_completed_by_client','booking_cancelled','booking_cancelled_by_client',
    'booking_rescheduled','booking_update','proposal_received','proposal_withdrawn',
    'proposal_accepted','project_proposal_declined','proposal_updated','new_project',
    'project_proposal_accepted','project_work_done','project_completed','project_cancelled',
    'project_deleted','support_reply','verification','verification_approved',
    'verification_rejected','verification_appeal_received','verification_reverted',
    'verification_pending','suggestion_approved','suggestion_rejected','direct_message',
    'professional_follow','followed_professional_activity','job_application','job_application_status',
    'verification_outreach','project_professional_withdrew',
    'project_proposals_waiting','booking_pending_reminder','project_in_progress_idle',
    'project_confirmation_pending','booking_past_date_idle'
  ));

-- El trabajo diario busca lo detenido por estado y fecha. Sin estos índices
-- cada corrida recorre las tablas enteras.
create index if not exists idx_proposals_pending_created
  on public.proposals (created_at)
  where status = 'pending';

create index if not exists idx_bookings_pending_created
  on public.bookings (created_at)
  where status = 'pending';

create index if not exists idx_projects_in_progress_updated
  on public.projects (updated_at)
  where status = 'in_progress';

create index if not exists idx_projects_awaiting_confirmation_work_done
  on public.projects (work_done_at)
  where status = 'awaiting_confirmation';

create index if not exists idx_bookings_confirmed_scheduled
  on public.bookings (scheduled_date)
  where status = 'confirmed';

-- La comprobación de "ya avisé" consulta por persona y tipo.
create index if not exists idx_notifications_user_type_created
  on public.notifications (user_id, type, created_at desc);

notify pgrst, 'reload schema';
