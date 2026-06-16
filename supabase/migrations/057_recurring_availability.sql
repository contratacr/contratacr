-- ============================================================
-- 057 — Recurring weekly availability ("Mis horarios de siempre")
-- ------------------------------------------------------------
-- The Disponibilidad editor moves from a per-date slot GENERATOR to a recurring
-- WEEKLY template + date EXCEPTIONS (Calendly/Cal.com model):
--   • availability_weekly      — the repeating weekly schedule (per location +
--                                profession + weekday + time franja).
--   • availability_exceptions  — one-off changes for a specific date ("¿Un día
--                                distinto?"): close the day, replace its hours, or
--                                add extra hours.
-- These two tables are the SOURCE OF TRUTH the editor edits. They are MATERIALIZED
-- (client-side, on save) into `availability_slots` — the existing booking-critical
-- table that /buscar, the booking modal and the public profile already read — so
-- NO downstream code changes. Bookings reference scheduled_date/scheduled_time
-- (not availability_slots.id), so regenerating slots never breaks a booking.
--
-- weekday: 0=Sunday … 6=Saturday (matches JS Date.getDay()).
-- location_id / category_id mirror availability_slots: a workplace id, a coverage
-- zone ('cov_*'), the literal 'videoconsulta', or NULL ("general" / all).
-- Idempotent.
-- ============================================================

-- ── Weekly recurring schedule ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.availability_weekly (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
  location_id text,
  category_id text,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_minutes smallint NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_weekly ENABLE ROW LEVEL SECURITY;

-- Public read so the editor (and any future reader) can load a pro's template.
DROP POLICY IF EXISTS "Weekly availability is public" ON public.availability_weekly;
CREATE POLICY "Weekly availability is public" ON public.availability_weekly
  FOR SELECT USING (true);

-- Owner (the professional) manages their own template.
DROP POLICY IF EXISTS "Pros manage their own weekly availability" ON public.availability_weekly;
CREATE POLICY "Pros manage their own weekly availability" ON public.availability_weekly
  FOR ALL
  USING (auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id))
  WITH CHECK (auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id));

CREATE INDEX IF NOT EXISTS availability_weekly_pro_loc_idx
  ON public.availability_weekly(professional_id, location_id);

-- ── Date-specific exceptions ("¿Un día distinto?") ──────────
-- mode:
--   'closed' — the pro is closed that date (no slots), times NULL.
--   'custom' — replace the weekly hours with these franjas for that date only.
--   'extra'  — keep the weekly hours AND add these extra franjas that date.
-- A date can hold several rows (multiple franjas) for 'custom'/'extra'.
CREATE TABLE IF NOT EXISTS public.availability_exceptions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
  location_id text,
  category_id text,
  exception_date date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('closed', 'custom', 'extra')),
  start_time time,
  end_time time,
  slot_minutes smallint NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Availability exceptions are public" ON public.availability_exceptions;
CREATE POLICY "Availability exceptions are public" ON public.availability_exceptions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Pros manage their own availability exceptions" ON public.availability_exceptions;
CREATE POLICY "Pros manage their own availability exceptions" ON public.availability_exceptions
  FOR ALL
  USING (auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id))
  WITH CHECK (auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id));

CREATE INDEX IF NOT EXISTS availability_exceptions_pro_date_idx
  ON public.availability_exceptions(professional_id, exception_date);

NOTIFY pgrst, 'reload schema';
