-- El contacto vuelve a ser un solo toque.
--
-- La 204 cambió el muro de registro por un formulario de dos campos. Mejor que
-- antes, pero seguía cobrando fricción por un dato que el profesional recibe
-- igual: cuando la persona escribe por WhatsApp, WhatsApp le muestra su número.
--
-- Ahora el toque abre WhatsApp directo y el aviso al profesional sale solo, sin
-- pedirle nada a nadie: «alguien te buscó por Redes e internet». Si quien toca
-- tiene cuenta, el aviso lleva su nombre. Por eso el nombre y el teléfono pasan
-- a ser opcionales.

alter table public.contact_leads alter column name drop not null;
alter table public.contact_leads alter column phone drop not null;

comment on column public.contact_leads.name is
  'Nombre de quien buscó al profesional. Vacío cuando el contacto fue anónimo: el número se lo entrega WhatsApp.';
comment on column public.contact_leads.phone is
  'Teléfono de quien buscó al profesional, cuando lo dejó o cuando tenía cuenta.';

notify pgrst, 'reload schema';
