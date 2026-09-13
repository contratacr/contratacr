-- Un push solo tiene sentido mientras la novedad es novedad.
--
-- El 13-sep-2026 se descubrió que NADIE vaciaba la cola de push: producción
-- tenía 156 avisos encolados desde hacía semanas, diez teléfonos con la app
-- instalada y cero entregas. Al poner la tarea que la vacía, esos avisos viejos
-- habrían salido todos de golpe al teléfono de diez personas reales.
--
-- Dos cosas: la cola descarta lo que ya pasó de seis horas, y todo lo que hay
-- encolado ahora mismo se descarta de una vez. La campana del app NO se toca.
--
-- La función se copia entera de la 167 con ese único agregado: `create or
-- replace` no puede cambiar el tipo de retorno, así que la forma tiene que ser
-- idéntica.

create or replace function public.claim_notification_push_outbox(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  data jsonb,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_worker_id, '')) = '' then
    raise exception 'worker_id_required' using errcode = '22023';
  end if;

  -- A process can die after claiming its final allowed attempt. Once that
  -- lease expires, make the terminal state explicit instead of leaving an
  -- unclaimable row stuck in `processing` forever.
  update public.notification_push_outbox as expired
  set status = 'failed',
      locked_at = null,
      locked_by = null,
      last_error = coalesce(expired.last_error, 'push_lease_expired_after_max_attempts'),
      completed_at = now(),
      updated_at = now()
  where expired.status = 'processing'
    and expired.attempts >= expired.max_attempts
    and expired.locked_at < now() - make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 15), 3600));

  -- Un push solo tiene sentido mientras la novedad es novedad: lo que lleva
  -- más de seis horas esperando en la cola no se manda al teléfono. La campana
  -- del app no se toca, ahí el aviso sigue con su fecha.
  update public.notification_push_outbox as viejo
  set status = 'suppressed',
      locked_at = null,
      locked_by = null,
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
          outbox.status = 'processing'
          and outbox.locked_at < now() - make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 15), 3600))
        )
      )
    order by outbox.available_at, outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ), claimed as (
    update public.notification_push_outbox as outbox
    set status = 'processing',
        attempts = outbox.attempts + 1,
        locked_at = now(),
        locked_by = p_worker_id,
        updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.notification_id, outbox.user_id,
              outbox.attempts, outbox.max_attempts
  )
  select claimed.id, claimed.notification_id, claimed.user_id,
         notification.title, notification.message,
         coalesce(notification.data, '{}'::jsonb),
         claimed.attempts, claimed.max_attempts
  from claimed
  join public.notifications as notification
    on notification.id = claimed.notification_id;
end;
$$;

revoke all on function public.claim_notification_push_outbox(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_push_outbox(text, integer, integer) to service_role;

-- La cola acumulada se descarta: son avisos de hace semanas que nadie drenó.
update public.notification_push_outbox
set status = 'suppressed',
    locked_at = null,
    locked_by = null,
    last_error = 'cola_sin_drenar_hasta_2026_09_13',
    completed_at = now(),
    updated_at = now()
where status in ('pending', 'processing');

notify pgrst, 'reload schema';
