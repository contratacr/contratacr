-- 178: measure the account gate in front of direct contact.
--
-- Since contact requires an account (WhatsApp, call, email), a guest tapping
-- "Contactar" no longer produces a whatsapp_click — the gate intercepts first.
-- Without a dedicated event the funnel looks like contacts collapsed, when in
-- fact the taps are simply no longer counted. `contact_gate_shown` records the
-- attempt (metadata.channel = whatsapp | phone | email), so the ratio
-- attempts -> registrations is measurable and the gate can be judged.

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
    'contact_gate_shown'
  ));
