-- Migration 069: atomic double-booking guard for the auto-confirm flow
-- ---------------------------------------------------------------------------
-- Solicitudes now AUTO-CONFIRM and occupy their slot the instant they're created.
-- The app already rejected a clashing slot with a check-then-insert, but that is
-- NON-ATOMIC: two concurrent requests for the same slot could both pass the check
-- and double-book. This PARTIAL UNIQUE INDEX makes occupying a slot atomic — only
-- ONE active booking can hold a given (professional, date, time); the loser's
-- INSERT/UPDATE fails with a unique violation (23505) and the API returns the 409
-- "Ese horario acaba de ser reservado." Cancelled/completed/rescheduled bookings
-- are NOT in the predicate, so cancelling frees the slot automatically.

CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_slot_uidx
  ON public.bookings (professional_id, scheduled_date, scheduled_time)
  WHERE status IN ('pending', 'confirmed', 'in_progress')
    AND scheduled_date IS NOT NULL
    AND scheduled_time IS NOT NULL;
