-- Migration 015: Booking notification delivery log
-- Tracks WhatsApp / email delivery status for automated booking status messages
-- (sent when a professional confirms or cancels a booking).
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id          uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id  uuid        REFERENCES public.bookings(id) ON DELETE CASCADE,
  channel     text        NOT NULL CHECK (channel IN ('whatsapp','email')),
  status      text        NOT NULL CHECK (status IN ('sent','failed','skipped')),
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_booking_idx
  ON public.notification_deliveries(booking_id);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Only the service role writes/reads these rows (server-side, admin client).
-- No public policies are added, so RLS denies anon/auth access by default.

NOTIFY pgrst, 'reload schema';
