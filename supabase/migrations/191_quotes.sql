-- Migration 191: cotizaciones dentro del app.
--
-- Un profesional arma una cotización (renglones, IVA, notas, vigencia) sobre
-- una cita o un proyecto, y el cliente la acepta o la rechaza desde su panel.
-- Antes el precio solo viajaba como texto en la respuesta a un proyecto o por
-- WhatsApp, sin rastro ni forma de aceptarlo.
-- Idempotente: se puede volver a correr.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  title text,
  items jsonb not null default '[]'::jsonb,
  tax_mode text not null default 'incluido' check (tax_mode in ('incluido', 'mas_iva', 'exento')),
  subtotal integer not null default 0,
  tax_amount integer not null default 0,
  total integer not null default 0,
  notes text,
  valid_until date,
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'withdrawn')),
  accepted_at timestamptz,
  declined_at timestamptz,
  created_source_host text,
  created_app_environment text,
  created_supabase_project_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quotes is 'Cotizaciones que un profesional envía sobre una cita o un proyecto; el cliente las acepta o rechaza.';
comment on column public.quotes.items is 'Renglones [{description, quantity, unit_price}] en colones enteros.';
comment on column public.quotes.tax_mode is 'incluido: los precios ya traen IVA; mas_iva: se suma 13%; exento: sin IVA.';

create index if not exists idx_quotes_booking on public.quotes (booking_id, created_at desc) where booking_id is not null;
create index if not exists idx_quotes_project on public.quotes (project_id, created_at desc) where project_id is not null;
create index if not exists idx_quotes_professional on public.quotes (professional_id, created_at desc);
create index if not exists idx_quotes_client on public.quotes (client_id, created_at desc);

alter table public.quotes enable row level security;

-- Lectura directa: el profesional ve las suyas y el cliente las que le mandaron.
-- Las escrituras pasan por la API con la llave de servicio.
drop policy if exists quotes_select_professional on public.quotes;
create policy quotes_select_professional on public.quotes
  for select to authenticated
  using (exists (select 1 from public.professionals p where p.id = quotes.professional_id and p.profile_id = auth.uid()));

drop policy if exists quotes_select_client on public.quotes;
create policy quotes_select_client on public.quotes
  for select to authenticated
  using (client_id = auth.uid());

-- Avisos: cotización enviada / aceptada / rechazada. Hay que repetir TODOS los
-- tipos ya permitidos (ver 189).
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
    'quote_sent','quote_accepted','quote_declined'
  ));

notify pgrst, 'reload schema';
