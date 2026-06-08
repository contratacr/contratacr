-- Sprint 34: a booking carries the (profession/service + location) context of the
-- slot it was made from, so the request records the correct location and profession
-- and the professional sees exactly where + for which service the client booked.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS category_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS slot_location_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS slot_location_label text;

NOTIFY pgrst, 'reload schema';
