-- A signed-in contact follow-up cannot survive without its client: the table
-- requires either client_id or an anonymous token. ON DELETE SET NULL could
-- therefore violate whatsapp_contact_followups_check while deleting an
-- account. Remove the account-owned follow-up atomically instead.

alter table public.whatsapp_contact_followups
  drop constraint if exists whatsapp_contact_followups_client_id_fkey;

alter table public.whatsapp_contact_followups
  add constraint whatsapp_contact_followups_client_id_fkey
  foreign key (client_id)
  references public.profiles(id)
  on delete cascade;

notify pgrst, 'reload schema';
