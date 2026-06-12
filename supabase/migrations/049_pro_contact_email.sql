-- 049_pro_contact_email.sql
-- Optional PUBLIC contact email a professional may opt in to show on their
-- profile (for clients who prefer email over WhatsApp/call). Nullable; the UI
-- only shows it when non-empty, and the pro chooses whether to fill it.
alter table public.professionals add column if not exists contact_email text;

-- contact_email is part of the public professional card/profile (the pro opted
-- in), so it stays within the existing column grants on `professionals`. No new
-- policy needed: reads go through the same SELECT the cards already use.

notify pgrst, 'reload schema';
