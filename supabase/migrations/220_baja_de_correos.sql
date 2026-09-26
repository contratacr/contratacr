-- QUIÉN PIDIÓ NO RECIBIR MÁS CORREOS DE NOVEDADES.
--
-- Las campañas caían en No deseado y la causa principal no era el contenido:
-- los correos salían SIN la cabecera `List-Unsubscribe`. Gmail y Yahoo la
-- exigen desde 2024 a quien manda en volumen, y es lo que pinta el botón
-- «Cancelar suscripción» arriba del mensaje. El correo decía «responde con la
-- palabra BAJA», que le sirve a una persona pero que el buzón no puede leer:
-- para Gmail era correo masivo sin salida, y eso solo ya lo castiga.
--
-- Esta tabla es esa salida. Se guarda por CORREO y no por cuenta a propósito:
-- quien se da de baja puede no tener sesión abierta —de hecho casi nunca la
-- tiene, viene desde el buzón— y la baja tiene que valer aunque después cambie
-- de cuenta o la borre.
--
-- Solo cubre los correos de novedades. Los de cuenta y seguridad —entrar,
-- recuperar la contraseña, soporte— siguen saliendo: no son publicidad y
-- ofrecer darse de baja de ellos sería dejar a alguien sin poder entrar.

create table if not exists public.email_bajas (
  correo text primary key,
  motivo text,
  dado_de_baja_en timestamptz not null default now()
);

comment on table public.email_bajas is
  'Correos que pidieron no recibir novedades. Las campañas los saltan. No afecta a los correos de cuenta y seguridad.';
comment on column public.email_bajas.motivo is
  'De dónde vino la baja: "un-clic" (el botón del buzón), "enlace" (tocó el enlace del correo) o lo que escriba soporte.';

-- Nadie la lee desde el app: la escribe la ruta de baja con la llave de
-- servicio y la consulta el envío de campañas.
alter table public.email_bajas enable row level security;
