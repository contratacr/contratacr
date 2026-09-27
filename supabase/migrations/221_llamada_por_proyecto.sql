-- PERMITIR QUE LE LLAMEN, PROYECTO POR PROYECTO.
--
-- Publicar un proyecto ya es pedir que lo contacten (`allow_direct_contact`),
-- pero el único canal es WhatsApp. Cuando el número que dejó quien publica NO
-- está en WhatsApp —pasa, y no hay forma de detectarlo: Meta no expone esa
-- información— el profesional llega a «este número no está en WhatsApp,
-- invítalo» y ahí se acaba. El proyecto queda muerto: ni el cliente recibe
-- ayuda ni el profesional consigue el trabajo.
--
-- Esta columna es la salida, y es por proyecto y no por cuenta a propósito:
-- que a alguien le llamen es una decisión suya, no un valor por omisión. Nace
-- APAGADA. Hoy solo se enciende a mano, desde el panel, para el proyecto que
-- lo necesita; si con el tiempo resulta que hace falta seguido, se agrega la
-- casilla al formulario de publicar.

alter table public.projects
  add column if not exists allow_phone_contact boolean not null default false;

comment on column public.projects.allow_phone_contact is
  'Quien publicó autoriza que le llamen al mismo número del WhatsApp. Apagada por omisión: el canal se concede, no se asume.';

notify pgrst, 'reload schema';
