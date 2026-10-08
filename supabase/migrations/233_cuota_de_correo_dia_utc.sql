-- EL CONTADOR DE CORREOS CUENTA POR EL DÍA DE BREVO (UTC), IGUAL QUE EL QUE LO LEE.
--
-- El 24-sep-2026 el código que LEE el contador (`src/lib/email/cuota.ts`,
-- `diaDelProveedor`) pasó a usar el día UTC, porque es el que reinicia el tope
-- diario de Brevo. Esta función, que lo ESCRIBE, se quedó con el día de Costa
-- Rica: entre las 18:00 y la medianoche de acá cada envío se anotaba en el día
-- anterior y el que leía veía un día UTC nuevo y vacío. Esos correos no contaban
-- para el tope. Se notó el 7-oct-2026 al probar los avisos de proyectos y
-- empleos por correo, que van en volumen.

create or replace function public.registrar_envio_de_correo(p_nivel text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia date := (now() at time zone 'UTC')::date;
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
