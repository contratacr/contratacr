-- Per-role soft archive for cancelled panel items. This never deletes history;
-- it only lets each side clean their own cancelled filter.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS archived_by_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_by_professional boolean NOT NULL DEFAULT false;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived_by_client boolean NOT NULL DEFAULT false;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS archived_by_professional boolean NOT NULL DEFAULT false;
