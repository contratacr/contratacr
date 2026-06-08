-- Migration 032: insurance networks, booking-for-someone-else (beneficiary),
-- no-show reporting, and "no CR identification" exception flag. Idempotent.

-- ── Insurance networks (aseguradoras) the professional belongs to ──────────────
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS insurance_networks text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS professionals_insurance_idx ON public.professionals USING gin (insurance_networks);

-- ── "No tengo identificación costarricense" → admin exceptions queue ───────────
-- Professionals with no CR cédula go to pending + this flag so the admin reviews
-- whatever document they have (passport, DIMEX in progress).
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS no_cr_id boolean NOT NULL DEFAULT false;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS id_document_note text;

-- ── Booking for someone else (responsible party vs beneficiary) ───────────────
-- Data minimization: store only the minimal beneficiary info for the appointment.
-- The beneficiary NEVER gets an account; the responsible adult remains accountable.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS for_someone_else boolean NOT NULL DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS beneficiary_name text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS beneficiary_cedula text;      -- optional, only if provided
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS beneficiary_dob date;          -- optional
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS beneficiary_phone text;        -- optional
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS beneficiary_is_minor boolean NOT NULL DEFAULT false;

-- ── No-show / non-performance / non-payment reporting (two-way, reputation) ────
-- Recorded against the reported party; no monetary penalty (payments are off-platform).
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_show_reported_by text;      -- 'client' | 'professional'
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_show_at timestamptz;
-- Professional flag mirrors the client flag added in migration 031.
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS flag_count integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
