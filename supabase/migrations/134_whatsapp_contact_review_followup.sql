-- Migration 134: follow up on WhatsApp contacts and allow an account-owned
-- review only after the client confirms that the service was contracted.

create table if not exists public.whatsapp_contact_followups (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  anonymous_token_hash text,
  professional_name text not null,
  service_name text,
  status text not null default 'contacted'
    check (status in ('contacted', 'hire_intent', 'hired', 'dismissed', 'reviewed')),
  contacted_at timestamptz not null default now(),
  follow_up_at timestamptz not null default (now() + interval '24 hours'),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or anonymous_token_hash is not null)
);

create index if not exists whatsapp_contact_followups_client_due_idx
  on public.whatsapp_contact_followups (client_id, status, follow_up_at desc);
create index if not exists whatsapp_contact_followups_anonymous_due_idx
  on public.whatsapp_contact_followups (anonymous_token_hash, status, follow_up_at desc)
  where client_id is null;
create index if not exists whatsapp_contact_followups_recent_idx
  on public.whatsapp_contact_followups (professional_id, contacted_at desc);

alter table public.whatsapp_contact_followups enable row level security;

alter table public.reviews
  add column if not exists whatsapp_contact_id uuid
    references public.whatsapp_contact_followups(id) on delete set null;

create unique index if not exists reviews_whatsapp_contact_uidx
  on public.reviews (whatsapp_contact_id)
  where whatsapp_contact_id is not null;

