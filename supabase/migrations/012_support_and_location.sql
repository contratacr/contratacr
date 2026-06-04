-- Migration 012: Support messages table + lat/lng for professionals
-- Run in Supabase SQL Editor (safe to run multiple times)

-- ============================================================
-- 1. Add coordinates and formatted address to professionals
-- ============================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS lat  double precision,
  ADD COLUMN IF NOT EXISTS lng  double precision,
  ADD COLUMN IF NOT EXISTS formatted_address text;

-- ============================================================
-- 2. Support messages table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_messages (
  id         uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  name       text,
  email      text        NOT NULL,
  subject    text        NOT NULL,
  message    text        NOT NULL,
  status     text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a support message
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_messages' AND policyname = 'Anyone can insert support messages'
  ) THEN
    CREATE POLICY "Anyone can insert support messages" ON public.support_messages
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Authenticated users can view their own messages
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_messages' AND policyname = 'Users can view own messages'
  ) THEN
    CREATE POLICY "Users can view own messages" ON public.support_messages
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 3. Ensure 'otro' exists in categories table (if FK enforced)
-- ============================================================
INSERT INTO public.categories (id, name, icon)
VALUES ('otro', 'Otro servicio', '')
ON CONFLICT (id) DO NOTHING;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
