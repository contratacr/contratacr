-- 184: page_freeze — the browser reported the page frozen (a task over a second
-- or a screen that stopped refreshing). Recorded by the freeze monitor with the
-- route, viewport and device so the admin analytics show where it happens.

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
    'page_freeze'
  ));
