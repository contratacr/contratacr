-- El permiso para escribirle a alguien por WhatsApp, guardado con su fecha.
--
-- Hoy los recordatorios salen por el app y por correo. Mandarlos por WhatsApp
-- exige, por política de Meta, que la persona lo haya aceptado: sin un permiso
-- registrado, un solo bloqueo cuenta como mensaje no solicitado y la
-- calificación del número cae. Esta columna es ese registro, y existe antes que
-- cualquier envío justamente para que el envío pueda ser legítimo el día que se
-- active.
--
-- Nada la activa sola: nace en falso y solo la persona la enciende desde su
-- perfil.

alter table public.profiles
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_opt_in_at timestamptz;

comment on column public.profiles.whatsapp_opt_in is
  'La persona aceptó recibir avisos por WhatsApp. Sin esto no se le escribe por ese canal.';
comment on column public.profiles.whatsapp_opt_in_at is
  'Cuándo lo aceptó. Es la prueba del consentimiento ante una revisión de Meta.';

-- La fecha se pone y se quita sola con el interruptor: así no puede quedar un
-- permiso encendido sin fecha, que es lo que no sirve como prueba.
create or replace function public.marcar_fecha_de_permiso_whatsapp()
returns trigger
language plpgsql
as $$
begin
  if new.whatsapp_opt_in is distinct from old.whatsapp_opt_in then
    new.whatsapp_opt_in_at := case when new.whatsapp_opt_in then now() else null end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marcar_fecha_de_permiso_whatsapp on public.profiles;
create trigger trg_marcar_fecha_de_permiso_whatsapp
  before update on public.profiles
  for each row
  execute function public.marcar_fecha_de_permiso_whatsapp();
