-- Migration 095: reapply the availability overlap guard with videoconsulta sharing.
-- ---------------------------------------------------------------------------
-- Defensive follow-up for environments that still have the older trigger body:
-- videoconsulta may share the same time with one in-person location, while two
-- in-person locations may not overlap.

CREATE OR REPLACE FUNCTION public.is_video_availability_location(location_id text)
RETURNS boolean AS $$
BEGIN
  RETURN lower(COALESCE(location_id, '')) IN ('videoconsulta', 'video_consultation', 'video-consultation');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.check_weekly_location_overlap()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.availability_weekly w
    WHERE w.professional_id = NEW.professional_id
      AND w.weekday = NEW.weekday
      AND COALESCE(w.location_id, '') <> COALESCE(NEW.location_id, '')
      AND NOT (
        public.is_video_availability_location(w.location_id)
        OR public.is_video_availability_location(NEW.location_id)
      )
      AND w.id IS DISTINCT FROM NEW.id
      AND w.start_time < NEW.end_time
      AND NEW.start_time < w.end_time
  ) THEN
    RAISE EXCEPTION 'availability_overlap: this time is already used by another in-person location on the same weekday'
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
          public.is_video_availability_location(e.location_id)
          OR public.is_video_availability_location(NEW.location_id)
        )
        AND e.id IS DISTINCT FROM NEW.id
        AND e.start_time < NEW.end_time
        AND NEW.start_time < e.end_time
    ) THEN
      RAISE EXCEPTION 'availability_overlap: this time is already used by another in-person location on the same date'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
