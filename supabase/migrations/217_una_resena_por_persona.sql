-- Una reseña por persona y profesional.
--
-- La regla era «una por trabajo terminado»: índices únicos por (cliente, cita)
-- y (cliente, proyecto). Con eso la misma persona podía acumular VARIAS
-- reseñas del mismo profesional —una por la cita, otra por el proyecto, otra
-- suelta desde la ficha— y, peor, editar una creaba otra: la API buscaba la
-- existente por contexto y no la encontraba. Isaac lo vio al actualizar una
-- reseña y encontrarse con dos.
--
-- Se conserva la MÁS RECIENTE de cada persona+profesional y se borran las
-- demás. El disparador `on_review_change` recalcula solo la nota y el conteo
-- de cada profesional al borrar, así que las notas quedan bien sin tocarlas.
-- Las reseñas sin cuenta (client_id nulo) no entran: esas ya tienen su propia
-- regla por contacto de WhatsApp.

delete from public.reviews r
where r.client_id is not null
  and exists (
    select 1
    from public.reviews mas_nueva
    where mas_nueva.client_id = r.client_id
      and mas_nueva.professional_id = r.professional_id
      and mas_nueva.client_id is not null
      and (mas_nueva.created_at, mas_nueva.id) > (r.created_at, r.id)
  );

-- Y que no vuelvan a aparecer. Los índices por cita y por proyecto quedan:
-- este es más estricto y los cubre.
create unique index if not exists reviews_cliente_profesional_uidx
  on public.reviews (client_id, professional_id)
  where client_id is not null;

notify pgrst, 'reload schema';
