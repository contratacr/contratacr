-- Migration 083: health project requests can be published for another person.
-- Mirrors the booking beneficiary fields, but only stores them when the selected
-- category is a health/care service.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS for_someone_else boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beneficiary_name text,
  ADD COLUMN IF NOT EXISTS beneficiary_dob date,
  ADD COLUMN IF NOT EXISTS beneficiary_is_minor boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
