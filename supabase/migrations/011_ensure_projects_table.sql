-- Migration 011: Ensure projects, proposals, blocked_dates tables exist
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE guards).
-- Run in Supabase SQL Editor if you're getting
-- "Could not find the table 'public.projects' in the schema cache".

-- ============================================================
-- 1. Upgrade bookings table (idempotent)
-- ============================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time time,
  ADD COLUMN IF NOT EXISTS client_phone text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','rescheduled'));

-- ============================================================
-- 2. Projects table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id           uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category_id  text,
  title        text        NOT NULL,
  description  text        NOT NULL,
  provincia_id text,
  canton_id    text,
  budget_min   integer,
  budget_max   integer,
  timeline     text,
  photo_urls   text[]      DEFAULT '{}',
  status       text        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','completed','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Clients can insert projects'
  ) THEN
    CREATE POLICY "Clients can insert projects" ON public.projects
      FOR INSERT WITH CHECK (auth.uid() = client_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Clients can view their projects'
  ) THEN
    CREATE POLICY "Clients can view their projects" ON public.projects
      FOR SELECT USING (auth.uid() = client_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Clients can update their projects'
  ) THEN
    CREATE POLICY "Clients can update their projects" ON public.projects
      FOR UPDATE USING (auth.uid() = client_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Open projects visible to authenticated users'
  ) THEN
    CREATE POLICY "Open projects visible to authenticated users" ON public.projects
      FOR SELECT USING (status = 'open');
  END IF;
END $$;

-- ============================================================
-- 3. Proposals table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.proposals (
  id              uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id      uuid        REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  professional_id uuid        REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
  price           integer,
  message         text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, professional_id)
);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='proposals' AND policyname='Pros can insert proposals'
  ) THEN
    CREATE POLICY "Pros can insert proposals" ON public.proposals
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.professionals WHERE id = professional_id AND profile_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='proposals' AND policyname='Pros can view their proposals'
  ) THEN
    CREATE POLICY "Pros can view their proposals" ON public.proposals
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.professionals WHERE id = professional_id AND profile_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='proposals' AND policyname='Project owners can view proposals'
  ) THEN
    CREATE POLICY "Project owners can view proposals" ON public.proposals
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND client_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='proposals' AND policyname='Project owners can update proposal status'
  ) THEN
    CREATE POLICY "Project owners can update proposal status" ON public.proposals
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND client_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 4. Blocked dates
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blocked_dates (
  id              uuid  DEFAULT uuid_generate_v4() PRIMARY KEY,
  professional_id uuid  REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
  blocked_date    date  NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(professional_id, blocked_date)
);

ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='blocked_dates' AND policyname='Pros manage their blocked dates'
  ) THEN
    CREATE POLICY "Pros manage their blocked dates" ON public.blocked_dates
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.professionals WHERE id = professional_id AND profile_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='blocked_dates' AND policyname='Public can view blocked dates'
  ) THEN
    CREATE POLICY "Public can view blocked dates" ON public.blocked_dates
      FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================================
-- 5. Expand notifications type constraint (idempotent)
-- ============================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'review_request','booking_received','booking_confirmed','booking_completed',
    'booking_cancelled','booking_rescheduled','proposal_received','proposal_accepted','new_project'
  ));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
