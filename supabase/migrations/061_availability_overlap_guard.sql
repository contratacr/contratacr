-- ============================================================
-- 061 — Server-side CROSS-LOCATION availability overlap guard
-- ------------------------------------------------------------
-- A professional can't be in two places at once. The editor enforces this client-
-- side (allowing CONSECUTIVE/touching ranges, blocking only TRUE overlaps), but the
-- recurring template + exceptions are written DIRECTLY via the browser Supabase
-- client, so these BEFORE-write triggers enforce the SAME rule server-side as a
-- backstop that can't be bypassed.
--
-- Overlap is HALF-OPEN — ranges that merely TOUCH (08:00–14:00 then 14:00–16:00, or
-- a gap-filling 14:00–16:00 between 08:00–14:00 and 16:00–17:00) do NOT conflict;
-- only a real intersection does:  start1 < end2  AND  start2 < end1.
-- Scope: same WEEKDAY (weekly) / same DATE (exceptions), DIFFERENT location only.
-- (Same-location rules and the weekly↔exception precedence — custom replaces, extra
-- adds, closed — remain in the client, the full source of truth; this covers the
-- common same-table cross-location bypass.) Idempotent.
-- ============================================================

-- ── Weekly template: no two LOCATIONS overlap on the same weekday ──────────────
CREATE OR REPLACE FUNCTION public.check_weekly_location_overlap()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.availability_weekly w
    WHERE w.professional_id = NEW.professional_id
      AND w.weekday = NEW.weekday
      AND COALESCE(w.location_id, '') <> COALESCE(NEW.location_id, '')  -- DIFFERENT location
      AND w.id <> NEW.id
      AND w.start_time < NEW.end_time                                   -- HALF-OPEN overlap:
      AND NEW.start_time < w.end_time                                   -- touching ≠ overlap
  ) THEN
    RAISE EXCEPTION 'availability_overlap: this time overlaps another location on the same weekday'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_weekly_location_overlap ON public.availability_weekly;
CREATE TRIGGER trg_weekly_location_overlap
  BEFORE INSERT OR UPDATE ON public.availability_weekly
  FOR EACH ROW EXECUTE FUNCTION public.check_weekly_location_overlap();

-- ── Date exceptions: no two LOCATIONS overlap on the same date ─────────────────
CREATE OR REPLACE FUNCTION public.check_exception_location_overlap()
RETURNS trigger AS $$
BEGIN
  -- Only rows with a concrete time range can conflict ('closed' / NULL are skipped).
  IF NEW.mode IN ('custom', 'extra') AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.availability_exceptions e
      WHERE e.professional_id = NEW.professional_id
        AND e.exception_date = NEW.exception_date
        AND e.mode IN ('custom', 'extra')
        AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL
        AND COALESCE(e.location_id, '') <> COALESCE(NEW.location_id, '')  -- DIFFERENT location
        AND e.id <> NEW.id
        AND e.start_time < NEW.end_time                                   -- HALF-OPEN overlap
        AND NEW.start_time < e.end_time
    ) THEN
      RAISE EXCEPTION 'availability_overlap: this time overlaps another location on the same date'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exception_location_overlap ON public.availability_exceptions;
CREATE TRIGGER trg_exception_location_overlap
  BEFORE INSERT OR UPDATE ON public.availability_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.check_exception_location_overlap();

NOTIFY pgrst, 'reload schema';
