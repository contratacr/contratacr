-- 176: first-party analytics for the surfaces that had none.
--
-- interaction_events only knew profile-level actions. Searches, job views,
-- job applications, offer views and assistant questions are the growth
-- signals the owner asked to keep from now on, so the event catalogue grows.
-- Rows carry `metadata.platform` ("web" | "native") written by the server
-- helper; the admin analytics RPC groups by event_type generically, so the
-- new types appear there without further changes.

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
    'assistant_question'
  ));
