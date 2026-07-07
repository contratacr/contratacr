-- Migration 099: persist category suggestion rejection reason for reuse across re-submissions.
-- Helps admins review re-opened suggestions faster by keeping the latest rejection note.

ALTER TABLE public.category_suggestions
  ADD COLUMN IF NOT EXISTS review_reason text;