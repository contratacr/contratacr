-- 042_contact_preference.sql
-- Simplify "¿Cómo recibes clientes?" to TWO options: solo_whatsapp | ambas.
-- The old app-only "solo_citas" is removed from the UI (WhatsApp is always
-- available), so migrate any pro on it to "ambas" (Agenda + WhatsApp). The
-- stored type still accepts the legacy value, so no constraint change is needed.

update public.professionals set contact_preference = 'ambas' where contact_preference = 'solo_citas';

notify pgrst, 'reload schema';
