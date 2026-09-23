-- El plan gratuito de Brevo son 300 correos al día, y ESE MISMO cupo lo comparten
-- los correos que el app NECESITA mandar (crear cuenta, recuperar contraseña,
-- verificación, soporte) con los que solo son útiles (avisos) y con una campaña.
-- Sin un contador, una campaña de 200 se come el día y a la persona 201 que crea
-- una cuenta no le llega el código: se queda afuera sin que nadie se entere.
--
-- Esta tabla lleva la cuenta del día por nivel. Una fila por (día, nivel), que se
-- incrementa de a uno. El día es el de COSTA RICA, no UTC: si no, el contador se
-- reinicia a las 6 de la tarde y la mitad de la noche cuenta contra el día
-- siguiente.
create table if not exists public.email_cuota_diaria (
  dia date not null,
  nivel text not null check (nivel in ('critico', 'normal', 'masivo')),
  enviados integer not null default 0,
  actualizado_en timestamptz not null default now(),
  constraint email_cuota_diaria_pk primary key (dia, nivel)
);

comment on table public.email_cuota_diaria is
  'Correos enviados por día (hora de Costa Rica) y nivel. Solo la service-role escribe.';

alter table public.email_cuota_diaria enable row level security;
-- Nadie más que la service-role: no hay política, así que ni anon ni authenticated
-- pueden leerlo. El panel admin lo consulta a través de su propia ruta.

-- Suma uno y devuelve el total del día, en una sola ida. Sin esto, dos envíos a
-- la vez leerían el mismo número y uno de los dos se perdería.
create or replace function public.registrar_envio_de_correo(p_nivel text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia date := (now() at time zone 'America/Costa_Rica')::date;
  v_total integer;
begin
  insert into public.email_cuota_diaria (dia, nivel, enviados, actualizado_en)
  values (v_dia, p_nivel, 1, now())
  on conflict (dia, nivel)
  do update set enviados = public.email_cuota_diaria.enviados + 1, actualizado_en = now()
  returning enviados into v_total;

  return v_total;
end;
$$;

revoke all on function public.registrar_envio_de_correo(text) from public, anon, authenticated;
