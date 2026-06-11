-- 045_availability_unify.sql
-- "Disponibilidad privada" is now the SINGLE control for schedule visibility
-- (the "¿Cómo recibes clientes?" block was removed). Migrate existing pros:
-- anyone who was "Solo WhatsApp" (contact_preference = 'solo_whatsapp') had no
-- public agenda → mark them private. "Agenda + WhatsApp"/legacy keep whatever
-- availability_public they already had (it already reflects their choice).

update public.professionals
  set availability_public = false
  where contact_preference = 'solo_whatsapp' and availability_public is distinct from false;

notify pgrst, 'reload schema';
