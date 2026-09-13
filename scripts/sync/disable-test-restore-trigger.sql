-- Disparadores que estorban mientras se restaura un volcado de confianza en el
-- proyecto de test aislado.
--
-- Producción puede traer horarios ya vencidos: el guardia solo debe proteger lo
-- que escribe una persona, no una restauración.
ALTER TABLE public.availability_slots
  DISABLE TRIGGER trg_reject_past_slots;

-- Al restaurar empleos y ofertas, estos disparadores publican su actividad; el
-- volcado trae después esas MISMAS filas de actividad y la copia chocaba contra
-- la llave única (professional_id, activity_type, content_id), dejando la
-- restauración a medias. La actividad viene en el volcado, así que no hay nada
-- que publicar mientras se restaura.
ALTER TABLE public.professional_offers
  DISABLE TRIGGER trg_capture_offer_activity;
ALTER TABLE public.job_posts
  DISABLE TRIGGER trg_capture_job_activity;
