-- ============================================================
-- 014 — Date-based availability slots + public/private toggle
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Public/private schedule toggle on professionals
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS availability_public boolean DEFAULT true;

-- 2. Explicit date+time availability slots (the new scheduling model)
CREATE TABLE IF NOT EXISTS public.availability_slots (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, slot_date, slot_time)
);

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

-- Public read so the booking calendar can show open slots
DROP POLICY IF EXISTS "Availability slots are public" ON public.availability_slots;
CREATE POLICY "Availability slots are public" ON public.availability_slots
  FOR SELECT USING (true);

-- Owner (the professional) can insert/update/delete their own slots
DROP POLICY IF EXISTS "Pros manage their own slots" ON public.availability_slots;
CREATE POLICY "Pros manage their own slots" ON public.availability_slots
  FOR ALL
  USING (auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id))
  WITH CHECK (auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = professional_id));

CREATE INDEX IF NOT EXISTS availability_slots_pro_date_idx
  ON public.availability_slots(professional_id, slot_date);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
