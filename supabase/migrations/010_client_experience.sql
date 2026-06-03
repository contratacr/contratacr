-- Sprint 7: Complete client experience — bookings, projects, proposals, blocked dates
-- Run in Supabase SQL Editor

-- ============================================================
-- 1. Upgrade bookings table
-- ============================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time time,
  ADD COLUMN IF NOT EXISTS client_phone text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Expand status constraint
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled','rescheduled'));

-- ============================================================
-- 2. Projects table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id           uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category_id  text        REFERENCES public.categories(id),
  title        text        NOT NULL,
  description  text        NOT NULL,
  provincia_id text        REFERENCES public.provincias(id),
  canton_id    text        REFERENCES public.cantones(id),
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

CREATE POLICY "Clients can insert projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Clients can view their projects" ON public.projects
  FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Clients can update their projects" ON public.projects
  FOR UPDATE USING (auth.uid() = client_id);
CREATE POLICY "Open projects visible to authenticated users" ON public.projects
  FOR SELECT USING (status = 'open');

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

CREATE POLICY "Pros can insert proposals" ON public.proposals
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.professionals WHERE id = professional_id AND profile_id = auth.uid())
  );
CREATE POLICY "Pros can view their proposals" ON public.proposals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.professionals WHERE id = professional_id AND profile_id = auth.uid())
  );
CREATE POLICY "Project owners can view proposals" ON public.proposals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND client_id = auth.uid())
  );
CREATE POLICY "Project owners can update proposal status" ON public.proposals
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND client_id = auth.uid())
  );

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

CREATE POLICY "Pros manage their blocked dates" ON public.blocked_dates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.professionals WHERE id = professional_id AND profile_id = auth.uid())
  );
CREATE POLICY "Public can view blocked dates" ON public.blocked_dates
  FOR SELECT USING (true);

-- ============================================================
-- 5. Expand notifications type constraint
-- ============================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'review_request','booking_received','booking_confirmed','booking_completed',
    'booking_cancelled','booking_rescheduled','proposal_received','proposal_accepted','new_project'
  ));

-- ============================================================
-- 6. Trigger: booking confirmed → notify client
-- ============================================================
CREATE OR REPLACE FUNCTION notify_client_on_booking_confirmed()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' AND NEW.client_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (
      NEW.client_id,
      'booking_confirmed',
      'Solicitud confirmada ✓',
      'El profesional confirmó tu solicitud de servicio.',
      jsonb_build_object('booking_id', NEW.id, 'professional_id', NEW.professional_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_confirmed ON public.bookings;
CREATE TRIGGER on_booking_confirmed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION notify_client_on_booking_confirmed();

-- ============================================================
-- 7. Trigger: proposal created → notify project owner
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_proposal_created()
RETURNS trigger AS $$
DECLARE
  project_owner_id uuid;
  pro_name         text;
BEGIN
  SELECT proj.client_id INTO project_owner_id
    FROM public.projects proj WHERE proj.id = NEW.project_id;

  SELECT pr.full_name INTO pro_name
    FROM public.professionals prof
    JOIN public.profiles pr ON pr.id = prof.profile_id
    WHERE prof.id = NEW.professional_id;

  IF project_owner_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, data)
    VALUES (
      project_owner_id,
      'proposal_received',
      'Nueva propuesta recibida',
      COALESCE(pro_name, 'Un profesional') || ' envió una propuesta a tu proyecto.',
      jsonb_build_object('proposal_id', NEW.id, 'project_id', NEW.project_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_proposal_created ON public.proposals;
CREATE TRIGGER on_proposal_created
  AFTER INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION notify_on_proposal_created();

-- ============================================================
-- 8. Trigger: proposal accepted → notify professional
-- ============================================================
CREATE OR REPLACE FUNCTION notify_pro_on_proposal_accepted()
RETURNS trigger AS $$
DECLARE
  pro_profile_id uuid;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT profile_id INTO pro_profile_id
      FROM public.professionals WHERE id = NEW.professional_id;

    IF pro_profile_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, data)
      VALUES (
        pro_profile_id,
        'proposal_accepted',
        '¡Tu propuesta fue aceptada!',
        'El cliente aceptó tu propuesta. Coordiná los detalles directamente.',
        jsonb_build_object('proposal_id', NEW.id, 'project_id', NEW.project_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_proposal_accepted ON public.proposals;
CREATE TRIGGER on_proposal_accepted
  AFTER UPDATE OF status ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION notify_pro_on_proposal_accepted();
