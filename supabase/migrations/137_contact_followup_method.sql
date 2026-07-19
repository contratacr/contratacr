-- Migration 137: track which public contact channel started a review follow-up.

alter table public.whatsapp_contact_followups
  add column if not exists contact_method text not null default 'whatsapp'
    check (contact_method in ('whatsapp', 'phone', 'email'));

alter table public.whatsapp_contact_followups
  alter column follow_up_at set default (now() + interval '5 days');

create index if not exists whatsapp_contact_followups_method_idx
  on public.whatsapp_contact_followups (contact_method, contacted_at desc);
