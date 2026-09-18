-- Un WhatsApp por publicación, además del de la cuenta.
--
-- Un empleo suele contestarlo otra persona —o el mismo dueño desde otro
-- número— y no siempre es el WhatsApp con el que atiende a sus clientes. Hasta
-- hoy la única forma era cambiar el número del perfil, que es el que usa TODA
-- la ficha.
--
-- Nulo significa «usá el de mi cuenta», que es como se venía comportando. Las
-- publicaciones que ya existen se quedan con el del profesional, copiado aquí
-- para que no cambie nada de un día para otro.

alter table public.job_posts
  add column if not exists contact_whatsapp text;
alter table public.professional_offers
  add column if not exists contact_whatsapp text;

update public.job_posts as j
   set contact_whatsapp = p.whatsapp
  from public.professionals as p
 where p.id = j.employer_id
   and j.contact_whatsapp is null
   and coalesce(p.whatsapp, '') <> '';

update public.professional_offers as o
   set contact_whatsapp = p.whatsapp
  from public.professionals as p
 where p.id = o.professional_id
   and o.contact_whatsapp is null
   and coalesce(p.whatsapp, '') <> '';

comment on column public.job_posts.contact_whatsapp is
  'WhatsApp al que se responde esta vacante. Nulo = el de la cuenta profesional.';
comment on column public.professional_offers.contact_whatsapp is
  'WhatsApp al que se responde esta promoción. Nulo = el de la cuenta profesional.';
