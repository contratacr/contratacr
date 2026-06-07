-- Migration 028: reject availability slots in the past (Costa Rica time).
-- Server-side guard complementing the client-side check, so a past date/time can
-- never be persisted regardless of the caller. CR is America/Costa_Rica (UTC-6).
-- Idempotent.

CREATE OR REPLACE FUNCTION public.reject_past_slots()
RETURNS trigger AS $$
BEGIN
  -- slot_date (date) + slot_time (time) → a CR wall-clock timestamp; compare to
  -- the current CR wall-clock. now() AT TIME ZONE converts to local CR time.
  IF (NEW.slot_date + NEW.slot_time) < (now() AT TIME ZONE 'America/Costa_Rica') THEN
    RAISE EXCEPTION 'No se pueden crear horarios en el pasado (hora de Costa Rica).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reject_past_slots ON public.availability_slots;
CREATE TRIGGER trg_reject_past_slots
  BEFORE INSERT ON public.availability_slots
  FOR EACH ROW EXECUTE FUNCTION public.reject_past_slots();
