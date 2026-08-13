-- Production can legitimately contain elapsed availability rows. The application
-- guard only protects new user-entered slots, so pause this one guard while a
-- trusted production snapshot is restored into the isolated test database.
ALTER TABLE public.availability_slots
  DISABLE TRIGGER trg_reject_past_slots;
