-- Sprint 2 additions
-- Run in Supabase SQL Editor

-- ============================================================
-- BOOKINGS — relax client_id + add anonymous booking fields
-- ============================================================
ALTER TABLE public.bookings ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_cedula text,
  ADD COLUMN IF NOT EXISTS client_name   text,
  ADD COLUMN IF NOT EXISTS client_email  text,
  ADD COLUMN IF NOT EXISTS preferred_date_text text;

-- ============================================================
-- PROFESSIONALS — weekly availability (JSONB)
-- ============================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS availability jsonb NOT NULL DEFAULT '{
    "monday":    {"morning": false, "afternoon": false, "evening": false},
    "tuesday":   {"morning": false, "afternoon": false, "evening": false},
    "wednesday": {"morning": false, "afternoon": false, "evening": false},
    "thursday":  {"morning": false, "afternoon": false, "evening": false},
    "friday":    {"morning": false, "afternoon": false, "evening": false},
    "saturday":  {"morning": false, "afternoon": false, "evening": false},
    "sunday":    {"morning": false, "afternoon": false, "evening": false}
  }'::jsonb;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type       text        NOT NULL CHECK (type IN ('review_request','booking_received','booking_confirmed','booking_completed')),
  title      text        NOT NULL,
  message    text        NOT NULL,
  data       jsonb       DEFAULT '{}'::jsonb,
  read       boolean     DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can mark notifications read" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications(user_id) WHERE read = false;

-- ============================================================
-- SAVED PROFESSIONALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.saved_professionals (
  id              uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id       uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  professional_id uuid        REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
  created_at      timestamptz DEFAULT now() NOT NULL,
  UNIQUE(client_id, professional_id)
);

ALTER TABLE public.saved_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients see their own saved" ON public.saved_professionals
  FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Clients can save professionals" ON public.saved_professionals
  FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Clients can unsave professionals" ON public.saved_professionals
  FOR DELETE USING (auth.uid() = client_id);

-- ============================================================
-- Trigger: notify professional when booking created
-- ============================================================
CREATE OR REPLACE FUNCTION notify_professional_on_booking()
RETURNS trigger AS $$
DECLARE
  pro_profile_id uuid;
BEGIN
  SELECT profile_id INTO pro_profile_id
    FROM public.professionals WHERE id = NEW.professional_id;

  IF pro_profile_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (
      pro_profile_id,
      'booking_received',
      'Nueva solicitud de servicio',
      COALESCE(NEW.client_name, 'Un cliente') || ' solicitó tus servicios.',
      jsonb_build_object('booking_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION notify_professional_on_booking();

-- ============================================================
-- Trigger: notify client to review after booking completed
-- ============================================================
CREATE OR REPLACE FUNCTION notify_client_review_request()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.client_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (
      NEW.client_id,
      'review_request',
      '¿Cómo fue tu experiencia?',
      'Dejá tu reseña para ayudar a otros clientes.',
      jsonb_build_object('booking_id', NEW.id, 'professional_id', NEW.professional_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_completed ON public.bookings;
CREATE TRIGGER on_booking_completed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION notify_client_review_request();
