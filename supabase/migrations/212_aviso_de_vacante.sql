-- UNA VACANTE NUEVA LE SUENA A QUIEN HACE ESE OFICIO.
--
-- Hasta hoy, publicar un empleo no avisaba a nadie: quien buscaba trabajo tenía
-- que entrar al tablero por su cuenta. Un proyecto sí avisa a los profesionales
-- de su categoría desde que existe, y un empleo es la misma clase de aviso —hay
-- trabajo y hay que enterarse—, no publicidad. Las promociones siguen sin
-- notificar a propósito: la oferta se busca, no se empuja.
--
-- El servicio de la vacante lo ELIGE quien publica, de la misma lista de
-- siempre (`job_posts.service_category_id`, que existía sin usarse). No se
-- deduce del título: «Mecánico Diésel» le caería también a los mecánicos
-- industriales, y un par de avisos equivocados bastan para que alguien apague
-- las notificaciones para siempre.
--
-- Aquí solo se agrega el tipo a la lista permitida. El aviso viaja por campana
-- y push, que no cuestan; el correo queda fuera mientras el plan siga en 300
-- diarios compartidos con recuperar contraseña y responder soporte.

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
    'counterparty_account_deleted','new_job'
  ));
