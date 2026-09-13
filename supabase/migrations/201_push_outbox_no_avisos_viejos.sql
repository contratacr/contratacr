-- Un push solo tiene sentido mientras la novedad es novedad.
--
-- El 13-sep-2026 se descubrió que NADIE vaciaba la cola de push: producción
-- tenía 156 avisos encolados desde hacía semanas, diez teléfonos con la app
-- instalada y cero entregas. Al poner la tarea que la vacía, esos 156 avisos
-- viejos habrían salido todos de golpe al teléfono de diez personas reales.
--
-- Dos cosas, entonces:
--   1. La cola descarta lo que ya pasó de VENTANA_DE_AVISO (seis horas). Un
--      aviso de una cita de hace tres semanas no se manda: se marca como
--      descartado y queda su rastro.
--   2. Todo lo que hay encolado ahora mismo, que es justo eso, se descarta de
--      una vez.
--
-- La campana del app NO se toca: ahí el aviso sigue estando, con su fecha.

-- 1. La cola deja de entregar lo viejo.
create or replace function public.claim_notification_push_outbox(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  notification_id uuid,
  user_id uuid,
  payload jsonb,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Lo que quedó tomado por un trabajador que ya no existe vuelve a la cola.
  update public.notification_push_outbox as expired
  set status = 'failed',
      last_error = 'lease_expired',
      updated_at = now()
  where expired.status = 'processing'
    and expired.locked_at is not null
    and expired.locked_at < now() - make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 30) * 3);

  -- Lo que nació hace más de seis horas ya no se manda al teléfono.
  update public.notification_push_outbox as viejo
  set status = 'suppressed',
      last_error = 'demasiado_viejo',
      completed_at = now(),
      updated_at = now()
  where viejo.status = 'pending'
    and viejo.created_at < now() - interval '6 hours';

  return query
  with candidates as (
    select outbox.id
    from public.notification_push_outbox as outbox
    where outbox.attempts < outbox.max_attempts
      and (
        (outbox.status = 'pending' and outbox.available_at <= now())
        or (
          outbox.status = 'failed'
          and outbox.available_at <= now()
        )
      )
    order by outbox.available_at, outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ),
  claimed as (
    update public.notification_push_outbox as outbox
    set status = 'processing',
        locked_at = now(),
        locked_by = p_worker_id,
        attempts = outbox.attempts + 1,
        updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select claimed.id, claimed.notification_id, claimed.user_id,
         claimed.payload, claimed.attempts, claimed.max_attempts
  from claimed;
end;
$$;

-- Los permisos se vuelven a declarar: `create or replace` conserva los de la
-- función anterior, pero dejarlo explícito evita una sorpresa si cambia la firma.
revoke all on function public.claim_notification_push_outbox(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_push_outbox(text, integer, integer) to service_role;

-- 2. La cola acumulada se descarta: son avisos de hace semanas.
update public.notification_push_outbox
set status = 'suppressed',
    last_error = 'cola_sin_drenar_hasta_2026_09_13',
    completed_at = now(),
    updated_at = now()
where status in ('pending', 'processing');

notify pgrst, 'reload schema';
