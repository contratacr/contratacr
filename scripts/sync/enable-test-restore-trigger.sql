ALTER TABLE public.availability_slots
  ENABLE TRIGGER trg_reject_past_slots;
ALTER TABLE public.professional_offers
  ENABLE TRIGGER trg_capture_offer_activity;
ALTER TABLE public.job_posts
  ENABLE TRIGGER trg_capture_job_activity;
