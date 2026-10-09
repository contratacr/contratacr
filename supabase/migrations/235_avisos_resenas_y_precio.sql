-- DOS EMPUJONES AL PROFESIONAL EN LA CAMPANITA (9-oct-2026, Isaac).
--
-- «Pide tus primeras reseñas» y «Agrega un precio de referencia» salían como
-- tarjetas fijas en el panel; ahora viven en la lista de pasos y el empujón
-- llega por notificación (y push). Medido ese día: de 315 profesionales
-- activos, 300 sin reseñas y 299 sin un precio real.
--
-- Lección de la 231: el tipo va en la base ANTES que en el código. La lista
-- se copia de la 231, la última que tocó esta regla.

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
    'project_confirmation_pending','booking_past_date_idle',
    'job_applications_waiting','quote_awaiting_client',
    'quote_sent','quote_accepted','quote_declined','pricing_request',
    'counterparty_account_deleted',
    -- Invitación a dejar una reseña en Google, dentro del app.
    'resena_google','new_job',
    -- «¿Necesitas a alguien?» (publicar un proyecto) y «Completa tu perfil».
    'invita_proyecto','completa_perfil',
    -- Empujones al profesional (9-oct-2026): primera reseña y precio de referencia.
    'pide_resenas','agrega_precio'
  ));

notify pgrst, 'reload schema';
