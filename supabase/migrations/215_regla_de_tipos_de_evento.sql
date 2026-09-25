-- Repone la regla de tipos de `interaction_events`, con `email_click`.
--
-- La migración 214 se escribió copiando el bloque de la 206 con una expresión
-- que cortaba en la primera línea en blanco: se llevó el `drop constraint` y
-- NO el `add constraint`. Resultado: la tabla quedó SIN regla, aceptando
-- cualquier texto como tipo de evento. Se detectó al probar contra la base de
-- prueba —un tipo inventado entró sin protestar— antes de tocar producción.
--
-- Esta migración deja la regla completa y con el tipo nuevo. Es idempotente:
-- vuelve a soltarla y a ponerla, así sirve igual sobre una base que ya pasó
-- por la 214 y sobre una base nueva.

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
