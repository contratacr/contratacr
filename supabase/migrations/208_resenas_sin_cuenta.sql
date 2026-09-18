-- Reseñas sin cuenta, para quien ya contactó por WhatsApp.
--
-- Medido en producción sobre los 68 avisos de seguimiento («¿llegaste a
-- contratarlo?»):
--   · 44 con cuenta  → 7 reseñas (16%)
--   · 24 SIN cuenta  → 0 reseñas (0%). Ni una. Los 24 quedaron en «contactado».
--
-- El muro no filtra a nadie: crear una cuenta con un correo desechable toma
-- treinta segundos, así que solo detiene a quien iba de buena fe. Y esto no es
-- una reseña anónima: para llegar a ella hay que haber contactado a ESE
-- profesional desde ESE dispositivo, y queda amarrada al seguimiento
-- (`whatsapp_contact_id`), que guarda la huella de la visita. Es más prueba de
-- la que da un correo gratis.
--
-- El nombre se pide en el momento y se guarda en `client_name_snapshot`, que ya
-- existía para las reseñas de reservas.

alter table public.reviews alter column client_id drop not null;

-- Una reseña por seguimiento: el aviso es 1:1 con el contacto, así que esto
-- cierra la puerta a repetir con el mismo toque.
create unique index if not exists reviews_whatsapp_contact_uidx
  on public.reviews (whatsapp_contact_id)
  where whatsapp_contact_id is not null;

comment on column public.reviews.client_id is
  'Quien dejó la reseña. NULO cuando la dejó sin cuenta desde el aviso de seguimiento; en ese caso manda whatsapp_contact_id y el nombre va en client_name_snapshot.';
