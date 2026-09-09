-- Migration 195: correo del cliente en la cotización.
--
-- El profesional lo escribe (o viene de la cita) y sirve para dos cosas: sale en
-- el documento, junto al teléfono y la cédula, y habilita el envío rápido por
-- correo desde la cotización.
-- Idempotente: se puede volver a correr.

alter table public.quotes add column if not exists client_email text;

comment on column public.quotes.client_email is 'Correo del cliente para el documento y el envío rápido.';
