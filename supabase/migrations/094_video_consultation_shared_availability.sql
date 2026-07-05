-- Migration 094: videoconsulta can share availability with one in-person place.
-- ---------------------------------------------------------------------------
-- availability_slots must be able to publish the same professional/date/time for
-- two different locations when one of them is videoconsulta. The active booking
-- unique index still guards the real appointment: only one booking can occupy a
-- professional/date/time, regardless of location.

ALTER TABLE public.availability_slots
  DROP CONSTRAINT IF EXISTS availability_slots_professional_id_slot_date_slot_time_key;

DROP INDEX IF EXISTS public.availability_slots_professional_id_slot_date_slot_time_key;

CREATE UNIQUE INDEX IF NOT EXISTS availability_slots_pro_date_time_location_uidx
  ON public.availability_slots (
    professional_id,
    slot_date,
    slot_time,
    (COALESCE(location_id, ''))
  );

CREATE OR REPLACE FUNCTION public.check_weekly_location_overlap()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.availability_weekly w
    WHERE w.professional_id = NEW.professional_id
      AND w.weekday = NEW.weekday
      AND COALESCE(w.location_id, '') <> COALESCE(NEW.location_id, '')
      AND NOT (
        COALESCE(w.location_id, '') = 'videoconsulta'
        OR COALESCE(NEW.location_id, '') = 'videoconsulta'
      )
      AND w.id <> NEW.id
      AND w.start_time < NEW.end_time
      AND NEW.start_time < w.end_time
  ) THEN
    RAISE EXCEPTION 'availability_overlap: this time overlaps another in-person location on the same weekday'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.check_exception_location_overlap()
RETURNS trigger AS $$
BEGIN
  IF NEW.mode IN ('custom', 'extra') AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.availability_exceptions e
      WHERE e.professional_id = NEW.professional_id
        AND e.exception_date = NEW.exception_date
        AND e.mode IN ('custom', 'extra')
        AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
        AND COALESCE(e.location_id, '') <> COALESCE(NEW.location_id, '')
        AND NOT (
          COALESCE(e.location_id, '') = 'videoconsulta'
          OR COALESCE(NEW.location_id, '') = 'videoconsulta'
        )
        AND e.id <> NEW.id
        AND e.start_time < NEW.end_time
        AND NEW.start_time < e.end_time
    ) THEN
      RAISE EXCEPTION 'availability_overlap: this time overlaps another in-person location on the same date'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
