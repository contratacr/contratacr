-- Contactar sin tener cuenta.
--
-- Medido en producción: con el muro de registro, 9 personas tocaron «WhatsApp»
-- y 8 se fueron; antes del muro, 41 invitados contactaron en un período
-- parecido. La tasa de contacto cayó de 9,0% a 2,3%. El muro cobra ocho para
-- dejar pasar uno, y no trajo registros (1,28 clientes/día antes, 1,20 después).
--
-- Se cambia por lo mínimo que de verdad hace falta: nombre y teléfono. Con eso
-- el profesional sabe quién lo busca y puede devolver la llamada aunque la
-- persona nunca abra el app otra vez. La cuenta se puede crear después.

create table if not exists public.contact_leads (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  -- Quién busca: lo que la persona escribió, tal cual.
  name text not null,
  phone text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'phone', 'email')),
  category_id text,
  -- Si después se registra, aquí queda el vínculo.
  client_id uuid references public.profiles(id) on delete set null,
  -- El mismo identificador anónimo que usan los eventos, para poder seguir el
  -- camino completo de una visita sin saber quién es.
  visitor_hash text,
  locale text not null default 'es',
  created_source_host text,
  created_app_environment text,
  created_supabase_project_ref text,
  created_at timestamptz not null default now()
);

comment on table public.contact_leads is
  'Alguien sin cuenta pidió el contacto de un profesional: su nombre y su teléfono, para que el profesional pueda devolverle.';

create index if not exists idx_contact_leads_professional on public.contact_leads (professional_id, created_at desc);
create index if not exists idx_contact_leads_created on public.contact_leads (created_at desc);

-- Nadie lee esta tabla desde el navegador: la escribe el servidor con la llave
-- de servicio y la lee el panel del profesional por su propio endpoint.
alter table public.contact_leads enable row level security;
revoke all on table public.contact_leads from anon, authenticated;
grant select, insert on table public.contact_leads to service_role;

-- El aviso que le llega al profesional.
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
    'counterparty_account_deleted','contact_lead'
  ));

notify pgrst, 'reload schema';

-- El evento del contacto que SÍ se completó sin cuenta. La lista se reemplaza
-- entera, así que cada tipo anterior tiene que repetirse o deja de poder
-- escribirse.
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
    'contact_lead_created'
  ));
