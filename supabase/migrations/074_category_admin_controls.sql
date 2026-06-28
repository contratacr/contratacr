-- Migration 074: admin controls for service catalog placement and visibility.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS group_id text,
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
