-- Migration 073: English display names for admin-managed services.
-- The fixed catalog has code-level English labels. Custom/admin-added services
-- need a DB value so the English app never falls back to a raw slug.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS name_en text;

NOTIFY pgrst, 'reload schema';
