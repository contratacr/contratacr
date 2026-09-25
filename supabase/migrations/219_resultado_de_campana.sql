-- QUÉ PASÓ CON CADA CORREO DE CAMPAÑA DESPUÉS DE SALIR.
--
-- `admin_campaign_sends` (migración 211) anota a quién se le envió, y con eso
-- basta para no repetirle a nadie. Pero deja sin respuesta la única pregunta
-- que importa después de mandar 200 correos: ¿alguien los abrió, alguien tocó
-- el botón? Hoy el panel solo puede decir «salieron 200», que es trabajo
-- hecho, no resultado.
--
-- Brevo ya sabe la respuesta —registra entrega, apertura, clic y rebote— pero
-- solo la cuenta si alguien la escucha. Estas cuatro marcas de tiempo son
-- donde ese aviso aterriza, una por persona y campaña.
--
-- Van como columnas de la tabla que ya existe y no como tabla aparte porque
-- la llave es la misma (campaña + correo) y el aviso de Brevo llega por
-- correo: cualquier otra forma obligaría a cruzar dos tablas para contestar
-- «de los que recibieron esto, cuántos entraron».
--
-- Son timestamps y no banderas: la diferencia entre `enviado_en` y
-- `abierto_en` dice a qué hora lee la gente, y eso decide a qué hora conviene
-- mandar la siguiente.

alter table public.admin_campaign_sends
  add column if not exists entregado_en timestamptz,
  add column if not exists abierto_en   timestamptz,
  add column if not exists click_en     timestamptz,
  add column if not exists rebote_en    timestamptz;

comment on column public.admin_campaign_sends.entregado_en is
  'Cuándo Brevo confirmó la entrega al buzón. Sin esto, un correo rebotado se ve igual que uno entregado.';
comment on column public.admin_campaign_sends.abierto_en is
  'Primera apertura. Se guarda solo la primera: las siguientes no cambian la decisión.';
comment on column public.admin_campaign_sends.click_en is
  'Primer clic en un enlace del correo. Es la señal real de interés.';
comment on column public.admin_campaign_sends.rebote_en is
  'Rebote duro o queja de spam. Ese correo no debería volver a recibir campañas.';

-- El panel pregunta «de esta campaña, cuántos abrieron», que es un recorrido
-- por campaña filtrando por columna nula o no.
create index if not exists admin_campaign_sends_resultado_idx
  on public.admin_campaign_sends (campana, abierto_en, click_en);
