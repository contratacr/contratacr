-- Los eventos de lo que el app hace HOY.
--
-- El panel medía citas y propuestas —retiradas— y no medía nada de lo que de
-- verdad pasa: cuántas cotizaciones se piden y cuántas se aceptan, los
-- mensajes internos de la app, los profesionales que escriben a un proyecto
-- del tablero (la única medida de si el tablero sirve), las verificaciones
-- aprobadas y los clics que llegan desde un correo de campaña.

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
    'email_click',
    'quote_created',
    'quote_accepted',
    'quote_declined',
    'internal_message_sent',
    'project_lead_whatsapp',
    'identity_verified',
    'campaign_click',
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
