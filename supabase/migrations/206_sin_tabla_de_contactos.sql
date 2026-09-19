-- Se retira `contact_leads` y el aviso que la acompañaba.
--
-- Vivieron un día. La idea era que el profesional supiera quién lo buscó, pero
-- decirle «casi te contactan» no le sirve: si de verdad lo contactan, se entera
-- solo, porque WhatsApp le muestra el número de quien le escribe.
--
-- Quién buscó a quién se sigue registrando donde siempre, en
-- `interaction_events` —con el profesional, el servicio, la fecha y la huella
-- anónima de la visita— y de ahí lo lee el panel de administración. Esa tabla
-- tiene el historial desde julio; la que se borra tenía un día.

drop table if exists public.contact_leads;

-- Los avisos de ese tipo se van con la tabla: apuntaban a filas que dejan de
-- existir y el app ya no sabe pintarlos. Sin este borrado la regla de abajo
-- choca con ellos (23514) y la migración entera se revierte: pasó en test el
-- 18-sep-2026, con 9 avisos.
delete from public.notifications where type = 'contact_lead';

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
    'counterparty_account_deleted'
  ));

-- El evento `contact_lead_created` tampoco se usa: la lista vuelve a la de 187.
alter table public.interaction_events
  drop constraint if exists interaction_events_event_type_check;

alter table public.interaction_events
  add constraint interaction_events_event_type_check
  check (event_type in (
    'profile_view',
    'whatsapp_click',
    'phone_click',
    'availability_view',
    'schedule_slot_selected',
    'favorite_add',
    'favorite_remove',
    'profile_share',
    'external_link_click',
    'service_request_started',
    'service_request_created',
    'project_published',
    'proposal_sent',
    'proposal_accepted',
    'review_created',
    'search_performed',
    'job_view',
    'job_application_sent',
    'offer_view',
    'assistant_question',
    'page_freeze',
    'contact_gate_shown',
    -- Histórico: ya nadie lo escribe, pero las filas que existen se conservan
    -- (es el registro de métricas). Sin él la regla chocaba con ellas (23514).
    'contact_lead_created'
  ));

notify pgrst, 'reload schema';
