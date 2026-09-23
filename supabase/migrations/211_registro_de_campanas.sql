-- QUÉ CORREO DE CAMPAÑA RECIBIÓ CADA QUIEN.
--
-- El envío masivo era un bucle sin memoria: no quedaba anotado a quién se le
-- había enviado. Con el plan gratuito de Brevo (300 correos por día, los
-- MISMOS que usan las respuestas de soporte y la recuperación de contraseña),
-- una campaña de 401 personas no cabe en un día: se corta a la mitad, y al
-- reintentarla al día siguiente los primeros la reciben dos veces.
--
-- Esta tabla es la memoria: una fila por persona y campaña. La segunda tanda
-- sale solo para quien no está aquí, y el candado de 24 horas se calcula con
-- la fila más reciente de esa campaña.
--
-- `campana` es la misma etiqueta que viaja en `utm_campaign` (se deriva del
-- asunto), así que el registro y la atribución hablan del mismo envío.

create table if not exists public.admin_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campana text not null,
  email text not null,
  enviado_en timestamptz not null default now(),
  constraint admin_campaign_sends_unicos unique (campana, email)
);

create index if not exists admin_campaign_sends_campana_idx
  on public.admin_campaign_sends (campana, enviado_en desc);

comment on table public.admin_campaign_sends is
  'A quién se le envió cada campaña de correo. Evita repetir a la misma persona cuando el envío se parte en tandas por el tope diario del proveedor.';

-- Solo el rol de servicio la lee y la escribe: es una bitácora de operación,
-- nadie la consulta desde el app.
alter table public.admin_campaign_sends enable row level security;
